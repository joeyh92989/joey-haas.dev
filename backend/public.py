"""The public, read-only view of the collection.

The only unauthenticated data router. /spine and /spine/:id are the
only pages that call it; Home and Projects read a build-time snapshot of it
instead (frontend/scripts/fetch-snapshot.mjs), so every other public page
renders while the free-tier backend is asleep.

Everything here is deliberately an allowlist. The response model names the
fields that may be published rather than serializing the ORM object, because
the failure mode of the latter is silent: adding a private column later would
publish it with no code change, no review signal, and no failing test.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from dataclasses import field as dc_field
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from formats import KEY_CARD_PLATFORMS
from models import (
    Completeness,
    Item,
    ItemStatus,
    ItemType,
    MovieDiscFormat,
    OwnedFormat,
    PhysicalFormat,
    PlaySession,
    Playthrough,
    PlaythroughOutcome,
)
from physical_sources import registry, registry_switch1, tracker
from physical_sources.catalogue import status_counts
from physical_sources.stores import STORES
from public_comics import (
    PublicComicDetail,
    PublicComicsOut,
    comic_detail,
    load_public_comics,
)
from public_issues import (
    PublicComicIndex,
    PublicEditionPage,
    PublicIssuePage,
    PublicWall,
    build_edition_page,
    build_issue_page,
    build_wall,
    load_comic_index,
)
from public_next_cache import PublicNextCache
from public_outputs import (
    PublicNextOut,
    PublicSpot,
    PublicStatusOut,
    load_public_next,
    load_public_spots,
)
from public_pick_for_me import PublicPickForMeOut, load_pick_for_me

# The owner's calendar. "Finished this year" turns over at midnight in
# Denver, not at 17:00 there on 31 December, which is UTC midnight.
OWNER_TZ = ZoneInfo("America/Denver")

# The runs that date the status strip's "Last refreshed": the stores and the
# registries, as on the Dashboard (lib/nightly.js, ANCHOR_KINDS). Resolve and
# Refresh N64 are pressed by hand, and would move it.
REFRESH_SOURCES = (*STORES, registry.SOURCE, tracker.SOURCE, registry_switch1.SOURCE)

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
    disc_format: MovieDiscFormat | None
    completeness: Completeness | None
    # The "normally" figure to the nearest hour, for a card that has one line.
    time_to_beat_hours: int | None
    # Up next (D2): whether this is the game being played next. When it was
    # pinned stays private.
    pinned: bool
    # The open run's start on an active or paused game, else null: after a
    # replay or Try again, "Started" and "Playing since" differ. On the list
    # too, so the shelf's Now playing band needs no second request.
    playing_since: date | None = None
    # Play states: when a paused game was set aside, and every dated finish
    # (replays included), ascending. The playthrough rows stay admin-only.
    paused_on: date | None = None
    finishes: list[date] = []
    # Finished runs, dated or not: the poster's ×n mark, and the number a
    # finish takes when earlier ones were never dated.
    times_completed: int = 0
    # The latest journal day, date only: the Now playing bands order by it
    # and the Continue card says "last played". Minutes and notes stay
    # on the diary and the owner's journal.
    last_played_on: date | None = None


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
    started_at: date | None
    similar_in_collection: list[PublicItemCard]
    themes: list[str]
    time_to_beat: PublicTimeToBeat | None
    # A comic's run, issues and editions; null for every other type.
    comic: PublicComicDetail | None = None


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


class PublicDiaryEntry(BaseModel):
    """One day a public game was played. Written by hand: the session's note
    is the owner's and is absent by construction, as is any other item field
    the shelf does not already show."""

    item_id: uuid.UUID
    title: str
    cover_url: str | None
    platform: str | None
    played_on: date
    minutes: int | None


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


@dataclass
class _Runs:
    """What the public pages read from one item's playthroughs."""

    paused_on: date | None = None
    finishes: list[date] = dc_field(default_factory=list)
    # Run 1's start: the item page's "Started", never a replay's.
    first_started: date | None = None
    # The open run's start: "Playing since" on an active or paused game.
    open_started: date | None = None


RunDates = dict[uuid.UUID, _Runs]


async def _run_dates(session: AsyncSession, *where) -> RunDates:
    """Each item's run dates, for the items `where` selects.

    One query joined on the item, one of the three a list read takes
    (the rows, their run dates and their latest journal day).
    """
    rows = await session.execute(
        select(
            Playthrough.item_id,
            Playthrough.number,
            Playthrough.outcome,
            Playthrough.started_on,
            Playthrough.finished_on,
            Playthrough.paused_on,
        )
        .join(Item, Item.id == Playthrough.item_id)
        .where(*where)
        .order_by(Playthrough.item_id, Playthrough.finished_on)
    )
    dates: RunDates = {}
    for item_id, number, outcome, started_on, finished_on, paused_on in rows:
        runs = dates.setdefault(item_id, _Runs())
        if outcome == PlaythroughOutcome.FINISHED and finished_on is not None:
            runs.finishes.append(finished_on)
        if outcome is None:
            runs.paused_on = paused_on
            runs.open_started = started_on
        if number == 1:
            runs.first_started = started_on
    return dates


LastPlayed = dict[uuid.UUID, date]


async def _last_played(session: AsyncSession, *where) -> LastPlayed:
    """Each item's latest journal day, for the items `where` selects."""
    rows = await session.execute(
        select(PlaySession.item_id, func.max(PlaySession.played_on))
        .join(Item, Item.id == PlaySession.item_id)
        .where(*where)
        .group_by(PlaySession.item_id)
    )
    return {item_id: played_on for item_id, played_on in rows}


def _list_fields(
    item: Item, runs: RunDates | None = None, played: LastPlayed | None = None
) -> dict:
    """The publishable list fields, named one by one."""
    item_runs = (runs or {}).get(item.id)
    dates = item_runs or _Runs()
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
        "disc_format": item.disc_format,
        "completeness": item.completeness,
        "time_to_beat_hours": _hours(_time_to_beat(snapshot)),
        "pinned": item.pinned_at is not None,
        "playing_since": _start_fields(item, item_runs)["playing_since"],
        "paused_on": dates.paused_on if item.status == ItemStatus.PAUSED else None,
        "finishes": dates.finishes,
        "times_completed": item.times_completed,
        "last_played_on": (played or {}).get(item.id),
    }


def _hours(time_to_beat: PublicTimeToBeat | None) -> int | None:
    if time_to_beat is None or time_to_beat.normally is None:
        return None
    return round(time_to_beat.normally)


def _to_public(
    item: Item, runs: RunDates | None = None, played: LastPlayed | None = None
) -> PublicItemOut:
    """Maps a row onto the publishable fields, and only those."""
    return PublicItemOut(**_list_fields(item, runs, played))


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


def _start_fields(item: Item, dates: _Runs | None) -> dict:
    """When the game was first started, and when the current run was.

    `started_at` is run 1's start rather than the item column, which is the
    earliest start of any run: with run 1 undated, that would be a replay's
    date presented as the first. An item with no runs keeps its column.
    """
    in_play = item.status in (ItemStatus.ACTIVE, ItemStatus.PAUSED)
    if dates is None:
        started = item.started_at
        return {"started_at": started, "playing_since": started if in_play else None}
    return {
        "started_at": dates.first_started,
        "playing_since": dates.open_started if in_play else None,
    }


def _to_public_detail(
    item: Item,
    similar: list[Item],
    today: date | None = None,
    runs: RunDates | None = None,
    played: LastPlayed | None = None,
) -> PublicItemDetailOut:
    """Maps a row onto the item page's publishable fields, and only those."""
    snapshot = _allowed_snapshot(item, PUBLIC_DETAIL_METADATA_FIELDS)
    description = snapshot.get("description")
    votes = snapshot.get("community_votes")
    return PublicItemDetailOut(
        **_list_fields(item, runs, played),
        description=description if isinstance(description, str) else None,
        community_votes=(
            votes if isinstance(votes, int) and not isinstance(votes, bool) else None
        ),
        started_at=_start_fields(item, (runs or {}).get(item.id))["started_at"],
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
        comic=(
            comic_detail(item, today or datetime.now(UTC).date())
            if item.type == ItemType.COMIC
            else None
        ),
    )


def create_public_router(factory: async_sessionmaker[AsyncSession]) -> APIRouter:
    """Builds the unauthenticated collection routes.

    Deliberately has no require_admin dependency. Every query filters on
    is_public, so the gate is the data rather than the caller.
    """
    router = APIRouter(prefix="/api/public", tags=["public"])
    # One per router, so one per app: /next's body, rebuilt only when its
    # inputs change (public_next_cache.py).
    next_cache: PublicNextCache[PublicNextOut] = PublicNextCache()
    pick_cache: PublicNextCache[PublicPickForMeOut] = PublicNextCache()

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
        runs = await _run_dates(session, Item.is_public.is_(True))
        played = await _last_played(session, Item.is_public.is_(True))
        return [_to_public(item, runs, played) for item in result.scalars()]

    @router.get("/diary", response_model=list[PublicDiaryEntry])
    async def public_diary(
        year: int = Query(ge=2000, le=2100),
        session: AsyncSession = Depends(get_session),
    ) -> list[PublicDiaryEntry]:
        """A year of play sessions, public games only, most recent first."""
        statement = (
            select(PlaySession, Item)
            .join(Item, Item.id == PlaySession.item_id)
            .where(
                Item.is_public.is_(True),
                PlaySession.played_on >= date(year, 1, 1),
                PlaySession.played_on <= date(year, 12, 31),
            )
            .order_by(PlaySession.played_on.desc(), PlaySession.created_at.desc())
        )
        return [
            PublicDiaryEntry(
                item_id=item.id,
                title=item.title,
                cover_url=item.cover_url,
                platform=item.platform,
                played_on=row.played_on,
                minutes=row.minutes,
            )
            for row, item in (await session.execute(statement)).all()
        ]

    @router.get("/stats", response_model=PublicStatsOut)
    async def public_stats(
        type: ItemType | None = Query(None),
        session: AsyncSession = Depends(get_session),
    ) -> PublicStatsOut:
        """Counts over public rows, computed in SQL.

        Aggregated by the database rather than by loading every row into
        Python: the page renders these next to the grid, and a collection is
        expected to outgrow the point where counting in the application is
        reasonable.

        With ``type`` every figure counts that type only, so the Games page
        is not counting comics. Private rows are out either way.
        """
        public = Item.is_public.is_(True)
        if type is not None:
            public = and_(public, Item.type == type)

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
        # Finishes are counted per playthrough, so a replay counts in the
        # month it was finished again; a dateless finish is in no month.
        finished_run = (
            Playthrough.outcome == PlaythroughOutcome.FINISHED,
            Playthrough.finished_on.is_not(None),
        )
        month = func.to_char(Playthrough.finished_on, "YYYY-MM")
        finishes = await session.execute(
            select(month, func.count())
            .join(Item, Item.id == Playthrough.item_id)
            .where(public, *finished_run)
            .group_by(month)
            .order_by(month)
        )

        # The owner's current calendar year, bounded as a date range so the
        # index on finished_on can serve it.
        year = datetime.now(OWNER_TZ).year
        finished_this_year = await session.scalar(
            select(func.count())
            .select_from(Playthrough)
            .join(Item, Item.id == Playthrough.item_id)
            .where(
                public,
                *finished_run,
                Playthrough.finished_on.between(date(year, 1, 1), date(year, 12, 31)),
            )
        )
        totals = await session.execute(
            select(
                func.count().filter(
                    Item.owned_format.is_distinct_from(OwnedFormat.NONE)
                ),
                func.round(func.avg(Item.rating), 1),
            ).where(public)
        )
        owned, average = totals.one()

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

    @router.get("/next", response_model=PublicNextOut)
    async def public_next(
        session: AsyncSession = Depends(get_session),
    ) -> PublicNextOut:
        """What's next: tonight's games, the wanted list, and what to look
        for in a store. Read-only; names only public games; no store data.
        Served from next_cache while the data it was built from is unchanged."""
        return await next_cache.get(session, datetime.now(UTC), load_public_next)

    @router.get("/pick-for-me", response_model=PublicPickForMeOut)
    async def public_pick_for_me(
        session: AsyncSession = Depends(get_session),
    ) -> PublicPickForMeOut:
        """Pick for me: every size and mood combination's top three, over
        public games only (public_pick_for_me.py). Read-only. Served from
        pick_cache on the same fingerprint as /next."""
        return await pick_cache.get(session, datetime.now(UTC), load_pick_for_me)

    @router.get("/comics", response_model=PublicComicsOut)
    async def public_comics(
        session: AsyncSession = Depends(get_session),
    ) -> PublicComicsOut:
        """/shelf/comics: public series, their stats and the weeks ahead.
        A series that is only followed is private and never listed (D5)."""
        return await load_public_comics(session, datetime.now(UTC).date())

    @router.get("/spots", response_model=list[PublicSpot])
    async def public_spots(
        session: AsyncSession = Depends(get_session),
    ) -> list[PublicSpot]:
        """/denver: published spots, never an anchor (public_outputs.py)."""
        return await load_public_spots(session)

    @router.get("/status", response_model=PublicStatusOut)
    async def public_status(
        response: Response,
        session: AsyncSession = Depends(get_session),
    ) -> PublicStatusOut:
        """The /spine status strip: when the catalogue last refreshed and how
        big it is. Uncached on the server (four counts over about 10k rows);
        the header spares repeat visits."""
        response.headers["Cache-Control"] = "public, max-age=300"
        counts = await status_counts(session, REFRESH_SOURCES)
        return PublicStatusOut(**counts, stores_watched=len(STORES))

    @router.get("/comic-issues", response_model=list[PublicComicIndex])
    async def public_comic_issues(
        session: AsyncSession = Depends(get_session),
    ) -> list[PublicComicIndex]:
        """The build's list of issue and edition pages (their link-preview
        heads): public series only, numbers that have a page, no state."""
        return await load_comic_index(session, datetime.now(UTC).date())

    @router.get("/items/{item_id}/issues", response_model=PublicWall)
    async def public_wall(
        item_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> PublicWall:
        """The cover wall of one public comic series: its issues and editions."""
        wall = await build_wall(session, item_id, datetime.now(UTC).date())
        if wall is None:
            raise HTTPException(status_code=404, detail="Not found")
        return wall

    @router.get("/items/{item_id}/issues/{number}", response_model=PublicIssuePage)
    async def public_issue_page(
        item_id: uuid.UUID,
        number: str,
        session: AsyncSession = Depends(get_session),
    ) -> PublicIssuePage:
        """One issue of a public comic series; 404 past the run or for a
        non-number."""
        if len(number) > 4 or not (number.isascii() and number.isdigit()):
            raise HTTPException(status_code=404, detail="Not found")
        page = await build_issue_page(
            session, item_id, int(number), datetime.now(UTC).date()
        )
        if page is None:
            raise HTTPException(status_code=404, detail="Not found")
        return page

    @router.get("/items/{item_id}/editions/{slug}", response_model=PublicEditionPage)
    async def public_edition_page(
        item_id: uuid.UUID,
        slug: str,
        session: AsyncSession = Depends(get_session),
    ) -> PublicEditionPage:
        """One collected edition of a public comic series."""
        page = await build_edition_page(
            session, item_id, slug, datetime.now(UTC).date()
        )
        if page is None:
            raise HTTPException(status_code=404, detail="Not found")
        return page

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
        runs = await _run_dates(session, Item.id == item.id)
        played = await _last_played(session, Item.id == item.id)
        return _to_public_detail(
            item, similar_in_collection(item, public_items), runs=runs, played=played
        )

    return router
