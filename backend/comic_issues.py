"""Storage helpers for the comic issue pages (the `comic_issues` table).

Why a module of its own: the sync (writes) and the public routes (reads) both
need the table, and neither should know how the upsert is spelled. Pure
storage: no HTTP, no Comic Vine calls.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from models import ComicIssue
from sources.comicvine import CvIssue

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
    (the table cannot hold them), and when two issues share a number the first
    in the list wins: one INSERT ... ON CONFLICT cannot touch a row twice.
    The caller commits.
    """
    first: dict[int, CvIssue] = {}
    for issue in issues:
        if issue.number is not None and issue.number not in first:
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
