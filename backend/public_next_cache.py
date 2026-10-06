"""A single-entry cache in front of GET /api/public/next (spec, PR 2, D3).

Building the body costs about a second of CPU on Render's free tier, and it
blocks the event loop while it runs. The body is rebuilt only when something
it is built from changes, which next_fingerprint reads in one small
aggregate query:

- the UTC day. Picks count only events before today's UTC midnight, so an
  event written today changes nothing until tomorrow; the day also decides
  which dates are still to come;
- every row of `items` and `recommendations`, as a count and a digest of
  each row's id and xmin. Postgres gives a row a new xmin on every UPDATE,
  whoever writes it, so no write path can slip past: not a bulk UPDATE, not
  SQL written by hand (which skips updated_at's SQLAlchemy-side onupdate),
  and not a transaction that started earlier committing later (updated_at
  is the transaction's start time, so max(updated_at) can stand still). An
  insert or delete changes the count and the digest;
- the catalogue's runs: how many have finished, and the latest finish.
  Runs are never deleted and finish once, so a finished run always moves
  the count, in whatever order runs commit.
- the shown and skipped pick events dated inside the picks window and
  before today's midnight. The day covers events written today, but a Play
  Next transaction that began before midnight and commits after it writes
  events dated yesterday, which a build in between could not see. Those
  actions are deleted only with their item, so the count moves only on such
  a late commit; NEVER is left out, which keeps the restore delay below.

A spurious change only costs a rebuild; a missed one would publish stale
data, so the fingerprint errs wide. Admin routes never use this: the store
list stays live.

Deliberately stricter than the uncached route: a "never" event the admin
restore route deletes leaves the fingerprint unchanged, so a restored game
reappears at the next UTC midnight rather than at once.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, time

from sqlalchemy import Text, cast, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import CatalogueRun, Item, PickAction, PickEvent, Recommendation
from public_outputs import PICKS_WINDOW, PublicNextOut

Build = Callable[[AsyncSession, datetime], Awaitable[PublicNextOut]]


def _rows(model) -> tuple:
    """A row count and an order-free digest of every row's (id, xmin).

    hashtextextended is 64-bit; summed as numeric it cannot overflow, and a
    changed row moves the sum unless two 64-bit hashes collide.
    """
    xmin = cast(literal_column(f"{model.__tablename__}.xmin"), Text)
    stamp = func.concat(cast(model.id, Text), ":", xmin)
    return (
        select(func.count()).select_from(model).scalar_subquery(),
        select(func.coalesce(func.sum(func.hashtextextended(stamp, 0)), 0))
        .select_from(model)
        .scalar_subquery(),
    )


async def next_fingerprint(session: AsyncSession, now: datetime) -> tuple:
    """Everything /api/public/next's body depends on, as one comparable tuple."""
    midnight = datetime.combine(now.astimezone(UTC).date(), time.min, tzinfo=UTC)
    late_picks = (
        select(func.count())
        .select_from(PickEvent)
        .where(
            PickEvent.action.in_((PickAction.SHOWN, PickAction.SKIPPED)),
            PickEvent.created_at >= midnight - PICKS_WINDOW,
            PickEvent.created_at < midnight,
        )
        .scalar_subquery()
    )
    row = (
        await session.execute(
            select(
                *_rows(Item),
                *_rows(Recommendation),
                select(func.count(CatalogueRun.finished_at)).scalar_subquery(),
                select(func.max(CatalogueRun.finished_at)).scalar_subquery(),
                late_picks,
            )
        )
    ).one()
    return (now.astimezone(UTC).date(), *row)


class PublicNextCache:
    """Holds one built body and the fingerprint it was built at."""

    def __init__(self) -> None:
        self._key: tuple | None = None
        self._body: PublicNextOut | None = None
        self._lock = asyncio.Lock()

    async def get(
        self, session: AsyncSession, now: datetime, build: Build
    ) -> PublicNextOut:
        """The cached body when the fingerprint is unchanged, else a fresh
        build. The fingerprint is read outside the lock, so a hit never
        waits on a rebuild; concurrent misses build once.

        The build runs after the fingerprint is read, so a body is never
        older than its key: a write landing in between only costs one more
        rebuild on the next request.
        """
        key = await next_fingerprint(session, now)
        if key == self._key:
            return self._body
        async with self._lock:
            if key != self._key:
                self._body = await build(session, now)
                self._key = key
            return self._body
