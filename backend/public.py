"""The public, read-only view of the collection.

The only unauthenticated router in the application, and the only part of the
public site that calls the API at all -- every other public page ships its
content in the frontend bundle so it renders while the free-tier backend is
asleep.

Everything here is deliberately an allowlist. The response model names the
fields that may be published rather than serializing the ORM object, because
the failure mode of the latter is silent: adding a private column later would
publish it with no code change, no review signal, and no failing test.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from formats import KEY_CARD_PLATFORMS
from models import (
    Completeness,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalFormat,
)

# Lifted out of the source_metadata snapshot rather than publishing the
# snapshot itself: its shape varies per source and may carry fields nobody
# reviewed for publication. The detail page adds two more; `similar_games` is
# read by the similarity helper and never serialized.
# `time_to_beat` is read on the list only to derive time_to_beat_hours; the
# object itself is published on the detail page alone.
PUBLIC_METADATA_FIELDS = ("genres", "community_score", "platforms", "time_to_beat")
PUBLIC_DETAIL_METADATA_FIELDS = PUBLIC_METADATA_FIELDS + (
    "description",
    "community_votes",
    "themes",
)

# The item page's "More from this shelf" strip, and the one source whose
# snapshot carries similar_games links.
SIMILAR_LIMIT = 8
SIMILAR_SOURCE = "igdb"
SIMILAR_MIN_SHARED_GENRES = 2


class PublicItemOut(BaseModel):
    """An item as the public site may see it.

    Written by hand. `notes` and `owned_format` are absent by construction --
    what someone privately thought of a film, and whether they own it, are not
    part of a showcase.
    """

    id: uuid.UUID
    type: ItemType
    title: str
    year: int | None
    creator: str | None
    cover_url: str | None
    status: ItemStatus
    rating: int | None
    favorite: bool
    finished_at: date | None
    genres: list[str]
    community_score: float | None
    platforms: list[str]
    created_at: datetime
    # Derived, never the column: whether a copy is physical, digital or
    # borrowed stays private, and only "on the want list" is published.
    wanted: bool
    # The copy on the shelf. Its cart ID, region, format source and dates of
    # acquisition are not part of a showcase.
    release_date: date | None
    platform: str | None
    physical_format: PhysicalFormat | None
    completeness: Completeness | None
    # The "normally" figure to the nearest hour, for a card that has one line.
    time_to_beat_hours: int | None


class PublicTimeToBeat(BaseModel):
    """IGDB's community times, in hours; a figure nobody submitted is null."""

    hastily: float | None
    normally: float | None
    completely: float | None
    count: int | None


class PublicItemCard(BaseModel):
    """The minimum a cover strip needs, so it costs no second request."""

    id: uuid.UUID
    type: ItemType
    title: str
    cover_url: str | None


class PublicItemDetailOut(PublicItemOut):
    """One item for its own page: the list fields plus what only it shows."""

    description: str | None
    community_votes: int | None
    times_completed: int
    started_at: date | None
    similar_in_collection: list[PublicItemCard]
    themes: list[str]
    time_to_beat: PublicTimeToBeat | None


class PublicFormatCounts(BaseModel):
    """Owned public copies on one key-card platform, by physical format.

    Unknown is its own count and never folded into the cartridges: a copy
    whose format was not recorded may be a Game-Key Card.
    """

    game_card: int
    game_key_card: int
    code_in_box: int
    unknown: int
    total: int


class PublicStatsOut(BaseModel):
    """Aggregates over the public rows only."""

    total: int
    by_type: dict[str, int]
    by_status: dict[str, int]
    rating_histogram: dict[str, int]
    finishes_by_month: dict[str, int]
    # `total` includes the want list; the hero number is what is owned.
    owned: int
    finished_this_year: int
    # Null, not 0, when nothing is rated: 0 would read as the lowest score.
    average_rating: float | None
    by_platform: dict[str, int]
    # Keyed by IGDB platform id, for key-card platforms only.
    by_format: dict[str, PublicFormatCounts]


def _string_list(value: object) -> list[str]:
    """A snapshot list as strings, tolerating a missing or malformed value."""
    if not isinstance(value, list):
        return []
    return [str(entry) for entry in value if entry]


def _number(value: object) -> float | None:
    # bool is an int subclass; a stray True is not a score.
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _allowed_snapshot(item: Item, fields: tuple[str, ...]) -> dict:
    """Only the named snapshot keys; everything else never leaves the row."""
    raw = item.source_metadata or {}
    return {key: raw.get(key) for key in fields}


def _time_to_beat(snapshot: dict) -> PublicTimeToBeat | None:
    raw = snapshot.get("time_to_beat")
    if not isinstance(raw, dict):
        return None
    return PublicTimeToBeat(
        hastily=_number(raw.get("hastily")),
        normally=_number(raw.get("normally")),
        completely=_number(raw.get("completely")),
        count=raw.get("count") if isinstance(raw.get("count"), int) else None,
    )


def _list_fields(item: Item) -> dict:
    """The publishable list fields, named one by one."""
    snapshot = _allowed_snapshot(item, PUBLIC_METADATA_FIELDS)
    return {
        "id": item.id,
        "type": item.type,
        "title": item.title,
        "year": item.year,
        "creator": item.creator,
        "cover_url": item.cover_url,
        "status": item.status,
        "rating": item.rating,
        "favorite": item.favorite,
        "finished_at": item.finished_at,
        "genres": _string_list(snapshot.get("genres")),
        "community_score": _number(snapshot.get("community_score")),
        "platforms": _string_list(snapshot.get("platforms")),
        "created_at": item.created_at,
        # NULL is owned: the want list is only what was explicitly marked so.
        "wanted": item.owned_format == OwnedFormat.NONE,
        "release_date": item.release_date,
        "platform": item.platform,
        "physical_format": item.physical_format,
        "completeness": item.completeness,
        "time_to_beat_hours": _hours(_time_to_beat(snapshot)),
    }


def _hours(time_to_beat: PublicTimeToBeat | None) -> int | None:
    if time_to_beat is None or time_to_beat.normally is None:
        return None
    return round(time_to_beat.normally)


def _to_public(item: Item) -> PublicItemOut:
    """Maps a row onto the publishable fields, and only those."""
    return PublicItemOut(**_list_fields(item))


def _similar_ids(item: Item) -> set[str]:
    """IGDB ids this item's snapshot links to, as external_id strings.

    Snapshot ids are ints and external_id is a string column, so the
    comparison has to happen on one side's terms.
    """
    if item.external_source != SIMILAR_SOURCE:
        return set()
    links = (item.source_metadata or {}).get("similar_games")
    if not isinstance(links, list):
        return set()
    return {str(link) for link in links}


def _is_linked(item: Item, other: Item) -> bool:
    """True when either IGDB row lists the other in similar_games."""
    if item.external_source != SIMILAR_SOURCE:
        return False
    if other.external_source != SIMILAR_SOURCE:
        return False
    return other.external_id in _similar_ids(item) or (
        item.external_id in _similar_ids(other)
    )


def similar_in_collection(item: Item, candidates: list[Item]) -> list[Item]:
    """Other public items linked to this one, or sharing two genres.

    Pure over rows already loaded. Rating descending with unrated last, then
    title; capped for the strip.
    """
    genres = set(_string_list((item.source_metadata or {}).get("genres")))
    matches = []
    for other in candidates:
        if other.id == item.id:
            continue
        shared = genres & set(_string_list((other.source_metadata or {}).get("genres")))
        if _is_linked(item, other) or len(shared) >= SIMILAR_MIN_SHARED_GENRES:
            matches.append(other)
    matches.sort(
        key=lambda other: (
            other.rating is None,
            -(other.rating or 0),
            other.title.casefold(),
        )
    )
    return matches[:SIMILAR_LIMIT]


def _to_public_detail(item: Item, similar: list[Item]) -> PublicItemDetailOut:
    """Maps a row onto the item page's publishable fields, and only those."""
    snapshot = _allowed_snapshot(item, PUBLIC_DETAIL_METADATA_FIELDS)
    description = snapshot.get("description")
    votes = snapshot.get("community_votes")
    return PublicItemDetailOut(
        **_list_fields(item),
        description=description if isinstance(description, str) else None,
        community_votes=(
            votes if isinstance(votes, int) and not isinstance(votes, bool) else None
        ),
        times_completed=item.times_completed,
        started_at=item.started_at,
        themes=_string_list(snapshot.get("themes")),
        time_to_beat=_time_to_beat(snapshot),
        similar_in_collection=[
            PublicItemCard(
                id=other.id,
                type=other.type,
                title=other.title,
                cover_url=other.cover_url,
            )
            for other in similar
        ],
    )


def create_public_router(factory: async_sessionmaker[AsyncSession]) -> APIRouter:
    """Builds the unauthenticated collection routes.

    Deliberately has no require_admin dependency. Every query filters on
    is_public, so the gate is the data rather than the caller.
    """
    router = APIRouter(prefix="/api/public", tags=["public"])

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    @router.get("/items", response_model=list[PublicItemOut])
    async def list_public_items(
        session: AsyncSession = Depends(get_session),
    ) -> list[PublicItemOut]:
        """Every item flagged public, most recently finished first."""
        statement = (
            select(Item)
            .where(Item.is_public.is_(True))
            .order_by(Item.finished_at.desc().nullslast(), Item.created_at.desc())
        )
        result = await session.execute(statement)
        return [_to_public(item) for item in result.scalars()]

    @router.get("/stats", response_model=PublicStatsOut)
    async def public_stats(
        session: AsyncSession = Depends(get_session),
    ) -> PublicStatsOut:
        """Counts over public rows, computed in SQL.

        Aggregated by the database rather than by loading every row into
        Python: the page renders these next to the grid, and a collection is
        expected to outgrow the point where counting in the application is
        reasonable.
        """
        public = Item.is_public.is_(True)

        by_type = await session.execute(
            select(Item.type, func.count()).where(public).group_by(Item.type)
        )
        by_status = await session.execute(
            select(Item.status, func.count()).where(public).group_by(Item.status)
        )
        ratings = await session.execute(
            select(Item.rating, func.count())
            .where(public, Item.rating.is_not(None))
            .group_by(Item.rating)
        )
        month = func.to_char(Item.finished_at, "YYYY-MM")
        finishes = await session.execute(
            select(month, func.count())
            .where(public, Item.finished_at.is_not(None))
            .group_by(month)
            .order_by(month)
        )

        # The current calendar year in UTC, bounded as a date range so the
        # index on finished_at can serve it.
        year = datetime.now(UTC).year
        this_year = Item.finished_at.between(date(year, 1, 1), date(year, 12, 31))
        totals = await session.execute(
            select(
                func.count().filter(
                    Item.owned_format.is_distinct_from(OwnedFormat.NONE)
                ),
                func.count().filter(this_year),
                func.round(func.avg(Item.rating), 1),
            ).where(public)
        )
        owned, finished_this_year, average = totals.one()

        platforms = await session.execute(
            select(Item.platform, func.count())
            .where(public, Item.platform.is_not(None))
            .group_by(Item.platform)
        )
        formats = await session.execute(
            select(Item.platform_id, Item.physical_format, func.count())
            .where(
                public,
                Item.owned_format.is_distinct_from(OwnedFormat.NONE),
                Item.platform_id.in_(KEY_CARD_PLATFORMS),
            )
            .group_by(Item.platform_id, Item.physical_format)
        )
        by_format: dict[str, dict[str, int]] = {}
        for platform, physical_format, count in formats:
            counts = by_format.setdefault(
                str(platform),
                {
                    "game_card": 0,
                    "game_key_card": 0,
                    "code_in_box": 0,
                    "unknown": 0,
                    "total": 0,
                },
            )
            # A disc counts toward the total and nothing else.
            key = "unknown" if physical_format is None else physical_format.value
            if key in counts:
                counts[key] += count
            counts["total"] += count

        type_counts = {row[0].value: row[1] for row in by_type}
        return PublicStatsOut(
            total=sum(type_counts.values()),
            by_type=type_counts,
            by_status={row[0].value: row[1] for row in by_status},
            rating_histogram={str(row[0]): row[1] for row in ratings},
            finishes_by_month={row[0]: row[1] for row in finishes},
            owned=owned,
            finished_this_year=finished_this_year,
            average_rating=float(average) if average is not None else None,
            by_platform={row[0]: row[1] for row in platforms},
            by_format={
                platform: PublicFormatCounts(**counts)
                for platform, counts in by_format.items()
            },
        )

    # Declared last, after the literal /items and /stats: a typed uuid would
    # 422 rather than fall through, but the order keeps that from mattering.
    @router.get("/items/{item_id}", response_model=PublicItemDetailOut)
    async def get_public_item(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> PublicItemDetailOut:
        """One public item with its similar-items strip.

        Unknown and private ids both 404: a 403 would confirm that a private
        row exists at that id.
        """
        result = await session.execute(select(Item).where(Item.is_public.is_(True)))
        public_items = list(result.scalars())
        item = next((row for row in public_items if row.id == item_id), None)
        if item is None:
            raise HTTPException(status_code=404, detail="Not found")
        return _to_public_detail(item, similar_in_collection(item, public_items))

    return router
