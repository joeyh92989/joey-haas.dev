"""The Closet's admin routes: garments, their photos, the profile, the jobs.

- **Upload is decoupled from tagging.** `POST /api/closet/garments/photos`
  takes several photos, makes each a 400px WebP (`closet_images.py`, one at
  a time so a decoded 12 MP HEIC never sits beside eleven others), and
  creates one `untagged` garment per photo. No model is called; the tag
  queue (`closet_tag.py`, the routes below) fills the details later.
- **A hand save is final.** PATCH sets `tag_source = manual`, which takes
  the garment out of the tag queue for good, and moves an `untagged`
  garment to `active` unless the save names another status.
- **Photos are served apart.** `GET /api/closet/garments/{id}/image` reads
  `garment_images` alone, with `Cache-Control: private, max-age=86400` and
  an ETag from the garment's `updated_at`, answering 304 to a matching
  `If-None-Match`. No list query loads the bytes.
- **The profile is one row** (`closet_profile`, `id = 1`). GET answers the
  defaults before it is first saved; PATCH validates every field it is
  given and writes the row. PATCH rather than PUT because the API's CORS
  policy (`main.py`) allows GET, POST, PATCH and DELETE only.
- **Tagging is a queue.** `untagged`, `tag_source IS NULL`, fewer than
  `closet_tag.MAX_ATTEMPTS` failed answers, with a photo, oldest first.
  `POST /api/closet/tag` (the page's button) tags one batch;
  `POST /api/closet/jobs/tag` (nightly) tags batches until the profile's
  `tag_budget` calls are spent, a model error, or the queue is empty, and
  writes `closet_settings["tag.last_run"]`. A write lands only while the
  garment is still untouched (`tag_source IS NULL`), so a hand save made
  during the model call wins. An answer that cannot be used for a batch of
  several strikes nobody: its photos are retried one at a time, and only a
  single photo's unusable answer counts a strike. A quota or overload error
  never does, since it says nothing about the photos; a missing model key
  fails the run without a call.

Admin only, at the router. The check is a router dependency, which FastAPI
solves after it has parsed a multipart body, so a signed-out upload is
still a 401 but its photos are read (and spooled) first; nothing is
decoded or written. Its own lock, shared with nothing: the tag job writes only
garment rows, and one tagging run at a time (a second is a 409).
Spec and plan: docs/planning/2026-11-09-outfit-design.md.
"""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    HTTPException,
    Response,
    UploadFile,
)
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import closet_tag
from closet_images import ClosetImageError, make_thumbnail, read_capped
from importer import ACCEPTED_MEDIA_TYPES
from items import require_admin
from llm import Image, LLMError, LLMProvider
from models import (
    ClosetProfile,
    ClosetSetting,
    Garment,
    GarmentCategory,
    GarmentImage,
    GarmentStatus,
    GarmentTagSource,
    Wear,
)
from public import OWNER_TZ
from recommendations_routes import _failure_note

logger = logging.getLogger(__name__)

# The run summaries the closet's jobs write into closet_settings; the admin
# page reads them through GET /api/closet/status. Unwritten is null.
STATUS_KEYS = ("tag.last_run", "plan.last_run", "opinion.last_run")

TAG_STATUS_KEY = "tag.last_run"
# _failure_note's catch-all: the one model error that may be the photos' fault.
GENERIC_FAILURE = "The model did not answer"

# A rack's worth from the phone, one request. Each is decoded and dropped
# before the next, so the cap bounds the request, not the memory.
MAX_UPLOAD_PHOTOS = 24

# The occasions a day can be; Today's chips (PR C) read the same list.
OCCASIONS = ("office", "wfh", "date", "weekend", "travel", "event")
DEFAULT_WEEK = ["office"] * 5 + ["weekend"] * 2
COLORING_KEYS = ("hair", "skin", "undertone")
MAX_WORDS = 12
MAX_WORD = 40
MAX_SIZE = 40
MAX_NOTES = 2000
MAX_BUILD_FIT = 500
TAG_BUDGET_MAX = 50
DEFAULT_TAG_BUDGET = 5  # the column's default (migration 0014)
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
TURN = re.compile(r"^\d{2}-\d{2}$")

# What a hand save may set. `untagged` is the upload's state, never chosen.
HAND_STATUSES = (
    GarmentStatus.ACTIVE,
    GarmentStatus.PACKED,
    GarmentStatus.LISTED,
    GarmentStatus.GONE,
)


class GarmentFields(BaseModel):
    """Every attribute a garment can carry; on PATCH an omitted field is
    left alone and a null clears it."""

    name: str | None = Field(default=None, max_length=120)
    category: GarmentCategory | None = None
    subtype: str | None = Field(default=None, max_length=60)
    brand: str | None = Field(default=None, max_length=80)
    primary_color: str | None = Field(default=None, max_length=40)
    primary_hex: str | None = Field(default=None, max_length=7)
    secondary_color: str | None = Field(default=None, max_length=40)
    secondary_hex: str | None = Field(default=None, max_length=7)
    pattern: str | None = Field(default=None, max_length=40)
    material: str | None = Field(default=None, max_length=60)
    warmth: int | None = Field(default=None, ge=1, le=5)
    formality: int | None = Field(default=None, ge=1, le=5)
    seasons: list[int] | None = Field(default=None, max_length=12)
    notes: str | None = Field(default=None, max_length=MAX_NOTES)
    acquired_on: date | None = None
    status: GarmentStatus | None = None
    back_on: date | None = None


TEXT_FIELDS = (
    "name",
    "subtype",
    "brand",
    "primary_color",
    "secondary_color",
    "pattern",
    "material",
    "notes",
)


class GarmentOut(BaseModel):
    id: uuid.UUID
    name: str | None
    category: GarmentCategory | None
    subtype: str | None
    brand: str | None
    primary_color: str | None
    primary_hex: str | None
    secondary_color: str | None
    secondary_hex: str | None
    pattern: str | None
    material: str | None
    warmth: int | None
    formality: int | None
    seasons: list[int]
    notes: str | None
    acquired_on: date | None
    status: GarmentStatus
    back_on: date | None
    tag_source: GarmentTagSource | None
    tag_attempts: int
    created_at: datetime
    updated_at: datetime
    # The photo's URL, versioned by updated_at so a changed garment is
    # fetched again; null for a garment without one.
    image: str | None
    wears_12mo: int
    last_worn: date | None


class ProfileFields(BaseModel):
    """The profile's fields; on PATCH an omitted field is left alone."""

    sizes: dict[str, str] | None = None
    coloring: dict[str, str] | None = None
    build_fit: str | None = Field(default=None, max_length=MAX_BUILD_FIT)
    style_words: list[str] | None = None
    dislikes: list[str] | None = None
    weekly_occasions: list[str] | None = None
    weekly_bike: list[bool] | None = None
    spring_turn: str | None = None
    autumn_turn: str | None = None
    repeat_top_days: int | None = None
    repeat_outfit_weeks: int | None = None
    tag_budget: int | None = None


def _clean(text: str | None) -> str | None:
    return (text or "").strip() or None


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=422, detail=detail)


def _hex(value: str | None, label: str) -> str | None:
    value = _clean(value)
    if value is None:
        return None
    if not HEX.match(value):
        raise _unprocessable(f"The {label} colour is a hex like #1f2a44")
    return value.lower()


def _seasons(values: list[int]) -> list[int]:
    if any(month < 1 or month > 12 for month in values):
        raise _unprocessable("Seasons are months, 1 to 12")
    return sorted(set(values))


def _month(value: date | None) -> date | None:
    """A bring-back date is a month: kept as its first day."""
    return None if value is None else value.replace(day=1)


def apply_garment_fields(row: Garment, fields: GarmentFields) -> None:
    """Writes the fields a request named onto the row, validated."""
    given = fields.model_fields_set
    for name in TEXT_FIELDS:
        if name in given:
            setattr(row, name, _clean(getattr(fields, name)))
    if "primary_hex" in given:
        row.primary_hex = _hex(fields.primary_hex, "primary")
    if "secondary_hex" in given:
        row.secondary_hex = _hex(fields.secondary_hex, "secondary")
    for name in ("category", "warmth", "formality", "acquired_on"):
        if name in given:
            setattr(row, name, getattr(fields, name))
    if "seasons" in given:
        row.seasons = _seasons(fields.seasons or [])
    if "back_on" in given:
        row.back_on = _month(fields.back_on)
    if "status" in given and fields.status is not None:
        if fields.status not in HAND_STATUSES:
            raise _unprocessable("A garment is untagged only until it is saved")
        row.status = fields.status
    elif row.status == GarmentStatus.UNTAGGED:
        row.status = GarmentStatus.ACTIVE
    if row.status != GarmentStatus.PACKED and "back_on" not in given:
        row.back_on = None


def _image_url(row: Garment, has_image: bool) -> str | None:
    if not has_image:
        return None
    return f"/api/closet/garments/{row.id}/image?v={_version(row)}"


def _version(row: Garment) -> int:
    """updated_at in microseconds: the image URL's version and its ETag."""
    return int(row.updated_at.timestamp() * 1_000_000)


def _etag(row: Garment) -> str:
    return f'"{row.id.hex}-{_version(row)}"'


def garment_out(
    row: Garment,
    *,
    has_image: bool,
    wears_12mo: int = 0,
    last_worn: date | None = None,
) -> GarmentOut:
    return GarmentOut(
        id=row.id,
        name=row.name,
        category=row.category,
        subtype=row.subtype,
        brand=row.brand,
        primary_color=row.primary_color,
        primary_hex=row.primary_hex,
        secondary_color=row.secondary_color,
        secondary_hex=row.secondary_hex,
        pattern=row.pattern,
        material=row.material,
        warmth=row.warmth,
        formality=row.formality,
        seasons=list(row.seasons or []),
        notes=row.notes,
        acquired_on=row.acquired_on,
        status=row.status,
        back_on=row.back_on,
        tag_source=row.tag_source,
        tag_attempts=row.tag_attempts,
        created_at=row.created_at,
        updated_at=row.updated_at,
        image=_image_url(row, has_image),
        wears_12mo=wears_12mo,
        last_worn=last_worn,
    )


# --- profile ---------------------------------------------------------------


def _words(values: list[str], label: str) -> list[str]:
    cleaned = []
    for value in values:
        word = _clean(value)
        if word is None:
            continue
        if len(word) > MAX_WORD:
            raise _unprocessable(f"{label} are at most {MAX_WORD} characters each")
        if word.lower() not in {w.lower() for w in cleaned}:
            cleaned.append(word)
    if len(cleaned) > MAX_WORDS:
        raise _unprocessable(f"Keep {label.lower()} to {MAX_WORDS} or fewer")
    return cleaned


def _keyed(values: dict[str, str], allowed: tuple[str, ...], label: str) -> dict:
    unknown = sorted(set(values) - set(allowed))
    if unknown:
        raise _unprocessable(
            f"{label} are kept for {', '.join(allowed)}; not {', '.join(unknown)}"
        )
    out = {}
    for key in allowed:
        value = _clean(values.get(key))
        if value is None:
            continue
        if len(value) > MAX_SIZE:
            raise _unprocessable(f"{label} are at most {MAX_SIZE} characters each")
        out[key] = value
    return out


def _turn(value: str, label: str) -> str:
    try:
        if not TURN.match(value):
            raise ValueError
        # A year with no 29 February: a turn date has to exist every year.
        date.fromisoformat(f"2025-{value}")
    except ValueError:
        raise _unprocessable(
            f"The {label} turn is a month and day, like 04-25"
        ) from None
    return value


def _bounded(value: int, low: int, high: int, label: str) -> int:
    if value < low or value > high:
        raise _unprocessable(f"{label} is between {low} and {high}")
    return value


def apply_profile_fields(row: ClosetProfile, fields: ProfileFields) -> None:
    given = fields.model_fields_set
    categories = tuple(category.value for category in GarmentCategory)
    if "sizes" in given:
        row.sizes = _keyed(fields.sizes or {}, categories, "Sizes")
    if "coloring" in given:
        row.coloring = _keyed(fields.coloring or {}, COLORING_KEYS, "Colouring words")
    if "build_fit" in given:
        row.build_fit = _clean(fields.build_fit)
    if "style_words" in given:
        row.style_words = _words(fields.style_words or [], "Style words")
    if "dislikes" in given:
        row.dislikes = _words(fields.dislikes or [], "Dislikes")
    if "weekly_occasions" in given:
        week = fields.weekly_occasions or []
        if len(week) != 7 or any(day not in OCCASIONS for day in week):
            raise _unprocessable(
                "The week is seven occasions, Monday first, each one of "
                + ", ".join(OCCASIONS)
            )
        row.weekly_occasions = list(week)
    if "weekly_bike" in given:
        bike = fields.weekly_bike or []
        if len(bike) != 7:
            raise _unprocessable("The bike week is seven days, Monday first")
        row.weekly_bike = list(bike)
    if "spring_turn" in given:
        row.spring_turn = _turn(fields.spring_turn or "", "spring")
    if "autumn_turn" in given:
        row.autumn_turn = _turn(fields.autumn_turn or "", "autumn")
    if "repeat_top_days" in given:
        row.repeat_top_days = _bounded(
            _required(fields.repeat_top_days), 1, 30, "Days before a top repeats"
        )
    if "repeat_outfit_weeks" in given:
        row.repeat_outfit_weeks = _bounded(
            _required(fields.repeat_outfit_weeks),
            1,
            12,
            "Weeks before an outfit repeats",
        )
    if "tag_budget" in given:
        row.tag_budget = _bounded(
            _required(fields.tag_budget), 0, TAG_BUDGET_MAX, "The tagging budget"
        )


def _required(value: int | None) -> int:
    if value is None:
        raise _unprocessable("A number is needed here")
    return value


def profile_out(row: ClosetProfile | None) -> dict[str, Any]:
    """The profile as the page reads it; the defaults before the first save,
    and the default week while none is stored."""
    row = row or ClosetProfile(
        id=1,
        sizes={},
        coloring={},
        style_words=[],
        dislikes=[],
        weekly_occasions=[],
        weekly_bike=[],
        spring_turn="04-25",
        autumn_turn="10-25",
        repeat_top_days=5,
        repeat_outfit_weeks=3,
        tag_budget=DEFAULT_TAG_BUDGET,
    )
    return {
        "sizes": dict(row.sizes or {}),
        "coloring": dict(row.coloring or {}),
        "build_fit": row.build_fit,
        "style_words": list(row.style_words or []),
        "dislikes": list(row.dislikes or []),
        "weekly_occasions": list(row.weekly_occasions or DEFAULT_WEEK),
        "weekly_bike": list(row.weekly_bike or [False] * 7),
        "spring_turn": row.spring_turn,
        "autumn_turn": row.autumn_turn,
        "repeat_top_days": row.repeat_top_days,
        "repeat_outfit_weeks": row.repeat_outfit_weeks,
        "tag_budget": row.tag_budget,
        "occasions": list(OCCASIONS),
    }


async def load_profile(session: AsyncSession) -> ClosetProfile | None:
    return await session.get(ClosetProfile, 1)


# --- the router ------------------------------------------------------------


def create_closet_router(
    factory: async_sessionmaker[AsyncSession],
    provider_factory: Callable[[], LLMProvider] | None = None,
    lock: asyncio.Lock | None = None,
) -> APIRouter:
    """`provider_factory` builds the model per tag run, so a missing key
    fails the tagging, never the boot."""
    run_lock = lock or asyncio.Lock()
    router = APIRouter(
        prefix="/api/closet",
        tags=["closet"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def _found(session: AsyncSession, garment_id: uuid.UUID) -> Garment:
        row = await session.get(Garment, garment_id)
        if row is None:
            raise HTTPException(status_code=404, detail="No such garment")
        return row

    async def _has_image(session: AsyncSession, garment_id: uuid.UUID) -> bool:
        found = await session.scalar(
            select(GarmentImage.garment_id).where(GarmentImage.garment_id == garment_id)
        )
        return found is not None

    async def _one_out(session: AsyncSession, row: Garment) -> GarmentOut:
        since = datetime.now(OWNER_TZ).date() - timedelta(days=365)
        count = await session.scalar(
            select(func.count(Wear.id)).where(
                Wear.garment_id == row.id, Wear.worn_on > since
            )
        )
        last = await session.scalar(
            select(func.max(Wear.worn_on)).where(Wear.garment_id == row.id)
        )
        return garment_out(
            row,
            has_image=await _has_image(session, row.id),
            wears_12mo=count or 0,
            last_worn=last,
        )

    @router.get("/garments")
    async def list_garments(
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Every garment, newest first, with its wears over twelve months and
        the counts the header and the area badge read."""
        since = datetime.now(OWNER_TZ).date() - timedelta(days=365)
        rows = (
            await session.scalars(
                select(Garment).order_by(Garment.created_at.desc(), Garment.id)
            )
        ).all()
        with_image = set((await session.scalars(select(GarmentImage.garment_id))).all())
        recent = dict(
            (
                await session.execute(
                    select(Wear.garment_id, func.count(Wear.id))
                    .where(Wear.worn_on > since)
                    .group_by(Wear.garment_id)
                )
            ).all()
        )
        last = dict(
            (
                await session.execute(
                    select(Wear.garment_id, func.max(Wear.worn_on)).group_by(
                        Wear.garment_id
                    )
                )
            ).all()
        )
        counts = {status.value: 0 for status in GarmentStatus}
        for row in rows:
            counts[row.status.value] += 1
        return {
            "garments": [
                garment_out(
                    row,
                    has_image=row.id in with_image,
                    wears_12mo=recent.get(row.id, 0),
                    last_worn=last.get(row.id),
                )
                for row in rows
            ],
            "counts": {"total": len(rows), **counts},
        }

    @router.get("/garments/{garment_id}")
    async def get_garment(
        garment_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> GarmentOut:
        return await _one_out(session, await _found(session, garment_id))

    @router.post("/garments", status_code=201)
    async def create_garment(
        fields: GarmentFields, session: AsyncSession = Depends(get_session)
    ) -> GarmentOut:
        """A garment added by hand, without a photo: manual from the start."""
        row = Garment(
            status=GarmentStatus.UNTAGGED,
            seasons=[],
            tag_attempts=0,
            tag_source=GarmentTagSource.MANUAL,
        )
        apply_garment_fields(row, fields)
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return garment_out(row, has_image=False)

    @router.patch("/garments/{garment_id}")
    async def patch_garment(
        garment_id: uuid.UUID,
        fields: GarmentFields,
        session: AsyncSession = Depends(get_session),
    ) -> GarmentOut:
        """A hand save: the fields given, and the garment is manual from now
        on, so the tag queue never takes it again."""
        row = await _found(session, garment_id)
        apply_garment_fields(row, fields)
        row.tag_source = GarmentTagSource.MANUAL
        await session.commit()
        await session.refresh(row)
        return await _one_out(session, row)

    @router.delete("/garments/{garment_id}", status_code=204)
    async def delete_garment(
        garment_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> Response:
        """Deletes the garment, its photo and its wears (the foreign keys
        cascade)."""
        row = await _found(session, garment_id)
        await session.delete(row)
        await session.commit()
        return Response(status_code=204)

    @router.post("/garments/photos", status_code=201)
    async def upload_photos(
        photos: list[UploadFile] = File(),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """One untagged garment per photo, its thumbnail stored at once.

        Every photo is checked and thumbnailed before anything is written,
        so a photo that cannot be read refuses the upload whole (and names
        itself) rather than leaving half a rack behind."""
        if not photos:
            raise _unprocessable("No photos were uploaded")
        if len(photos) > MAX_UPLOAD_PHOTOS:
            raise _unprocessable(f"Upload at most {MAX_UPLOAD_PHOTOS} photos at a time")
        for upload in photos:
            if upload.content_type not in ACCEPTED_MEDIA_TYPES:
                raise HTTPException(
                    status_code=415,
                    detail=(
                        f"{upload.filename or 'file'} is {upload.content_type}; "
                        "upload JPEG, PNG, WebP, or HEIC images"
                    ),
                )

        thumbnails = []
        for upload in photos:
            name = upload.filename or "A photo"
            try:
                data = read_capped(upload.file, upload.size)
            except ClosetImageError as error:
                too_large = "too large" in str(error)
                raise HTTPException(
                    status_code=413 if too_large else 422,
                    detail=f"{name}: {error}",
                ) from error
            try:
                # Off the event loop, still one photo at a time.
                thumbnails.append(await asyncio.to_thread(make_thumbnail, data))
            except ClosetImageError as error:
                too_large = "too large" in str(error)
                raise HTTPException(
                    status_code=413 if too_large else 422,
                    detail=f"{name}: {error}",
                ) from error
            finally:
                del data
                await upload.close()

        # Ascending created_at in upload order, so the queue tags a rack in
        # the order it was shot.
        start = datetime.now(UTC)
        rows = []
        for offset, thumbnail in enumerate(thumbnails):
            row = Garment(
                status=GarmentStatus.UNTAGGED,
                seasons=[],
                tag_attempts=0,
                created_at=start + timedelta(microseconds=offset),
            )
            session.add(row)
            await session.flush()
            session.add(
                GarmentImage(
                    garment_id=row.id,
                    webp=thumbnail.webp,
                    width=thumbnail.width,
                    height=thumbnail.height,
                )
            )
            rows.append(row)
        await session.commit()
        for row in rows:
            await session.refresh(row)
        logger.info("closet: %d photos added", len(rows))
        return {
            "added": len(rows),
            "garments": [garment_out(row, has_image=True) for row in rows],
        }

    @router.get("/garments/{garment_id}/image")
    async def garment_image(
        garment_id: uuid.UUID,
        if_none_match: str | None = Header(default=None),
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """The photo as WebP. Private (it is behind the session) and cached a
        day; the ETag follows the garment's updated_at."""
        row = await _found(session, garment_id)
        etag = _etag(row)
        headers = {"Cache-Control": "private, max-age=86400", "ETag": etag}
        if if_none_match is not None and etag in {
            tag.strip() for tag in if_none_match.split(",")
        }:
            return Response(status_code=304, headers=headers)
        image = await session.get(GarmentImage, garment_id)
        if image is None:
            raise HTTPException(status_code=404, detail="That garment has no photo")
        return Response(content=image.webp, media_type="image/webp", headers=headers)

    @router.get("/profile")
    async def get_profile(
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        return profile_out(await load_profile(session))

    @router.patch("/profile")
    async def patch_profile(
        fields: ProfileFields, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Saves the fields given; the row is created on the first save."""
        row = await load_profile(session)
        if row is None:
            row = ClosetProfile(id=1)
            session.add(row)
        apply_profile_fields(row, fields)
        await session.commit()
        await session.refresh(row)
        return profile_out(row)

    @router.get("/status")
    async def job_status(
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """The jobs' last run summaries, null for a job that has not run."""
        rows = await session.scalars(
            select(ClosetSetting).where(ClosetSetting.key.in_(STATUS_KEYS))
        )
        found = {row.key: row.value for row in rows}
        return {key: found.get(key) for key in STATUS_KEYS}

    # --- tagging ------------------------------------------------------------

    def _queued():
        return (
            select(Garment.id)
            .join(GarmentImage, GarmentImage.garment_id == Garment.id)
            .where(
                Garment.status == GarmentStatus.UNTAGGED,
                Garment.tag_source.is_(None),
                Garment.tag_attempts < closet_tag.MAX_ATTEMPTS,
            )
        )

    async def _remaining(session: AsyncSession) -> int:
        count = await session.scalar(
            select(func.count()).select_from(_queued().subquery())
        )
        return count or 0

    async def _strike(session: AsyncSession, ids: list[uuid.UUID]) -> None:
        await session.execute(
            update(Garment)
            .where(Garment.id.in_(ids), Garment.tag_source.is_(None))
            .values(tag_attempts=Garment.tag_attempts + 1)
        )
        await session.commit()

    async def tag_batch(
        session: AsyncSession, only: list[uuid.UUID] | None = None
    ) -> dict[str, Any]:
        """One model call over the oldest queued garments (or over `only`,
        the ones still queued), or none when there is nothing to tag. Never
        raises: the answer says what happened.

        `called` is whether a model call was spent, `stop` whether the run
        should go no further (no model, or a model error), and `retry` the
        ids of a rejected batch of more than one, to be tried one at a time.

        **Strikes apply only to a single-photo call.** When a batch of
        several is rejected (an answer that does not match the photos, an
        unreadable one, or the model's unexplained error) nobody knows which
        photo is at fault, so none is struck: the ids come back in `retry`
        and the run (`_run`) sends each alone, one call apiece against the
        same budget. A single photo that fails the same way takes a strike.
        A quota or overload error never strikes, since it says nothing about
        the photos."""
        query = (
            select(Garment.id, GarmentImage.webp)
            .join(GarmentImage, GarmentImage.garment_id == Garment.id)
            .where(Garment.id.in_(_queued()))
        )
        if only is not None:
            query = query.where(Garment.id.in_(only))
        rows = (
            await session.execute(
                query.order_by(Garment.created_at, Garment.id).limit(
                    closet_tag.BATCH_SIZE
                )
            )
        ).all()
        # Done reading: no connection is held through the model call.
        await session.commit()
        idle = {"tagged": 0, "called": False, "stop": False, "note": None, "retry": []}
        if not rows:
            return idle
        if provider_factory is None:
            return {**idle, "stop": True, "note": "No model is configured"}
        # Built before any call, apart from the call's own errors: a missing
        # key is the service's configuration, never the photos' fault.
        try:
            provider = provider_factory()
        except LLMError as error:
            logger.warning("closet tag has no model: %s", error)
            return {**idle, "stop": True, "note": f"No model is configured: {error}"}

        ids = [row.id for row in rows]
        images = [Image("image/webp", row.webp) for row in rows]
        del rows
        single = len(ids) == 1

        async def rejected(note: str, stop: bool = False) -> dict[str, Any]:
            if single:
                await _strike(session, ids)
                return {**idle, "called": True, "stop": stop, "note": note}
            return {
                **idle,
                "called": True,
                "note": f"{note}; trying them one at a time",
                "retry": ids,
            }

        try:
            payload = await provider.complete_json(
                closet_tag.build_prompt(len(ids)),
                closet_tag.TAG_SCHEMA,
                images=images,
            )
            tagged = closet_tag.validate(payload, len(ids))
        except LLMError as error:
            logger.warning("closet tag model call failed: %s", error)
            note = _failure_note(str(error))
            # A quota or overload says nothing about the photos; only the
            # catch-all might be a photo the model refuses.
            if note == GENERIC_FAILURE:
                return await rejected(note, stop=True)
            return {**idle, "called": True, "stop": True, "note": note}
        except closet_tag.TagBatchError as error:
            logger.warning("closet tag answer rejected: %s", error)
            return await rejected(
                "The model’s answer didn’t match the photos; they stay queued"
            )
        except Exception as error:  # an unreadable answer must not stop the run
            logger.exception("closet tag model call failed unexpectedly")
            return await rejected(
                f"The model’s answer couldn’t be read ({type(error).__name__})"
            )

        written = 0
        for garment_id, entry in zip(ids, tagged, strict=True):
            values = dict(entry.attributes)
            values["category"] = GarmentCategory(values["category"])
            result = await session.execute(
                update(Garment)
                .where(
                    Garment.id == garment_id,
                    Garment.tag_source.is_(None),
                    Garment.status == GarmentStatus.UNTAGGED,
                )
                .values(
                    **values,
                    tag_source=GarmentTagSource.MODEL,
                    status=GarmentStatus.ACTIVE,
                    updated_at=func.now(),
                )
            )
            written += result.rowcount or 0
        await session.commit()
        return {**idle, "tagged": written, "called": True}

    async def _run(
        session: AsyncSession, budget: int, batches: int | None = None
    ) -> dict[str, Any]:
        """Batches until `budget` calls are spent, a model error stops it,
        the queue is empty, or `batches` queue batches have been taken. A
        rejected batch's singles are tried before the next batch, each one a
        call against the same budget. `state` is the job's word for it."""
        tagged = calls = taken = 0
        note = None
        state = "off" if budget == 0 else "ok"
        pending: list[uuid.UUID] = []
        while calls < budget:
            if pending:
                result = await tag_batch(session, only=[pending.pop(0)])
            elif batches is not None and taken >= batches:
                break
            else:
                result = await tag_batch(session)
                taken += 1
            tagged += result["tagged"]
            calls += int(result["called"])
            note = result["note"] or note
            pending.extend(result["retry"])
            if result["stop"]:
                # No model at all is a failed night; a quota or overload
                # after a call is a run cut short, worded by its note.
                state = "stopped" if result["called"] else "failed"
                break
            if not result["called"] and not pending:
                break
        if state == "ok" and calls == 0:
            state = "empty"
        return {"state": state, "tagged": tagged, "calls": calls, "note": note}

    async def _write_tag_status(session: AsyncSession, summary: dict[str, Any]) -> None:
        await session.execute(
            insert(ClosetSetting)
            .values(key=TAG_STATUS_KEY, value=summary)
            .on_conflict_do_update(
                index_elements=[ClosetSetting.key],
                set_={"value": summary, "updated_at": func.now()},
            )
        )
        await session.commit()

    @router.post("/tag")
    async def tag_now(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The page's Tag now: one batch, whatever the nightly budget says."""
        if run_lock.locked():
            raise HTTPException(status_code=409, detail="Tagging is already running")
        async with run_lock:
            # One batch, and its photos one at a time if it is rejected.
            result = await _run(session, 1 + closet_tag.BATCH_SIZE, batches=1)
            return {
                "tagged": result["tagged"],
                "calls": result["calls"],
                "note": result["note"],
                "remaining": await _remaining(session),
            }

    @router.post("/jobs/tag")
    async def tag_job(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The nightly step: batches until the profile's budget of calls is
        spent, a model error stops it, or the queue is empty. Writes its
        summary to `tag.last_run` whatever happened."""
        if run_lock.locked():
            raise HTTPException(status_code=409, detail="Tagging is already running")
        async with run_lock:
            profile = await load_profile(session)
            budget = profile.tag_budget if profile is not None else DEFAULT_TAG_BUDGET
            at = datetime.now(UTC).isoformat()
            result = await _run(session, budget)
            remaining = await _remaining(session)
            state = result["state"]
            summary = {
                "at": at,
                "state": state,
                "ok": state not in ("failed", "stopped"),
                "tagged": result["tagged"],
                "calls": result["calls"],
                "remaining": remaining,
                "note": result["note"],
            }
            await _write_tag_status(session, summary)
            logger.info("closet tag: %s", summary)
            return summary

    return router
