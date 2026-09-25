"""CRUD for the media collection. Every route requires the admin session."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from formats import CopyFieldError, apply_copy_fields
from models import (
    Completeness,
    FormatSource,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalEdition,
    PhysicalFormat,
    PickAction,
    PickEvent,
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
FAVORITES_FULL = (
    f"You already have {FAVORITES_LIMIT} favourites. Unfavourite one first."
)


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
    times_completed: int = Field(default=0, ge=0)
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
    # "Use registry value" (E7c): the format of this registry edition, with
    # format_source registry. The edition's cart ID is never copied.
    edition_id: uuid.UUID | None = None


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
    # Play Next was told never to suggest it; the edit page offers Restore.
    play_next_excluded: bool = False
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


def require_admin(request: Request) -> None:
    """Rejects anyone without the admin session.

    Declared as a router-level dependency rather than called inside each route.
    FastAPI solves dependencies before validating path, query, and body
    parameters, so an unauthenticated caller gets 401 and never 422 -- it cannot
    probe the request schema, and cannot learn whether an id exists by comparing
    a 401 against a 404.
    """
    if not request.session.get("user"):
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


def _copy_fields(changes: dict, row: Item | None) -> dict:
    """Runs the copy-field rules, answering a refusal as a 422 in words."""
    try:
        return apply_copy_fields(changes, row)
    except CopyFieldError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


# Games per bulk-refresh request: IGDB answers up to 500 rows, and 100 keeps
# one failed request from costing more than a hundred refreshes.
REFRESH_BATCH = 100

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
    item.source_metadata = detail.source_metadata
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

    async def _mark_excluded(session: AsyncSession, items: list[Item]) -> None:
        """Sets play_next_excluded on each item from its "never" events.

        One query for the whole list. The flag is a plain attribute on the
        instance, not a column, so it is recomputed on every response.
        """
        if not items:
            return
        result = await session.execute(
            select(PickEvent.item_id)
            .where(PickEvent.action == PickAction.NEVER)
            .where(PickEvent.item_id.in_([item.id for item in items]))
        )
        excluded = set(result.scalars())
        for item in items:
            item.play_next_excluded = item.id in excluded

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
        await session.commit()
        await session.refresh(item)
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
                status_code=422, detail=f"Could not update: {'; '.join(refused)}"
            )

        for row, row_changes in planned:
            for field, value in row_changes.items():
                setattr(row, field, value)
        await session.commit()
        return BulkSetOut(updated=len(planned))

    @router.post("/bulk", response_model=BulkOut, status_code=201)
    async def create_items_bulk(
        payload: BulkIn,
        session: AsyncSession = Depends(get_session),
    ) -> BulkOut:
        """Creates many items at once, skipping ones already in the collection.

        Photographing the same shelf twice is expected behaviour, not a
        mistake, so a duplicate is reported rather than raised.

        Duplicates within the batch are removed here first: ON CONFLICT does
        not deduplicate rows inside a single statement, so two identical rows
        in one INSERT would both be written.
        """
        seen: set[tuple[str, str]] = set()
        rows: list[dict] = []
        within_batch_duplicates = 0

        for item in payload.items:
            values = item.model_dump()
            # One refused row refuses the batch: this is a review-then-commit
            # step, and a half-imported shelf is harder to reason about.
            try:
                values.update(
                    apply_copy_fields(item.model_dump(exclude_unset=True), None)
                )
            except CopyFieldError as error:
                raise HTTPException(
                    status_code=422, detail=f"{item.title}: {error}"
                ) from error
            key = (values.get("external_source"), values.get("external_id"))
            # A manual row has NULL on both and is never a duplicate of
            # another manual row -- the same reason the index is partial.
            if key[0] and key[1]:
                if key in seen:
                    within_batch_duplicates += 1
                    continue
                seen.add(key)
            values["id"] = uuid.uuid4()
            rows.append(values)

        # Checked before the insert and over the whole batch, so a batch that
        # would cross the limit is refused whole. A favourited row that ON
        # CONFLICT would skip as a duplicate still counts: conservative, and
        # the importer never sets the flag anyway.
        await _require_favorite_slots(
            session, sum(1 for values in rows if values.get("favorite"))
        )

        statement = (
            pg_insert(Item)
            .values(rows)
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
        result = await session.execute(statement)
        created = list(result.scalars())
        await session.commit()

        enriched = await _enrich(session, registry, created)

        return BulkOut(
            created=len(created),
            skipped_duplicates=within_batch_duplicates + (len(rows) - len(created)),
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
        """Re-fetches every IGDB-linked game in batches.

        Games only: IGDB is the one source with a batched fetch, and the shelf
        is almost all games. A failed batch is counted and the others still
        land, so one bad request never costs the whole refresh. Synchronous:
        a shelf of games is a handful of requests.
        """
        if type is not ItemType.GAME:
            raise HTTPException(
                status_code=422, detail="Only games can be refreshed in bulk."
            )
        try:
            adapter = adapter_for(registry, ItemType.GAME)
        except SourceError as error:
            raise _http_error_for(error) from error

        result = await session.execute(
            select(Item)
            .where(Item.type == ItemType.GAME, Item.external_source == "igdb")
            .where(Item.external_id.is_not(None))
            .order_by(Item.created_at)
        )
        linked = list(result.scalars())

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
        item = await _load(session, item_id)
        body = payload.model_dump(exclude_unset=True)
        if "edition_id" in body:
            body["edition_format"] = await _edition_format(
                session, item, body["edition_id"]
            )
        changes = _copy_fields(body, item)
        if changes.get("favorite") is True and not item.favorite:
            await _require_favorite_slots(session, 1)
        for field, value in changes.items():
            setattr(item, field, value)
        await session.commit()
        await session.refresh(item)
        await _mark_excluded(session, [item])
        return item

    @router.post("/{item_id}/pin", response_model=ItemOut)
    async def pin_item(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Commits to a game: Up next.

        One transaction: any other pin is cleared, this game is pinned and
        marked in progress (started today unless a start date exists), and a
        pinned event is recorded. A route of its own rather than a PATCH field,
        because it changes another row and writes an event.
        """
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
        item.status = ItemStatus.ACTIVE
        item.started_at = item.started_at or date.today()
        session.add(PickEvent(item_id=item_id, action=PickAction.PINNED))
        await session.commit()
        await session.refresh(item)
        await _mark_excluded(session, [item])
        logger.info("pinned %s as up next", item_id)
        return item

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
