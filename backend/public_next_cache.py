"""A single-entry cache in front of GET /api/public/next (spec, PR 2, D3).

Building the body costs about a second of CPU on Render's free tier, and it
blocks the event loop while it runs. The body is rebuilt only when something
it is built from changes, which next_fingerprint reads in one small
aggregate query:

- the UTC day. The picks are live (public_picks) and read no shown,
  skipped or pinned event, only "never" events dated before today's UTC
  midnight, so an event written today changes nothing until tomorrow; the
  day also seeds the picks' jitter and decides which dates are still to
  come;
- every row of `items`, `recommendations`, `playthroughs`, `play_sessions`
  and `comic_issues` (Tonight's comic progress counts read marks), as a
  count and a digest of each row's id and xmin (the
  Continue card reads the open run and its journal, which touch neither
  the item's xmin nor its updated_at). Postgres gives a row a new xmin on every UPDATE,
  whoever writes it, so no write path can slip past: not a bulk UPDATE, not
  SQL written by hand (which skips updated_at's SQLAlchemy-side onupdate),
  and not a transaction that started earlier committing later (updated_at
  is the transaction's start time, so max(updated_at) can stand still). An
  insert or delete changes the count and the digest;
- the catalogue's runs: how many have finished, and the latest finish.
  Runs are never deleted and finish once, so a finished run always moves
  the count, in whatever order runs commit.

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
from datetime import UTC, datetime
from typing import Generic, TypeVar

from sqlalchemy import Text, cast, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    CatalogueRun,
    ComicIssue,
    Item,
    PlaySession,
    Playthrough,
    Recommendation,
)

Body = TypeVar("Body")
Build = Callable[[AsyncSession, datetime], Awaitable[Body]]


def _rows(model, *keys) -> tuple:
    """A row count and an order-free digest of every row's (id, xmin).

    hashtextextended is 64-bit; summed as numeric it cannot overflow, and a
    changed row moves the sum unless two 64-bit hashes collide.
    """
    xmin = cast(literal_column(f"{model.__tablename__}.xmin"), Text)
    # A table without an `id` names its key columns (comic_issues).
    ident = [cast(key, Text) for key in keys] or [cast(model.id, Text)]
    stamp = func.concat(*[part for key in ident for part in (key, ":")], xmin)
    return (
        select(func.count()).select_from(model).scalar_subquery(),
        select(func.coalesce(func.sum(func.hashtextextended(stamp, 0)), 0))
        .select_from(model)
        .scalar_subquery(),
    )


async def next_fingerprint(session: AsyncSession, now: datetime) -> tuple:
    """Everything /api/public/next's body depends on, as one comparable tuple.

    Pick for me's body is built from the same inputs and shares it. Neither
    reads a "never" dated today, so the day alone carries the nevers: a
    transaction that began before midnight and commits after the day's first
    rebuild waits for the next day, on both pages.
    """
    row = (
        await session.execute(
            select(
                *_rows(Item),
                *_rows(Recommendation),
                *_rows(Playthrough),
                *_rows(PlaySession),
                *_rows(ComicIssue, ComicIssue.item_id, ComicIssue.number),
                select(func.count(CatalogueRun.finished_at)).scalar_subquery(),
                select(func.max(CatalogueRun.finished_at)).scalar_subquery(),
            )
        )
    ).one()
    return (now.astimezone(UTC).date(), *row)


class PublicNextCache(Generic[Body]):
    """Holds one built body and the fingerprint it was built at.

    Any body built only from what next_fingerprint covers may use one: Pick
    for me (public_pick_for_me.py) has its own instance, since its "never"
    events count only before today's UTC midnight and the day is in the key.
    """

    def __init__(self) -> None:
        self._key: tuple | None = None
        self._body: Body | None = None
        self._lock = asyncio.Lock()

    async def get(
        self, session: AsyncSession, now: datetime, build: Build[Body]
    ) -> Body:
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
