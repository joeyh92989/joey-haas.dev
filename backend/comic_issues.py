"""Storage helpers for the comic issue pages (the `comic_issues` table).

Why a module of its own: the sync (writes) and the public routes (reads) both
need the table, and neither should know how the upsert is spelled. Pure
storage: no HTTP, no Comic Vine calls.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from models import ComicIssue, Item
from sources.base import SourceError, SourceRateLimited
from sources.comicvine import ALL_ISSUES_PAGE, CvIssue

logger = logging.getLogger(__name__)

_UPDATED = (
    "cv_id",
    "name",
    "store_date",
    "cover_date",
    "cover_url",
    "large_url",
    "description",
    "fetched_on",
)


async def upsert_issues(
    session: AsyncSession, item_id: uuid.UUID, issues: list[CvIssue], today: date
) -> int:
    """Insert or update a series' issues on (item_id, number).

    Returns the number of rows written. Issues without a number are skipped
    (the table cannot hold them), and when two issues share a number the lowest
    Comic Vine id wins, within the batch (one INSERT ... ON CONFLICT cannot
    touch a row twice) and against the stored row (so a later page never
    overwrites an earlier one; the same id still refreshes). The caller
    commits.
    """
    first: dict[int, CvIssue] = {}
    for issue in issues:
        if issue.number is None:
            continue
        held = first.get(issue.number)
        if held is None or issue.cv_id < held.cv_id:
            first[issue.number] = issue
    if not first:
        return 0
    rows = [
        {
            "item_id": item_id,
            "number": number,
            "cv_id": issue.cv_id,
            "name": issue.name,
            "store_date": issue.store_date,
            "cover_date": issue.cover_date,
            "cover_url": issue.cover_url,
            "large_url": issue.large_url,
            "description": list(issue.description),
            "fetched_on": today,
        }
        for number, issue in first.items()
    ]
    statement = insert(ComicIssue).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=["item_id", "number"],
        set_={column: getattr(statement.excluded, column) for column in _UPDATED},
        where=ComicIssue.cv_id >= statement.excluded.cv_id,
    )
    await session.execute(statement)
    return len(rows)


async def load_issues(session: AsyncSession, item_id: uuid.UUID) -> list[ComicIssue]:
    """A series' stored issues, ordered by number."""
    result = await session.scalars(
        select(ComicIssue)
        .where(ComicIssue.item_id == item_id)
        .order_by(ComicIssue.number)
    )
    return list(result)


@dataclass(frozen=True)
class SyncResult:
    """What one series' sync did. `error` is set when Comic Vine failed it
    (the pages already written stay); `rate_limited` marks the failure a
    whole run should stop on."""

    requests: int
    written: int
    complete: bool
    error: str | None = None
    rate_limited: bool = False


async def sync_series(
    session: AsyncSession, source, item: Item, budget: int, today: date
) -> SyncResult:
    """Pages every issue of a linked series into `comic_issues`.

    Spends at most `budget` Comic Vine requests; `issues_synced_on` is set
    only when the last page was reached, so an unfinished series stays the
    stalest and the next run starts it again (upserts make that idempotent).

    Each page is written and committed on its own, after the row is re-read
    FOR UPDATE: no lock is held across a Comic Vine request, and a series
    deleted or re-linked meanwhile stops the sync quietly. The caller's
    transaction is ended first (a commit), so call this with nothing
    uncommitted.
    """
    item_id, volume_id = item.id, item.external_id
    await session.commit()
    requests = written = offset = 0
    while requests < budget:
        try:
            page = await source.fetch_issue_page(volume_id, offset)
        except SourceError as error:
            logger.info("issue sync failed for %s: %s", item_id, error)
            return SyncResult(
                requests + 1,
                written,
                False,
                error=str(error),
                rate_limited=isinstance(error, SourceRateLimited),
            )
        requests += 1
        row = await session.get(
            Item, item_id, with_for_update=True, populate_existing=True
        )
        if row is None or row.external_id != volume_id:
            await session.rollback()
            return SyncResult(requests, written, False)
        try:
            written += await upsert_issues(session, item_id, page.issues, today)
            offset += ALL_ISSUES_PAGE
            complete = offset >= page.total
            if complete:
                row.issues_synced_on = today
            await session.commit()
        except Exception as error:
            logger.exception("issue sync write failed for %s", item_id)
            await session.rollback()
            return SyncResult(requests, written, False, error=str(error))
        if complete:
            return SyncResult(requests, written, True)
    return SyncResult(requests, written, False)
