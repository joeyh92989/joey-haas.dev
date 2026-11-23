"""The public wall, issue page and volume page of a comic series.

An allowlist like public_comics.py: every field is named by hand, and a row is
looked up by id (never by loading every public row) and then held to the same
public predicate as the rest of the comics. The run state comes from
`series_of`, where a skipped issue is a gap like any other: Skip stays private
because nothing here reads `issues_skipped` except through that.

Each builder returns None for a page that does not exist (unknown, private or
non-comic item, an issue out of range, an unknown volume); the route turns
that into a 404.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import date
from urllib.parse import urlparse

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from comic_issues import load_issues
from comics import (
    MAX_ISSUE,
    ComicSeries,
    expand,
    held_ranges,
    load_holds,
    next_issue,
    own_editions,
    parse_ranges,
    title_kind,
)
from models import (
    ComicIssue,
    ComicVolume,
    ComicVolumeCollect,
    Item,
    ItemType,
)
from public_comics import (
    line_order,
    loose_issues,
    public_comic_items,
    public_holds,
    series_of,
)

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


class PublicIssueAlsoIn(BaseModel):
    """One owned book that collects the issue (a linked entry only)."""

    slug: str
    label: str
    kind: str
    line_number: int | None
    # The book's own title: the Book page is /shelf/<title_id>/<slug>/.
    title_id: uuid.UUID
    title_slug: str | None = None
    title: str
    same_title: bool


class PublicIssuePage(BaseModel):
    """GET /api/public/items/{id}/issues/{n}."""

    series_id: uuid.UUID
    series_slug: str | None = None
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
    # Held as a single issue (the marks' `issues_owned`), apart from any book.
    held_single: bool
    # Every owned book of a public title that collects it through a linked entry.
    also_in: list[PublicIssueAlsoIn]
    released: int
    ongoing: bool
    neighbours: list[PublicNeighbour]
    source_url: str


class PublicComicIndexIssue(BaseModel):
    number: int
    name: str | None
    cover_url: str | None


class PublicComicIndexVolume(BaseModel):
    slug: str
    label: str
    kind: str
    line_number: int | None
    cover_url: str | None


class PublicComicIndex(BaseModel):
    """GET /api/public/comic-issues: the build's list of issue and volume
    pages, for their link-preview heads. No state, ownership or skip. The old
    `ed-<from>-<to>` URLs are volumes whose slug kept that name."""

    item_id: uuid.UUID
    item_slug: str | None = None
    series_title: str
    # What the title is (`comics.title_kind`), so the build's link preview
    # for the title's page can say "a book line" and not "a series".
    kind: str
    issues: list[PublicComicIndexIssue]
    volumes: list[PublicComicIndexVolume]


class PublicVolumeTitle(BaseModel):
    id: uuid.UUID
    slug: str | None = None
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
    # Set (true) only when a collects row came from Metron (CC BY-SA 4.0): the
    # page then credits it. Left unset otherwise, and the route leaves unset
    # fields out, so no other volume's body changes.
    metron_credit: bool | None = None


async def _public_comic(
    session: AsyncSession, item_id: uuid.UUID | None, public_only: bool = True
) -> Item | None:
    """One row by id, held to the public predicate. `public_only=False` is
    for the admin comic page, which draws the same wall for a private row.
    None (a key that names no item, public.py `_resolve_key`) finds nothing."""
    if item_id is None:
        return None
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
    holds = await load_holds(session, item.id)
    series = series_of(item, held_ranges(holds))
    released = series.run().released
    every = await load_issues(session, item.id, include_stubs=True)
    held = _held(series, every)
    numbers = set(_page_numbers(held, released, _upcoming(series, today)))
    # A stub is a book held that Comic Vine has not synced: drawn as a
    # numbered blank. A skipped stub is no page (skips stay private).
    rows = [row for row in every if row.cv_id is not None or row.owned]
    by_number = {row.number: row for row in rows}
    out_editions = []
    for edition in own_editions(holds):
        slug = edition["slug"]
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


async def _also_in(
    session: AsyncSession, item: Item, number: int
) -> list[PublicIssueAlsoIn]:
    """Every OWNED book, of any PUBLIC title, with a linked collects entry
    that covers this issue. One query. A text-only entry, an unowned book and
    a private title's book never appear (nor that title's id or name)."""
    result = await session.execute(
        select(ComicVolume, Item.title, Item.slug)
        .join(ComicVolumeCollect, ComicVolumeCollect.volume_id == ComicVolume.id)
        .join(Item, Item.id == ComicVolume.item_id)
        .where(
            ComicVolumeCollect.item_id == item.id,
            ComicVolumeCollect.from_number <= number,
            ComicVolumeCollect.to_number >= number,
            ComicVolume.owned.is_(True),
            Item.is_public.is_(True),
            Item.type == ItemType.COMIC,
        )
    )
    rows = result.all()
    return also_in_rows(
        item.id,
        {volume.id: (volume, title) for volume, title, _ in rows},
        {volume.item_id: slug for volume, _, slug in rows if slug},
    )


def held_single(item: Item, number: int) -> bool:
    """The issue is held as a single: in the marks' `issues_owned`."""
    return number in expand(parse_ranges(item.issues_owned))


def also_in_rows(
    item_id: uuid.UUID,
    books: dict[uuid.UUID, tuple[ComicVolume, str]],
    slugs: dict[uuid.UUID, str] | None = None,
) -> list[PublicIssueAlsoIn]:
    """The `also_in` entries for books (volume id -> (volume, its title's
    name)): the page's own title first, then by title name, `line_number`
    nulls last, position. Pure, so the e2e fixtures use it too."""
    ordered = sorted(
        books.values(),
        key=lambda pair: (
            pair[0].item_id != item_id,
            pair[1].casefold(),
            pair[1],
            *line_order(pair[0]),
        ),
    )
    return [
        PublicIssueAlsoIn(
            slug=volume.slug,
            label=volume.label,
            kind=volume.kind,
            line_number=volume.line_number,
            title_id=volume.item_id,
            title_slug=(slugs or {}).get(volume.item_id),
            title=title,
            same_title=volume.item_id == item_id,
        )
        for volume, title in ordered
    ]


async def build_issue_page(
    session: AsyncSession, item_id: uuid.UUID, number: int, today: date
) -> PublicIssuePage | None:
    if not 1 <= number <= MAX_ISSUE:
        return None
    item = await _public_comic(session, item_id)
    if item is None:
        return None
    series = series_of(item, held_ranges(await load_holds(session, item.id)))
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
    also_in = await _also_in(session, item, number)
    return PublicIssuePage(
        series_id=item.id,
        series_slug=item.slug,
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
        held_single=held_single(item, number),
        also_in=also_in,
        released=released,
        ongoing=series.ongoing,
        neighbours=_neighbours(number, held, released, upcoming, rows),
        source_url=_comic_vine_url(item) or COMIC_VINE_HOME,
    )


_line_order = line_order


def _neighbour(volume: ComicVolume | None) -> PublicVolumeNeighbour | None:
    if volume is None:
        return None
    return PublicVolumeNeighbour(
        slug=volume.slug, label=volume.label, line_number=volume.line_number
    )


def _paragraphs(text: str | None) -> list[str]:
    return [p.strip() for p in (text or "").split("\n\n") if p.strip()]


async def _linkable_numbers(
    session: AsyncSession, item_ids: set[uuid.UUID], today: date
) -> dict[uuid.UUID, list[int]]:
    """For each of these titles that is a public comic, the issue numbers a
    collects entry may link to: those whose issue page exists (the rule of the
    issue route, `_page_numbers`) and that Comic Vine has synced. A skip is
    deliberately not read: it changes no public body, so it must not change a
    link either. A title missing from the result is not linkable at all."""
    out: dict[uuid.UUID, list[int]] = {}
    for item_id in sorted(item_ids, key=str):
        item = await _public_comic(session, item_id)
        if item is None:
            continue
        series = series_of(item, held_ranges(await load_holds(session, item.id)))
        rows = await load_issues(session, item.id, include_stubs=True)
        held = _held(series, rows)
        pages = set(
            _page_numbers(held, series.run().released, _upcoming(series, today))
        )
        out[item.id] = sorted(
            r.number for r in rows if r.cv_id is not None and r.number in pages
        )
    return out


def _link(
    entry: ComicVolumeCollect, linkable: dict[uuid.UUID, list[int]]
) -> PublicVolumeLink | None:
    """The entry's range cut to the issue numbers that have a page: from the
    first to the last of them inside it, or no link when none is."""
    low, high = entry.from_number, entry.to_number
    if entry.item_id is None or entry.item_id not in linkable:
        return None
    if low is None or high is None or not 1 <= low <= high <= MAX_ISSUE:
        return None
    inside = [n for n in linkable[entry.item_id] if low <= n <= high]
    if not inside:
        return None
    return PublicVolumeLink(
        item_id=entry.item_id, from_number=inside[0], to_number=inside[-1]
    )


async def build_volume_page(
    session: AsyncSession, item_id: uuid.UUID, slug: str, today: date
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
    linkable = await _linkable_numbers(
        session, {e.item_id for e in entries if e.item_id is not None}, today
    )
    credit = (
        {"metron_credit": True} if any(e.source == "metron" for e in entries) else {}
    )
    return PublicVolumePage(
        **credit,
        title=PublicVolumeTitle(
            id=item.id,
            slug=item.slug,
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
    rule as the issue route: `_state` is non-empty) and its owned volumes. The
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
    ranges = await public_holds(session, items)
    out = []
    for item in sorted(items, key=lambda i: (i.title, str(i.id))):
        series = series_of(item, ranges[item.id])
        released = series.run().released
        upcoming = _upcoming(series, today)
        every = by_item[item.id]
        held = _held(series, every.values())
        # Names and covers come only from Comic Vine's rows, never a stub.
        rows = {n: r for n, r in every.items() if r.cv_id is not None}
        numbers = _page_numbers(held, released, upcoming)
        out.append(
            PublicComicIndex(
                item_id=item.id,
                item_slug=item.slug,
                series_title=item.title,
                kind=title_kind(len(volumes[item.id]), loose_issues(item)),
                issues=[
                    PublicComicIndexIssue(
                        number=n,
                        name=rows[n].name if n in rows else None,
                        cover_url=rows[n].cover_url if n in rows else None,
                    )
                    for n in numbers
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
