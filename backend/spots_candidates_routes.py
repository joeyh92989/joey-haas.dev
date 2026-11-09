"""The spot finder's routes: the weekly refresh, the queue, and its answers.

`POST /api/spots/candidates/refresh` is the job (nightly.yml calls it on
Sundays through `items.JOB_ROUTES`): one Overpass query over every anchor,
`spot_sources.dedupe` against itself and the spots already kept, the
dismissed and already-accepted places dropped, `candidates.shortlist`, one
model call, and the pending rows replaced. Its summary goes to
`spot_settings["candidates.last_run"]`, which `GET /api/spots/status` reads.

Accept and Dismiss each claim the row with `DELETE ... RETURNING`, so a
second answer to one candidate is a 409, never a second spot. Both return
what they removed, and `POST /api/spots/candidates/restore` puts it back
for the page's Undo. A refresh keeps a place's id while it stays queued, so
a page read before the refresh still answers the same rows.

Admin only, at the router. Its own lock, shared with nothing: it writes only
spot rows (the comics precedent). Spec and plan:
docs/planning/2026-11-08-denver-spots-design.md.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime
from typing import Any, cast

import httpx2
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import candidates
import spots
from items import require_admin
from llm import LLMError, LLMProvider
from models import Candidate, CandidateSource, Dismissal, Spot, SpotSetting, Visit
from recommendations_routes import _failure_note
from spot_sources.dedupe import dedupe
from spot_sources.limits import RADIUS_M
from spot_sources.overpass import Anchor, OverpassError, build_query, fetch, parse
from spots_routes import _tags, commit_spot, slug_for

logger = logging.getLogger(__name__)

STATUS_KEY = "candidates.last_run"
METRES_PER_MILE = 1609.344


class CandidateOut(BaseModel):
    id: uuid.UUID
    source: CandidateSource
    source_id: str = Field(max_length=60)
    name: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=60)
    lat: float
    lng: float
    distance_m: int | None
    nearest_anchor_id: uuid.UUID | None
    # "0.6 mi from Union Station · on foot"; null when the anchor is gone.
    distance: str | None
    fit: int | None
    reason: str | None
    suggested_tags: list[str]


class AcceptIn(BaseModel):
    """The tags pressed on the card; the spot gets exactly these."""

    tags: list[str] = Field(default_factory=list, max_length=len(spots.TAGS))


class AnsweredOut(BaseModel):
    """What an answer removed, for Undo: the candidate, and the spot Accept
    made (null after Dismiss)."""

    candidate: CandidateOut
    spot_id: uuid.UUID | None = None


class RestoreIn(BaseModel):
    """An answer to take back: the candidate as Accept or Dismiss returned
    it, and the spot Accept made."""

    candidate: CandidateOut
    spot_id: uuid.UUID | None = None


def _miles(distance_m: int | None) -> float | None:
    return None if distance_m is None else distance_m / METRES_PER_MILE


def _candidate_out(row: Candidate, anchor_name: str | None) -> CandidateOut:
    miles = _miles(row.distance_m)
    distance = (
        spots.distance_line(miles, anchor_name)
        if miles is not None and anchor_name is not None
        else None
    )
    return CandidateOut(
        id=row.id,
        source=row.source,
        source_id=row.source_id,
        name=row.name,
        category=row.category,
        lat=row.lat,
        lng=row.lng,
        distance_m=row.distance_m,
        nearest_anchor_id=row.nearest_anchor_id,
        distance=distance,
        fit=row.fit,
        reason=row.reason,
        suggested_tags=list(row.suggested_tags or []),
    )


def create_candidates_router(
    factory: async_sessionmaker[AsyncSession],
    http_client: Callable[[], httpx2.AsyncClient] | None = None,
    provider_factory: Callable[[], LLMProvider] | None = None,
    lock: asyncio.Lock | None = None,
) -> APIRouter:
    """`http_client` builds the client Overpass is read with (main.py passes
    the catalogue's, with its User-Agent); `provider_factory` builds the
    model per run, so a missing key fails the scoring, never the boot."""
    router = APIRouter(
        prefix="/api/spots/candidates",
        tags=["spots"],
        dependencies=[Depends(require_admin)],
    )
    run_lock = lock or asyncio.Lock()
    client_factory = http_client or httpx2.AsyncClient

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def _write_status(session: AsyncSession, summary: dict[str, Any]) -> None:
        await session.execute(
            insert(SpotSetting)
            .values(key=STATUS_KEY, value=summary)
            .on_conflict_do_update(
                index_elements=[SpotSetting.key],
                set_={"value": summary, "updated_at": func.now()},
            )
        )

    async def _anchor_names(
        session: AsyncSession, ids: set[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        rows = await session.execute(select(Spot.id, Spot.name).where(Spot.id.in_(ids)))
        return dict(rows.all())

    async def _dismissed(session: AsyncSession) -> set[str]:
        rows = await session.scalars(
            select(Dismissal.source_id).where(Dismissal.source == CandidateSource.OSM)
        )
        return set(rows.all())

    async def score(prompt: str) -> tuple[dict | None, str | None]:
        """One model call, or why there was none. Never raises."""
        if provider_factory is None:
            return None, "No model is configured"
        try:
            provider = provider_factory()
            payload = await provider.complete_json(prompt, candidates.SCORES_SCHEMA)
        except LLMError as error:
            logger.warning("spot finder model call failed: %s", error)
            return None, _failure_note(str(error))
        except Exception as error:  # a malformed answer must not stop the finder
            logger.exception("spot finder model call failed unexpectedly")
            return (
                None,
                f"The model’s answer couldn’t be read ({type(error).__name__})",
            )
        return payload, None

    async def run(session: AsyncSession) -> dict[str, Any]:
        now = datetime.now(UTC)
        kept = (await session.scalars(select(Spot))).all()
        anchors = [spot for spot in kept if spot.anchor]
        if not anchors:
            summary = {"at": now.isoformat(), "state": "no_anchors"}
            await _write_status(session, summary)
            await session.commit()
            return summary

        dismissed = await _dismissed(session)
        visits = dict(
            (
                await session.execute(
                    select(Visit.spot_id, func.count(Visit.id)).group_by(Visit.spot_id)
                )
            ).all()
        )
        # Done reading: end the transaction so no connection is held through
        # the Overpass call and the model call, which can take minutes.
        await session.commit()

        query = build_query([Anchor(a.lat, a.lng) for a in anchors], RADIUS_M)
        try:
            async with client_factory() as client:
                payload = await fetch(client, query)
        except OverpassError as error:
            logger.warning("spot finder: %s", error)
            summary = {"at": now.isoformat(), "state": "failed", "note": str(error)}
            await _write_status(session, summary)
            await session.commit()
            raise HTTPException(status_code=502, detail=str(error)) from error

        found = parse(payload)
        taken = {spot.source_id for spot in kept if spot.source == CandidateSource.OSM}
        fresh = [
            row
            for row in dedupe(found, known=kept)
            if row.source_id not in dismissed and row.source_id not in taken
        ]
        profile = [
            candidates.ProfileSpot(
                spot.name, tuple(spot.tags or ()), visits.get(spot.id, 0)
            )
            for spot in kept
            if not spot.anchor
        ]
        weights = candidates.tag_weights(profile)
        anchor_of: dict[str, Spot] = {}
        queued = []
        for row in fresh:
            nearest = spots.nearest_anchor((row.lat, row.lng), anchors)
            if nearest is None:  # unreachable: anchors is not empty
                continue
            anchor = cast(Spot, nearest.anchor)
            anchor_of[row.source_id] = anchor
            queued.append(candidates.queue(row, nearest.miles, anchor.name, weights))
        listed = candidates.shortlist(queued)

        answer, note = (None, None)
        scores: dict[int, candidates.Score] = {}
        if listed:
            answer, note = await score(candidates.build_prompt(listed, profile))
            if answer is not None:
                scores = candidates.validate(answer, listed)
                if not scores:
                    note = "The model’s answer had no usable scores"
        scored = candidates.merge(listed, scores)

        # Replace the queue in one transaction, keeping the id of every place
        # still queued. The delete comes first: it waits on an answer's row
        # lock, so the answers read after it include one committed meanwhile,
        # and a place dismissed or accepted since the first read is left out.
        # An anchor deleted since links nothing.
        before = dict(
            (
                await session.execute(
                    delete(Candidate).returning(Candidate.source_id, Candidate.id)
                )
            ).all()
        )
        answered = await _dismissed(session) | set(
            (
                await session.scalars(
                    select(Spot.source_id).where(Spot.source == CandidateSource.OSM)
                )
            ).all()
        )
        alive = set(
            (
                await session.scalars(
                    select(Spot.id).where(Spot.id.in_([a.id for a in anchors]))
                )
            ).all()
        )
        written = 0
        new = 0
        for entry in scored:
            row = entry.queued.row
            if row.source_id in answered:
                continue
            anchor_id = anchor_of[row.source_id].id
            new += row.source_id not in before
            miles = entry.queued.miles
            session.add(
                Candidate(
                    id=before.get(row.source_id) or uuid.uuid4(),
                    source=CandidateSource.OSM,
                    source_id=row.source_id,
                    name=row.name[:200],
                    category=row.category,
                    lat=row.lat,
                    lng=row.lng,
                    distance_m=None
                    if miles is None
                    else round(miles * METRES_PER_MILE),
                    nearest_anchor_id=anchor_id if anchor_id in alive else None,
                    fit=entry.score.fit,
                    reason=entry.score.reason,
                    suggested_tags=list(entry.score.tags),
                    fetched_at=now,
                )
            )
            written += 1
        summary = {
            "at": now.isoformat(),
            "state": "ok",
            "found": len(found),
            "after_dedupe": len(fresh),
            "queued": written,
            "new": new,
            "ranked_by": "model" if scores else ("fallback" if listed else None),
            "note": note,
        }
        await _write_status(session, summary)
        await session.commit()
        logger.info("spot finder: %s", summary)
        return summary

    @router.post("/refresh")
    async def refresh(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The weekly job. A second call while one runs is a 409."""
        if run_lock.locked():
            raise HTTPException(status_code=409, detail="A refresh is already running")
        async with run_lock:
            return await run(session)

    @router.get("", response_model=list[CandidateOut])
    async def list_candidates(
        session: AsyncSession = Depends(get_session),
    ) -> list[CandidateOut]:
        """The queue: highest fit first, unscored last, then nearest."""
        rows = (
            await session.scalars(
                select(Candidate).order_by(
                    Candidate.fit.desc().nulls_last(),
                    Candidate.distance_m.asc().nulls_last(),
                    Candidate.name,
                )
            )
        ).all()
        names = await _anchor_names(
            session, {row.nearest_anchor_id for row in rows if row.nearest_anchor_id}
        )
        return [_candidate_out(row, names.get(row.nearest_anchor_id)) for row in rows]

    async def _claim(session: AsyncSession, candidate_id: uuid.UUID) -> Candidate:
        claimed = (
            await session.scalars(
                delete(Candidate)
                .where(Candidate.id == candidate_id)
                .returning(Candidate)
            )
        ).one_or_none()
        if claimed is None:
            raise HTTPException(
                status_code=409, detail="That place has already been answered"
            )
        return claimed

    async def _answered(
        session: AsyncSession, row: Candidate, spot_id: uuid.UUID | None = None
    ) -> AnsweredOut:
        names = await _anchor_names(
            session, {row.nearest_anchor_id} if row.nearest_anchor_id else set()
        )
        return AnsweredOut(
            candidate=_candidate_out(row, names.get(row.nearest_anchor_id)),
            spot_id=spot_id,
        )

    @router.post("/{candidate_id}/accept", response_model=AnsweredOut)
    async def accept(
        candidate_id: uuid.UUID,
        payload: AcceptIn,
        session: AsyncSession = Depends(get_session),
    ) -> AnsweredOut:
        """A private spot with the pressed tags at the candidate's position."""
        tags = _tags(payload.tags)
        row = await _claim(session, candidate_id)
        try:
            slug = await slug_for(session, row.name)
        except ValueError as exc:  # a name with no ASCII letter or digit
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        spot = Spot(
            name=row.name,
            slug=slug,
            lat=row.lat,
            lng=row.lng,
            tags=tags,
            is_public=False,
            source=row.source,
            source_id=row.source_id,
        )
        session.add(spot)
        await session.flush()
        answered = await _answered(session, row, spot.id)
        await commit_spot(session)
        return answered

    @router.post("/{candidate_id}/dismiss", response_model=AnsweredOut)
    async def dismiss(
        candidate_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> AnsweredOut:
        """Never offered again: the `(source, source_id)` pair is kept."""
        row = await _claim(session, candidate_id)
        await session.execute(
            insert(Dismissal)
            .values(source=row.source, source_id=row.source_id)
            .on_conflict_do_nothing()
        )
        answered = await _answered(session, row)
        await session.commit()
        return answered

    @router.post("/restore", response_model=CandidateOut)
    async def restore(
        payload: RestoreIn, session: AsyncSession = Depends(get_session)
    ) -> CandidateOut:
        """Takes an answer back: removes the spot Accept made (only that one,
        and only while it is as Accept left it: never edited, no visits),
        forgets the dismissal, and puts the candidate back in the queue."""
        item = payload.candidate
        if payload.spot_id is not None:
            spot = await session.get(Spot, payload.spot_id)
            if spot is not None:
                if (spot.source, spot.source_id) != (item.source, item.source_id):
                    raise HTTPException(
                        status_code=409, detail="That spot did not come from this place"
                    )
                # Accept writes created_at and updated_at in one transaction;
                # any edit since (a rename, publishing, marking an anchor)
                # moves updated_at, and the spot is the owner's now.
                if spot.updated_at != spot.created_at:
                    raise HTTPException(
                        status_code=409,
                        detail="That spot has been edited; delete it from the table",
                    )
                has_visits = await session.scalar(
                    select(func.count(Visit.id)).where(Visit.spot_id == spot.id)
                )
                if has_visits:
                    raise HTTPException(
                        status_code=409,
                        detail="That spot has a visit now; delete it from the table",
                    )
                await session.delete(spot)
        await session.execute(
            delete(Dismissal).where(
                Dismissal.source == item.source, Dismissal.source_id == item.source_id
            )
        )
        anchor_id = item.nearest_anchor_id
        if anchor_id is not None and await session.get(Spot, anchor_id) is None:
            anchor_id = None
        await session.execute(
            insert(Candidate)
            .values(
                id=item.id,
                source=item.source,
                source_id=item.source_id,
                name=item.name,
                category=item.category,
                lat=item.lat,
                lng=item.lng,
                distance_m=item.distance_m,
                nearest_anchor_id=anchor_id,
                fit=item.fit,
                reason=item.reason,
                suggested_tags=_tags(item.suggested_tags),
            )
            .on_conflict_do_nothing()
        )
        await session.commit()
        row = await session.get(Candidate, item.id)
        if row is None:
            # The (source, source_id) pair came back under another id: a
            # refresh ran in between. The queue already has it.
            row = (
                await session.scalars(
                    select(Candidate).where(
                        Candidate.source == item.source,
                        Candidate.source_id == item.source_id,
                    )
                )
            ).one()
        names = await _anchor_names(
            session, {row.nearest_anchor_id} if row.nearest_anchor_id else set()
        )
        return _candidate_out(row, names.get(row.nearest_anchor_id))

    return router
