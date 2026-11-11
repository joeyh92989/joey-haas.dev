"""Comics on the public site: /api/public/comics, the comic block on a
series' item page, and What's next's Comics this week.

An allowlist like public.py: every field is named by hand. Only public rows
are read (spec, D5), so a series that is only followed never appears, and
nothing here reads `issues_skipped` except through the run, where a skipped
issue is a gap like any other: Skip is a pull-list answer and stays private.
"""

from __future__ import annotations

import uuid
from collections import Counter
from collections.abc import Iterable
from datetime import date, datetime

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from comics import (
    ComicSeries,
    Issue,
    format_ranges,
    next_issue,
    pull_weeks,
    read_next,
    read_state,
    series_from_row,
    shelf_figures,
    sort_series,
    validate_editions,
)
from models import ComicShelfFormat, Item, ItemStatus, ItemType, OwnedFormat

ADDED_MONTHS = 12


class PublicRunSegment(BaseModel):
    """One stretch of a run, drawn by the card's lanes: owned, missing or
    upcoming."""

    kind: str
    length: int


class PublicNextIssue(BaseModel):
    number: str
    store_date: date


class PublicComicRow(BaseModel):
    """A series on /shelf/comics. A want carries no run."""

    item_id: uuid.UUID
    title: str
    publisher: str | None
    year: int | None
    cover_url: str | None
    ongoing: bool
    following: bool
    wanted: bool
    shelf_format: ComicShelfFormat | None
    edition_labels: list[str]
    owned: int
    released: int
    missing: int
    run_state: str | None
    segments: list[PublicRunSegment]
    status: ItemStatus
    rating: int | None
    read_to: int | None
    read: int
    # The first held issue past read_to (editions included); None when all
    # are read. Skips play no part.
    read_next: int | None
    next_issue: PublicNextIssue | None
    created_at: datetime


class PublicRunCounts(BaseModel):
    complete: int
    up_to_date: int
    gaps: int
    wanted: int


class PublicPublisherCount(BaseModel):
    publisher: str
    count: int


class PublicAddedMonth(BaseModel):
    # The first of the month.
    month: date
    count: int


class PublicComicStats(BaseModel):
    """The hero numbers and the four cards, over public rows. Added counts
    rows by when they were added to the site, never the private acquired
    date."""

    series: int
    issues_owned: int
    missing: int
    read_percent: int | None
    runs: PublicRunCounts
    by_status: dict[str, int]
    publishers: list[PublicPublisherCount]
    added_by_month: list[PublicAddedMonth]


class PublicComicIssue(BaseModel):
    """One issue out in a week: what the strip shows, and nothing about where
    to buy it (spec, AC9)."""

    item_id: uuid.UUID
    title: str
    publisher: str | None
    number: str
    store_date: date
    cover_url: str | None
    owned_text: str
    released: int | None


class PublicComicWeek(BaseModel):
    start: date
    this_week: bool
    rows: list[PublicComicIssue]


class PublicComicUndated(BaseModel):
    item_id: uuid.UUID
    title: str


class PublicComicWeeks(BaseModel):
    weeks: list[PublicComicWeek]
    later: list[PublicComicUndated]


class PublicComicsOut(BaseModel):
    """GET /api/public/comics."""

    series: list[PublicComicRow]
    stats: PublicComicStats
    this_week: PublicComicWeeks


class PublicEdition(BaseModel):
    kind: str
    label: str
    from_issue: int
    to_issue: int


class PublicComicDetail(BaseModel):
    """The comic block on /shelf/:id: enough for What's next, the run's
    lanes and box, and the editions card."""

    publisher: str | None
    owned_text: str
    released: int
    ongoing: bool
    run_state: str
    missing: int
    segments: list[PublicRunSegment]
    read_to: int | None
    read: int
    # As on the shelf row.
    read_next: int | None
    editions: list[PublicEdition]
    next_issue: PublicNextIssue | None
    following: bool
    # The same as the shelf row's: how the run sits on the shelf.
    shelf_format: ComicShelfFormat | None
    # The day the issues were last fetched from Comic Vine.
    as_of: date | None


def _publisher(item: Item) -> str | None:
    publisher = (item.source_metadata or {}).get("publisher")
    return publisher if isinstance(publisher, str) and publisher else item.creator


def series_of(item: Item) -> ComicSeries:
    return series_from_row(
        item.id,
        item.title,
        _publisher(item),
        item.issues_owned,
        item.issues_skipped,
        item.editions,
        item.read_to,
        item.source_metadata,
        on_shelf=item.owned_format != OwnedFormat.NONE,
        following=item.following,
    )


def _editions(item: Item) -> list[dict]:
    try:
        return validate_editions(item.editions)
    except ValueError:
        return []


def _next(series: ComicSeries, today: date) -> PublicNextIssue | None:
    upcoming = next_issue(series, today)
    if upcoming is None or upcoming.store_date is None:
        return None
    return PublicNextIssue(number=upcoming.number, store_date=upcoming.store_date)


def _segments(series: ComicSeries) -> list[PublicRunSegment]:
    return [PublicRunSegment(kind=k, length=n) for k, n in series.run().segments]


def _row(item: Item, series: ComicSeries, today: date) -> PublicComicRow:
    run = series.run()
    wanted = not series.on_shelf
    return PublicComicRow(
        item_id=item.id,
        title=item.title,
        publisher=series.publisher,
        year=item.year,
        cover_url=item.cover_url,
        ongoing=series.ongoing,
        following=item.following,
        wanted=wanted,
        shelf_format=item.shelf_format,
        edition_labels=[e["label"] for e in _editions(item)],
        owned=run.owned,
        released=run.released,
        missing=0 if wanted else run.missing,
        run_state=None if wanted else run.state,
        segments=[] if wanted else _segments(series),
        status=item.status,
        rating=item.rating,
        read_to=item.read_to,
        read=read_state(item.read_to, set(series.owned)).read,
        read_next=read_next(item.read_to, set(series.owned)),
        next_issue=_next(series, today),
        created_at=item.created_at,
    )


def _months_back(today: date, count: int) -> list[date]:
    year, month = today.year, today.month
    months = []
    for _ in range(count):
        months.append(date(year, month, 1))
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)
    return months[::-1]


def comic_stats(items: list[Item], today: date) -> PublicComicStats:
    pairs = [(item, series_of(item)) for item in items]
    figures = shelf_figures(series for _, series in pairs)
    shelf = [(item, s) for item, s in pairs if s.on_shelf]
    states = Counter(s.run().state for _, s in shelf)
    publishers = Counter(s.publisher for _, s in shelf if s.publisher)
    added = Counter(
        date(item.created_at.year, item.created_at.month, 1) for item in items
    )
    return PublicComicStats(
        series=figures.series,
        issues_owned=figures.issues_owned,
        missing=figures.missing,
        read_percent=figures.read_percent,
        runs=PublicRunCounts(
            complete=states["complete"],
            up_to_date=states["up_to_date"],
            gaps=states["gaps"],
            wanted=len(pairs) - len(shelf),
        ),
        by_status=dict(Counter(item.status.value for item, _ in shelf)),
        publishers=[
            PublicPublisherCount(publisher=name, count=n)
            for name, n in sorted(
                publishers.items(), key=lambda kv: (-kv[1], kv[0].casefold())
            )
        ],
        added_by_month=[
            PublicAddedMonth(month=m, count=added[m])
            for m in _months_back(today, ADDED_MONTHS)
        ],
    )


def comic_weeks(items: Iterable[Item], today: date) -> PublicComicWeeks:
    """The pull list in public mode, over public followed series only."""
    by_id = {item.id: item for item in items}
    pull = pull_weeks((series_of(item) for item in by_id.values()), today, public=True)

    def issue_row(row) -> PublicComicIssue:
        issue: Issue = row.issue
        return PublicComicIssue(
            item_id=row.series_id,
            title=row.title,
            publisher=row.publisher,
            number=issue.number,
            store_date=issue.store_date,
            cover_url=issue.cover_url or by_id[row.series_id].cover_url,
            owned_text=row.owned_text,
            released=row.released,
        )

    return PublicComicWeeks(
        weeks=[
            PublicComicWeek(
                start=week.start,
                this_week=week.this_week,
                rows=[issue_row(row) for row in week.rows],
            )
            for week in pull.weeks
        ],
        later=[PublicComicUndated(item_id=s.id, title=s.title) for s in pull.undated],
    )


def comic_detail(item: Item, today: date) -> PublicComicDetail:
    series = series_of(item)
    run = series.run()
    fetched = (item.source_metadata or {}).get("fetched_on")
    try:
        as_of = date.fromisoformat(fetched) if isinstance(fetched, str) else None
    except ValueError:
        as_of = None
    return PublicComicDetail(
        publisher=series.publisher,
        owned_text=format_ranges(series.owned),
        released=run.released,
        ongoing=series.ongoing,
        run_state=run.state,
        missing=run.missing,
        segments=_segments(series),
        read_to=item.read_to,
        read=read_state(item.read_to, set(series.owned)).read,
        read_next=read_next(item.read_to, set(series.owned)),
        editions=[
            PublicEdition(
                kind=e["kind"], label=e["label"], from_issue=e["from"], to_issue=e["to"]
            )
            for e in _editions(item)
        ],
        next_issue=_next(series, today),
        following=item.following,
        shelf_format=item.shelf_format,
        as_of=as_of,
    )


async def public_comic_items(session: AsyncSession) -> list[Item]:
    result = await session.execute(
        select(Item).where(Item.is_public.is_(True), Item.type == ItemType.COMIC)
    )
    return list(result.scalars())


async def load_public_comics(session: AsyncSession, today: date) -> PublicComicsOut:
    items = await public_comic_items(session)
    pairs = {item.id: (item, series_of(item)) for item in items}
    ordered = sort_series((s for _, s in pairs.values()), "next", today)
    return PublicComicsOut(
        series=[_row(pairs[s.id][0], s, today) for s in ordered],
        stats=comic_stats(items, today),
        this_week=comic_weeks(items, today),
    )
