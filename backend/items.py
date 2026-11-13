"""CRUD for the media collection. Every route requires the admin session."""

from __future__ import annotations

import asyncio
import logging
import secrets
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import playthroughs
from auth import session_admin
from comics import (
    HELD_FIELDS,
    ISSUE_SNAPSHOT_KEYS,
    RangeError,
    apply_comic_fields,
    row_run,
)
from formats import CopyFieldError, apply_copy_fields
from models import (
    ComicIssue,
    ComicShelfFormat,
    Completeness,
    FormatSource,
    IntakeArea,
    IntakeEntry,
    IntakeEntryState,
    IntakeSitting,
    Item,
    ItemStatus,
    ItemType,
    MovieDiscFormat,
    OwnedFormat,
    PhysicalEdition,
    PhysicalFormat,
    PickAction,
    PickEvent,
    PlaySession,
    Playthrough,
)
from sources.base import (
    SourceAdapter,
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
)
from sources.igdb import PLATFORM_NAMES
from sources.registry import adapter_for

logger = logging.getLogger(__name__)


# The favourites row has room for four covers. A fifth favourite used to be
# saved but never shown, so the cap is enforced here, where every way of
# setting the flag -- the shelf, the edit page, the create form and the photo
# importer -- has to pass through.
FAVORITES_LIMIT = 4
FAVORITES_FULL = f"You already have {FAVORITES_LIMIT} favorites. Remove one first."


class ItemIn(BaseModel):
    """Fields accepted when creating an item."""

    type: ItemType
    title: str = Field(min_length=1, max_length=500)
    status: ItemStatus
    rating: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = None
    is_public: bool = False
    year: int | None = Field(default=None, ge=1880, le=2100)
    creator: str | None = Field(default=None, max_length=300)
    cover_url: str | None = None
    external_source: str | None = Field(default=None, max_length=20)
    external_id: str | None = Field(default=None, max_length=50)
    favorite: bool = False
    started_at: date | None = None
    finished_at: date | None = None
    times_completed: int = Field(default=0, ge=0, le=999)
    owned_format: OwnedFormat | None = None
    source_metadata: dict | None = None
    # The copy on the shelf (formats.py). platform, format_source and
    # pinned_at are deliberately absent: the first two are derived on the
    # server and the third has no writer yet.
    platform_id: int | None = None
    physical_format: PhysicalFormat | None = None
    cart_id: str | None = Field(default=None, max_length=20)
    region: str | None = Field(default=None, max_length=4)
    completeness: Completeness | None = None
    acquired_at: date | None = None
    release_date: date | None = None
    # A comic series (comics.py canonicalises the ranges and refuses them on
    # any other type).
    issues_owned: str | None = Field(default=None, max_length=2000)
    issues_skipped: str | None = Field(default=None, max_length=2000)
    editions: list[dict] | None = None
    read_to: int | None = None
    shelf_format: ComicShelfFormat | None = None
    disc_format: MovieDiscFormat | None = None
    following: bool = False


class ItemPatch(BaseModel):
    """Every field optional: most edits change exactly one thing."""

    type: ItemType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=500)
    status: ItemStatus | None = None
    rating: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = None
    is_public: bool | None = None
    year: int | None = Field(default=None, ge=1880, le=2100)
    creator: str | None = Field(default=None, max_length=300)
    cover_url: str | None = None
    external_source: str | None = Field(default=None, max_length=20)
    external_id: str | None = Field(default=None, max_length=50)
    favorite: bool | None = None
    started_at: date | None = None
    finished_at: date | None = None
    times_completed: int | None = Field(default=None, ge=0)
    owned_format: OwnedFormat | None = None
    # The copy on the shelf (formats.py). platform, format_source and
    # pinned_at are deliberately absent: the first two are derived on the
    # server and the third has no writer yet.
    platform_id: int | None = None
    physical_format: PhysicalFormat | None = None
    cart_id: str | None = Field(default=None, max_length=20)
    region: str | None = Field(default=None, max_length=4)
    completeness: Completeness | None = None
    acquired_at: date | None = None
    release_date: date | None = None
    source_metadata: dict | None = None
    # A comic series (comics.py canonicalises the ranges and refuses them on
    # any other type).
    issues_owned: str | None = Field(default=None, max_length=2000)
    issues_skipped: str | None = Field(default=None, max_length=2000)
    editions: list[dict] | None = None
    read_to: int | None = None
    shelf_format: ComicShelfFormat | None = None
    disc_format: MovieDiscFormat | None = None
    following: bool | None = None
    # "Use registry value" (E7c): the format of this registry edition, with
    # format_source registry. The edition's cart ID is never copied.
    edition_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _refuse_null_for_required(self) -> ItemPatch:
        """An explicit null on a NOT NULL column would reach the database
        as an IntegrityError (a 500); refuse it here as a 422 instead."""
        columns = Item.__table__.columns
        nulled = [
            field
            for field in sorted(self.model_fields_set)
            if getattr(self, field) is None
            and field in columns
            and not columns[field].nullable
        ]
        if nulled:
            raise ValueError(f"{', '.join(nulled)} cannot be null")
        return self


class PlaythroughOut(BaseModel):
    """One run of a game, with the journal days its dates hold."""

    number: int
    started_on: date | None
    finished_on: date | None
    paused_on: date | None
    outcome: str | None
    journal_days: int
    journal_minutes: int
    # The Wrap up sheet's line, written as the run closed or paused.
    note: str | None = None


# The longest line the Wrap up sheet takes (spec, Open questions).
NOTE_MAX = 500


class StatusIn(BaseModel):
    """A status move. `today` is the owner's local date (localToday()).

    `on` dates a Finished, Paused or Abandoned move instead of today, and
    `note` is the line written on the run it touches (playthroughs.py);
    both are refused on other moves.
    """

    status: ItemStatus
    today: date
    on: date | None = None
    note: str | None = Field(default=None, max_length=NOTE_MAX)


class PlaythroughDatesIn(BaseModel):
    """A hand edit of a run's dates; absent fields are left alone."""

    started_on: date | None = None
    finished_on: date | None = None


class PastPlaythroughIn(BaseModel):
    """A finished run from before the tracker knew about it."""

    started_on: date | None = None
    finished_on: date | None = None


NO_RUN = "No such playthrough"

# The fields the status route owns (playthroughs.py). PATCH refuses them
# rather than ignoring them, so a caller that still sends one finds out.
STATUS_FIELDS = ("status", "started_at", "finished_at", "times_completed")
STATUS_FIELDS_REFUSED = (
    "Status and play dates change through POST /api/items/{id}/status "
    "and the playthrough routes, not PATCH."
)


class ItemOut(BaseModel):
    """An item as returned by the API."""

    id: uuid.UUID
    type: ItemType
    title: str
    status: ItemStatus
    rating: int | None
    notes: str | None
    is_public: bool
    year: int | None
    creator: str | None
    cover_url: str | None
    external_source: str | None
    external_id: str | None
    favorite: bool
    started_at: date | None
    finished_at: date | None
    times_completed: int
    owned_format: OwnedFormat | None
    source_metadata: dict | None
    release_date: date | None
    pinned_at: datetime | None
    acquired_at: date | None
    platform_id: int | None
    platform: str | None
    physical_format: PhysicalFormat | None
    format_source: FormatSource | None
    cart_id: str | None
    region: str | None
    completeness: Completeness | None
    issues_owned: str | None = None
    issues_skipped: str | None = None
    editions: list[dict] | None = None
    read_to: int | None = None
    shelf_format: ComicShelfFormat | None = None
    disc_format: MovieDiscFormat | None = None
    following: bool = False
    # Play Next was told never to suggest it; the edit page offers Restore.
    play_next_excluded: bool = False
    # A comic's run against its snapshot (comics.row_run); None otherwise.
    comic_run: dict | None = None
    # Every run, oldest first (playthroughs.py).
    playthroughs: list[PlaythroughOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BulkIn(BaseModel):
    """A batch of items to create in one request.

    Capped because this is a review-then-commit step, not a bulk data load: a
    shelf is tens of items, and an unbounded list would let one request hold a
    connection open for as long as it liked.
    """

    items: list[ItemIn] = Field(min_length=1, max_length=500)


class BulkOut(BaseModel):
    """What a bulk create actually did."""

    created: int
    skipped_duplicates: int
    enriched: int
    ids: list[uuid.UUID]


class RefreshBulkOut(BaseModel):
    """What a bulk refresh did, per linked item.

    `skipped` is a linked item the source returned nothing for (a deleted or
    merged record); `failed` is an item in a batch whose request failed.
    """

    updated: int
    skipped: int
    failed: int


class BulkSetChanges(BaseModel):
    """What a bulk set may change: fields shared by many copies.

    No cart_id: a cart ID belongs to exactly one copy.
    """

    platform_id: int | None = None
    physical_format: PhysicalFormat | None = None
    region: str | None = Field(default=None, max_length=4)
    completeness: Completeness | None = None


class BulkSetIn(BaseModel):
    """The same copy-field change applied to many items at once.

    Capped like BulkIn and VisibilityIn, for the same parameter-ceiling reason.
    """

    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    changes: BulkSetChanges


class BulkSetOut(BaseModel):
    """How many items the change was applied to."""

    updated: int


class DeleteIdsIn(BaseModel):
    """The rows a delete or its preview is about; capped like BulkSetIn."""

    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


class DeletePreviewOut(BaseModel):
    """What deleting those rows takes with them: the rows themselves and the
    child rows that cascade (`ON DELETE CASCADE`), plus the first three titles
    for the confirm to name. Pick events are counted, not shown."""

    items: int
    playthroughs: int
    play_sessions: int
    comic_issues: int
    pick_events: int
    titles: list[str]


class BulkDeleteOut(BaseModel):
    """How many items were deleted."""

    deleted: int


class RedoOut(BaseModel):
    """The intake entry a redo left, and the sitting it sits in."""

    sitting_id: uuid.UUID
    entry_id: uuid.UUID


class VisibilityIn(BaseModel):
    """Which items to publish or hide.

    `ids` omitted or null means every item; a list means exactly those. An
    empty list is therefore meaningfully different from null, and changes
    nothing -- a caller that sent [] intending "all" would otherwise publish
    the whole collection by accident.
    """

    is_public: bool
    # Capped for the same reason BulkIn is: an unbounded list becomes an
    # unbounded IN clause, which fails as a 500 from the driver's parameter
    # ceiling rather than as a 422 anyone can act on.
    ids: list[uuid.UUID] | None = Field(default=None, max_length=500)


class VisibilityOut(BaseModel):
    """How many rows the change applied to.

    Rows *matched*, not rows whose value differed: Postgres reports everything
    the WHERE clause selected, so publishing an already-public collection
    reports all of them rather than zero. Unknown ids are ignored rather than
    raising, so this is also not necessarily the number of ids sent.
    """

    updated: int


class CandidateOut(BaseModel):
    """One picker row: a search hit from an external source."""

    external_source: str
    external_id: str
    title: str
    year: int | None
    thumbnail_url: str | None


def _http_error_for(error: SourceError) -> HTTPException:
    """Maps a source failure onto the status code that actually describes it.

    503 rather than 500 for an unconfigured source: nothing is broken, the
    feature was never enabled on this deploy, and the detail names the variable
    to set.
    """
    if isinstance(error, SourceNotConfigured):
        return HTTPException(status_code=503, detail=str(error))
    if isinstance(error, SourceRateLimited):
        return HTTPException(status_code=429, detail=str(error))
    return HTTPException(status_code=502, detail=str(error))


# Must match the predicate on ux_items_external in models.py and migration
# 0002. Postgres matches a partial index by its predicate, so these three
# have to stay in step.
EXTERNAL_PRESENT = "external_source IS NOT NULL AND external_id IS NOT NULL"
ALREADY_ON_SHELF = "Already on your shelf"


async def _write_or_conflict(
    session: AsyncSession, write: Callable[[], Awaitable[None]]
) -> None:
    """Run `write` (the session's flush or commit), answering a second item
    for the same external match with a 409 rather than a 500. Any other
    integrity error is re-raised."""
    try:
        await write()
    except IntegrityError as error:
        await session.rollback()
        if "ux_items_external" not in str(error.orig):
            raise
        raise HTTPException(status_code=409, detail=ALREADY_ON_SHELF) from None


# The only routes the nightly workflow's bearer token opens (Spine Next
# spec, A2): (method, route template), templates including the router
# prefix. Matching on the template FastAPI routed to, not the raw URL, so a
# trailing slash or root_path cannot widen it. tests/test_job_token.py pins
# this set; changing it means changing that test.
JOB_ROUTES: frozenset[tuple[str, str]] = frozenset(
    {
        ("POST", "/api/physical/refresh-registry"),
        ("POST", "/api/physical/refresh"),
        ("POST", "/api/physical/refresh-switch1"),
        ("POST", "/api/physical/resolve"),
        ("POST", "/api/recommendations/generate"),
        ("GET", "/api/physical/status"),
        ("GET", "/api/physical/stores/{key}/html-skip"),
        ("POST", "/api/physical/stores/{key}/ingest"),
        ("POST", "/api/analytics/rollup"),
        ("POST", "/api/comics/refresh"),
        ("POST", "/api/comics/issues/sync"),
        ("POST", "/api/spots/candidates/refresh"),
        ("POST", "/api/spots/weather/refresh"),
        ("POST", "/api/closet/jobs/tag"),
        ("POST", "/api/closet/jobs/plan"),
        ("POST", "/api/closet/jobs/opinion"),
        ("POST", "/api/intake/jobs/nightly"),
    }
)


def _job_route(request: Request) -> str | None:
    """The routed template when it is a job route, else None."""
    path = getattr(request.scope.get("route"), "path", None)
    return path if (request.method, path) in JOB_ROUTES else None


def _job_token_route(request: Request) -> str | None:
    """The matched job route when the bearer token is valid for it, else None."""
    expected = getattr(request.app.state, "job_token", None)
    route = _job_route(request)
    if not expected or route is None:
        return None
    scheme, _, presented = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not presented:
        return None
    return (
        route if secrets.compare_digest(presented.encode(), expected.encode()) else None
    )


def require_admin(request: Request) -> None:
    """Rejects anyone without the admin session.

    Declared as a router-level dependency rather than called inside each route.
    FastAPI solves dependencies before validating path, query, and body
    parameters, so an unauthenticated caller gets 401 and never 422 -- it cannot
    probe the request schema, and cannot learn whether an id exists by comparing
    a 401 against a 404.

    The nightly workflow is the one other caller: a bearer token equal to
    JOB_TOKEN passes on JOB_ROUTES and nowhere else. A session is checked
    first, so nothing changes for the owner. The session is re-checked
    against the allowlist on every request (auth.session_admin).
    """
    if session_admin(request) is not None:
        return
    if (route := _job_token_route(request)) is not None:
        # Never the token: the method and route only.
        logger.info("job token accepted: %s %s", request.method, route)
        return
    raise HTTPException(status_code=401, detail="Not authenticated")


async def _edition_format(
    session: AsyncSession, item: Item, edition_id: uuid.UUID | None
) -> str | None:
    """The format of a live registry edition of this item's game, for
    "Use registry value". 404 for an unknown or retired edition; 422 for one
    that belongs to another game or platform."""
    edition = await session.get(PhysicalEdition, edition_id) if edition_id else None
    if edition is None or edition.retired_at is not None:
        raise HTTPException(
            status_code=404, detail="No live registry edition by that id"
        )
    if (
        edition.platform_id != item.platform_id
        or item.external_source != "igdb"
        or str(edition.igdb_id) != (item.external_id or "")
    ):
        raise HTTPException(
            status_code=422, detail="That registry edition is for another game."
        )
    fmt = edition.physical_format
    return getattr(fmt, "value", fmt)


def _is_comic(changes: dict, row: Item | None) -> bool:
    item_type = changes.get("type") or (row.type if row is not None else None)
    return item_type == ItemType.COMIC


def _check_disc_format(changes: dict, row: Item | None) -> dict:
    """A disc format is a movie's alone (intake spec D1); RangeError otherwise.

    Only a value is refused: a non-movie may send an explicit null, as a game's
    form may send empty comic fields.
    """
    if changes.get("disc_format") is None:
        return changes
    item_type = changes.get("type") or (row.type if row is not None else None)
    if item_type != ItemType.MOVIE:
        raise RangeError("Disc format is for movies only.")
    return changes


def _write_fields(changes: dict, row: Item | None) -> dict:
    """The comic rules, the disc rule, then the copy rules; CopyFieldError or
    RangeError."""
    current = None if row is None else {key: getattr(row, key) for key in HELD_FIELDS}
    checked = _check_disc_format(
        apply_comic_fields(changes, _is_comic(changes, row), current), row
    )
    return apply_copy_fields(checked, row)


def _copy_fields(changes: dict, row: Item | None) -> dict:
    """Runs the write rules, answering a refusal as a 422 in words."""
    try:
        return _write_fields(changes, row)
    except (CopyFieldError, RangeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


# Games per bulk-refresh request: IGDB answers up to 500 rows, and 100 keeps
# one failed request from costing more than a hundred refreshes.
REFRESH_BATCH = 100

# The types a bulk refresh covers, and the source each one's links point at.
# Games go in batches (IGDB's fetch_many); comics and movies one fetch per
# item, since neither Comic Vine nor TMDB has a batched detail call.
BULK_REFRESH_SOURCES = {
    ItemType.GAME: "igdb",
    ItemType.COMIC: "comicvine",
    ItemType.MOVIE: "tmdb",
}

# The snapshot keys a source's release date arrives under.
RELEASE_DATE_KEYS = ("first_release_date", "release_date")


def _release_date(snapshot: dict) -> date | None:
    for key in RELEASE_DATE_KEYS:
        value = snapshot.get(key)
        if isinstance(value, str):
            try:
                return date.fromisoformat(value[:10])
            except ValueError:
                continue
    return None


async def _refresh_in_batches(adapter, linked: list[Item]) -> tuple[int, int, int]:
    """Games: fetch_many per REFRESH_BATCH; (updated, skipped, failed)."""
    updated = skipped = failed = 0
    for start in range(0, len(linked), REFRESH_BATCH):
        batch = linked[start : start + REFRESH_BATCH]
        try:
            details = await adapter.fetch_many([row.external_id for row in batch])
        except SourceError as error:
            logger.warning("bulk refresh batch failed: %s", error)
            failed += len(batch)
            continue
        by_id = {detail.external_id: detail for detail in details}
        for row in batch:
            detail = by_id.get(row.external_id)
            if detail is None:
                skipped += 1
                continue
            _apply_detail(row, detail)
            _backfill_platform(row)
            updated += 1
    return updated, skipped, failed


async def _refresh_one_by_one(adapter, linked: list[Item]) -> tuple[int, int, int]:
    """Comics and movies: one fetch each; a failed fetch is one failure."""
    updated = failed = 0
    for row in linked:
        try:
            detail = await adapter.fetch(row.external_id)
        except SourceError as error:
            logger.warning("bulk refresh of %s failed: %s", row.id, error)
            failed += 1
            continue
        _apply_detail(row, detail)
        updated += 1
    return updated, 0, failed


def _apply_detail(item: Item, detail) -> None:
    """Copies a fetched source record onto an item, leaving the title alone.

    The title is the owner's: the picker prefills it and it stays editable, so
    overwriting it here would be data loss rather than enrichment.

    The release date is overwritten when the source has one: for a linked item
    the source is its truth, because announced dates move. Nothing the owner
    records about their copy is touched here.
    """
    item.year = detail.year if detail.year is not None else item.year
    item.creator = detail.creator
    item.cover_url = detail.cover_url
    kept = {
        key: value
        for key, value in (item.source_metadata or {}).items()
        if item.type == ItemType.COMIC and key in ISSUE_SNAPSHOT_KEYS
    }
    item.source_metadata = (
        {**(detail.source_metadata or {}), **kept} if kept else detail.source_metadata
    )
    released = _release_date(detail.source_metadata or {})
    if released is not None:
        item.release_date = released


def _backfill_platform(item: Item) -> None:
    """Fills an empty platform when the snapshot names exactly one.

    A game released on several platforms says nothing about which one this
    copy is for, so it is left for the owner; so is a platform the site has no
    name for.
    """
    if item.platform_id is not None:
        return
    platforms = (item.source_metadata or {}).get("platform_ids") or []
    if len(platforms) == 1 and platforms[0] in PLATFORM_NAMES:
        item.platform_id = platforms[0]
        item.platform = PLATFORM_NAMES[platforms[0]]


async def _enrich(
    session: AsyncSession,
    registry: dict[ItemType, SourceAdapter],
    ids: list[uuid.UUID],
) -> int:
    """Fills in cover art, creator, and the snapshot for newly created rows.

    Bulk creation carries only what the browser could verify -- the external
    link, the title, the year -- so without this step an imported collection
    has no covers at all, and the public page is a poster grid with no
    posters.

    Grouped by source and serial within a group, matching the importer: the
    per-source throttle lives in the adapter, so films resolve quickly while
    the slow sources do not hold them up. A source that fails leaves its rows
    unenriched rather than failing the import that already succeeded -- the
    items exist, and refresh-metadata can fill them in later.
    """
    if not ids:
        return 0

    result = await session.execute(
        select(Item).where(
            Item.id.in_(ids),
            Item.external_source.is_not(None),
            Item.external_id.is_not(None),
        )
    )
    linked = list(result.scalars())
    if not linked:
        return 0

    grouped: dict[ItemType, list[Item]] = defaultdict(list)
    for item in linked:
        grouped[item.type].append(item)

    async def enrich_group(item_type: ItemType, group: list[Item]) -> int:
        try:
            adapter = adapter_for(registry, item_type)
        except SourceError as error:
            logger.info("bulk enrich skipped %s: %s", item_type.value, error)
            return 0

        done = 0
        for item in group:
            try:
                _apply_detail(item, await adapter.fetch(item.external_id))
                done += 1
            except SourceError as error:
                logger.info("bulk enrich failed for %s: %s", item.title, error)
        return done

    counts = await asyncio.gather(
        *(enrich_group(item_type, group) for item_type, group in grouped.items())
    )
    await session.commit()

    total = sum(counts)
    logger.info("bulk enrich: %d of %d linked rows", total, len(linked))
    return total


# Rows per INSERT in commit_items: Postgres caps a statement at 65,535 bound
# parameters, and an items row carries some forty columns.
BULK_CHUNK = 500


class RowRefused(Exception):
    """A row the write rules refuse; `index` is its place in the batch and
    `error` the rule's own words."""

    def __init__(self, index: int, error: Exception):
        super().__init__(str(error))
        self.index = index
        self.error = error


@dataclass(frozen=True)
class CommitResult:
    """What commit_items wrote: the new ids, rows dropped as repeats within
    the batch, and rows already in the collection."""

    created: list[uuid.UUID]
    duplicates: int
    existing: int


async def _require_favorite_slots(session: AsyncSession, adding: int) -> None:
    """Refuses a change that would add favourites past the limit.

    Counts only what the change adds, so unfavouriting, re-saving an
    existing favourite, and rows favourited before the cap existed are
    never refused. Those extras are kept, not trimmed, and block new
    favourites until they are. 409 rather than 422: the request is valid,
    the collection's state is what conflicts with it.

    An application check with no row lock, so two simultaneous requests
    could both pass. With one admin that is not a realistic race, and a
    guarantee would take a trigger and a migration.
    """
    if adding <= 0:
        return
    current = await session.scalar(
        select(func.count()).select_from(Item).where(Item.favorite.is_(True))
    )
    if current + adding > FAVORITES_LIMIT:
        raise HTTPException(status_code=409, detail=FAVORITES_FULL)


async def commit_items(
    session: AsyncSession, rows: Sequence[ItemIn], *, today: date
) -> CommitResult:
    """Creates `rows` as items, skipping ones already in the collection (spec
    D8: the one create path `/bulk` and intake's commit share).

    Photographing the same shelf twice is expected behaviour, not a
    mistake, so a duplicate is counted rather than raised.

    Duplicates within the batch are removed here first: ON CONFLICT does
    not deduplicate rows inside a single statement, so two identical rows
    in one INSERT would both be written.

    One refused row refuses the batch (RowRefused, before any write for the
    write rules): this is a review-then-commit step, and a half-imported
    shelf is harder to reason about. Rows go in INSERTs of at most
    BULK_CHUNK, all in the caller's transaction. Does not commit.
    """
    seen: set[tuple[str, str]] = set()
    values_list: list[dict] = []
    index_of: dict[uuid.UUID, int] = {}
    duplicates = 0

    for index, item in enumerate(rows):
        values = item.model_dump()
        try:
            values.update(_write_fields(item.model_dump(exclude_unset=True), None))
        except (CopyFieldError, RangeError) as error:
            raise RowRefused(index, error) from error
        key = (values.get("external_source"), values.get("external_id"))
        # A manual row has NULL on both and is never a duplicate of
        # another manual row -- the same reason the index is partial.
        if key[0] and key[1]:
            if key in seen:
                duplicates += 1
                continue
            seen.add(key)
        values["id"] = uuid.uuid4()
        index_of[values["id"]] = index
        values_list.append(values)

    # A multi-row INSERT takes its columns from the first row: a key some
    # rows lack (apply_copy_fields adds `platform` and `format_source`
    # only when their inputs were sent) either fails to compile or is
    # silently dropped from the later rows. Every row gets every key.
    columns = set().union(*values_list) if values_list else set()
    for values in values_list:
        for column in columns:
            values.setdefault(column, None)

    # Checked before the insert and over the whole batch, so a batch that
    # would cross the limit is refused whole. A favourited row that ON
    # CONFLICT would skip as a duplicate still counts: conservative, and
    # the importer never sets the flag anyway.
    await _require_favorite_slots(
        session, sum(1 for values in values_list if values.get("favorite"))
    )

    created: list[uuid.UUID] = []
    for start in range(0, len(values_list), BULK_CHUNK):
        statement = (
            pg_insert(Item)
            .values(values_list[start : start + BULK_CHUNK])
            .on_conflict_do_nothing(
                index_elements=["external_source", "external_id"],
                # The index is partial, so Postgres will not match it unless
                # the predicate is restated here -- without index_where it
                # answers "no unique or exclusion constraint matching the ON
                # CONFLICT specification", which reads like a missing index.
                index_where=text(EXTERNAL_PRESENT),
            )
            .returning(Item.id)
        )
        created.extend((await session.execute(statement)).scalars())
    if created:
        new_items = await session.execute(select(Item).where(Item.id.in_(created)))
        for new_item in new_items.scalars():
            try:
                await playthroughs.seed_rows(session, new_item, today)
            except playthroughs.PlaythroughError as error:
                raise RowRefused(index_of[new_item.id], error) from error
    return CommitResult(
        created=created,
        duplicates=duplicates,
        existing=len(values_list) - len(created),
    )


def create_items_router(
    factory: async_sessionmaker[AsyncSession],
    registry: dict[ItemType, SourceAdapter] | None = None,
) -> APIRouter:
    """Builds the collection routes bound to this session factory.

    `registry` supplies the metadata sources. It defaults to empty so that a
    caller wanting only CRUD -- most of the existing tests -- need not build
    one; the lookup routes then answer 503, which is the truthful response for
    a deploy with no sources configured.
    """
    registry = {} if registry is None else registry
    router = APIRouter(
        prefix="/api/items",
        tags=["items"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def _load(session: AsyncSession, item_id: uuid.UUID) -> Item:
        item = await session.get(Item, item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Not found")
        return item

    async def _mark_excluded(session: AsyncSession, items: list[Item]) -> None:
        """Sets play_next_excluded on each item from its "never" events, and a
        comic's run summary.

        One query for the whole list. Both are plain attributes on the
        instance, not columns, so they are recomputed on every response.
        """
        if not items:
            return
        for item in items:
            item.comic_run = (
                row_run(
                    item.issues_owned,
                    item.issues_skipped,
                    item.editions,
                    item.read_to,
                    item.source_metadata,
                )
                if item.type == ItemType.COMIC
                else None
            )
        result = await session.execute(
            select(PickEvent.item_id)
            .where(PickEvent.action == PickAction.NEVER)
            .where(PickEvent.item_id.in_([item.id for item in items]))
        )
        excluded = set(result.scalars())
        runs = await playthroughs.runs_with_journal(
            session, [item.id for item in items]
        )
        for item in items:
            item.play_next_excluded = item.id in excluded
            item.playthroughs = [
                PlaythroughOut(
                    number=run.number,
                    started_on=run.started_on,
                    finished_on=run.finished_on,
                    paused_on=run.paused_on,
                    outcome=run.outcome,
                    journal_days=days,
                    journal_minutes=minutes,
                    note=run.note,
                )
                for run, days, minutes, _last in runs.get(item.id, [])
            ]

    @router.get("", response_model=list[ItemOut])
    async def list_items(
        session: AsyncSession = Depends(get_session),
        type: ItemType | None = Query(default=None),
        status: ItemStatus | None = Query(default=None),
    ) -> list[Item]:
        """Every item, newest first, optionally filtered by type and status."""
        statement = select(Item).order_by(Item.created_at.desc())
        if type is not None:
            statement = statement.where(Item.type == type)
        if status is not None:
            statement = statement.where(Item.status == status)
        result = await session.execute(statement)
        items = list(result.scalars())
        await _mark_excluded(session, items)
        return items

    @router.post("", response_model=ItemOut, status_code=201)
    async def create_item(
        payload: ItemIn,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Adds one item and returns it, including its generated id."""
        await _require_favorite_slots(session, int(payload.favorite))
        values = payload.model_dump()
        values.update(_copy_fields(payload.model_dump(exclude_unset=True), None))
        item = Item(**values)
        session.add(item)
        await _write_or_conflict(session, session.flush)
        try:
            await playthroughs.seed_rows(session, item, date.today())
        except playthroughs.PlaythroughError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        await _write_or_conflict(session, session.commit)
        await session.refresh(item)
        await _mark_excluded(session, [item])
        return item

    @router.post("/visibility", response_model=VisibilityOut)
    async def set_visibility(
        payload: VisibilityIn,
        session: AsyncSession = Depends(get_session),
    ) -> VisibilityOut:
        """Publishes or hides items in one statement.

        A bulk route rather than a loop of PATCHes because publishing a
        collection is one decision: seventy-five sequential requests would be
        slow, and a partial failure has no useful story to tell -- "forty of
        seventy-five saved" is not something the page can act on.
        """
        statement = update(Item).values(is_public=payload.is_public)
        if payload.ids is not None:
            # Deliberately not short-circuiting on an empty list: the WHERE
            # below matches nothing, which is exactly what [] should mean.
            statement = statement.where(Item.id.in_(payload.ids))

        result = await session.execute(statement)
        await session.commit()

        logger.info(
            "visibility: set is_public=%s on %d matched items",
            payload.is_public,
            result.rowcount,
        )
        return VisibilityOut(updated=result.rowcount)

    # Declared before /{item_id}: FastAPI matches in order, and the typed id
    # would answer "bulk" with a 422 rather than let it through.
    @router.patch("/bulk", response_model=BulkSetOut)
    async def bulk_set(
        payload: BulkSetIn,
        session: AsyncSession = Depends(get_session),
    ) -> BulkSetOut:
        """Applies one copy-field change to many items, all or nothing.

        Every row goes through the same rules as a single PATCH. If any row
        refuses -- a Game-Key Card cart ID set to a cartridge, say -- the whole
        request is refused naming those items, and nothing is written, so the
        selection can be corrected and sent again as it was.
        """
        changes = payload.changes.model_dump(exclude_unset=True)
        if not changes:
            raise HTTPException(status_code=422, detail="Nothing to change.")

        result = await session.execute(select(Item).where(Item.id.in_(payload.ids)))
        rows = list(result.scalars())
        planned: list[tuple[Item, dict]] = []
        refused: list[str] = []
        for row in rows:
            try:
                planned.append((row, apply_copy_fields(changes, row)))
            except CopyFieldError as error:
                refused.append(f"{row.title} ({error})")
        if refused:
            raise HTTPException(
                status_code=422, detail=f"Couldn’t update: {'; '.join(refused)}"
            )

        for row, row_changes in planned:
            for field, value in row_changes.items():
                setattr(row, field, value)
        await session.commit()
        return BulkSetOut(updated=len(planned))

    @router.post("/delete-preview", response_model=DeletePreviewOut)
    async def delete_preview(
        payload: DeleteIdsIn,
        session: AsyncSession = Depends(get_session),
    ) -> DeletePreviewOut:
        """Read-only: counts what deleting these rows would take with them.
        Ids that match no row are ignored (the delete itself refuses them)."""
        ids = payload.ids
        found = await session.execute(
            select(Item.title).where(Item.id.in_(ids)).order_by(Item.title)
        )
        titles = list(found.scalars())

        async def count(model) -> int:
            return await session.scalar(
                select(func.count()).select_from(model).where(model.item_id.in_(ids))
            )

        return DeletePreviewOut(
            items=len(titles),
            playthroughs=await count(Playthrough),
            play_sessions=await count(PlaySession),
            comic_issues=await count(ComicIssue),
            pick_events=await count(PickEvent),
            titles=titles[:3],
        )

    # A POST path, not DELETE /bulk: DELETE /{item_id} would answer "bulk"
    # with a 422 (see the route-order note on PATCH /bulk).
    @router.post("/bulk-delete", response_model=BulkDeleteOut)
    async def bulk_delete(
        payload: DeleteIdsIn,
        session: AsyncSession = Depends(get_session),
    ) -> BulkDeleteOut:
        """Deletes many items in one transaction. An unknown id is a 404
        naming it and nothing is deleted. Children go by cascade."""
        wanted = set(payload.ids)
        result = await session.execute(select(Item).where(Item.id.in_(wanted)))
        rows = list(result.scalars())
        missing = wanted - {row.id for row in rows}
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"No such item: {', '.join(sorted(str(i) for i in missing))}",
            )
        for row in rows:
            await session.delete(row)
        await session.commit()
        logger.info("bulk delete: removed %d items", len(rows))
        return BulkDeleteOut(deleted=len(rows))

    @router.post("/bulk", response_model=BulkOut, status_code=201)
    async def create_items_bulk(
        payload: BulkIn,
        session: AsyncSession = Depends(get_session),
    ) -> BulkOut:
        """Creates many items at once through commit_items, skipping ones
        already in the collection and reporting them as duplicates."""
        try:
            result = await commit_items(session, payload.items, today=date.today())
        except RowRefused as refused:
            title = payload.items[refused.index].title
            raise HTTPException(
                status_code=422, detail=f"{title}: {refused.error}"
            ) from refused
        await session.commit()
        created = result.created

        enriched = await _enrich(session, registry, created)

        return BulkOut(
            created=len(created),
            skipped_duplicates=result.duplicates + result.existing,
            enriched=enriched,
            ids=created,
        )

    # Declared before /{item_id}/refresh-metadata, for the same ordering reason
    # as /search-metadata below.
    @router.post("/refresh-metadata/bulk", response_model=RefreshBulkOut)
    async def refresh_metadata_bulk(
        type: ItemType = Query(),
        session: AsyncSession = Depends(get_session),
    ) -> RefreshBulkOut:
        """Re-fetches every linked game, comic or movie.

        Games go in batches through IGDB's fetch_many; comics and movies one
        fetch per item, since their sources have no batched call. A failed
        request is counted and the rest still land, so one bad answer never
        costs the whole refresh. A comic keeps its pull-list issue snapshot
        (`_apply_detail`). Synchronous: a shelf is a handful of requests, and
        Comic Vine's one-a-second throttle makes comics the slow part.
        """
        source_name = BULK_REFRESH_SOURCES.get(type)
        if source_name is None:
            raise HTTPException(
                status_code=422,
                detail="Only games, comics and movies can be refreshed in bulk.",
            )
        try:
            adapter = adapter_for(registry, type)
        except SourceError as error:
            raise _http_error_for(error) from error

        result = await session.execute(
            select(Item)
            .where(Item.type == type, Item.external_source == source_name)
            .where(Item.external_id.is_not(None))
            .order_by(Item.created_at)
        )
        linked = list(result.scalars())

        if type is ItemType.GAME:
            updated, skipped, failed = await _refresh_in_batches(adapter, linked)
        else:
            updated, skipped, failed = await _refresh_one_by_one(adapter, linked)

        await session.commit()
        logger.info(
            "bulk refresh: %s updated, %s skipped, %s failed", updated, skipped, failed
        )
        return RefreshBulkOut(updated=updated, skipped=skipped, failed=failed)

    # Declared before /{item_id}. FastAPI matches in declaration order and
    # {item_id} is typed uuid.UUID, so a later /search-metadata would be
    # swallowed by it and answered 422 instead of reaching the picker.
    @router.get("/search-metadata", response_model=list[CandidateOut])
    async def search_metadata(
        type: ItemType = Query(),
        query: str = Query(min_length=1, max_length=200),
        year: int | None = Query(default=None, ge=1880, le=2100),
    ) -> list[CandidateOut]:
        """Candidate external records for a title.

        A server-side proxy rather than a call from the browser: the source
        credentials live here and must stay here.
        """
        try:
            adapter = adapter_for(registry, type)
            results = await adapter.search(query, year)
        except SourceError as error:
            raise _http_error_for(error) from error

        return [
            CandidateOut(
                external_source=adapter.source_name,
                external_id=result.external_id,
                title=result.title,
                year=result.year,
                thumbnail_url=result.thumbnail_url,
            )
            for result in results
        ]

    @router.post("/{item_id}/refresh-metadata", response_model=ItemOut)
    async def refresh_metadata(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Re-fetches the linked source record for one item.

        The title is deliberately left alone. The picker prefills it and the
        owner may have edited it since, so overwriting on refresh would be
        data loss rather than a refresh.
        """
        item = await _load(session, item_id)
        if not item.external_source or not item.external_id:
            raise HTTPException(
                status_code=409, detail="This item is not linked to a source"
            )

        try:
            adapter = adapter_for(registry, item.type)
            detail = await adapter.fetch(item.external_id)
        except SourceError as error:
            raise _http_error_for(error) from error

        _apply_detail(item, detail)
        await session.commit()
        await session.refresh(item)
        await _mark_excluded(session, [item])
        return item

    @router.get("/{item_id}", response_model=ItemOut)
    async def get_item(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """One item, or 404."""
        item = await _load(session, item_id)
        await _mark_excluded(session, [item])
        return item

    @router.patch("/{item_id}", response_model=ItemOut)
    async def update_item(
        item_id: uuid.UUID,
        payload: ItemPatch,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Partial update. Fields absent from the body are left alone."""
        body = payload.model_dump(exclude_unset=True)
        if any(field in body for field in STATUS_FIELDS):
            raise HTTPException(status_code=422, detail=STATUS_FIELDS_REFUSED)
        item = await _load(session, item_id)
        if "edition_id" in body:
            body["edition_format"] = await _edition_format(
                session, item, body["edition_id"]
            )
        changes = _copy_fields(body, item)
        if changes.get("favorite") is True and not item.favorite:
            await _require_favorite_slots(session, 1)
        relinked = any(
            field in changes and changes[field] != getattr(item, field)
            for field in ("external_source", "external_id")
        )
        for field, value in changes.items():
            setattr(item, field, value)
        if relinked and item.source_metadata:
            # A comic's issue snapshot belongs to the volume it was fetched
            # for; _apply_detail keeps it across a refresh, so a re-link has
            # to drop it or the new volume shows the old one's issues.
            item.source_metadata = {
                key: value
                for key, value in item.source_metadata.items()
                if key not in ISSUE_SNAPSHOT_KEYS
            }
        await _write_or_conflict(session, session.commit)
        await session.refresh(item)
        await _mark_excluded(session, [item])
        return item

    @router.post("/{item_id}/pin", response_model=ItemOut)
    async def pin_item(
        item_id: uuid.UUID,
        today: date | None = Query(
            None,
            description="The owner's local date (localToday()), which dates "
            "the run the pin opens; the server's UTC date when absent.",
        ),
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Commits to a game: Up next.

        One transaction: any other pin is cleared, this game is pinned and
        marked in progress (started today unless a start date exists), and a
        pinned event is recorded. A route of its own rather than a PATCH field,
        because it changes another row and writes an event.
        """
        server_today = datetime.now(UTC).date()
        if today is not None:
            # The status route dates its moves the same way, so the
            # misclick rule's "started today" compares like with like.
            try:
                playthroughs.check_today(today, server_today)
            except playthroughs.PlaythroughError as error:
                raise HTTPException(status_code=422, detail=str(error)) from error
        item = await _load(session, item_id)
        if item.owned_format == OwnedFormat.NONE:
            raise HTTPException(
                status_code=422,
                detail="Up next is for games you own; this one is on the want list.",
            )
        await session.execute(
            update(Item)
            .where(Item.pinned_at.is_not(None), Item.id != item_id)
            .values(pinned_at=None)
        )
        item.pinned_at = datetime.now(UTC)
        await playthroughs.apply_status(
            session, item, ItemStatus.ACTIVE, today or server_today
        )
        session.add(PickEvent(item_id=item_id, action=PickAction.PINNED))
        await session.commit()
        await session.refresh(item)
        await _mark_excluded(session, [item])
        logger.info("pinned %s as up next", item_id)
        return item

    async def _respond(session: AsyncSession, item: Item) -> Item:
        await session.commit()
        await session.refresh(item)
        await _mark_excluded(session, [item])
        return item

    def _refused(error: playthroughs.PlaythroughError) -> HTTPException:
        return HTTPException(status_code=422, detail=str(error))

    @router.post("/{item_id}/status", response_model=ItemOut)
    async def set_status(
        item_id: uuid.UUID,
        payload: StatusIn,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Moves the item to a status, writing its playthroughs.

        The one way a status changes after creation (playthroughs.py). The
        client's `today` dates the move, so a late-evening finish lands on
        the owner's day, within a day of the server's; `on` backdates a
        Wrap up to earlier in the week, and `note` is its one line.
        """
        try:
            playthroughs.check_today(payload.today, datetime.now(UTC).date())
        except playthroughs.PlaythroughError as error:
            raise _refused(error) from error
        item = await _load(session, item_id)
        try:
            await playthroughs.apply_status(
                session,
                item,
                payload.status,
                payload.today,
                on=payload.on,
                note=payload.note,
            )
        except playthroughs.PlaythroughError as error:
            raise _refused(error) from error
        return await _respond(session, item)

    @router.post("/{item_id}/playthroughs", response_model=ItemOut, status_code=201)
    async def add_playthrough(
        item_id: uuid.UUID,
        payload: PastPlaythroughIn,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Records a past finished run, numbered below any open one."""
        item = await _load(session, item_id)
        try:
            await playthroughs.add_past(
                session, item, payload.started_on, payload.finished_on
            )
        except playthroughs.PlaythroughError as error:
            raise _refused(error) from error
        return await _respond(session, item)

    @router.patch("/{item_id}/playthroughs/{number}", response_model=ItemOut)
    async def edit_playthrough(
        item_id: uuid.UUID,
        number: int,
        payload: PlaythroughDatesIn,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Corrects a run's dates. Its outcome changes only by status."""
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise HTTPException(status_code=422, detail="Nothing to change.")
        item = await _load(session, item_id)
        try:
            await playthroughs.edit_dates(session, item, number, changes)
        except LookupError as error:
            raise HTTPException(status_code=404, detail=NO_RUN) from error
        except playthroughs.PlaythroughError as error:
            raise _refused(error) from error
        return await _respond(session, item)

    @router.delete("/{item_id}/playthroughs/{number}", response_model=ItemOut)
    async def delete_playthrough(
        item_id: uuid.UUID,
        number: int,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Deletes a closed run. Numbers are history: none is renumbered."""
        item = await _load(session, item_id)
        try:
            await playthroughs.delete_run(session, item, number)
        except LookupError as error:
            raise HTTPException(status_code=404, detail=NO_RUN) from error
        except playthroughs.PlaythroughError as error:
            raise _refused(error) from error
        return await _respond(session, item)

    @router.delete("/{item_id}/pin", response_model=ItemOut)
    async def unpin_item(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Clears Up next. The game keeps its status and start date."""
        item = await _load(session, item_id)
        item.pinned_at = None
        await session.commit()
        await session.refresh(item)
        await _mark_excluded(session, [item])
        return item

    @router.post("/{item_id}/redo", response_model=RedoOut)
    async def redo_item(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> RedoOut:
        """Sends a row back through intake: one entry, asking for a check,
        in the newest shelf sitting of the item's kind (or a new one), and
        the item is deleted, all in one transaction. The entry carries the
        item's title and external match so it can be kept or changed."""
        item = await _load(session, item_id)
        kind = item.type.value
        sitting = (
            await session.scalars(
                select(IntakeSitting)
                .where(IntakeSitting.area == IntakeArea.SHELF)
                .where(IntakeSitting.kind == kind)
                .order_by(IntakeSitting.updated_at.desc(), IntakeSitting.id)
                .limit(1)
            )
        ).first()
        if sitting is None:
            sitting = IntakeSitting(area=IntakeArea.SHELF, kind=kind)
            session.add(sitting)
        chosen = None
        if item.external_source and item.external_id:
            chosen = {
                "title": item.title,
                "external_source": item.external_source,
                "external_id": item.external_id,
                "year": item.year,
                "cover_url": item.cover_url,
                "creator": item.creator,
            }
        await session.flush()
        entry = IntakeEntry(
            sitting_id=sitting.id,
            kind=kind,
            state=IntakeEntryState.CHECK,
            payload={
                "detected_title": item.title,
                "detected_year": item.year,
                "reason": "Sent back to match again",
            },
            chosen=chosen,
        )
        session.add(entry)
        await session.delete(item)
        await session.commit()
        return RedoOut(sitting_id=sitting.id, entry_id=entry.id)

    @router.delete("/{item_id}", status_code=204)
    async def delete_item(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """Removes one item, or 404 if it never existed."""
        item = await _load(session, item_id)
        await session.delete(item)
        await session.commit()
        return Response(status_code=204)

    return router
