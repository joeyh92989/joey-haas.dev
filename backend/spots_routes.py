"""Denver spots' admin routes: the spots table, visits and the jobs' status.

Every write passes through `spots.py` for tags, slug and coordinates, and a
value it refuses comes back as a 422 whose `detail` is a sentence the form
shows as it is. Admin only, at the router: an anonymous call is a 401 before
any body is read. The public read lives with the other public outputs.

Spec and plan: docs/planning/2026-11-08-denver-spots-design.md.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import spots
from items import require_admin
from models import CandidateSource, Spot, SpotSetting, Visit
from public import OWNER_TZ

MAX_NAME = 200
MAX_NEIGHBOURHOOD = 100
MAX_BLURB = 500
MAX_VISIT_NOTE = 2000

# The run summaries the jobs write into spot_settings (PR 3 and PR 4); the
# admin page reads them through GET /api/spots/status. Unwritten is null.
STATUS_KEYS = ("candidates.last_run", "weather.last_run")


class SpotIn(BaseModel):
    """A spot to add. `coords` is the pasted "lat, lng" (or a maps URL)."""

    name: str = Field(min_length=1, max_length=MAX_NAME)
    coords: str = Field(min_length=1, max_length=500)
    neighbourhood: str | None = Field(default=None, max_length=MAX_NEIGHBOURHOOD)
    blurb: str | None = Field(default=None, max_length=MAX_BLURB)
    tags: list[str] = Field(default_factory=list, max_length=len(spots.TAGS) * 2)
    anchor: bool = False
    is_public: bool = False


class SpotPatch(BaseModel):
    """Any subset of SpotIn's fields; an omitted field is left alone."""

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME)
    coords: str | None = Field(default=None, min_length=1, max_length=500)
    neighbourhood: str | None = Field(default=None, max_length=MAX_NEIGHBOURHOOD)
    blurb: str | None = Field(default=None, max_length=MAX_BLURB)
    tags: list[str] | None = Field(default=None, max_length=len(spots.TAGS) * 2)
    anchor: bool | None = None
    is_public: bool | None = None


class SpotOut(BaseModel):
    """A spot as the admin sees it, anchor and visits included."""

    id: uuid.UUID
    name: str
    slug: str
    lat: float
    lng: float
    neighbourhood: str | None
    blurb: str | None
    tags: list[str]
    anchor: bool
    is_public: bool
    city: str
    source: CandidateSource | None
    source_id: str | None
    last_visit: date | None
    visit_count: int


class VisitIn(BaseModel):
    """A visit to log. The date defaults to the owner's Denver day."""

    visited_on: date | None = None
    note: str | None = Field(default=None, max_length=MAX_VISIT_NOTE)


class VisitOut(BaseModel):
    id: uuid.UUID
    spot_id: uuid.UUID
    visited_on: date
    note: str | None


def _clean(text: str | None) -> str | None:
    return (text or "").strip() or None


def _parse_coords(text: str) -> tuple[float, float]:
    try:
        return spots.parse_coords(text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _tags(values: list[str]) -> list[str]:
    try:
        return spots.canonical_tags(values)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _out(row: Spot, last_visit: date | None, visit_count: int) -> SpotOut:
    return SpotOut(
        id=row.id,
        name=row.name,
        slug=row.slug,
        lat=row.lat,
        lng=row.lng,
        neighbourhood=row.neighbourhood,
        blurb=row.blurb,
        tags=list(row.tags or []),
        anchor=row.anchor,
        is_public=row.is_public,
        city=row.city,
        source=row.source,
        source_id=row.source_id,
        last_visit=last_visit,
        visit_count=visit_count,
    )


def create_spots_router(factory: async_sessionmaker[AsyncSession]) -> APIRouter:
    """Builds the spots routes; admin only."""
    router = APIRouter(
        prefix="/api/spots",
        tags=["spots"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def _spot(session: AsyncSession, spot_id: uuid.UUID) -> Spot:
        row = await session.get(Spot, spot_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Spot not found")
        return row

    async def _visit_summary(
        session: AsyncSession, spot_ids: list[uuid.UUID] | None = None
    ) -> dict[uuid.UUID, tuple[date, int]]:
        query = select(
            Visit.spot_id, func.max(Visit.visited_on), func.count(Visit.id)
        ).group_by(Visit.spot_id)
        if spot_ids is not None:
            query = query.where(Visit.spot_id.in_(spot_ids))
        rows = await session.execute(query)
        return {spot_id: (last, count) for spot_id, last, count in rows}

    async def _read(session: AsyncSession, row: Spot) -> SpotOut:
        last, count = (await _visit_summary(session, [row.id])).get(row.id, (None, 0))
        return _out(row, last, count)

    async def _slug_for(
        session: AsyncSession, name: str, exclude: uuid.UUID | None = None
    ) -> str:
        # A suffix shortens a long base to stay within the column, so the
        # lookup takes every slug sharing the part a suffix can never cut
        # (slugify leaves no run of hyphens for rstrip to eat into it).
        stem = spots.slugify(name)[: spots.SLUG_MAX - spots.SLUG_SUFFIX_ROOM]
        query = select(Spot.slug).where(Spot.slug.startswith(stem))
        if exclude is not None:
            query = query.where(Spot.id != exclude)
        return spots.unique_slug(name, (await session.scalars(query)).all())

    async def _commit(session: AsyncSession) -> None:
        # Two writes racing for one slug: the unique index decides, and the
        # loser is told to try again rather than given a 500.
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise HTTPException(
                status_code=409, detail="Another spot took that name; try again"
            ) from exc

    @router.get("", response_model=list[SpotOut])
    async def list_spots(session: AsyncSession = Depends(get_session)) -> list[SpotOut]:
        """Every spot, anchors and private ones included, by name."""
        rows = (await session.scalars(select(Spot).order_by(Spot.name))).all()
        visits = await _visit_summary(session)
        return [_out(row, *visits.get(row.id, (None, 0))) for row in rows]

    @router.post("", response_model=SpotOut, status_code=201)
    async def create_spot(
        payload: SpotIn, session: AsyncSession = Depends(get_session)
    ) -> SpotOut:
        """Adds a spot by hand. Private unless `is_public` says otherwise."""
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="A spot needs a name")
        lat, lng = _parse_coords(payload.coords)
        tags = _tags(payload.tags)
        try:
            slug = await _slug_for(session, name)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        row = Spot(
            name=name,
            slug=slug,
            lat=lat,
            lng=lng,
            neighbourhood=_clean(payload.neighbourhood),
            blurb=_clean(payload.blurb),
            tags=tags,
            anchor=payload.anchor,
            is_public=payload.is_public,
        )
        session.add(row)
        await _commit(session)
        await session.refresh(row)
        return _out(row, None, 0)

    @router.patch("/{spot_id}", response_model=SpotOut)
    async def update_spot(
        spot_id: uuid.UUID,
        payload: SpotPatch,
        session: AsyncSession = Depends(get_session),
    ) -> SpotOut:
        """Edits a spot. A rename re-derives the slug; nothing is public yet
        that links by it, and the public map reads it fresh each time."""
        row = await _spot(session, spot_id)
        fields = payload.model_fields_set
        if "name" in fields:
            name = (payload.name or "").strip()
            if not name:
                raise HTTPException(status_code=422, detail="A spot needs a name")
            if name != row.name:
                try:
                    row.slug = await _slug_for(session, name, exclude=row.id)
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail=str(exc)) from exc
                row.name = name
        if "coords" in fields:
            if payload.coords is None:
                raise HTTPException(status_code=422, detail="A spot needs coordinates")
            row.lat, row.lng = _parse_coords(payload.coords)
        if "neighbourhood" in fields:
            row.neighbourhood = _clean(payload.neighbourhood)
        if "blurb" in fields:
            row.blurb = _clean(payload.blurb)
        if "tags" in fields:
            row.tags = _tags(payload.tags or [])
        for flag in ("anchor", "is_public"):
            if flag in fields:
                value = getattr(payload, flag)
                if value is None:
                    raise HTTPException(
                        status_code=422, detail=f"{flag} must be true or false"
                    )
                setattr(row, flag, value)
        await _commit(session)
        await session.refresh(row)
        return await _read(session, row)

    @router.delete("/{spot_id}", status_code=204)
    async def delete_spot(
        spot_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> None:
        """Removes a spot and its visits; a candidate pointing at it as its
        nearest anchor keeps its row with the link cleared."""
        row = await _spot(session, spot_id)
        await session.delete(row)
        await session.commit()

    @router.post("/{spot_id}/visits", response_model=VisitOut, status_code=201)
    async def log_visit(
        spot_id: uuid.UUID,
        payload: VisitIn,
        session: AsyncSession = Depends(get_session),
    ) -> VisitOut:
        """Logs a day at a spot, on the owner's Denver day when no date is
        sent. A date more than a day past it is refused; the day's grace is
        for the owner logging from a time zone east of Denver."""
        await _spot(session, spot_id)
        today = datetime.now(OWNER_TZ).date()
        visited_on = payload.visited_on or today
        if visited_on > today + timedelta(days=1):
            raise HTTPException(
                status_code=422, detail="A visit cannot be in the future"
            )
        row = Visit(spot_id=spot_id, visited_on=visited_on, note=_clean(payload.note))
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return VisitOut(
            id=row.id, spot_id=row.spot_id, visited_on=row.visited_on, note=row.note
        )

    @router.get("/status")
    async def job_status(
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """The jobs' last run summaries, null for a job that has not run."""
        rows = await session.scalars(
            select(SpotSetting).where(SpotSetting.key.in_(STATUS_KEYS))
        )
        found = {row.key: row.value for row in rows}
        return {key: found.get(key) for key in STATUS_KEYS}

    return router
