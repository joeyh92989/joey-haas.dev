"""Radar's (E8c) and Discover's (E8b) admin routes: generate, list,
watching, and the owner's answer to each suggestion.

Everything here is admin-only and nothing is public: a watched game reaches
`/spine` as an ordinary item with `wanted`, never as a recommendation.
Generation re-scores the catalogue as it is and never walks the stores; it
takes the catalogue's write lock, so it cannot run during a refresh.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import discover
from formats import apply_registry_format
from items import ItemIn, _copy_fields, require_admin
from llm import LLMError, LLMProvider
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
from next_list import PUBLIC_DATE_SOURCES
from next_list import sections as next_sections
from next_load import catalogue_times, load_next
from picker import attribute_table, reference_weights
from radar import SECTIONS, _line_dict, build
from radar_load import (
    DISCOVER_PLATFORMS,
    RADAR_PLATFORMS,
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
    kind: Literal["radar", "discover"]
    # The catalogue's platforms; Radar refuses N64 (4), which has no
    # upcoming releases. Anything else is a 422.
    platforms: list[Literal[130, 508, 4]] | None = None
    include_key_cards: bool = False
    # Discover only.
    popularity: Literal["safe", "balanced", "deep"] = "balanced"
    window: Literal["recent", "any"] = "any"


def _today() -> date:
    return datetime.now(UTC).date()


def _failure_note(error: str) -> str:
    """Why the model did not rank the picks, in the owner's words.

    Reads `llm.py`'s own wording: only Gemini's per-day 429 says "used up",
    Gemini's other 429s say "rate limit", its exhausted 503 chain says "is
    overloaded", and Anthropic's SDK errors start "Error code: 429" or
    "Error code: 529".
    """
    lowered = error.lower()
    if "per day" in lowered and "used up" in lowered:
        return "Gemini's daily quota is used up"
    if "gemini is overloaded" in lowered:
        return "Gemini is overloaded; try again in a few minutes"
    if "error code: 529" in lowered:
        return "The model is overloaded; try again in a few minutes"
    if "rate limit" in lowered or "error code: 429" in lowered:
        return "The model's rate limit was reached; try again in a minute"
    return "The model did not answer"


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


def _item_release_date(row: Recommendation) -> date | None:
    """The date a Want or Already own may copy onto the item: a public
    source's (next_list.PUBLIC_DATE_SOURCES), to the day. A store's date is
    store data and a wanted item is public; an item has no precision
    column, so a month or quarter would read as its first day."""
    meta = row.source_metadata or {}
    if (
        meta.get("release_source") in PUBLIC_DATE_SOURCES
        and meta.get("release_precision") == "day"
    ):
        return row.release_date
    return None


def create_recommendations_router(
    factory: async_sessionmaker[AsyncSession],
    registry: dict,
    lock: asyncio.Lock,
    provider_factory: Callable[[], LLMProvider] | None = None,
) -> APIRouter:
    """Builds `/api/recommendations`. `lock` is the catalogue's write lock,
    shared with `create_physical_router`; `provider_factory` builds the
    model provider for Discover, per request, as the photo importer does."""
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

    async def _replace_pending(
        session: AsyncSession,
        kind: RecommendationKind,
        scope: tuple[int, ...],
        rows: list[dict],
        batch_id: uuid.UUID,
    ) -> None:
        """Replaces the kind's pending suggestions on `scope` with `rows`.

        Rows are locked until this commits: an answer pressed meanwhile
        waits, then applies to the row as generated. A wanted, dismissed or
        owned row keeps the owner's answer; a skipped one comes back.
        """
        now = datetime.now(UTC)
        existing = {
            (row.external_id, row.platform_id): row
            for row in await session.scalars(
                select(Recommendation)
                .where(
                    Recommendation.kind == kind,
                    Recommendation.platform_id.in_(scope),
                )
                .with_for_update()
            )
        }
        fresh = {(str(entry["igdb_id"]), entry["platform_id"]): entry for entry in rows}
        for key, row in existing.items():
            if row.status == RecommendationStatus.PENDING and key not in fresh:
                await session.delete(row)
        for key, entry in fresh.items():
            row = existing.get(key)
            if row is not None and row.status not in WAITING:
                continue  # wanted, dismissed, owned: the owner's answer stands
            if row is None:
                row = Recommendation(
                    kind=kind,
                    type=ItemType.GAME,
                    external_source="igdb",
                    external_id=key[0],
                    platform_id=entry["platform_id"],
                )
                session.add(row)
            released = entry["release_date"]
            row.title = entry["title"]
            row.year = released.year if released else None
            row.release_date = released
            row.cover_url = entry["cover_url"]
            row.reason = "\n".join(entry["reasons"])
            row.reason_source = entry["reason_source"]
            row.based_on = list(entry["based_on"])
            row.score = max(0, min(SMALLINT_MAX, entry["score"]))
            row.batch_id = batch_id
            row.generated_at = now
            row.status = RecommendationStatus.PENDING
            row.platform = PLATFORM_NAMES.get(entry["platform_id"])
            row.physical_format = (
                PhysicalFormat(entry["physical_format"])
                if entry["physical_format"]
                else None
            )
            row.format_source = (
                FormatSource(entry["format_source"]) if entry["format_source"] else None
            )
            row.format_note = entry["format_note"]
            row.listing_ids = list(entry["listing_ids"])
            row.source_metadata = entry["source_metadata"]
        await session.commit()

    async def generate_radar(body: GenerateIn, session: AsyncSession) -> dict:
        """Re-scores the catalogue into Radar's sections."""
        if body.platforms and 4 in body.platforms:
            raise HTTPException(
                status_code=422, detail="Radar covers the two Switches only"
            )
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
        # What this generation replaces: the platforms asked for, or all of
        # Radar's when none were, so a platform the collection no longer
        # has does not keep stale rows.
        await _replace_pending(
            session,
            RecommendationKind.RADAR,
            tuple(body.platforms or ()) or RADAR_PLATFORMS,
            [
                {
                    "igdb_id": s.igdb_id,
                    "platform_id": s.platform_id,
                    "title": s.title,
                    "release_date": s.release_date,
                    "cover_url": s.cover_url,
                    "reasons": s.reasons,
                    "reason_source": ReasonSource.TEMPLATE,
                    "based_on": s.based_on,
                    "score": s.score,
                    "physical_format": s.physical_format,
                    "format_source": s.format_source,
                    "format_note": s.format_note,
                    "listing_ids": s.listing_ids,
                    "source_metadata": {
                        "lane": s.lane,
                        "section": s.section,
                        "release_precision": s.release_precision,
                        "release_source": s.release_source,
                        "hypes": s.hypes,
                        "store_lines": list(s.store_lines),
                        "snapshot": s.snapshot,
                    },
                }
                for s in suggestions
            ],
            batch_id,
        )
        counts = {section: 0 for section in SECTIONS}
        for suggestion in suggestions:
            counts[suggestion.section] += 1
        logger.info("radar generated %s (batch %s)", counts, batch_id)
        return {
            "batch_id": str(batch_id),
            "counts": counts,
            "digital_error": digital_error,
        }

    async def rank(prompt: str) -> tuple[dict | None, str | None]:
        """One model call, or why there was none. Never raises."""
        if provider_factory is None:
            return None, "No model is configured"
        try:
            provider = provider_factory()
            payload = await provider.complete_json(prompt, discover.PICKS_SCHEMA)
        except LLMError as error:
            logger.warning("discover model call failed: %s", error)
            return None, _failure_note(str(error))
        except Exception as error:  # a malformed answer must not stop Discover
            logger.exception("discover model call failed unexpectedly")
            return (
                None,
                f"The model's answer could not be read ({type(error).__name__})",
            )
        return payload, None

    async def generate_discover(body: GenerateIn, session: AsyncSession) -> dict:
        """Released physical games the owner would love: pre-scored, one
        model call to pick eight with reasons, the template eight when the
        model cannot answer."""
        today = _today()
        platforms = tuple(body.platforms or ()) or await collection_platforms(
            session, DISCOVER_PLATFORMS
        )
        profile = await load_profile(session)
        pool = discover.eligible(
            await load_pool(session, platforms, today),
            await excluded_games(session),
            today,
            body.window,
            body.include_key_cards,
        )
        candidates = discover.prescore(pool, profile, body.popularity, today)
        batch_id = uuid.uuid4()
        short = discover.shortlist(candidates, batch_id.int % 2**32)
        refs = discover.references(profile)
        weights = reference_weights(profile)
        table = attribute_table(profile, weights) if weights else {}

        picks: list[discover.Pick] = []
        note = "Nothing in the catalogue fits yet" if not short else None
        if short:
            payload, note = await rank(discover.build_prompt(short, refs, table))
            if payload is not None:
                picks = discover.validate(payload, short, refs, today)
                logger.info(
                    "discover model kept %d of %d picks", len(picks), len(short)
                )
                if not picks:
                    note = "The model's picks did not hold up"
            if not picks:
                picks = discover.fallback(candidates, profile, today)
        ranked_by = picks[0].ranked_by if picks else "template"
        titles = {item.id: item.title for item in profile}
        rows = []
        for position, pick in enumerate(picks):
            candidate = pick.candidate.game.candidate
            rows.append(
                {
                    "igdb_id": candidate.igdb_id,
                    "platform_id": candidate.platform_id,
                    "title": candidate.title,
                    "release_date": candidate.release_date,
                    "cover_url": candidate.cover_url,
                    "reasons": pick.reasons,
                    "reason_source": ReasonSource.MODEL
                    if pick.ranked_by == "model"
                    else ReasonSource.TEMPLATE,
                    "based_on": pick.based_on,
                    "score": pick.candidate.score,
                    "physical_format": candidate.physical_format,
                    "format_source": candidate.format_source,
                    "format_note": candidate.format_note,
                    "listing_ids": candidate.listing_ids,
                    "source_metadata": {
                        "rank": position,
                        "ranked_by": pick.ranked_by,
                        "model_note": note,
                        "based_on_titles": [
                            titles[ref] for ref in pick.based_on if ref in titles
                        ],
                        "genres": list(pick.candidate.item.genres[:4]),
                        "buyable": pick.candidate.buyable,
                        "release_precision": candidate.release_precision,
                        "store_lines": [
                            _line_dict(line) for line in candidate.store_lines
                        ],
                        "snapshot": pick.candidate.game.snapshot,
                    },
                }
            )
        # Every generate replaces all of Discover's pending picks, whatever
        # platforms it read: the list is always one batch, under one note.
        await _replace_pending(
            session, RecommendationKind.DISCOVER, DISCOVER_PLATFORMS, rows, batch_id
        )
        logger.info(
            "discover generated %d picks, ranked by %s (batch %s)",
            len(rows),
            ranked_by,
            batch_id,
        )
        return {
            "batch_id": str(batch_id),
            "count": len(rows),
            "ranked_by": ranked_by,
            "model_note": note,
        }

    @router.post("/generate")
    async def generate(
        body: GenerateIn,
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Radar's sections or Discover's picks, from the catalogue as it is."""
        if body.kind == "discover":
            return await generate_discover(body, session)
        return await generate_radar(body, session)

    async def _last_generated(session: AsyncSession, kind: RecommendationKind):
        """The last generation, whatever the owner has answered since."""
        return await session.scalar(
            select(func.max(Recommendation.generated_at)).where(
                Recommendation.kind == kind
            )
        )

    @router.get("")
    async def list_recommendations(
        kind: Literal["radar", "discover"],
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """The pending suggestions, best first. Skipped ones stay hidden
        until the next generation."""
        wanted_kind = RecommendationKind(kind)
        rows = list(
            await session.scalars(
                select(Recommendation)
                .where(
                    Recommendation.kind == wanted_kind,
                    Recommendation.status == RecommendationStatus.PENDING,
                )
                .order_by(Recommendation.score.desc(), Recommendation.release_date)
            )
        )
        generated_at = await _last_generated(session, wanted_kind)
        # With nothing favourited, rated or finished, the ranking is by
        # hype or popularity alone, and the page says so.
        personalised = bool(reference_weights(await load_profile(session)))
        if wanted_kind == RecommendationKind.DISCOVER:
            # The latest batch first, in the model's order; a skipped pick
            # revived by a later generate belongs to that batch.
            rows.sort(
                key=lambda row: (
                    -row.generated_at.timestamp(),
                    (row.source_metadata or {}).get("rank", 99),
                )
            )
            meta = (rows[0].source_metadata or {}) if rows else {}
            return {
                "generated_at": generated_at,
                "personalised": personalised,
                "ranked_by": meta.get("ranked_by"),
                "model_note": meta.get("model_note"),
                "picks": [
                    {
                        **_row_out(row),
                        "based_on_titles": (row.source_metadata or {}).get(
                            "based_on_titles", []
                        ),
                        "genres": (row.source_metadata or {}).get("genres", []),
                    }
                    for row in rows
                ],
            }
        sections: dict[str, list[dict]] = {section: [] for section in SECTIONS}
        for row in rows:
            section = (row.source_metadata or {}).get("section")
            if section in sections:
                sections[section].append(_row_out(row))
        return {
            "generated_at": generated_at,
            "personalised": personalised,
            "catalogue": await catalogue_times(session),
            "sections": sections,
        }

    @router.get("/store-list")
    async def store_list(session: AsyncSession = Depends(get_session)) -> dict:
        """The signed-in What's next: the same sections as /api/public/next
        (next_list in admin mode, where any date counts, over pending rows
        only), with the admin fields, the stored reasons and each row's own
        date, whatever its section."""
        today = _today()
        data = await load_next(session)
        built = next_sections(data.candidates, today, public=False)
        return {
            "generated_at": data.generated_at,
            "catalogue": await catalogue_times(session),
            "sections": {
                key: [
                    {
                        **_row_out(entry.candidate.payload),
                        "top_pick": entry.top_pick,
                        "new": entry.new,
                        "kind": entry.candidate.kind,
                    }
                    for entry in entries
                ]
                for key, entries in built.items()
            },
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

    async def _add_item(
        session: AsyncSession,
        recommendation_id: uuid.UUID,
        owned_format: OwnedFormat,
        is_public: bool,
        answered: RecommendationStatus,
    ) -> dict:
        """Adds a suggested game to the collection and records the answer.

        Through the items create path, backlog, with the snapshot; the only
        format recorded is the registry's (it is apply_registry_format's to
        write): a store's claim stays on the suggestion.
        """
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
            is_public=is_public,
            year=row.year,
            cover_url=row.cover_url,
            external_source=row.external_source,
            external_id=row.external_id,
            owned_format=owned_format,
            source_metadata=snapshot or None,
            platform_id=row.platform_id,
            release_date=_item_release_date(row),
        )
        values = payload.model_dump()
        values.update(_copy_fields(payload.model_dump(exclude_unset=True), None))
        item = Item(**values)
        if (
            row.physical_format is not None
            and row.format_source == FormatSource.REGISTRY
        ):
            for field, value in apply_registry_format(
                item, row.physical_format.value
            ).items():
                setattr(item, field, value)
        session.add(item)
        row.status = answered
        await session.commit()
        return {"item_id": str(item.id)}

    @router.post("/{recommendation_id}/want", status_code=201)
    async def want(
        recommendation_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict:
        """Want: no owned copy, public (the owner's decision, E7c)."""
        return await _add_item(
            session,
            recommendation_id,
            OwnedFormat.NONE,
            True,
            RecommendationStatus.WANTED,
        )

    @router.post("/{recommendation_id}/own", status_code=201)
    async def own(
        recommendation_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict:
        """Already own: a physical copy, private until the owner publishes it."""
        return await _add_item(
            session,
            recommendation_id,
            OwnedFormat.PHYSICAL,
            False,
            RecommendationStatus.OWNED,
        )

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
