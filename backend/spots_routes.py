"""Denver spots' admin routes: the spots table, visits and the jobs' status.

Every write passes through `spots.py` for tags, slug and coordinates, and a
value it refuses comes back as a 422 whose `detail` is a sentence the form
shows as it is. Admin only, at the router: an anonymous call is a 401 before
any body is read. The public read lives with the other public outputs.

Spec and plan: docs/planning/2026-11-08-denver-spots-design.md.
"""

from __future__ import annotations

import unicodedata
import uuid
from collections.abc import AsyncIterator
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import spots
from items import require_admin
from models import (
    CandidateSource,
    OutingPrecision,
    OutingVerdict,
    Spot,
    SpotSetting,
    Visit,
)
from public import OWNER_TZ
from spots_schemas import SpotsStatusOut

MAX_NAME = 200
MAX_NEIGHBOURHOOD = 100
MAX_BLURB = 500
MAX_VISIT_NOTE = 2000
MAX_OUTING_TITLE = 80
# What a request may carry before trimming; the 80-character rule applies to
# the trimmed title, so padding around a short title is not an error.
MAX_OUTING_TITLE_RAW = 500
# A cap on the raw body only, so a huge string is not read; the 40-character
# rule itself is spots.normalize_city's, after trimming and collapsing.
CITY_BODY_MAX = 1000

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
    # Omitted means Denver; a city that is sent blank, or as an explicit null,
    # is a 422 (not Denver).
    city: str | None = Field(default=None, max_length=CITY_BODY_MAX)


class SpotPatch(BaseModel):
    """Any subset of SpotIn's fields; an omitted field is left alone."""

    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME)
    coords: str | None = Field(default=None, min_length=1, max_length=500)
    neighbourhood: str | None = Field(default=None, max_length=MAX_NEIGHBOURHOOD)
    blurb: str | None = Field(default=None, max_length=MAX_BLURB)
    tags: list[str] | None = Field(default=None, max_length=len(spots.TAGS) * 2)
    anchor: bool | None = None
    is_public: bool | None = None
    city: str | None = Field(default=None, max_length=CITY_BODY_MAX)


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
    # The verdict of the latest outing (greatest visited_on, then newest
    # created_at); null with no outings or when that one has none.
    last_verdict: OutingVerdict | None = None


class VisitIn(BaseModel):
    """A visit (an outing) to log. The date defaults to the owner's Denver
    day; with `precision` month or year it is moved to the period's start."""

    visited_on: date | None = None
    precision: OutingPrecision = OutingPrecision.DAY
    title: str | None = Field(default=None, max_length=MAX_OUTING_TITLE_RAW)
    verdict: OutingVerdict | None = None
    kid_along: bool | None = None

    @field_validator("precision", mode="before")
    @classmethod
    def _null_precision_is_day(cls, value):
        return OutingPrecision.DAY if value is None else value

    @field_validator("title")
    @classmethod
    def _clean_title(cls, value: str | None) -> str | None:
        """Whitespace of any kind (newline, tab) becomes one space, control
        and format characters (a NUL included) are dropped, the ends are
        trimmed. Blank means no title. ZWJ and ZWNJ stay (emoji sequences).
        The length is checked by `log_visit` on this cleaned value, so the
        form gets a plain sentence rather than a validation list."""
        if value is None:
            return None
        spaced = "".join(" " if ch.isspace() else ch for ch in value)
        kept = "".join(
            ch
            for ch in spaced
            if ch in "\u200c\u200d" or unicodedata.category(ch) not in ("Cc", "Cf")
        )
        return " ".join(kept.split()) or None

    note: str | None = Field(default=None, max_length=MAX_VISIT_NOTE)


class VisitOut(BaseModel):
    id: uuid.UUID
    spot_id: uuid.UUID
    visited_on: date
    note: str | None
    title: str | None
    verdict: OutingVerdict | None
    kid_along: bool | None
    precision: OutingPrecision


class OutingPlaceIn(BaseModel):
    """A place to save as a new private spot in the same save as its outing.
    The values are checked by the intake place validators, not here; the
    caps only keep a huge body from being read."""

    name: str = Field(max_length=MAX_NAME * 3)
    lat: float
    lng: float
    city: str | None = Field(default=None, max_length=CITY_BODY_MAX)
    source_id: str | None = Field(default=None, max_length=200)


class OutingIn(VisitIn):
    """An outing: the visit fields plus exactly one of a saved spot's id or a
    place to create (and reuse if it is already a spot)."""

    spot_id: uuid.UUID | None = None
    place: OutingPlaceIn | None = None

    @model_validator(mode="after")
    def _one_place(self):
        if (self.spot_id is None) == (self.place is None):
            raise ValueError("Send exactly one of spot_id or place")
        return self


class OutingOut(BaseModel):
    visit: VisitOut
    spot: SpotOut
    created: bool


def _clean(text: str | None) -> str | None:
    return (text or "").strip() or None


def _period_start(day: date, precision: OutingPrecision) -> date:
    if precision is OutingPrecision.MONTH:
        return day.replace(day=1)
    if precision is OutingPrecision.YEAR:
        return day.replace(month=1, day=1)
    return day


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


def build_visit(payload: VisitIn) -> Visit:
    """The one place a visit's title length, future date and row are decided,
    shared by the per-spot route and the outing route so they cannot drift.
    Adds nothing to a session and sets no `spot_id` (the caller does)."""
    if payload.title is not None and len(payload.title) > MAX_OUTING_TITLE:
        raise HTTPException(
            status_code=422,
            detail=f"A title is at most {MAX_OUTING_TITLE} characters",
        )
    today = datetime.now(OWNER_TZ).date()
    visited_on = _period_start(payload.visited_on or today, payload.precision)
    if visited_on > today + timedelta(days=1):
        raise HTTPException(status_code=422, detail="A visit cannot be in the future")
    return Visit(
        visited_on=visited_on,
        precision=payload.precision,
        title=payload.title,
        verdict=payload.verdict,
        kid_along=payload.kid_along,
        note=_clean(payload.note),
    )


def _visit_out(row: Visit) -> VisitOut:
    return VisitOut(
        id=row.id,
        spot_id=row.spot_id,
        visited_on=row.visited_on,
        note=row.note,
        title=row.title,
        verdict=row.verdict,
        kid_along=row.kid_along,
        precision=row.precision,
    )


def _city(raw: str | None) -> str:
    try:
        return spots.normalize_city(raw or "")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _check_public(city: str, is_public: bool) -> None:
    try:
        spots.check_public_city(city, is_public)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _out(
    row: Spot,
    last_visit: date | None,
    visit_count: int,
    last_verdict: OutingVerdict | None = None,
) -> SpotOut:
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
        last_verdict=last_verdict,
    )


async def slug_for(
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


async def build_spot(
    session: AsyncSession,
    *,
    name: str,
    lat: float,
    lng: float,
    neighbourhood: str | None = None,
    blurb: str | None = None,
    tags: list[str] | None = None,
    anchor: bool = False,
    is_public: bool = False,
    city: str | None = None,
    source: CandidateSource | None = None,
    source_id: str | None = None,
) -> Spot:
    """The one place a `Spot` is built and checked from fields, shared by
    the by-hand route and the intake place commit so they cannot drift. The
    name must be non-empty, the position finite and in range, the tags in the
    vocabulary, and the slug unique-able. Adds nothing to the session (the
    slug is read from it, so a caller writing several spots flushes between).
    Raises ValueError with a message fit to show."""
    name = name.strip()
    if not name:
        raise ValueError("A spot needs a name")
    if not (
        isinstance(lat, int | float)
        and isinstance(lng, int | float)
        and -90 <= lat <= 90
        and -180 <= lng <= 180
    ):
        raise ValueError("A spot needs a latitude and longitude in range")
    canonical = spots.canonical_tags(tags or [])
    slug = await slug_for(session, name)
    row = Spot(
        name=name,
        slug=slug,
        lat=lat,
        lng=lng,
        neighbourhood=_clean(neighbourhood),
        blurb=_clean(blurb),
        tags=canonical,
        anchor=anchor,
        is_public=is_public,
        source=source,
        source_id=source_id,
    )
    if city is not None:
        row.city = spots.normalize_city(city)
    spots.check_public_city(row.city or spots.DENVER, is_public)
    return row


async def commit_spot(session: AsyncSession) -> None:
    # Two writes racing for one slug: the unique index decides, and the
    # loser is told to try again rather than given a 500.
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="Another spot took that name; try again"
        ) from exc


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
    ) -> dict[uuid.UUID, tuple[date, int, OutingVerdict | None]]:
        """Per spot: the latest visit's date, the count and the latest
        outing's verdict. Two queries however many spots, never one per spot."""
        query = select(
            Visit.spot_id, func.max(Visit.visited_on), func.count(Visit.id)
        ).group_by(Visit.spot_id)
        latest = (
            select(Visit.spot_id, Visit.verdict)
            .distinct(Visit.spot_id)
            .order_by(
                Visit.spot_id,
                Visit.visited_on.desc(),
                Visit.created_at.desc(),
                Visit.id.desc(),
            )
        )
        if spot_ids is not None:
            query = query.where(Visit.spot_id.in_(spot_ids))
            latest = latest.where(Visit.spot_id.in_(spot_ids))
        verdicts = {
            spot_id: verdict for spot_id, verdict in await session.execute(latest)
        }
        rows = await session.execute(query)
        return {
            spot_id: (last, count, verdicts.get(spot_id))
            for spot_id, last, count in rows
        }

    async def _read(session: AsyncSession, row: Spot) -> SpotOut:
        last, count, verdict = (await _visit_summary(session, [row.id])).get(
            row.id, (None, 0, None)
        )
        return _out(row, last, count, verdict)

    @router.get("", response_model=list[SpotOut])
    async def list_spots(session: AsyncSession = Depends(get_session)) -> list[SpotOut]:
        """Every spot, anchors and private ones included, by name."""
        rows = (await session.scalars(select(Spot).order_by(Spot.name))).all()
        visits = await _visit_summary(session)
        return [_out(row, *visits.get(row.id, (None, 0, None))) for row in rows]

    @router.post("", response_model=SpotOut, status_code=201)
    async def create_spot(
        payload: SpotIn, session: AsyncSession = Depends(get_session)
    ) -> SpotOut:
        """Adds a spot by hand. Private unless `is_public` says otherwise."""
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="A spot needs a name")
        lat, lng = _parse_coords(payload.coords)
        city = None if "city" not in payload.model_fields_set else _city(payload.city)
        try:
            row = await build_spot(
                session,
                name=name,
                lat=lat,
                lng=lng,
                neighbourhood=payload.neighbourhood,
                blurb=payload.blurb,
                tags=payload.tags,
                anchor=payload.anchor,
                is_public=payload.is_public,
                city=city,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        session.add(row)
        await commit_spot(session)
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
                    row.slug = await slug_for(session, name, exclude=row.id)
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
        if "city" in fields:
            row.city = _city(payload.city)
        if "city" in fields or "is_public" in fields:
            _check_public(row.city, row.is_public)
        await commit_spot(session)
        await session.refresh(row)
        return await _read(session, row)

    # No body: a 204 answers nothing.
    @router.delete("/{spot_id}", status_code=204, response_model=None)
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
        """Logs an outing at a spot, on the owner's Denver day when no date is
        sent. The date is moved to the start of its period (precision month:
        the 1st; year: Jan 1) and that start must not be more than a day past
        the owner's Denver day, so the current month and year pass and the
        next are refused. The day's grace is for the owner logging from a time
        zone east of Denver."""
        await _spot(session, spot_id)
        row = build_visit(payload)
        row.spot_id = spot_id
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _visit_out(row)

    @router.post("/outings", response_model=OutingOut, status_code=201)
    async def log_outing(
        payload: OutingIn, session: AsyncSession = Depends(get_session)
    ) -> OutingOut:
        """Logs an outing at a saved spot, or at a place that is saved as a
        new private spot in the same transaction (`created` true). A place
        already owned (same OSM id, else same name nearby) takes the visit and
        creates nothing. The visit is checked before anything is added, and
        one commit ends it: any error leaves no spot and no visit."""
        # Lazy: intake.commit imports this module.
        from intake import place_kind
        from intake.commit import lock_place_commits

        visit = build_visit(payload)
        created = False
        if payload.place is None:
            spot = await _spot(session, payload.spot_id)
        else:
            place = payload.place
            try:
                name = place_kind.clean_name(place.name)
                lat, lng = place_kind.clean_position(place.lat, place.lng)
                source_id = place.source_id
                if source_id is not None:
                    place_kind.check_source_id(source_id)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            city = (
                _city(place.city) if "city" in place.model_fields_set else spots.DENVER
            )
            await lock_place_commits(session)
            owned = await place_kind.owned_spot_id(
                session, source_id=source_id, name=name, lat=lat, lng=lng
            )
            if owned:
                spot = await _spot(session, uuid.UUID(owned))
            else:
                try:
                    spot = await build_spot(
                        session,
                        name=name,
                        lat=lat,
                        lng=lng,
                        city=city,
                        source=CandidateSource.OSM if source_id else None,
                        source_id=source_id,
                    )
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail=str(exc)) from exc
                session.add(spot)
                try:
                    await session.flush()
                except IntegrityError as exc:
                    await session.rollback()
                    raise HTTPException(
                        status_code=409,
                        detail="Another spot took that name; try again",
                    ) from exc
                created = True
        visit.spot_id = spot.id
        session.add(visit)
        await commit_spot(session)
        await session.refresh(spot)
        await session.refresh(visit)
        return OutingOut(
            visit=_visit_out(visit), spot=await _read(session, spot), created=created
        )

    @router.get("/status", response_model=SpotsStatusOut)
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
