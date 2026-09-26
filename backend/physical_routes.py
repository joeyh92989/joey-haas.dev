"""The physical catalogue's admin routes: refresh, resolve and status.

Everything is admin-only, synchronous and pressed by hand (spec §6). Each
source's refresh is its own catalogue_runs row and its own commit, so a store
that fails late in a refresh never loses the ones read before it. One lock
covers every writing route: Render runs one instance, and two refreshes
interleaving their upserts would make the run counts meaningless.

A run is committed when it starts, so a refresh cut short by a restart
leaves an open run the status page reads as interrupted, and any exception
inside one source is recorded as that source's failed run -- the refresh
moves on to the next source instead of answering 500.

A store archives the listings it no longer saw, and a registry retires its
editions, only after a clean run: something seen, not short against the last
successful run, and no handle or schema error -- a store whose one broken
collection hid half its stock has not proved that stock gone.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from items import require_admin
from models import (
    CatalogueGame,
    CatalogueMatch,
    CatalogueRun,
    Item,
    ItemType,
    MatchDecision,
    PhysicalEdition,
    StoreListing,
)
from physical_sources import registry as sheet
from physical_sources import shopify, tracker, woocommerce
from physical_sources.base import HostThrottle, PhysicalSourceError
from physical_sources.catalogue import (
    count_live,
    failure_streaks,
    finish_run,
    is_short,
    latest_runs,
    previous_rows_seen,
    recently_checked_handles,
    run_failed,
    start_run,
    upsert_editions,
    upsert_listings,
)
from physical_sources.collapse import item_note
from physical_sources.courtesy import robots_for
from physical_sources.limits import (
    NEEDS_ATTENTION_AFTER,
    REGISTRY_WORDS,
    RESOLVE_LIMIT,
    SWITCH_2,
)
from physical_sources.platform_policy import INGESTED_PLATFORMS, ingest_platform
from physical_sources.resolve import (
    ResolveResult,
    UnknownGame,
    count_pending,
    ignore,
    link_by_hand,
    rekey_platform,
    resolve_batch,
)
from physical_sources.stores import STORES
from physical_sources.sync import (
    disagreements,
    item_view,
    registry_editions,
    sync_items,
)
from sources.base import SourceError, SourceNotConfigured
from sources.igdb import PLATFORM_NAMES

logger = logging.getLogger(__name__)

REGISTRY_SOURCES = ("nscollectors", "switch2tracker")
SOURCE_NAMES = {
    **{key: config.name for key, config in STORES.items()},
    "nscollectors": "r/NSCollectors registry",
    "switch2tracker": "switch2-tracker",
    "igdb_platform": "N64 (IGDB)",
    "resolve": "Resolve",
}


class RunOut(BaseModel):
    source: str
    name: str
    started_at: datetime
    finished_at: datetime | None
    ok: bool | None
    rows_seen: int
    rows_changed: int
    rows_retired: int
    items_synced: int
    unresolved_remaining: int
    short_run: bool
    # Open past STALE_RUN_MINUTES: the process restarted mid-run.
    interrupted: bool
    errors: list[dict]


class RefreshIn(BaseModel):
    stores: list[str] | None = None


class RefreshOut(BaseModel):
    runs: list[RunOut]
    unresolved_remaining: int


class ResolveOut(BaseModel):
    resolved: int
    pending: int
    games_fetched: int
    unresolved_remaining: int
    errors: list[dict]


class SourceStatus(BaseModel):
    source: str
    name: str
    kind: str
    last_run: RunOut | None
    consecutive_failures: int
    needs_attention: bool


class StatusOut(BaseModel):
    sources: list[SourceStatus]
    totals: dict[str, int]


class NeedsMatchKey(BaseModel):
    title_normalized: str
    platform_id: int
    platform: str | None
    title: str
    sources: list[str]
    rows: int
    candidates: list[dict]


class NeedsMatchOut(BaseModel):
    keys: list[NeedsMatchKey]
    total: int


class MatchIn(BaseModel):
    """Exactly one of: link to a game, ignore, or give the key a platform."""

    title_normalized: str
    platform_id: int
    igdb_id: int | None = None
    ignored: bool = False
    new_platform_id: int | None = None

    @model_validator(mode="after")
    def one_action(self) -> MatchIn:
        chosen = [
            self.igdb_id is not None,
            self.ignored,
            self.new_platform_id is not None,
        ]
        if sum(chosen) != 1:
            raise ValueError("Send one of igdb_id, ignored or new_platform_id.")
        return self


class MatchOut(BaseModel):
    action: str
    moved: int = 0


class EditionOut(BaseModel):
    id: uuid.UUID
    region: str
    physical_format: str | None
    format_words: str | None
    cart_id: str | None


class RegistryNoteOut(BaseModel):
    edition: EditionOut | None
    agrees: bool | None
    note: str | None


class DisagreementOut(BaseModel):
    item_id: uuid.UUID
    title: str
    region: str
    yours: str | None
    yours_source: str | None
    registry: str
    cart_id: str | None
    note: str


class DisagreementsOut(BaseModel):
    items: list[DisagreementOut]


def run_out(run) -> RunOut:
    return RunOut(
        source=run.source,
        name=SOURCE_NAMES.get(run.source, run.source),
        started_at=run.started_at,
        finished_at=run.finished_at,
        ok=run.ok,
        rows_seen=run.rows_seen or 0,
        rows_changed=run.rows_changed or 0,
        rows_retired=run.rows_retired or 0,
        items_synced=run.items_synced or 0,
        unresolved_remaining=run.unresolved_remaining or 0,
        short_run=bool(run.short_run),
        interrupted=run.ok is None and run_failed(run),
        errors=list(run.errors or []),
    )


def _warning_entry(warning: str) -> dict:
    code, _, detail = warning.rpartition(":")
    if "unknown_card_type" in code:
        return {"code": "unknown_card_type", "detail": detail}
    return {"code": "info", "detail": warning}


def _waiting_on_a_human():
    """Pending decisions some live row still carries: unretired editions,
    unarchived listings. One a later refresh re-keyed or retired has nothing
    left to link, so neither the list nor its count shows it."""

    def carried_by(model, is_live):
        return (
            select(model.title_normalized)
            .where(
                model.title_normalized == CatalogueMatch.title_normalized,
                model.platform_id == CatalogueMatch.platform_id,
                is_live,
            )
            .exists()
        )

    return (
        CatalogueMatch.decided_by == MatchDecision.PENDING,
        or_(
            carried_by(PhysicalEdition, PhysicalEdition.retired_at.is_(None)),
            carried_by(StoreListing, StoreListing.availability != "archived"),
        ),
    )


def create_physical_router(
    factory: async_sessionmaker[AsyncSession],
    registry: dict,
    http_client_factory: Callable,
    sheets_key: str | None,
) -> APIRouter:
    """Builds the catalogue routes. `http_client_factory` returns an async
    context-managed HTTP client carrying the tracker's User-Agent; tests pass
    one that serves the recorded fixtures."""
    router = APIRouter(
        prefix="/api/physical",
        tags=["physical"],
        dependencies=[Depends(require_admin)],
    )
    lock = asyncio.Lock()

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    def igdb():
        return registry[ItemType.GAME]

    async def exclusive():
        if lock.locked():
            raise HTTPException(status_code=409, detail="A refresh is already running")
        async with lock:
            yield

    async def guarded(session, source: str, work):
        """One source's run: committed at the start, finished by `work`, and
        recorded as a failure if `work` raises anything at all.

        Returns (RunOut, run id, work's result or None after a failure). The
        RunOut is a snapshot taken while the row is fresh: a later source's
        rollback expires every ORM object in the session, and reading an
        expired attribute on an async session fails.
        """
        run = await start_run(session, source)
        run_id = run.id
        await session.commit()
        try:
            result = await work(run)
            return run_out(run), run_id, result
        except Exception as error:
            logger.exception("%s run failed", source)
            await session.rollback()
            run = await session.get(CatalogueRun, run_id)
            await finish_run(
                session,
                run,
                ok=False,
                errors=[{"code": "internal", "detail": type(error).__name__}],
            )
            await session.commit()
            return run_out(run), run_id, None

    async def refresh_store(session, client, throttle, key: str):
        config = STORES[key]

        async def work(run):
            previous = await previous_rows_seen(session, key)
            robots = await robots_for(config.domain, client, throttle)
            if config.adapter == "shopify":
                skip = await recently_checked_handles(session, key)
                products, errors = await shopify.list_products(
                    config, client, robots, throttle, html_skip=skip
                )
            else:
                products, errors = await woocommerce.list_products(
                    config, client, robots, throttle
                )
            seen = len(products)
            short = is_short(seen, previous)
            ok = seen > 0
            changed, archived = await upsert_listings(
                session, products, key, archive=ok and not short and not errors
            )
            await finish_run(
                session,
                run,
                ok=ok,
                rows_seen=seen,
                rows_changed=changed,
                rows_retired=archived,
                short_run=short,
                errors=[error.as_entry() for error in errors],
            )
            await session.commit()

        snapshot, _, _ = await guarded(session, key, work)
        return snapshot

    async def refresh_editions(session, source: str, load) -> tuple:
        async def work(run):
            previous = await previous_rows_seen(session, source)
            try:
                rows, warnings = await load()
            except PhysicalSourceError as error:
                await finish_run(session, run, ok=False, errors=[error.as_entry()])
                await session.commit()
                return False
            short = is_short(len(rows), previous)
            ok = len(rows) > 0
            changed, retired = await upsert_editions(
                session, rows, source, retire=ok and not short
            )
            await finish_run(
                session,
                run,
                ok=ok,
                rows_seen=len(rows),
                rows_changed=changed,
                rows_retired=retired,
                short_run=short,
                errors=[_warning_entry(w) for w in warnings]
                or ([] if ok else [{"code": "empty", "detail": "no rows"}]),
            )
            await session.commit()
            return ok

        snapshot, run_id, ok = await guarded(session, source, work)
        return snapshot, run_id, bool(ok)

    async def resolve_run(session, limit: int = RESOLVE_LIMIT) -> ResolveResult:
        async def work(run):
            outcome = await resolve_batch(session, igdb(), limit)
            await finish_run(
                session,
                run,
                ok=not outcome.errors,
                rows_seen=outcome.resolved + outcome.pending,
                rows_changed=outcome.resolved,
                unresolved_remaining=outcome.unresolved_remaining,
                errors=outcome.errors,
            )
            await session.commit()
            return outcome

        snapshot, _, outcome = await guarded(session, "resolve", work)
        if outcome is None:
            outcome = ResolveResult(
                unresolved_remaining=await count_pending(session),
                errors=list(snapshot.errors),
            )
        return outcome

    @router.post("/refresh", response_model=RefreshOut)
    async def refresh(
        body: RefreshIn | None = None,
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> RefreshOut:
        """Walks the named stores (default all), then one resolve batch."""
        keys = (body.stores if body and body.stores else None) or list(STORES)
        unknown = [key for key in keys if key not in STORES]
        if unknown:
            raise HTTPException(
                status_code=422, detail=f"Unknown store: {', '.join(unknown)}"
            )
        throttle = HostThrottle()
        runs = []
        async with http_client_factory() as client:
            for key in keys:
                runs.append(await refresh_store(session, client, throttle, key))
        outcome = await resolve_run(session)
        return RefreshOut(
            runs=runs,
            unresolved_remaining=outcome.unresolved_remaining,
        )

    @router.post("/refresh-registry", response_model=RefreshOut)
    async def refresh_registry(
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> RefreshOut:
        """The sheet, then the tracker; one resolve batch; then the sync."""
        throttle = HostThrottle()
        async with http_client_factory() as client:

            async def load_sheet():
                return await sheet.list_editions(client, sheets_key, throttle)

            async def load_tracker():
                robots = await robots_for(tracker.HOST, client, throttle)
                if not robots.can_fetch(tracker.URL):
                    raise PhysicalSourceError(
                        "robots.txt disallows the tracker", code="robots_disallowed"
                    )
                return tracker.parse_games(
                    await tracker.fetch_games(client, throttle)
                ), []

            sheet_out, sheet_id, sheet_ok = await refresh_editions(
                session, "nscollectors", load_sheet
            )
            tracker_out, _, _ = await refresh_editions(
                session, "switch2tracker", load_tracker
            )
        outcome = await resolve_run(session)
        if sheet_ok:
            # Re-read by id: an earlier rollback may have expired the row.
            try:
                synced = await sync_items(session)
                sheet_run = await session.get(CatalogueRun, sheet_id)
                sheet_run.items_synced = synced
                await session.commit()
            except Exception as error:
                logger.exception("registry sync failed")
                await session.rollback()
                sheet_run = await session.get(CatalogueRun, sheet_id)
                sheet_run.errors = [
                    *(sheet_run.errors or []),
                    {"code": "sync_failed", "detail": type(error).__name__},
                ]
                await session.commit()
            sheet_out = run_out(sheet_run)
        return RefreshOut(
            runs=[sheet_out, tracker_out],
            unresolved_remaining=outcome.unresolved_remaining,
        )

    @router.post("/refresh-platform", response_model=RunOut)
    async def refresh_platform(
        platform_id: int = Query(...),
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> RunOut:
        """The N64 ingest; Switch 1 and everything else are 422."""
        if platform_id not in INGESTED_PLATFORMS:
            raise HTTPException(
                status_code=422,
                detail="Only the Nintendo 64 (platform 4) is ingested from IGDB",
            )
        previous = await previous_rows_seen(session, "igdb_platform")

        async def work(run):
            outcome = await ingest_platform(
                session, igdb(), platform_id, previous=previous
            )
            errors = list(outcome.errors)
            if previous is None and outcome.rows:
                errors.append(
                    {
                        "code": "info",
                        "detail": f"{outcome.with_cover} of {outcome.rows} "
                        "with a cover",
                    }
                )
            await finish_run(
                session,
                run,
                ok=outcome.rows > 0 and not outcome.errors,
                rows_seen=outcome.rows,
                rows_changed=outcome.changed,
                rows_retired=outcome.retired,
                short_run=outcome.short,
                errors=errors,
            )
            await session.commit()

        snapshot, _, _ = await guarded(session, "igdb_platform", work)
        return snapshot

    @router.post("/resolve", response_model=ResolveOut)
    async def resolve(
        # Capped: each key is one or two IGDB queries inside this request.
        limit: int = Query(RESOLVE_LIMIT, ge=1, le=200),
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> ResolveOut:
        """One resolve batch; the page loops this until nothing remains."""
        outcome = await resolve_run(session, limit)
        return ResolveOut(
            resolved=outcome.resolved,
            pending=outcome.pending,
            games_fetched=outcome.games_fetched,
            unresolved_remaining=outcome.unresolved_remaining,
            errors=outcome.errors,
        )

    @router.get("/needs-match", response_model=NeedsMatchOut)
    async def needs_match(
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        session: AsyncSession = Depends(get_session),
    ) -> NeedsMatchOut:
        """Keys a human has to decide: searched without a sure match, or
        with no platform the store would say."""
        pending = {
            (m.title_normalized, m.platform_id): list(m.candidates or [])
            for m in await session.scalars(
                select(CatalogueMatch).where(*_waiting_on_a_human())
            )
        }
        decided_platformless = set(
            await session.scalars(
                select(CatalogueMatch.title_normalized).where(
                    CatalogueMatch.platform_id == 0
                )
            )
        )
        platformless = [
            row
            for row in await session.scalars(
                select(StoreListing).where(
                    StoreListing.platform_id.is_(None),
                    StoreListing.platform.is_(None),
                    StoreListing.is_game.is_(True),
                    StoreListing.availability != "archived",
                )
            )
            if row.title_normalized not in decided_platformless
        ]
        rows: dict[tuple[str, int], list] = {key: [] for key in pending}
        for row in platformless:
            rows.setdefault((row.title_normalized, 0), []).append(row)
        if pending:
            titles = {title for title, _ in pending}
            live = {
                PhysicalEdition: PhysicalEdition.retired_at.is_(None),
                StoreListing: StoreListing.availability != "archived",
            }
            for model, is_live in live.items():
                for row in await session.scalars(
                    select(model).where(model.title_normalized.in_(titles), is_live)
                ):
                    key = (row.title_normalized, row.platform_id)
                    if key in pending:
                        rows[key].append(row)
        keys = []
        for (title_normalized, platform_id), found in sorted(rows.items()):
            editions = [r for r in found if isinstance(r, PhysicalEdition)]
            keys.append(
                NeedsMatchKey(
                    title_normalized=title_normalized,
                    platform_id=platform_id,
                    platform=PLATFORM_NAMES.get(platform_id),
                    title=(editions or found)[0].title,
                    sources=sorted(
                        {getattr(r, "store", None) or r.source for r in found}
                    ),
                    rows=len(found),
                    candidates=pending.get((title_normalized, platform_id), []),
                )
            )
        return NeedsMatchOut(keys=keys[offset : offset + limit], total=len(keys))

    @router.post("/matches", response_model=MatchOut)
    async def decide_match(
        body: MatchIn,
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> MatchOut:
        """Link a key by hand, ignore it, or give a platform-less key one."""
        if body.new_platform_id is not None:
            if body.new_platform_id not in PLATFORM_NAMES:
                raise HTTPException(status_code=422, detail="Unknown platform id")
            if body.platform_id != 0:
                # A store that states a platform restates it on every
                # refresh, so a correction could not stick; only a key with
                # no platform can be given one.
                raise HTTPException(
                    status_code=422,
                    detail="Only a key with no platform can be given one",
                )
            moved = await rekey_platform(
                session, body.title_normalized, body.platform_id, body.new_platform_id
            )
            await session.commit()
            return MatchOut(action="rekeyed", moved=moved)
        if body.ignored:
            await ignore(session, body.title_normalized, body.platform_id)
            await session.commit()
            return MatchOut(action="ignored")
        try:
            await link_by_hand(
                session, igdb(), body.title_normalized, body.platform_id, body.igdb_id
            )
        except UnknownGame as error:
            raise HTTPException(
                status_code=404, detail=f"IGDB has no game {error.args[0]}"
            ) from error
        except SourceNotConfigured as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except SourceError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error
        await session.commit()
        return MatchOut(action="linked")

    @router.get("/items/{item_id}/registry", response_model=RegistryNoteOut)
    async def item_registry(
        item_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> RegistryNoteOut:
        """What the registry says about one copy; Switch 2 copies only."""
        item = await session.get(Item, item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Item not found")
        if item.platform_id != SWITCH_2:
            return RegistryNoteOut(edition=None, agrees=None, note=None)
        igdb_id = int(item.external_id) if (item.external_id or "").isdigit() else None
        editions = (
            (await registry_editions(session, {igdb_id})).get(igdb_id, [])
            if item.external_source == "igdb" and igdb_id is not None
            else []
        )
        note = item_note(item_view(item), editions)
        edition = note.edition
        return RegistryNoteOut(
            edition=EditionOut(
                id=uuid.UUID(edition.id),
                region=edition.region,
                physical_format=edition.physical_format,
                format_words=REGISTRY_WORDS.get(edition.physical_format),
                cart_id=edition.cart_id,
            )
            if edition
            else None,
            agrees=note.agrees,
            note=note.note,
        )

    @router.get("/disagreements", response_model=DisagreementsOut)
    async def list_disagreements(
        session: AsyncSession = Depends(get_session),
    ) -> DisagreementsOut:
        """Owner-recorded copies the registry contradicts."""
        return DisagreementsOut(
            items=[
                DisagreementOut(
                    **{**found.__dict__, "item_id": uuid.UUID(found.item_id)}
                )
                for found in await disagreements(session)
            ]
        )

    @router.get("/status", response_model=StatusOut)
    async def status(session: AsyncSession = Depends(get_session)) -> StatusOut:
        """The latest run per source, and the catalogue's totals."""
        runs = await latest_runs(session)
        streaks = await failure_streaks(session)
        sources = []
        for source, kind in (
            *((key, "store") for key in STORES),
            *((key, "registry") for key in REGISTRY_SOURCES),
            ("igdb_platform", "platform"),
            ("resolve", "resolve"),
        ):
            failures = streaks.get(source, 0)
            run = runs.get(source)
            sources.append(
                SourceStatus(
                    source=source,
                    name=SOURCE_NAMES[source],
                    kind=kind,
                    last_run=run_out(run) if run else None,
                    consecutive_failures=failures,
                    needs_attention=failures >= NEEDS_ATTENTION_AFTER,
                )
            )
        totals = await count_live(session)
        totals["cached_games"] = (
            await session.scalar(select(func.count()).select_from(CatalogueGame)) or 0
        )
        # Needs match: decided by nobody yet. Unresolved: never searched.
        totals["pending_keys"] = (
            await session.scalar(
                select(func.count())
                .select_from(CatalogueMatch)
                .where(*_waiting_on_a_human())
            )
            or 0
        )
        totals["unresolved_keys"] = await count_pending(session)
        totals["keys_without_platform"] = (
            await session.scalar(
                select(func.count(StoreListing.title_normalized.distinct())).where(
                    StoreListing.platform_id.is_(None),
                    StoreListing.platform.is_(None),
                    StoreListing.is_game.is_(True),
                    StoreListing.availability != "archived",
                    # Ignored under platform 0: decided, so not waiting.
                    StoreListing.title_normalized.not_in(
                        select(CatalogueMatch.title_normalized).where(
                            CatalogueMatch.platform_id == 0
                        )
                    ),
                )
            )
            or 0
        )
        totals["disagreements"] = len(await disagreements(session))
        return StatusOut(sources=sources, totals=totals)

    return router
