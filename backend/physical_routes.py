"""The physical catalogue's admin routes: refresh, resolve and status.

Everything is admin-only, synchronous and pressed by hand (spec §6). Each
source's refresh is its own catalogue_runs row and its own commit, so a store
that fails late in a refresh never loses the ones read before it. One lock
covers every writing route: Render runs one instance, and two refreshes
interleaving their upserts would make the run counts meaningless.

A store archives the listings it no longer saw, and a registry retires its
editions, only after a clean run: something seen, not short against the last
successful run, and no handle or schema error -- a store whose one broken
collection hid half its stock has not proved that stock gone.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from items import require_admin
from models import CatalogueGame, CatalogueMatch, ItemType, MatchDecision, StoreListing
from physical_sources import registry as sheet
from physical_sources import shopify, tracker, woocommerce
from physical_sources.base import HostThrottle, PhysicalSourceError
from physical_sources.catalogue import (
    consecutive_failures,
    count_live,
    finish_run,
    is_short,
    latest_runs,
    previous_rows_seen,
    recently_checked_handles,
    start_run,
    upsert_editions,
    upsert_listings,
)
from physical_sources.courtesy import robots_for
from physical_sources.limits import NEEDS_ATTENTION_AFTER, RESOLVE_LIMIT
from physical_sources.platform_policy import INGESTED_PLATFORMS, ingest_platform
from physical_sources.resolve import count_pending, resolve_batch
from physical_sources.stores import STORES
from physical_sources.sync import disagreements, sync_items

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
        errors=list(run.errors or []),
    )


def _warning_entry(warning: str) -> dict:
    code, _, detail = warning.rpartition(":")
    if "unknown_card_type" in code:
        return {"code": "unknown_card_type", "detail": detail}
    return {"code": "info", "detail": warning}


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

    async def refresh_store(session, client, throttle, key: str):
        config = STORES[key]
        run = await start_run(session, key)
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
        return run

    async def refresh_editions(session, source: str, load) -> tuple:
        run = await start_run(session, source)
        previous = await previous_rows_seen(session, source)
        try:
            rows, warnings = await load()
        except PhysicalSourceError as error:
            await finish_run(session, run, ok=False, errors=[error.as_entry()])
            await session.commit()
            return run, False
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
        return run, ok

    async def resolve_run(session, limit: int = RESOLVE_LIMIT):
        run = await start_run(session, "resolve")
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
            runs=[run_out(run) for run in runs],
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

            sheet_run, sheet_ok = await refresh_editions(
                session, "nscollectors", load_sheet
            )
            tracker_run, _ = await refresh_editions(
                session, "switch2tracker", load_tracker
            )
        outcome = await resolve_run(session)
        if sheet_ok:
            sheet_run.items_synced = await sync_items(session)
            await session.commit()
        return RefreshOut(
            runs=[run_out(sheet_run), run_out(tracker_run)],
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
        run = await start_run(session, "igdb_platform")
        outcome = await ingest_platform(session, igdb(), platform_id, previous=previous)
        errors = list(outcome.errors)
        if previous is None and outcome.rows:
            errors.append(
                {
                    "code": "info",
                    "detail": f"{outcome.with_cover} of {outcome.rows} with a cover",
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
        return run_out(run)

    @router.post("/resolve", response_model=ResolveOut)
    async def resolve(
        limit: int = Query(RESOLVE_LIMIT, ge=1, le=500),
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

    @router.get("/status", response_model=StatusOut)
    async def status(session: AsyncSession = Depends(get_session)) -> StatusOut:
        """The latest run per source, and the catalogue's totals."""
        runs = await latest_runs(session)
        sources = []
        for source, kind in (
            *((key, "store") for key in STORES),
            *((key, "registry") for key in REGISTRY_SOURCES),
            ("igdb_platform", "platform"),
            ("resolve", "resolve"),
        ):
            failures = await consecutive_failures(session, source)
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
                .where(CatalogueMatch.decided_by == MatchDecision.PENDING)
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
                )
            )
            or 0
        )
        totals["disagreements"] = len(await disagreements(session))
        return StatusOut(sources=sources, totals=totals)

    return router
