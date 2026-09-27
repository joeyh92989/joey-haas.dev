"""Radar's admin routes (E8c): generate, list, watching, and the owner's
answer to each suggestion. Discover (E8b) joins this router later.

Everything here is admin-only and nothing is public: a watched game reaches
`/collection` as an ordinary item with `wanted`, never as a recommendation.
Generation re-scores the catalogue as it is and never walks the stores; it
takes the catalogue's write lock, so it cannot run during a refresh.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from formats import apply_registry_format
from items import ItemIn, _copy_fields, require_admin
from models import (
    CatalogueGame,
    FormatSource,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalFormat,
    ReasonSource,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)
from physical_sources.catalogue import latest_runs
from physical_sources.stores import STORES
from picker import reference_weights
from radar import SECTIONS, build
from radar_load import (
    collection_platforms,
    excluded_games,
    load_pool,
    load_profile,
    watching,
)
from sources.base import SourceError
from sources.igdb import PLATFORM_NAMES

logger = logging.getLogger(__name__)

SMALLINT_MAX = 32767
# The answers a suggestion can still take: once watched, dismissed or owned,
# it is settled.
WAITING = (RecommendationStatus.PENDING, RecommendationStatus.SKIPPED)


class GenerateIn(BaseModel):
    kind: Literal["radar"]
    # Radar's platforms only (RADAR_PLATFORMS); anything else is a 422.
    platforms: list[Literal[130, 508]] | None = None
    include_key_cards: bool = False


def _today() -> date:
    return datetime.now(UTC).date()


def _row_out(row: Recommendation) -> dict:
    """A suggestion as the admin page reads it."""
    meta = row.source_metadata or {}
    return {
        "id": str(row.id),
        "title": row.title,
        "cover_url": row.cover_url,
        "release_date": row.release_date.isoformat() if row.release_date else None,
        "release_precision": meta.get("release_precision"),
        "platform": row.platform,
        "physical_format": row.physical_format.value if row.physical_format else None,
        "format_note": row.format_note,
        "reasons": [line for line in (row.reason or "").split("\n") if line],
        "score": row.score,
        "status": row.status.value,
        "store_lines": meta.get("store_lines", []),
        "hypes": meta.get("hypes"),
        "lane": meta.get("lane"),
    }


def create_recommendations_router(
    factory: async_sessionmaker[AsyncSession],
    registry: dict,
    lock: asyncio.Lock,
) -> APIRouter:
    """Builds `/api/recommendations`. `lock` is the catalogue's write lock,
    shared with `create_physical_router`."""
    router = APIRouter(
        prefix="/api/recommendations",
        tags=["recommendations"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def exclusive():
        """The catalogue's write lock, or 409 while a refresh holds it."""
        if lock.locked():
            raise HTTPException(status_code=409, detail="A refresh is already running")
        async with lock:
            yield

    async def upcoming(platforms: tuple[int, ...]) -> tuple[list[dict], str | None]:
        """Lane 3, or the reason it is missing; lanes 1-2 never wait on it."""
        igdb = registry.get(ItemType.GAME)
        if igdb is None or not igdb.configured():
            return [], "IGDB is not configured"
        try:
            return await igdb.upcoming(platforms, now=int(time.time())), None
        except SourceError as error:
            logger.warning("radar lane 3 failed: %s", error)
            return [], str(error)
        except Exception as error:  # an unreadable answer must not cost lanes 1-2
            logger.exception("radar lane 3 failed unexpectedly")
            return [], f"IGDB answer could not be read ({type(error).__name__})"

    @router.post("/generate")
    async def generate(
        body: GenerateIn,
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Re-scores the catalogue into Radar's sections."""
        today = _today()
        platforms = tuple(body.platforms or ()) or await collection_platforms(session)
        lane_three, digital_error = await upcoming(platforms)
        suggestions = build(
            await load_pool(session, platforms, today),
            lane_three,
            await load_profile(session),
            await excluded_games(session),
            today,
            include_key_cards=body.include_key_cards,
        )

        batch_id = uuid.uuid4()
        now = datetime.now(UTC)
        # Locked until this commits: an answer pressed meanwhile waits, then
        # applies to the row as generated, rather than being overwritten.
        existing = {
            (row.external_id, row.platform_id): row
            for row in await session.scalars(
                select(Recommendation)
                .where(
                    Recommendation.kind == RecommendationKind.RADAR,
                    Recommendation.platform_id.in_(platforms),
                )
                .with_for_update()
            )
        }
        fresh = {(str(s.igdb_id), s.platform_id): s for s in suggestions}
        for key, row in existing.items():
            if row.status == RecommendationStatus.PENDING and key not in fresh:
                await session.delete(row)
        for key, suggestion in fresh.items():
            row = existing.get(key)
            if row is not None and row.status not in (
                RecommendationStatus.PENDING,
                RecommendationStatus.SKIPPED,
            ):
                continue  # wanted, dismissed, owned: the owner's answer stands
            if row is None:
                row = Recommendation(
                    kind=RecommendationKind.RADAR,
                    type=ItemType.GAME,
                    external_source="igdb",
                    external_id=key[0],
                    platform_id=suggestion.platform_id,
                )
                session.add(row)
            row.title = suggestion.title
            row.year = suggestion.release_date.year if suggestion.release_date else None
            row.release_date = suggestion.release_date
            row.cover_url = suggestion.cover_url
            row.reason = "\n".join(suggestion.reasons)
            row.reason_source = ReasonSource.TEMPLATE
            row.based_on = list(suggestion.based_on)
            row.score = max(0, min(SMALLINT_MAX, suggestion.score))
            row.batch_id = batch_id
            row.generated_at = now
            row.status = RecommendationStatus.PENDING
            row.platform = PLATFORM_NAMES.get(suggestion.platform_id)
            row.physical_format = (
                PhysicalFormat(suggestion.physical_format)
                if suggestion.physical_format
                else None
            )
            row.format_source = (
                FormatSource(suggestion.format_source)
                if suggestion.format_source
                else None
            )
            row.format_note = suggestion.format_note
            row.listing_ids = list(suggestion.listing_ids)
            row.source_metadata = {
                "lane": suggestion.lane,
                "section": suggestion.section,
                "release_precision": suggestion.release_precision,
                "hypes": suggestion.hypes,
                "store_lines": list(suggestion.store_lines),
                "snapshot": suggestion.snapshot,
            }
        await session.commit()
        counts = {section: 0 for section in SECTIONS}
        for suggestion in suggestions:
            counts[suggestion.section] += 1
        logger.info("radar generated %s (batch %s)", counts, batch_id)
        return {
            "batch_id": str(batch_id),
            "counts": counts,
            "digital_error": digital_error,
        }

    @router.get("")
    async def list_recommendations(
        kind: Literal["radar"], session: AsyncSession = Depends(get_session)
    ) -> dict:
        """The pending suggestions by section, best first. Skipped ones stay
        hidden until the next generation."""
        rows = list(
            await session.scalars(
                select(Recommendation)
                .where(
                    Recommendation.kind == RecommendationKind(kind),
                    Recommendation.status == RecommendationStatus.PENDING,
                )
                .order_by(Recommendation.score.desc(), Recommendation.release_date)
            )
        )
        # The last generation, whatever the owner has answered since.
        generated_at = await session.scalar(
            select(func.max(Recommendation.generated_at)).where(
                Recommendation.kind == RecommendationKind(kind)
            )
        )
        sections: dict[str, list[dict]] = {section: [] for section in SECTIONS}
        for row in rows:
            section = (row.source_metadata or {}).get("section")
            if section in sections:
                sections[section].append(_row_out(row))
        runs = await latest_runs(session)
        # The stalest store's last good run: how old the pre-orders may be.
        store_times = [
            run.finished_at
            for source, run in runs.items()
            if source in STORES and run.ok and run.finished_at is not None
        ]
        registry_run = runs.get("nscollectors")
        # With nothing favourited, rated or finished, Radar ranks by hype and
        # date alone, and the page says so.
        personalised = bool(reference_weights(await load_profile(session)))
        return {
            "generated_at": generated_at,
            "personalised": personalised,
            "catalogue": {
                "stores_at": min(store_times, default=None),
                "registry_at": registry_run.finished_at if registry_run else None,
            },
            "sections": sections,
        }

    @router.get("/watching")
    async def list_watching(session: AsyncSession = Depends(get_session)) -> list[dict]:
        """Watched games still to come, soonest first."""
        return await watching(session, _today())

    async def _suggestion(
        session: AsyncSession, recommendation_id: uuid.UUID, allowed
    ) -> Recommendation:
        """The suggestion, locked, if it is still waiting for this answer.

        Only a pending or skipped suggestion takes an answer: pressing Skip
        on a stale tab must not undo a dismissal or a watch.
        """
        row = await session.get(Recommendation, recommendation_id, with_for_update=True)
        if row is None:
            raise HTTPException(status_code=404, detail="No such suggestion")
        if row.status not in allowed:
            raise HTTPException(
                status_code=409, detail=f"Already answered ({row.status.value})"
            )
        return row

    @router.post("/{recommendation_id}/watch", status_code=201)
    async def watch(
        recommendation_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict:
        """Adds the game to the collection as watched: no owned copy, backlog,
        public (the owner's decision, E7c), with its announced format."""
        row = await _suggestion(session, recommendation_id, WAITING)
        already = await session.scalar(
            select(Item.id).where(
                Item.external_source == row.external_source,
                Item.external_id == row.external_id,
            )
        )
        if already is not None:
            raise HTTPException(status_code=409, detail="Already on your shelf")
        game = (
            await session.get(CatalogueGame, int(row.external_id))
            if row.external_id.isdigit()
            else None
        )
        snapshot = (
            game.snapshot if game else (row.source_metadata or {}).get("snapshot", {})
        )
        payload = ItemIn(
            type=ItemType.GAME,
            title=row.title,
            status=ItemStatus.BACKLOG,
            is_public=True,
            year=row.year,
            cover_url=row.cover_url,
            external_source=row.external_source,
            external_id=row.external_id,
            owned_format=OwnedFormat.NONE,
            source_metadata=snapshot or None,
            platform_id=row.platform_id,
            release_date=row.release_date,
        )
        values = payload.model_dump()
        values.update(_copy_fields(payload.model_dump(exclude_unset=True), None))
        item = Item(**values)
        # Only the registry's word is recorded as the copy's format (it is
        # apply_registry_format's to write); a store's claim stays on the
        # suggestion, and the copy's format stays unknown until the owner
        # or the registry says.
        if (
            row.physical_format is not None
            and row.format_source == FormatSource.REGISTRY
        ):
            for field, value in apply_registry_format(
                item, row.physical_format.value
            ).items():
                setattr(item, field, value)
        session.add(item)
        row.status = RecommendationStatus.WANTED
        await session.commit()
        return {"item_id": str(item.id)}

    async def _answer(
        recommendation_id: uuid.UUID,
        status: RecommendationStatus,
        allowed,
        session: AsyncSession,
    ) -> dict:
        """Records the owner's answer on a suggestion still waiting for one."""
        row = await _suggestion(session, recommendation_id, allowed)
        row.status = status
        await session.commit()
        return {"status": status.value}

    @router.post("/{recommendation_id}/dismiss")
    async def dismiss(
        recommendation_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict:
        """Not interested: out of Radar and Discover for good."""
        return await _answer(
            recommendation_id, RecommendationStatus.DISMISSED, WAITING, session
        )

    @router.post("/{recommendation_id}/skip")
    async def skip(
        recommendation_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict:
        """Hidden until the next generation."""
        return await _answer(
            recommendation_id,
            RecommendationStatus.SKIPPED,
            (RecommendationStatus.PENDING,),
            session,
        )

    return router
