"""The public wall, issue page, collected-edition page and volume page of a
comic series.

An allowlist like public_comics.py: every field is named by hand, and a row is
looked up by id (never by loading every public row) and then held to the same
public predicate as the rest of the comics. The run state comes from
`series_of`, where a skipped issue is a gap like any other: Skip stays private
because nothing here reads `issues_skipped` except through that.

Each builder returns None for a page that does not exist (unknown, private or
non-comic item, an issue out of range, an unknown edition); the route turns
that into a 404.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import date
from urllib.parse import urlparse

from pydantic import BaseModel
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from comic_issues import load_issues
from comics import (
    MAX_ISSUE,
    ComicSeries,
    edition_slugs,
    expand,
    next_issue,
    parse_ranges,
)
from models import (
    ComicIssue,
    ComicVolume,
    ComicVolumeCollect,
    Item,
    ItemType,
)
from public_comics import _editions, public_comic_items, series_of

COMIC_VINE_HOST = "comicvine.gamespot.com"
# The Comic Vine home page, for a series that has no page of its own stored.
COMIC_VINE_HOME = f"https://{COMIC_VINE_HOST}/"
NEIGHBOURS = 4


class PublicWallIssue(BaseModel):
    number: int
    # From the marks on the issue row. A skipped issue is just missing.
    owned: bool
    read: bool
    name: str | None
    store_date: date | None
    cover_url: str | None


class PublicWallEdition(BaseModel):
    slug: str
    kind: str
    label: str
    from_issue: int
    to_issue: int
    cover_url: str | None


class PublicWall(BaseModel):
    """GET /api/public/items/{id}/issues: what the cover wall draws."""

    series_title: str
    publisher: str | None
    issues: list[PublicWallIssue]
    editions: list[PublicWallEdition]


class PublicNeighbour(BaseModel):
    number: int
    cover_url: str | None
    state: str


class PublicIssueEdition(BaseModel):
    slug: str
    label: str
    kind: str


class PublicIssuePage(BaseModel):
    """GET /api/public/items/{id}/issues/{n}."""

    series_id: uuid.UUID
    series_title: str
    publisher: str | None
    number: int
    name: str | None
    store_date: date | None
    cover_date: date | None
    cover_url: str | None
    large_url: str | None
    description: list[str]
    # read, owned, missing or not-out. Missing includes a skipped issue.
    state: str
    owned: bool
    read: bool
    held_as: str
    edition: PublicIssueEdition | None
    released: int
    ongoing: bool
    neighbours: list[PublicNeighbour]
    source_url: str


class PublicEditionLink(BaseModel):
    slug: str
    label: str


class PublicEditionNext(BaseModel):
    """The next edition (slug and label), or after the last one the first
    issue after it (number)."""

    slug: str | None = None
    label: str | None = None
    number: int | None = None


class PublicEditionPage(BaseModel):
    """GET /api/public/items/{id}/editions/{slug}."""

    series_id: uuid.UUID
    series_title: str
    publisher: str | None
    slug: str
    kind: str
    label: str
    from_issue: int
    to_issue: int
    cover_url: str | None
    large_url: str | None
    description: list[str]
    state: str
    # all, to or not-yet.
    read: str
    read_to: int | None
    inside: list[PublicNeighbour]
    prev: PublicEditionLink | None
    next: PublicEditionNext | None
    source_url: str | None


class PublicComicIndexIssue(BaseModel):
    number: int
    name: str | None
    cover_url: str | None


class PublicComicIndexEdition(BaseModel):
    slug: str
    label: str
    cover_url: str | None


class PublicComicIndexVolume(BaseModel):
    slug: str
    label: str
    kind: str
    line_number: int | None
    cover_url: str | None


class PublicComicIndex(BaseModel):
    """GET /api/public/comic-issues: the build's list of issue, edition and
    volume pages, for their link-preview heads. No state, ownership or skip.
    `editions` stays until the prerender reads `volumes` (a later cleanup)."""

    item_id: uuid.UUID
    series_title: str
    issues: list[PublicComicIndexIssue]
    editions: list[PublicComicIndexEdition]
    volumes: list[PublicComicIndexVolume]


class PublicVolumeTitle(BaseModel):
    id: uuid.UUID
    title: str
    cover_url: str | None
    publisher: str | None
    year: int | None


class PublicVolumeBody(BaseModel):
    slug: str
    label: str
    kind: str
    line_number: int | None
    isbn: str | None
    pages: int | None
    # Paragraphs, like the edition page's description.
    description: list[str]
    cover_url: str | None
    large_url: str | None
    owned: bool
    read: bool


class PublicVolumeLink(BaseModel):
    """A collects entry linked to a public series with synced issues: the
    numbers the issue pages are built from."""

    item_id: uuid.UUID
    from_number: int
    to_number: int


class PublicVolumeCollect(BaseModel):
    series_name: str
    issue_text: str
    link: PublicVolumeLink | None


class PublicVolumeNeighbour(BaseModel):
    slug: str
    label: str
    line_number: int | None


class PublicVolumePage(BaseModel):
    """GET /api/public/items/{id}/volumes/{slug}: one owned book of a public
    title. No skip, follow, price, store or collects `source`."""

    title: PublicVolumeTitle
    volume: PublicVolumeBody
    collects: list[PublicVolumeCollect]
    prev: PublicVolumeNeighbour | None
    next: PublicVolumeNeighbour | None
    source_url: str | None


async def _public_comic(
    session: AsyncSession, item_id: uuid.UUID, public_only: bool = True
) -> Item | None:
    """One row by id, held to the public predicate. `public_only=False` is
    for the admin comic page, which draws the same wall for a private row."""
    query = select(Item).where(Item.id == item_id, Item.type == ItemType.COMIC)
    if public_only:
        query = query.where(Item.is_public.is_(True))
    result = await session.execute(query)
    return result.scalar_one_or_none()


def _comic_vine_url(item: Item) -> str | None:
    url = (item.source_metadata or {}).get("source_url")
    if not isinstance(url, str):
        return None
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or parsed.hostname != COMIC_VINE_HOST:
        return None
    return url


def _held(series: ComicSeries, rows: Iterable[ComicIssue]) -> dict[int, bool]:
    """Every issue held, loose or in an edition, mapped to whether it is read.

    The marks on the issue rows are the record from 5c; the ranges still
    count for a row the marks have not reached, so a held issue is either.
    Read is the row's mark, or `read_to` for a row that carries none."""
    read_to = series.read_to
    held = {n: read_to is not None and n <= read_to for n in series.owned}
    for row in rows:
        if row.owned:
            held[row.number] = row.read or held.get(row.number, False)
    return held


def _state(
    number: int, held: dict[int, bool], released: int, upcoming: int | None
) -> str:
    """read, owned, missing, or not-out (the next dated issue, beyond what is
    released). None for a number with no page."""
    if number in held:
        return "read" if held[number] else "owned"
    if number <= released:
        return "missing"
    return "not-out" if number == upcoming else ""


def _page_numbers(
    held: dict[int, bool], released: int, upcoming: int | None
) -> list[int]:
    """The issue numbers that have a page: the one rule of the issue route, the
    wall and the index."""
    candidates = {*range(1, released + 1), *held}
    if upcoming is not None:
        candidates.add(upcoming)
    return sorted(
        n
        for n in candidates
        if 1 <= n <= MAX_ISSUE and _state(n, held, released, upcoming)
    )


def _upcoming(series: ComicSeries, today: date) -> int | None:
    issue = next_issue(series, today)
    return issue.count if issue is not None else None


def _neighbours(
    around: int,
    held: dict[int, bool],
    released: int,
    upcoming: int | None,
    rows: dict[int, ComicIssue],
) -> list[PublicNeighbour]:
    """The strip around an issue, the issue itself included (the page marks and
    centres on it)."""
    out = []
    for number in range(max(1, around - NEIGHBOURS), around + NEIGHBOURS + 1):
        state = _state(number, held, released, upcoming)
        if state:
            row = rows.get(number)
            out.append(
                PublicNeighbour(
                    number=number,
                    cover_url=row.cover_url if row else None,
                    state=state,
                )
            )
    return out


def _edition_cover(edition: dict, by_number: dict[int, ComicIssue]) -> str | None:
    """The edition's own cover, else the first stored cover inside it."""
    return edition.get("cover_url") or next(
        (
            by_number[n].cover_url
            for n in range(edition["from"], edition["to"] + 1)
            if n in by_number and by_number[n].cover_url
        ),
        None,
    )


async def build_wall(
    session: AsyncSession,
    item_id: uuid.UUID,
    today: date,
    public_only: bool = True,
) -> PublicWall | None:
    item = await _public_comic(session, item_id, public_only)
    if item is None:
        return None
    series = series_of(item)
    released = series.run().released
    every = await load_issues(session, item.id, include_stubs=True)
    held = _held(series, every)
    numbers = set(_page_numbers(held, released, _upcoming(series, today)))
    # A stub is a book held that Comic Vine has not synced: drawn as a
    # numbered blank. A skipped stub is no page (skips stay private).
    rows = [row for row in every if row.cv_id is not None or row.owned]
    by_number = {row.number: row for row in rows}
    editions = _editions(item)
    out_editions = []
    for slug, edition in zip(edition_slugs(editions), editions, strict=True):
        cover = _edition_cover(edition, by_number)
        out_editions.append(
            PublicWallEdition(
                slug=slug,
                kind=edition["kind"],
                label=edition["label"],
                from_issue=edition["from"],
                to_issue=edition["to"],
                cover_url=cover,
            )
        )
    return PublicWall(
        series_title=item.title,
        publisher=series.publisher,
        issues=[
            PublicWallIssue(
                number=row.number,
                owned=row.number in held,
                read=held.get(row.number, False),
                name=row.name,
                store_date=row.store_date,
                cover_url=row.cover_url,
            )
            for row in rows
            if row.number in numbers
        ],
        editions=out_editions,
    )


def _held_as(number: int, item: Item, edition: dict | None) -> str:
    single = number in expand(parse_ranges(item.issues_owned))
    if edition is None:
        return "Single issue" if single else "Not owned"
    inside = f"In {edition['label']} ({edition['kind'].lower()})"
    return f"{inside} and as a single, counted once" if single else inside


async def build_issue_page(
    session: AsyncSession, item_id: uuid.UUID, number: int, today: date
) -> PublicIssuePage | None:
    if not 1 <= number <= MAX_ISSUE:
        return None
    item = await _public_comic(session, item_id)
    if item is None:
        return None
    series = series_of(item)
    released = series.run().released
    upcoming = _upcoming(series, today)
    # The issue in full; its strip needs only the covers around it. The marks
    # come with them, stubs included (a held book Comic Vine lacks).
    full = await load_issues(
        session, item.id, number, number, with_description=True, include_stubs=True
    )
    row = full[0] if full else None
    around = await load_issues(
        session,
        item.id,
        max(1, number - NEIGHBOURS),
        number + NEIGHBOURS,
        include_stubs=True,
    )
    held = _held(series, around)
    state = _state(number, held, released, upcoming)
    if not state:
        return None
    rows = {r.number: r for r in around if r.cv_id is not None}
    if row is not None and row.cv_id is None:
        row = None  # a stub has no name, cover or description to publish
    editions = _editions(item)
    slugs = edition_slugs(editions)
    covering = next(
        (
            (slug, edition)
            for slug, edition in zip(slugs, editions, strict=True)
            if edition["from"] <= number <= edition["to"]
        ),
        None,
    )
    return PublicIssuePage(
        series_id=item.id,
        series_title=item.title,
        publisher=series.publisher,
        number=number,
        name=row.name if row else None,
        store_date=row.store_date if row else None,
        cover_date=row.cover_date if row else None,
        cover_url=row.cover_url if row else None,
        large_url=row.large_url if row else None,
        description=list(row.description) if row else [],
        state=state,
        owned=number in held,
        read=held.get(number, False),
        held_as=_held_as(number, item, covering[1] if covering else None),
        edition=(
            PublicIssueEdition(
                slug=covering[0], label=covering[1]["label"], kind=covering[1]["kind"]
            )
            if covering
            else None
        ),
        released=released,
        ongoing=series.ongoing,
        neighbours=_neighbours(number, held, released, upcoming, rows),
        source_url=_comic_vine_url(item) or COMIC_VINE_HOME,
    )


async def build_edition_page(
    session: AsyncSession, item_id: uuid.UUID, slug: str, today: date
) -> PublicEditionPage | None:
    item = await _public_comic(session, item_id)
    if item is None:
        return None
    editions = _editions(item)
    slugs = edition_slugs(editions)
    if slug not in slugs:
        return None
    index = slugs.index(slug)
    edition = editions[index]
    low, high = edition["from"], edition["to"]
    series = series_of(item)
    released = series.run().released
    upcoming = _upcoming(series, today)
    around = await load_issues(session, item.id, low, high + 1, include_stubs=True)
    held = _held(series, around)
    rows = {
        row.number: row
        for row in around
        if row.cv_id is not None and row.number <= high
    }
    collected = [rows[n] for n in range(low, high + 1) if n in rows]
    cover = edition.get("cover_url") or next(
        (r.cover_url for r in collected if r.cover_url), None
    )
    large = edition.get("large_url") or next(
        (r.large_url for r in collected if r.large_url), None
    )
    # Read from the marks: every book inside, or the unbroken run from its
    # first book.
    shown = None
    for n in range(low, high + 1):
        if not held.get(n):
            break
        shown = n
    if shown == high:
        read = "all"
    elif shown is not None:
        read = "to"
    else:
        read, shown = "not-yet", None
    after = high + 1
    if index + 1 < len(editions):
        following = PublicEditionNext(
            slug=slugs[index + 1], label=editions[index + 1]["label"]
        )
    elif _state(after, held, released, upcoming):
        following = PublicEditionNext(number=after)
    else:
        following = None
    description = edition.get("description")
    return PublicEditionPage(
        series_id=item.id,
        series_title=item.title,
        publisher=series.publisher,
        slug=slug,
        kind=edition["kind"],
        label=edition["label"],
        from_issue=low,
        to_issue=high,
        cover_url=cover,
        large_url=large,
        description=list(description) if isinstance(description, list) else [],
        state="read" if read == "all" else "owned",
        read=read,
        read_to=shown,
        inside=[
            PublicNeighbour(
                number=n,
                cover_url=rows[n].cover_url if n in rows else None,
                state=_state(n, held, released, upcoming) or "owned",
            )
            for n in range(low, high + 1)
        ],
        prev=(
            PublicEditionLink(slug=slugs[index - 1], label=editions[index - 1]["label"])
            if index > 0
            else None
        ),
        next=following,
        source_url=_comic_vine_url(item),
    )


def _line_order(volume: ComicVolume) -> tuple:
    """A book's place in its title's line: numbered books by number, the rest
    after them, ties by position."""
    return (
        volume.line_number is None,
        volume.line_number or 0,
        volume.position,
        volume.slug,
    )


def _neighbour(volume: ComicVolume | None) -> PublicVolumeNeighbour | None:
    if volume is None:
        return None
    return PublicVolumeNeighbour(
        slug=volume.slug, label=volume.label, line_number=volume.line_number
    )


def _paragraphs(text: str | None) -> list[str]:
    return [p.strip() for p in (text or "").split("\n\n") if p.strip()]


async def _linkable_items(
    session: AsyncSession, item_ids: set[uuid.UUID]
) -> set[uuid.UUID]:
    """Of these titles, the public comics with at least one synced issue row
    (a Comic Vine id): the only ones a collects entry may link to."""
    if not item_ids:
        return set()
    synced = exists().where(
        ComicIssue.item_id == Item.id, ComicIssue.cv_id.is_not(None)
    )
    result = await session.scalars(
        select(Item.id).where(
            Item.id.in_(item_ids),
            Item.is_public.is_(True),
            Item.type == ItemType.COMIC,
            synced,
        )
    )
    return set(result)


def _link(
    entry: ComicVolumeCollect, linkable: set[uuid.UUID]
) -> PublicVolumeLink | None:
    low, high = entry.from_number, entry.to_number
    if entry.item_id is None or entry.item_id not in linkable:
        return None
    if low is None or high is None or not 1 <= low <= high <= MAX_ISSUE:
        return None
    return PublicVolumeLink(item_id=entry.item_id, from_number=low, to_number=high)


async def build_volume_page(
    session: AsyncSession, item_id: uuid.UUID, slug: str
) -> PublicVolumePage | None:
    """One owned volume of a public comic title. None (a 404) for a private
    or unknown title, an unknown slug or a volume that is not owned, all alike."""
    item = await _public_comic(session, item_id)
    if item is None:
        return None
    result = await session.scalars(
        select(ComicVolume).where(
            ComicVolume.item_id == item.id, ComicVolume.owned.is_(True)
        )
    )
    line = sorted(result, key=_line_order)
    index = next((i for i, v in enumerate(line) if v.slug == slug), None)
    if index is None:
        return None
    volume = line[index]
    entries = list(
        await session.scalars(
            select(ComicVolumeCollect)
            .where(ComicVolumeCollect.volume_id == volume.id)
            .order_by(ComicVolumeCollect.position, ComicVolumeCollect.id)
        )
    )
    linkable = await _linkable_items(
        session, {e.item_id for e in entries if e.item_id is not None}
    )
    return PublicVolumePage(
        title=PublicVolumeTitle(
            id=item.id,
            title=item.title,
            cover_url=item.cover_url,
            publisher=series_of(item).publisher,
            year=item.year,
        ),
        volume=PublicVolumeBody(
            slug=volume.slug,
            label=volume.label,
            kind=volume.kind,
            line_number=volume.line_number,
            isbn=volume.isbn,
            pages=volume.pages,
            description=_paragraphs(volume.description),
            cover_url=volume.cover_url,
            large_url=volume.large_url,
            owned=volume.owned,
            read=volume.read,
        ),
        collects=[
            PublicVolumeCollect(
                series_name=e.series_name,
                issue_text=e.issue_text,
                link=_link(e, linkable),
            )
            for e in entries
        ],
        prev=_neighbour(line[index - 1] if index > 0 else None),
        next=_neighbour(line[index + 1] if index + 1 < len(line) else None),
        source_url=_comic_vine_url(item),
    )


async def load_comic_index(
    session: AsyncSession, today: date
) -> list[PublicComicIndex]:
    """Every public series with the issue numbers that have a page (the same
    rule as the issue route: `_state` is non-empty) and its editions. The
    issues of all series come in one query."""
    items = await public_comic_items(session)
    by_item: dict[uuid.UUID, dict[int, ComicIssue]] = {item.id: {} for item in items}
    if items:
        result = await session.scalars(
            select(ComicIssue)
            .where(
                ComicIssue.item_id.in_(list(by_item)),
            )
            .options(defer(ComicIssue.description))
        )
        for row in result:
            by_item[row.item_id][row.number] = row
    volumes: dict[uuid.UUID, list[ComicVolume]] = {item.id: [] for item in items}
    if items:
        for volume in await session.scalars(
            select(ComicVolume).where(
                ComicVolume.item_id.in_(list(volumes)), ComicVolume.owned.is_(True)
            )
        ):
            volumes[volume.item_id].append(volume)
    out = []
    for item in sorted(items, key=lambda i: (i.title, str(i.id))):
        series = series_of(item)
        released = series.run().released
        upcoming = _upcoming(series, today)
        every = by_item[item.id]
        held = _held(series, every.values())
        # Names and covers come only from Comic Vine's rows, never a stub.
        rows = {n: r for n, r in every.items() if r.cv_id is not None}
        numbers = _page_numbers(held, released, upcoming)
        editions = _editions(item)
        out.append(
            PublicComicIndex(
                item_id=item.id,
                series_title=item.title,
                issues=[
                    PublicComicIndexIssue(
                        number=n,
                        name=rows[n].name if n in rows else None,
                        cover_url=rows[n].cover_url if n in rows else None,
                    )
                    for n in numbers
                ],
                editions=[
                    PublicComicIndexEdition(
                        slug=slug,
                        label=edition["label"],
                        cover_url=_edition_cover(edition, rows),
                    )
                    for slug, edition in zip(
                        edition_slugs(editions), editions, strict=True
                    )
                ],
                volumes=[
                    PublicComicIndexVolume(
                        slug=v.slug,
                        label=v.label,
                        kind=v.kind,
                        line_number=v.line_number,
                        cover_url=v.cover_url,
                    )
                    for v in sorted(volumes[item.id], key=_line_order)
                ],
            )
        )
    return out
