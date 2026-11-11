"""Intake's admin routes, under /api/intake (spec D2, D11).

A sitting is a server-side draft: every photo, entry and step lives in
Postgres, so the phone that shot the shelf and the laptop that checks it
see the same thing (AC 3). Nothing here reaches the collection; committing
does (`intake/commit.py`).
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import intake.garment_kind  # noqa: F401  (registers the closet's kind)
import intake.shelf_kinds  # noqa: F401  (registers the shelf's kinds)
from closet_images import make_reading_copy, make_thumbnail
from closet_routes import add_garment_photo, check_media_type, convert_upload
from config import Config
from intake.budget import budget_state
from intake.commit import (
    NOTHING_TO_ADD,
    SITTING_GONE,
    NothingToAdd,
    SittingGone,
    commit_sitting,
)
from intake.kinds import REGISTRY, describe
from intake.nightly import LAST_RUN_KEY, run_nightly
from intake.reader import read_next
from items import _enrich, require_admin
from llm import LLMError, LLMProvider
from models import (
    IntakeArea,
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
    IntakePhotoState,
    IntakeSetting,
    IntakeSitting,
)

PHOTO_LIMIT = 200
PHOTO_LIMIT_DETAIL = (
    f"This sitting already holds {PHOTO_LIMIT} photos; commit it or start another"
)


class SittingCreate(BaseModel):
    """A new sitting: its area, and optionally one kind for the whole shelf."""

    area: IntakeArea
    kind: str | None = Field(default=None, max_length=40)
    label: str | None = Field(default=None, max_length=120)


class SittingPatch(BaseModel):
    """The page's step and the sitting's label; last write wins."""

    step: str | None = Field(default=None, max_length=20)
    label: str | None = Field(default=None, max_length=120)


class EntryCreate(BaseModel):
    """A typed entry, or one chosen from search."""

    kind: str = Field(max_length=40)
    payload: dict[str, Any] = Field(default_factory=dict)


class CommitIn(BaseModel):
    """The owner's local day, for the playthroughs a commit seeds (as the
    status route takes it); the server's day when left out."""

    today: date | None = None


class EntryPatch(BaseModel):
    """A partial edit of an entry; fields left out are kept."""

    payload: dict[str, Any] | None = None
    state: IntakeEntryState | None = None
    chosen: dict[str, Any] | None = None


def photo_json(photo: IntakePhoto) -> dict[str, Any]:
    """The page's view of a photo. The image is its own route."""
    return {
        "id": str(photo.id),
        "state": photo.state.value,
        "filename": photo.filename,
        "error": photo.error,
    }


def entry_json(entry: IntakeEntry) -> dict[str, Any]:
    """The page's view of an entry."""
    return {
        "id": str(entry.id),
        "photo_id": str(entry.photo_id) if entry.photo_id else None,
        "kind": entry.kind,
        "state": entry.state.value,
        "payload": entry.payload,
        "candidates": entry.candidates,
        "chosen": entry.chosen,
        "garment_id": str(entry.garment_id) if entry.garment_id else None,
    }


def _check_kind(area: IntakeArea, kind: str | None) -> None:
    if kind is None:
        return
    registered = REGISTRY.get(kind)
    if registered is None or registered.area is not area:
        raise HTTPException(422, f"{kind} is not a {area.value} kind")


def create_intake_router(
    session_factory: async_sessionmaker[AsyncSession],
    registry: dict,
    *,
    config: Config,
    provider_factory: Callable[[], LLMProvider] | None = None,
) -> APIRouter:
    """The intake router. Every route is admin only. `provider_factory`
    builds the model per read, so a missing key fails the read, never the
    boot."""
    router = APIRouter(
        prefix="/api/intake",
        tags=["intake"],
        dependencies=[Depends(require_admin)],
    )
    # One nightly run at a time; a second is a 409, as the closet's jobs are.
    nightly_lock = asyncio.Lock()

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async def _sitting_or_404(session: AsyncSession, sitting_id: uuid.UUID):
        sitting = await session.get(IntakeSitting, sitting_id)
        if sitting is None:
            raise HTTPException(404, "No such sitting")
        return sitting

    async def _sitting_json(session: AsyncSession, sitting: IntakeSitting) -> dict:
        photos = (
            await session.scalars(
                select(IntakePhoto)
                .where(IntakePhoto.sitting_id == sitting.id)
                .order_by(IntakePhoto.created_at, IntakePhoto.id)
            )
        ).all()
        entries = (
            await session.scalars(
                select(IntakeEntry)
                .where(IntakeEntry.sitting_id == sitting.id)
                .order_by(IntakeEntry.created_at, IntakeEntry.id)
            )
        ).all()
        return {
            "id": str(sitting.id),
            "area": sitting.area.value,
            "kind": sitting.kind,
            "label": sitting.label,
            "step": sitting.step,
            "photos": [photo_json(photo) for photo in photos],
            "entries": [entry_json(entry) for entry in entries],
        }

    @router.get("/kinds")
    async def list_kinds() -> list[dict[str, Any]]:
        """Every registered kind, with its fields and source state."""
        return [describe(kind, registry) for kind in REGISTRY.values()]

    @router.post("/sittings", status_code=201)
    async def create_sitting(
        body: SittingCreate, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Start a sitting. A kind must belong to the area; none is a mixed shelf."""
        _check_kind(body.area, body.kind)
        sitting = IntakeSitting(area=body.area, kind=body.kind, label=body.label)
        session.add(sitting)
        await session.commit()
        return await _sitting_json(session, sitting)

    @router.get("/sittings")
    async def list_sittings(
        area: IntakeArea, session: AsyncSession = Depends(get_session)
    ) -> list[dict[str, Any]]:
        """The area's open sittings, newest first, with a photo count each."""
        photo_count = (
            select(func.count())
            .where(IntakePhoto.sitting_id == IntakeSitting.id)
            .scalar_subquery()
        )
        rows = (
            await session.execute(
                select(IntakeSitting, photo_count)
                .where(IntakeSitting.area == area)
                .order_by(IntakeSitting.updated_at.desc(), IntakeSitting.id)
            )
        ).all()
        return [
            {
                "id": str(sitting.id),
                "area": sitting.area.value,
                "kind": sitting.kind,
                "label": sitting.label,
                "step": sitting.step,
                "photos": count,
                "updated_at": sitting.updated_at,
            }
            for sitting, count in rows
        ]

    @router.get("/sittings/{sitting_id}")
    async def get_sitting(
        sitting_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """One sitting with its photos and entries."""
        return await _sitting_json(session, await _sitting_or_404(session, sitting_id))

    @router.patch("/sittings/{sitting_id}")
    async def patch_sitting(
        sitting_id: uuid.UUID,
        body: SittingPatch,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Move the sitting's step or rename it."""
        sitting = await _sitting_or_404(session, sitting_id)
        for field in body.model_fields_set:
            setattr(sitting, field, getattr(body, field))
        await session.commit()
        return await _sitting_json(session, sitting)

    @router.delete("/sittings/{sitting_id}", status_code=204)
    async def delete_sitting(
        sitting_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> Response:
        """Discard a sitting. Garments its photos made stay in the tag queue."""
        sitting = await _sitting_or_404(session, sitting_id)
        await session.delete(sitting)
        await session.commit()
        return Response(status_code=204)

    @router.post("/sittings/{sitting_id}/photos", status_code=201)
    async def upload_photo(
        sitting_id: uuid.UUID,
        photo: UploadFile = File(...),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Add one photo. A shelf photo waits to be read; a closet photo
        becomes an untagged garment at once, as the closet's own intake does."""
        sitting = await _sitting_or_404(session, sitting_id)
        held = await session.scalar(
            select(func.count()).where(IntakePhoto.sitting_id == sitting.id)
        )
        if held >= PHOTO_LIMIT:
            await photo.close()
            raise HTTPException(409, PHOTO_LIMIT_DETAIL)
        check_media_type(photo)
        filename = (photo.filename or "")[:255] or None
        if sitting.area is IntakeArea.SHELF:
            reading, thumb = await convert_upload(
                photo, make_reading_copy, make_thumbnail
            )
            row = IntakePhoto(
                sitting_id=sitting.id,
                filename=filename,
                reading_jpeg=reading,
                thumb_webp=thumb.webp,
                width=thumb.width,
                height=thumb.height,
            )
            session.add(row)
        else:
            (thumb,) = await convert_upload(photo, make_thumbnail)
            garment = await add_garment_photo(session, thumb, datetime.now(UTC))
            row = IntakePhoto(
                sitting_id=sitting.id,
                state=IntakePhotoState.READ,
                filename=filename,
                thumb_webp=thumb.webp,
                width=thumb.width,
                height=thumb.height,
            )
            session.add(row)
            await session.flush()
            session.add(
                IntakeEntry(
                    sitting_id=sitting.id,
                    photo_id=row.id,
                    kind="garment",
                    state=IntakeEntryState.READY,
                    garment_id=garment.id,
                )
            )
        await session.commit()
        return photo_json(row)

    @router.post("/sittings/{sitting_id}/read-next")
    async def read_next_photo(
        sitting_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Read the sitting's oldest waiting photo. `status` is `read`,
        `empty`, `failed`, `waiting` (today's budget is spent) or `idle`
        (nothing waiting)."""
        await _sitting_or_404(session, sitting_id)
        state = await budget_state(session, config)
        budget = state["remaining"] if state["enforced"] else 1
        if provider_factory is None:
            raise HTTPException(502, "No model is configured")
        try:
            provider = provider_factory()
        except LLMError as error:
            raise HTTPException(502, f"No model is configured: {error}") from error
        outcome = await read_next(
            session, sitting_id, provider, budget, registry=registry
        )
        return {
            "status": outcome.status,
            "photo": photo_json(outcome.photo) if outcome.photo else None,
            "entries": [entry_json(entry) for entry in outcome.entries],
        }

    @router.post("/sittings/{sitting_id}/entries", status_code=201)
    async def add_entry(
        sitting_id: uuid.UUID,
        body: EntryCreate,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Add a typed entry, or one chosen from search."""
        sitting = await _sitting_or_404(session, sitting_id)
        _check_kind(sitting.area, body.kind)
        entry = IntakeEntry(
            sitting_id=sitting.id,
            kind=body.kind,
            state=IntakeEntryState.TYPED,
            payload=body.payload,
        )
        session.add(entry)
        await session.commit()
        return entry_json(entry)

    @router.post("/sittings/{sitting_id}/commit")
    async def commit(
        sitting_id: uuid.UUID,
        body: CommitIn | None = None,
        session: AsyncSession = Depends(get_session),
    ) -> Any:
        """Add the sitting's entries to the collection, all or nothing
        (`intake/commit.py`). A refused row answers 422 with the same shape,
        `refused` naming each entry, and writes nothing. A sitting already
        committed or discarded, as from a second device, is a 409."""
        today = body.today if body and body.today else date.today()
        try:
            outcome = await commit_sitting(session, sitting_id, today=today)
        except SittingGone:
            raise HTTPException(409, SITTING_GONE) from None
        except NothingToAdd:
            raise HTTPException(409, NOTHING_TO_ADD) from None
        if outcome.refused:
            await session.rollback()
            count = len(outcome.refused)
            return JSONResponse(
                status_code=422,
                content={
                    **outcome.as_json(),
                    "added": 0,
                    "already_owned": 0,
                    "skipped_kept": 0,
                    "photos_empty": 0,
                    "detail": f"{count} to fix before anything is added",
                },
            )
        await session.commit()
        # As /bulk does: covers, creators and snapshots after the commit,
        # best effort, so a slow or failing source never undoes the add.
        await _enrich(session, registry, outcome.created)
        return outcome.as_json()

    @router.patch("/entries/{entry_id}")
    async def patch_entry(
        entry_id: uuid.UUID,
        body: EntryPatch,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Edit an entry in place. Fields left out are kept; last write wins."""
        entry = await session.get(IntakeEntry, entry_id)
        if entry is None:
            raise HTTPException(404, "No such entry")
        for field in body.model_fields_set:
            value = getattr(body, field)
            if field == "state" and value is None:
                continue
            setattr(entry, field, value)
        await session.commit()
        return entry_json(entry)

    @router.post("/photos/{photo_id}/retry")
    async def retry_photo(
        photo_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Put a failed photo back in the reading queue."""
        photo = await session.get(IntakePhoto, photo_id)
        if photo is None:
            raise HTTPException(404, "No such photo")
        if photo.state is not IntakePhotoState.FAILED:
            raise HTTPException(409, "Only a photo that failed to read can be retried")
        photo.state = IntakePhotoState.UPLOADED
        photo.error = None
        await session.commit()
        return photo_json(photo)

    @router.get("/photos/{photo_id}/image")
    async def photo_image(
        photo_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> Response:
        """The photo's thumbnail."""
        photo = await session.get(IntakePhoto, photo_id)
        if photo is None:
            raise HTTPException(404, "No such photo")
        return Response(
            photo.thumb_webp,
            media_type="image/webp",
            headers={"Cache-Control": "private, max-age=86400"},
        )

    @router.get("/counts")
    async def counts(session: AsyncSession = Depends(get_session)) -> dict[str, int]:
        """Entries left to check, per area (the rail's badges)."""
        rows = (
            await session.execute(
                select(IntakeSitting.area, func.count())
                .join(IntakeEntry, IntakeEntry.sitting_id == IntakeSitting.id)
                .where(IntakeEntry.state == IntakeEntryState.CHECK)
                .group_by(IntakeSitting.area)
            )
        ).all()
        found = {area.value: count for area, count in rows}
        return {area.value: found.get(area.value, 0) for area in IntakeArea}

    @router.get("/budget")
    async def budget(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """What is left of today's free reads, and when it resets."""
        return await budget_state(session, config)

    @router.post("/jobs/nightly")
    async def nightly(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The nightly step (job token): expire sittings untouched for 30
        days, then read waiting shelf photos while the budget lasts. Its
        summary is stored as `nightly.last_run` whatever happened."""
        if nightly_lock.locked():
            raise HTTPException(409, "The intake nightly is already running")
        async with nightly_lock:
            return await run_nightly(session, config, provider_factory, registry)

    @router.get("/status")
    async def status(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The nightly's last run summary, null before its first run."""
        row = await session.get(IntakeSetting, LAST_RUN_KEY)
        return {LAST_RUN_KEY: row.value if row is not None else None}

    return router
