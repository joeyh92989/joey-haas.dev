"""The public wall, issue page and collected-edition page of a comic series.

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
    edition_slugs,
    expand,
    next_issue,
    parse_ranges,
)
from models import ComicIssue, Item, ItemType
from public_comics import _editions, public_comic_items, series_of

COMIC_VINE_HOST = "comicvine.gamespot.com"
# The Comic Vine home page, for a series that has no page of its own stored.
COMIC_VINE_HOME = f"https://{COMIC_VINE_HOST}/"
NEIGHBOURS = 4


class PublicWallIssue(BaseModel):
    number: int
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


class PublicComicIndex(BaseModel):
    """GET /api/public/comic-issues: the build's list of issue and edition
    pages, for their link-preview heads. No state, ownership or skip."""

    item_id: uuid.UUID
    series_title: str
    issues: list[PublicComicIndexIssue]
    editions: list[PublicComicIndexEdition]


async def _public_comic(session: AsyncSession, item_id: uuid.UUID) -> Item | None:
    """One row by id, held to the public predicate."""
    result = await session.execute(
        select(Item).where(
            Item.id == item_id,
            Item.is_public.is_(True),
            Item.type == ItemType.COMIC,
        )
    )
    return result.scalar_one_or_none()


def _comic_vine_url(item: Item) -> str | None:
    url = (item.source_metadata or {}).get("source_url")
    if not isinstance(url, str):
        return None
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or parsed.hostname != COMIC_VINE_HOST:
        return None
    return url


def _state(
    number: int, series: ComicSeries, released: int, upcoming: int | None
) -> str:
    """read, owned, missing, or not-out (the next dated issue, beyond what is
    released). None for a number with no page."""
    if number in series.owned:
        read_to = series.read_to
        return "read" if read_to is not None and number <= read_to else "owned"
    if number <= released:
        return "missing"
    return "not-out" if number == upcoming else ""


def _page_numbers(
    series: ComicSeries, released: int, upcoming: int | None
) -> list[int]:
    """The issue numbers that have a page: the one rule of the issue route, the
    wall and the index."""
    candidates = {*range(1, released + 1), *series.owned}
    if upcoming is not None:
        candidates.add(upcoming)
    return sorted(
        n
        for n in candidates
        if 1 <= n <= MAX_ISSUE and _state(n, series, released, upcoming)
    )


def _upcoming(series: ComicSeries, today: date) -> int | None:
    issue = next_issue(series, today)
    return issue.count if issue is not None else None


def _neighbours(
    around: int,
    series: ComicSeries,
    released: int,
    upcoming: int | None,
    rows: dict[int, ComicIssue],
) -> list[PublicNeighbour]:
    """The strip around an issue, the issue itself included (the page marks and
    centres on it)."""
    out = []
    for number in range(max(1, around - NEIGHBOURS), around + NEIGHBOURS + 1):
        state = _state(number, series, released, upcoming)
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
    session: AsyncSession, item_id: uuid.UUID, today: date
) -> PublicWall | None:
    item = await _public_comic(session, item_id)
    if item is None:
        return None
    series = series_of(item)
    released = series.run().released
    numbers = set(_page_numbers(series, released, _upcoming(series, today)))
    rows = await load_issues(session, item.id)
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
    state = _state(number, series, released, upcoming)
    if not state:
        return None
    # The issue in full; its strip needs only the covers around it.
    full = await load_issues(session, item.id, number, number, with_description=True)
    row = full[0] if full else None
    rows = {
        r.number: r
        for r in await load_issues(
            session,
            item.id,
            max(1, number - NEIGHBOURS),
            number + NEIGHBOURS,
        )
    }
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
        neighbours=_neighbours(number, series, released, upcoming, rows),
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
    rows = {row.number: row for row in await load_issues(session, item.id, low, high)}
    collected = [rows[n] for n in range(low, high + 1) if n in rows]
    cover = edition.get("cover_url") or next(
        (r.cover_url for r in collected if r.cover_url), None
    )
    large = edition.get("large_url") or next(
        (r.large_url for r in collected if r.large_url), None
    )
    read_to = series.read_to
    if read_to is not None and read_to >= high:
        read, shown = "all", high
    elif read_to is not None and read_to >= low:
        read, shown = "to", read_to
    else:
        read, shown = "not-yet", None
    after = high + 1
    if index + 1 < len(editions):
        following = PublicEditionNext(
            slug=slugs[index + 1], label=editions[index + 1]["label"]
        )
    elif _state(after, series, released, upcoming):
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
                state=_state(n, series, released, upcoming) or "owned",
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
            .where(ComicIssue.item_id.in_(list(by_item)))
            .options(defer(ComicIssue.description))
        )
        for row in result:
            by_item[row.item_id][row.number] = row
    out = []
    for item in sorted(items, key=lambda i: (i.title, str(i.id))):
        series = series_of(item)
        released = series.run().released
        upcoming = _upcoming(series, today)
        rows = by_item[item.id]
        numbers = _page_numbers(series, released, upcoming)
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
            )
        )
    return out
