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
from collections.abc import Iterable, Sequence
from datetime import date, datetime

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from comics import (
    ComicSeries,
    Issue,
    format_ranges,
    loose_issue_count,
    next_issue,
    owned_line_numbers,
    pull_weeks,
    read_next,
    read_state,
    series_from_row,
    shelf_figures,
    shown_status,
    sort_series,
    title_kind,
    validate_editions,
)
from models import (
    ComicIssue,
    ComicShelfFormat,
    ComicVolume,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
)

ADDED_MONTHS = 12


class PublicRunSegment(BaseModel):
    """One stretch of a run, drawn by the card's lanes: owned, missing or
    upcoming."""

    kind: str
    length: int


class PublicNextIssue(BaseModel):
    number: str
    store_date: date


class PublicTag(BaseModel):
    """One curated tag: a group and a word from the type's vocabulary
    (tags.py). The words people read live in the frontend, by key."""

    group: str
    tag: str


def public_tags(value: object) -> list[PublicTag]:
    """Stored tags as published: well-formed {group, tag} strings only."""
    if not isinstance(value, list):
        return []
    return [
        PublicTag(group=entry["group"], tag=entry["tag"])
        for entry in value
        if isinstance(entry, dict)
        and isinstance(entry.get("group"), str)
        and isinstance(entry.get("tag"), str)
    ]


class PublicComicRow(BaseModel):
    """A series on /shelf/comics. A want carries no run."""

    item_id: uuid.UUID
    title: str
    publisher: str | None
    year: int | None
    cover_url: str | None
    ongoing: bool
    wanted: bool
    shelf_format: ComicShelfFormat | None
    edition_labels: list[str]
    owned: int
    released: int
    missing: int
    run_state: str | None
    segments: list[PublicRunSegment]
    status: ItemStatus
    # Every owned issue read on a run that is not complete: the page says
    # "Caught up" in place of To read (#277).
    caught_up: bool
    rating: int | None
    read_to: int | None
    read: int
    # The first held issue past read_to (editions included); None when all
    # are read. Skips play no part.
    read_next: int | None
    next_issue: PublicNextIssue | None
    tags: list[PublicTag]
    created_at: datetime
    # What the title is, derived from its owned books and issues
    # (`comics.title_kind`), and how many books it holds: the shelf (#331)
    # draws "Vol. 1, 2 and 4 of 6" from them.
    kind: str
    volumes_owned: int
    # The line numbers (1..9999) of the OWNED books that have one, ascending,
    # each once: "Vol. 1, 2 and 4". Never the line's size, which is not stored.
    volume_numbers: list[int]


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
    # The book-first figures (#333); `comic_stats` defines them.
    books_owned: int
    volumes_missing: int
    issues_read: int


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


class PublicTitleVolume(BaseModel):
    """One OWNED book on a title's page: enough to draw its tile and link to
    its page. Never an intake id, source, raw kind, position or contents."""

    slug: str
    label: str
    kind: str
    line_number: int | None
    cover_url: str | None
    read: bool


class PublicVolumeSlot(BaseModel):
    """One place in a book line, 1..the highest owned number: the book on it,
    or None where nothing owned has that number."""

    number: int
    slug: str | None


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
    # The status the page shows, derived from the marks, and caught_up as on
    # the shelf row (#277).
    status: ItemStatus
    caught_up: bool
    # As on the shelf row.
    read_next: int | None
    # Comic Vine's count_of_issues for the volume (stored as `issue_count`),
    # shown on the series page; null before the series is linked.
    issue_count: int | None
    editions: list[PublicEdition]
    next_issue: PublicNextIssue | None
    # The same as the shelf row's: how the run sits on the shelf.
    shelf_format: ComicShelfFormat | None
    # The day the issues were last fetched from Comic Vine.
    as_of: date | None
    # What the title is (`comics.title_kind`: run, book_line, single_book or
    # both) from its owned volumes and its issues; derived, never stored.
    kind: str
    # The OWNED books in line order (numbered first, then position).
    volumes: list[PublicTitleVolume]
    volumes_owned: int
    # A book line's places 1..max owned line number; [] for any other kind or
    # when no owned book has a number. A line size is never invented.
    slots: list[PublicVolumeSlot]


def line_order(volume: ComicVolume) -> tuple:
    """A book's place in its title's line: numbered books by number, the rest
    after them, ties by position."""
    return (
        volume.line_number is None,
        volume.line_number or 0,
        volume.position,
        volume.slug,
    )


def loose_issues(item: Item) -> int:
    """How many single issues the title holds loose (`issues_owned`). The
    issue marks are not used: they also mark what an owned volume links, and
    a title of trades alone has no issues of its own."""
    return loose_issue_count(item.issues_owned)


def volume_slots(volumes: Sequence[ComicVolume]) -> list[PublicVolumeSlot]:
    """The line's places for these OWNED volumes: every number from 1 to the
    highest `line_number` held, the first book (in line order) on each and
    None where there is none. Empty when no book has a number."""
    by_number: dict[int, str] = {}
    for volume in sorted(volumes, key=line_order):
        if volume.line_number is not None:
            by_number.setdefault(volume.line_number, volume.slug)
    top = max(by_number, default=0)
    return [
        PublicVolumeSlot(number=n, slug=by_number.get(n)) for n in range(1, top + 1)
    ]


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
        return validate_editions(item.editions, stored_rows=True)
    except ValueError:
        return []


def _next(series: ComicSeries, today: date) -> PublicNextIssue | None:
    upcoming = next_issue(series, today)
    if upcoming is None or upcoming.store_date is None:
        return None
    return PublicNextIssue(number=upcoming.number, store_date=upcoming.store_date)


def _segments(series: ComicSeries) -> list[PublicRunSegment]:
    return [PublicRunSegment(kind=k, length=n) for k, n in series.run().segments]


def _row(
    item: Item,
    series: ComicSeries,
    today: date,
    read_marks: int = 0,
    volumes_owned: int = 0,
    volume_numbers: Sequence[int] = (),
) -> PublicComicRow:
    run = series.run()
    wanted = not series.on_shelf
    status, caught_up = derived_status(item, series, read_marks)
    return PublicComicRow(
        item_id=item.id,
        title=item.title,
        publisher=series.publisher,
        year=item.year,
        cover_url=item.cover_url,
        ongoing=series.ongoing,
        wanted=wanted,
        shelf_format=item.shelf_format,
        edition_labels=[e["label"] for e in _editions(item)],
        owned=run.owned,
        released=run.released,
        missing=0 if wanted else run.missing,
        run_state=None if wanted else run.state,
        segments=[] if wanted else _segments(series),
        status=status,
        caught_up=caught_up,
        rating=item.rating,
        read_to=item.read_to,
        read=max(read_marks, read_state(item.read_to, set(series.owned)).read),
        read_next=read_next(item.read_to, set(series.owned)),
        next_issue=_next(series, today),
        tags=public_tags(item.tags),
        created_at=item.created_at,
        kind=title_kind(volumes_owned, loose_issues(item)),
        volumes_owned=volumes_owned,
        volume_numbers=list(volume_numbers),
    )


def derived_status(
    item: Item,
    series: ComicSeries,
    read_marks: int,
    volumes: tuple[int, int] = (0, 0),
) -> tuple[ItemStatus, bool]:
    """`comics.shown_status` for a row: the one place the stored status, the
    run and the read count meet. Read counts the marks and read_to, as the
    series page does."""
    run = series.run()
    read = max(read_marks, read_state(item.read_to, set(series.owned)).read)
    status, caught_up = shown_status(
        item.status.value,
        owned=run.owned,
        read=read,
        released=series.released,
        ongoing=series.ongoing,
        missing=run.missing,
        volumes_owned=volumes[0],
        volumes_read=volumes[1],
    )
    return ItemStatus(status), caught_up


def _months_back(today: date, count: int) -> list[date]:
    year, month = today.year, today.month
    months = []
    for _ in range(count):
        months.append(date(year, month, 1))
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)
    return months[::-1]


def book_figures(
    pairs: Iterable[tuple[Item, ComicSeries]],
    books: dict[uuid.UUID, tuple[int, list[int]]],
) -> tuple[int, int]:
    """(books_owned, volumes_missing) over PUBLIC titles; `books` is
    `owned_volume_shelf` (owned volumes only, so an unowned book is never
    counted or used to fill a gap).

    A one-issue book: Comic Vine models some trades as one-issue volumes, so
    a title with no owned volume, a finished one-issue run (released == 1, not
    ongoing) and that issue held counts as one book. A title that already has
    an owned volume never adds it, so nothing counts twice.
    """
    owned = missing = 0
    for item, series in pairs:
        count, numbers = books.get(item.id, (0, []))
        if count:
            owned += count
            # Only a line of books alone (`title_kind` book_line): the slots
            # 1..highest owned number that no owned book has. Never past the
            # highest owned number, no line size invented.
            if count >= 2 and loose_issues(item) == 0 and numbers:
                missing += numbers[-1] - len(numbers)
        elif series.released == 1 and not series.ongoing and series.owned:
            owned += 1
    return owned, missing


def comic_stats(
    items: list[Item],
    today: date,
    marks: dict[uuid.UUID, int] | None = None,
    books: dict[uuid.UUID, tuple[int, list[int]]] | None = None,
) -> PublicComicStats:
    """The figures over PUBLIC rows (callers pass only those).

    - `books_owned`: owned volumes, plus one for each title with no owned
      volume that is a one-issue Comic Vine volume with its issue held
      (`book_figures`).
    - `volumes_missing`: per book line (`kind` book_line), the line numbers
      from 1 to the highest owned that no owned volume has; 0 for titles
      with no numbered volume.
    - `issues_read`: the issue marks are the record, each (title, number) once
      (the primary key), whether read as a single or through a volume.
      `read_percent` is a different figure (the read-to marker over owned
      issues) and is unchanged.
    """
    pairs = [(item, series_of(item)) for item in items]
    figures = shelf_figures(series for _, series in pairs)
    shelf = [(item, s) for item, s in pairs if s.on_shelf]
    states = Counter(s.run().state for _, s in shelf)
    publishers = Counter(s.publisher for _, s in shelf if s.publisher)
    added = Counter(
        date(item.created_at.year, item.created_at.month, 1) for item in items
    )
    books_owned, volumes_missing = book_figures(pairs, books or {})
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
        by_status=dict(
            Counter(
                derived_status(item, s, (marks or {}).get(item.id, 0))[0].value
                for item, s in shelf
            )
        ),
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
        books_owned=books_owned,
        volumes_missing=volumes_missing,
        issues_read=sum((marks or {}).values()),
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


def comic_detail(
    item: Item,
    today: date,
    read_marks: int | None = None,
    volumes: tuple[int, int] = (0, 0),
    owned_volumes: Sequence[ComicVolume] = (),
) -> PublicComicDetail:
    """`read_marks` is the count of owned issues whose row says read (5c: read
    is per book); `read_to` still counts for a row the marks have not reached.
    `volumes` is (owned, read) volumes of the title for `shown_status`; the
    public callers leave it (0, 0) until the public volume read (#329).
    `owned_volumes` are the title's OWNED volumes (`owned_volumes_of`): they
    give `kind`, `volumes` and `slots`."""
    series = series_of(item)
    run = series.run()
    status, caught_up = derived_status(item, series, read_marks or 0, volumes)
    books = sorted((v for v in owned_volumes if v.owned), key=line_order)
    kind = title_kind(len(books), loose_issues(item))
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
        read=max(read_marks or 0, read_state(item.read_to, set(series.owned)).read),
        status=status,
        caught_up=caught_up,
        read_next=read_next(item.read_to, set(series.owned)),
        issue_count=(
            count
            if isinstance(count := (item.source_metadata or {}).get("issue_count"), int)
            and not isinstance(count, bool)
            else None
        ),
        editions=[
            PublicEdition(
                kind=e["kind"], label=e["label"], from_issue=e["from"], to_issue=e["to"]
            )
            for e in _editions(item)
        ],
        next_issue=_next(series, today),
        shelf_format=item.shelf_format,
        as_of=as_of,
        kind=kind,
        volumes=[
            PublicTitleVolume(
                slug=v.slug,
                label=v.label,
                kind=v.kind,
                line_number=v.line_number,
                cover_url=v.cover_url,
                read=v.read,
            )
            for v in books
        ],
        volumes_owned=len(books),
        slots=volume_slots(books) if kind == "book_line" else [],
    )


async def read_marks_by_item(
    session: AsyncSession, item_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Owned, read issues per series, for the series that have any."""
    ids = list(item_ids)
    if not ids:
        return {}
    rows = await session.execute(
        select(ComicIssue.item_id, func.count())
        .where(
            ComicIssue.item_id.in_(ids),
            ComicIssue.owned.is_(True),
            ComicIssue.read.is_(True),
        )
        .group_by(ComicIssue.item_id)
    )
    return {item_id: count for item_id, count in rows}


async def owned_volumes_of(
    session: AsyncSession, item_id: uuid.UUID
) -> list[ComicVolume]:
    """The title's OWNED volumes (not the description: the page does not
    draw it), for `comic_detail`."""
    result = await session.scalars(
        select(ComicVolume)
        .where(ComicVolume.item_id == item_id, ComicVolume.owned.is_(True))
        .options(defer(ComicVolume.description))
    )
    return list(result)


async def owned_volume_shelf(
    session: AsyncSession, item_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, list[int]]]:
    """Per title with owned volumes: how many it owns and their line numbers
    (ascending, once each, books with no number left out). One query for
    every row of the shelf."""
    ids = list(item_ids)
    if not ids:
        return {}
    rows = await session.execute(
        select(ComicVolume.item_id, ComicVolume.line_number).where(
            ComicVolume.item_id.in_(ids), ComicVolume.owned.is_(True)
        )
    )
    counts: Counter[uuid.UUID] = Counter()
    numbers: dict[uuid.UUID, list[int | None]] = {}
    for item_id, line_number in rows:
        counts[item_id] += 1
        numbers.setdefault(item_id, []).append(line_number)
    return {i: (counts[i], owned_line_numbers(numbers[i])) for i in counts}


async def read_marks_count(session: AsyncSession, item_id: uuid.UUID) -> int:
    """How many owned issues of a series carry a read mark."""
    return (
        await session.scalar(
            select(func.count())
            .select_from(ComicIssue)
            .where(
                ComicIssue.item_id == item_id,
                ComicIssue.owned.is_(True),
                ComicIssue.read.is_(True),
            )
        )
    ) or 0


async def public_comic_items(session: AsyncSession) -> list[Item]:
    result = await session.execute(
        select(Item).where(Item.is_public.is_(True), Item.type == ItemType.COMIC)
    )
    return list(result.scalars())


async def load_public_comics(session: AsyncSession, today: date) -> PublicComicsOut:
    items = await public_comic_items(session)
    pairs = {item.id: (item, series_of(item)) for item in items}
    marks = await read_marks_by_item(session, pairs)
    books = await owned_volume_shelf(session, pairs)
    ordered = sort_series((s for _, s in pairs.values()), "next", today)
    return PublicComicsOut(
        series=[
            _row(
                pairs[s.id][0],
                s,
                today,
                marks.get(s.id, 0),
                *books.get(s.id, (0, [])),
            )
            for s in ordered
        ],
        stats=comic_stats(items, today, marks, books),
        this_week=comic_weeks(items, today),
    )
