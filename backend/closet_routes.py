"""The Closet's admin routes: garments, their photos, the profile, the jobs.

- **Upload is decoupled from tagging.** `POST /api/closet/garments/photos`
  takes several photos, makes each a 400px WebP (`closet_images.py`, one at
  a time so a decoded 12 MP HEIC never sits beside eleven others), and
  creates one `untagged` garment per photo. No model is called; the tag
  queue (`closet_tag.py`, the routes below) fills the details later.
- **A hand save is final for every field it set.** PATCH sets
  `tag_source = manual`, which takes the garment out of the first-time tag
  queue for good, and moves an `untagged` garment to `active` unless the save
  names another status. Only the fill queue (below) may later write its empty
  warmth or formality, never a field already set.
- **Photos are served apart.** `GET /api/closet/garments/{id}/image` reads
  `garment_images` alone, with `Cache-Control: private, max-age=86400` and
  an ETag from the garment's `updated_at`, answering 304 to a matching
  `If-None-Match`. No list query loads the bytes.
- **A photo can be added later.** `POST /garments/{id}/photo` adds or
  replaces one garment's photo (800px) and moves `updated_at`, so the image
  URL changes; nothing else about the garment moves. `POST` and `PATCH`
  `/garments/{id}/product` attach a store product from a pasted link
  (`closet_product.py`; `intake/README.md`).
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
- **A formality re-tag follows the first-time queue** (#548), in the nightly
  job only (Tag now never takes it). Once nothing is untagged, the same
  call and budget re-tag `tag_source = model` pieces
  whose `tag_scale` is below `closet_tag.SCALE_VERSION` (`active` or
  `packed`, with a photo, oldest first). A batch is all first-time or all
  re-tag. A re-tag writes `formality`, `graphic` (only when the answer is a
  real boolean) and `tag_scale` only, guarded by
  `tag_source = model AND tag_scale < SCALE_VERSION`, so a hand save wins and
  `updated_at` (the photo's ETag) does not move. A formality the model gave
  unusably leaves the old value and still marks the piece as done. Strikes
  count the same way. `tag.last_run` adds `retagged` and `retag_remaining`.
- **A fill queue sits between them** (#549), in the nightly job only. Once
  nothing is untagged, `tag_source = manual` pieces (`active` or `packed`,
  with a photo, strikes left) missing warmth or formality, or a `top` whose
  `graphic` is NULL (#550), are asked for just those fields. The write is
  `COALESCE(existing, new)` per field, guarded by `tag_source = manual AND`
  the same blank test, so a field set by hand wins; `tag_source`, status,
  colours, name and `updated_at` never move, and `tag_scale` is set only
  when the formality was written. A piece still blank after a fill takes a
  strike. Order: first-time, fill, re-tag;
  `tag.last_run` adds `filled` and `fill_remaining`.

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
from typing import Any, Literal

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
from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import closet_product
import closet_resolver
import closet_tag
from closet_images import (
    ClosetImageError,
    make_garment_image,
    read_capped,
    resize_webp,
)
from closet_schemas import (
    GarmentListOut,
    GarmentOut,
    JobStatusOut,
    ProductAttachOut,
    ProductPreviewOut,
    ProfileOut,
    TagJobOut,
    TagNowOut,
    UploadOut,
)
from importer import ACCEPTED_MEDIA_TYPES
from items import require_admin
from llm import Image, LLMError, LLMProvider
from models import (
    ClosetProfile,
    ClosetSetting,
    Garment,
    GarmentCategory,
    GarmentColorSource,
    GarmentFeedback,
    GarmentFeedbackKind,
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
STATUS_KEYS = ("tag.last_run", "plan.last_run", "opinion.last_run", "weather.last_run")

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
    # True or false is the owner's word and stays; null is "not known".
    graphic: bool | None = None
    seasons: list[int] | None = Field(default=None, max_length=12)
    notes: str | None = Field(default=None, max_length=MAX_NOTES)
    acquired_on: date | None = None
    # The purchase date: another name for acquired_on, the column it writes.
    purchased_on: date | None = None
    # The store's colour wording, verbatim; set by hand it is `manual`.
    color_name: str | None = Field(default=None, max_length=80)
    size: str | None = Field(default=None, max_length=40)
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
    "size",
    "notes",
)


class ProductLink(BaseModel):
    """The pasted product link (`POST /garments/{id}/product`)."""

    url: str = Field(min_length=1, max_length=closet_resolver.MAX_URL_CHARS)


class ProductChoice(ProductLink):
    """The owner's pick from what the link offered. Only ids: the colour,
    its price and its photo are read again from the store, never taken from
    here."""

    external_id: str = Field(min_length=1, max_length=200)
    size: str | None = Field(default=None, max_length=40)
    replace_brand: bool = False
    replace_color: bool = False
    replace_size: bool = False
    replace_product: bool = False


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


def check_media_type(upload: UploadFile) -> None:
    """Refuse (415) a file that is not an image the photo pipeline reads."""
    if upload.content_type not in ACCEPTED_MEDIA_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"{upload.filename or 'file'} is {upload.content_type}; "
                "upload JPEG, PNG, WebP, or HEIC images"
            ),
        )


def photo_refusal(name: str, error: ClosetImageError) -> HTTPException:
    """413 for a photo over the size cap, 422 for one that cannot be read."""
    too_large = "too large" in str(error)
    return HTTPException(
        status_code=413 if too_large else 422, detail=f"{name}: {error}"
    )


async def convert_upload(upload: UploadFile, *converters: Any) -> list[Any]:
    """Read one upload under the size cap and run each converter on its bytes.

    Converters run off the event loop, one after another, so a decoded
    12 MP photo is held once. A failure names the file; the upload is
    closed either way."""
    name = upload.filename or "A photo"
    try:
        data = read_capped(upload.file, upload.size)
        return [await asyncio.to_thread(convert, data) for convert in converters]
    except ClosetImageError as error:
        raise photo_refusal(name, error) from error
    finally:
        await upload.close()


async def add_garment_photo(
    session: AsyncSession, thumbnail: Any, created_at: datetime
) -> Garment:
    """An untagged garment and its stored thumbnail (flushed, not committed)."""
    row = Garment(
        status=GarmentStatus.UNTAGGED,
        seasons=[],
        tag_attempts=0,
        created_at=created_at,
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
    return row


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
    for name in ("category", "warmth", "formality", "graphic", "acquired_on"):
        if name in given:
            setattr(row, name, getattr(fields, name))
    if "purchased_on" in given:
        row.acquired_on = fields.purchased_on
    if "color_name" in given:
        typed = _clean(fields.color_name)
        # The edit form sends the colour back on every save: only a colour
        # that changed is the owner's own wording.
        if typed != _clean(row.color_name):
            row.color_name = typed
            row.color_source = GarmentColorSource.MANUAL if typed is not None else None
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
        color_name=row.color_name,
        color_source=row.color_source,
        size=row.size,
        pattern=row.pattern,
        material=row.material,
        warmth=row.warmth,
        formality=row.formality,
        graphic=row.graphic,
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

    async def _conflict(session: AsyncSession, garment_id: uuid.UUID) -> HTTPException:
        """What a failed write means: the garment is gone (404) or another
        write got there first (409)."""
        if await session.get(Garment, garment_id) is None:
            return HTTPException(status_code=404, detail="No such garment")
        return HTTPException(
            status_code=409, detail="That garment changed meanwhile; try again"
        )

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

    @router.get("/garments", response_model=GarmentListOut)
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
        owner_day = datetime.now(OWNER_TZ).date()
        flagged = (
            await session.execute(
                select(
                    GarmentFeedback.garment_id,
                    func.count(GarmentFeedback.id).filter(
                        GarmentFeedback.kind == GarmentFeedbackKind.TOO_COLD
                    ),
                    func.count(GarmentFeedback.id).filter(
                        GarmentFeedback.kind == GarmentFeedbackKind.TOO_WARM
                    ),
                    func.max(GarmentFeedback.day),
                )
                .join(Garment, Garment.id == GarmentFeedback.garment_id)
                .where(
                    Garment.status == GarmentStatus.ACTIVE,
                    GarmentFeedback.kind.in_(
                        [GarmentFeedbackKind.TOO_COLD, GarmentFeedbackKind.TOO_WARM]
                    ),
                    GarmentFeedback.day > owner_day - timedelta(days=60),
                    GarmentFeedback.day <= owner_day,
                )
                .group_by(GarmentFeedback.garment_id)
                .order_by(func.max(GarmentFeedback.day).desc())
            )
        ).all()
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
            "temperature_flags": [
                {
                    "garment_id": garment_id,
                    "too_cold": cold,
                    "too_warm": warm,
                    "last_day": last_day,
                }
                for garment_id, cold, warm, last_day in flagged
            ],
        }

    @router.get("/garments/{garment_id}", response_model=GarmentOut)
    async def get_garment(
        garment_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> GarmentOut:
        return await _one_out(session, await _found(session, garment_id))

    @router.post("/garments", status_code=201, response_model=GarmentOut)
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

    @router.patch("/garments/{garment_id}", response_model=GarmentOut)
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

    # 204: no body, so no model.
    @router.delete("/garments/{garment_id}", status_code=204, response_model=None)
    async def delete_garment(
        garment_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> Response:
        """Deletes the garment, its photo and its wears (the foreign keys
        cascade)."""
        row = await _found(session, garment_id)
        await session.delete(row)
        await session.commit()
        return Response(status_code=204)

    @router.post("/garments/photos", status_code=201, response_model=UploadOut)
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
            check_media_type(upload)

        # One photo at a time, off the event loop.
        thumbnails = [
            (await convert_upload(upload, make_garment_image))[0] for upload in photos
        ]

        # Ascending created_at in upload order, so the queue tags a rack in
        # the order it was shot.
        start = datetime.now(UTC)
        rows = [
            await add_garment_photo(
                session, thumbnail, start + timedelta(microseconds=offset)
            )
            for offset, thumbnail in enumerate(thumbnails)
        ]
        await session.commit()
        for row in rows:
            await session.refresh(row)
        logger.info("closet: %d photos added", len(rows))
        return {
            "added": len(rows),
            "garments": [garment_out(row, has_image=True) for row in rows],
        }

    @router.post("/garments/{garment_id}/photo", response_model=GarmentOut)
    async def set_garment_photo(
        garment_id: uuid.UUID,
        photo: UploadFile = File(),
        session: AsyncSession = Depends(get_session),
    ) -> GarmentOut:
        """Adds a photo to a garment, or replaces its photo. Only the photo
        and `updated_at` (the image URL's version) change: no retag, and no
        field, status or source moves."""
        await _found(session, garment_id)
        check_media_type(photo)
        [image] = await convert_upload(photo, make_garment_image)
        try:
            # Locked and read again: the garment may have gone, or another
            # photo landed, while the upload was being decoded.
            row = await session.scalar(
                select(Garment)
                .where(Garment.id == garment_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if row is None:
                raise HTTPException(status_code=404, detail="No such garment")
            await closet_product.store_photo(session, row, image)
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise await _conflict(session, garment_id) from None
        await session.refresh(row)
        return await _one_out(session, row)

    @router.post("/garments/{garment_id}/product", response_model=ProductPreviewOut)
    async def preview_product(
        garment_id: uuid.UUID,
        link: ProductLink,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Reads a product link and answers its colours, sizes, price and
        brand. Writes nothing. A link the store will not give up is a 200
        with `state` refused and the reason, never an error."""
        row = await _found(session, garment_id)
        return await closet_product.preview(
            session, row, link.url, has_photo=await _has_image(session, row.id)
        )

    @router.patch("/garments/{garment_id}/product", response_model=ProductAttachOut)
    async def attach_product(
        garment_id: uuid.UUID,
        choice: ProductChoice,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Attaches the chosen colour (see `closet_product.py`). PATCH, not
        PUT: the API's CORS policy (`main.py`) allows GET, POST, PATCH and
        DELETE only, and the POST above is the read-only preview."""
        try:
            row, photo, product, kept = await closet_product.attach(
                session,
                garment_id,
                url=choice.url,
                external_id=choice.external_id,
                size=choice.size,
                replace_brand=choice.replace_brand,
                replace_color=choice.replace_color,
                replace_size=choice.replace_size,
                replace_product=choice.replace_product,
            )
            await session.commit()
        except closet_product.AttachRefused as refused:
            await session.rollback()
            raise HTTPException(
                status_code=refused.status, detail=refused.message
            ) from None
        except IntegrityError:
            await session.rollback()
            raise await _conflict(session, garment_id) from None
        await session.refresh(row)
        return {
            "garment": await _one_out(session, row),
            "photo": photo.state,
            "photo_error": photo.error,
            "kept": kept,
            "product": closet_product.attached(product),
        }

    # The photo as WebP bytes (or a 304), not JSON.
    @router.get("/garments/{garment_id}/image", response_model=None)
    async def garment_image(
        garment_id: uuid.UUID,
        size: Literal["thumb"] | None = None,
        if_none_match: str | None = Header(default=None),
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """The photo as WebP. Private (it is behind the session) and cached a
        day; the ETag follows the garment's updated_at, with a `-thumb`
        suffix for `?size=thumb`, the 400px grid rendition made on read."""
        row = await _found(session, garment_id)
        etag = _etag(row)
        if size == "thumb":
            etag = etag[:-1] + '-thumb"'
        headers = {"Cache-Control": "private, max-age=86400", "ETag": etag}
        if if_none_match is not None and etag in {
            tag.strip() for tag in if_none_match.split(",")
        }:
            return Response(status_code=304, headers=headers)
        image = await session.get(GarmentImage, garment_id)
        if image is None:
            raise HTTPException(status_code=404, detail="That garment has no photo")
        body = image.webp if size is None else resize_webp(image.webp)
        return Response(content=body, media_type="image/webp", headers=headers)

    @router.get("/profile", response_model=ProfileOut)
    async def get_profile(
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        return profile_out(await load_profile(session))

    @router.patch("/profile", response_model=ProfileOut)
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

    @router.get("/status", response_model=JobStatusOut)
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

    def _requeued():
        """Model-tagged pieces on an older formality scale (#548)."""
        return (
            select(Garment.id)
            .join(GarmentImage, GarmentImage.garment_id == Garment.id)
            .where(
                Garment.tag_source == GarmentTagSource.MODEL,
                Garment.tag_scale < closet_tag.SCALE_VERSION,
                Garment.status.in_((GarmentStatus.ACTIVE, GarmentStatus.PACKED)),
                Garment.tag_attempts < closet_tag.MAX_ATTEMPTS,
            )
        )

    def _blank():
        """A field a fill can still give: warmth, formality, or a top's graphic."""
        return or_(
            Garment.warmth.is_(None),
            Garment.formality.is_(None),
            and_(Garment.category == GarmentCategory.TOP, Garment.graphic.is_(None)),
        )

    def _to_fill():
        """Hand-saved pieces still missing warmth or formality (#549), or a
        top whose graphic flag is not known (#550)."""
        return (
            select(Garment.id)
            .join(GarmentImage, GarmentImage.garment_id == Garment.id)
            .where(
                Garment.tag_source == GarmentTagSource.MANUAL,
                _blank(),
                Garment.status.in_((GarmentStatus.ACTIVE, GarmentStatus.PACKED)),
                Garment.tag_attempts < closet_tag.MAX_ATTEMPTS,
            )
        )

    def _queue_for(mode: str):
        return {"new": _queued, "fill": _to_fill, "retag": _requeued}[mode]()

    async def _count(session: AsyncSession, queue) -> int:
        count = await session.scalar(select(func.count()).select_from(queue.subquery()))
        return count or 0

    async def _remaining(session: AsyncSession) -> int:
        return await _count(session, _queued())

    async def _retag_remaining(session: AsyncSession) -> int:
        return await _count(session, _requeued())

    async def _fill_remaining(session: AsyncSession) -> int:
        return await _count(session, _to_fill())

    async def _strike(
        session: AsyncSession, ids: list[uuid.UUID], mode: closet_tag.Mode = "new"
    ) -> None:
        if mode not in closet_tag.MODES:
            raise ValueError(f"unknown tag mode {mode!r}")
        owner = {
            "new": Garment.tag_source.is_(None),
            "fill": Garment.tag_source == GarmentTagSource.MANUAL,
            "retag": Garment.tag_source == GarmentTagSource.MODEL,
        }[mode]
        await session.execute(
            update(Garment)
            .where(Garment.id.in_(ids), owner)
            # `updated_at` is the photo's cache version: the column's onupdate
            # would move it, so it is set to itself.
            .values(
                tag_attempts=Garment.tag_attempts + 1, updated_at=Garment.updated_at
            )
        )
        await session.commit()

    async def tag_batch(
        session: AsyncSession,
        only: list[uuid.UUID] | None = None,
        mode: closet_tag.Mode = "new",
        sent: set[uuid.UUID] | None = None,
    ) -> dict[str, Any]:
        """One model call over the oldest queued garments (or over `only`,
        the ones still queued), or none when there is nothing to tag. Never
        raises: the answer says what happened. `mode` picks the queue:
        `"new"` (first-time, `_queued`), `"fill"` (warmth, formality and, on
        a top, graphic blanks on hand-saved pieces, `_to_fill`) or `"retag"`
        (formality and, on a top, graphic, `_requeued`). The graphic flag is
        written for tops only. A top whose graphic comes back unusable stays
        queued: a first-time tag leaves `tag_scale` one below current, and a
        re-tag keeps `tag_scale` and strikes it (gone after MAX_ATTEMPTS).
        `sent` is the run's set of ids already asked: fill and re-tag batches
        leave them out, so a piece still blank after its call is not asked
        again tonight (one strike a night at most), and every id this call
        sends is added to it. `only` ignores it: a rejected
        batch's single retry is allowed once. `"new"` is left as it was.

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
        if mode not in closet_tag.MODES:
            raise ValueError(f"unknown tag mode {mode!r}")
        query = (
            select(Garment.id, GarmentImage.webp)
            .join(GarmentImage, GarmentImage.garment_id == Garment.id)
            .where(Garment.id.in_(_queue_for(mode)))
        )
        if only is not None:
            query = query.where(Garment.id.in_(only))
        elif sent and mode != "new":
            query = query.where(Garment.id.not_in(sent))
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
        if sent is not None:
            sent.update(ids)
        images = [Image("image/webp", row.webp) for row in rows]
        del rows
        single = len(ids) == 1

        async def rejected(note: str, stop: bool = False) -> dict[str, Any]:
            if single:
                await _strike(session, ids, mode)
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
            tagged = closet_tag.validate(payload, len(ids), mode=mode)
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
        if mode == "fill":
            blank_before = {
                row.id: row
                for row in await session.execute(
                    select(
                        Garment.id,
                        Garment.category,
                        Garment.warmth,
                        Garment.formality,
                        Garment.graphic,
                    ).where(Garment.id.in_(ids))
                )
            }
            unusable: list[uuid.UUID] = []
            for garment_id, entry in zip(ids, tagged, strict=True):
                # Only the blanks, and a field set by hand during the call
                # wins (COALESCE in SQL). `tag_source`, colours and the
                # photo's cache version `updated_at` never move. The scale is
                # current only when this fill wrote the formality.
                values: dict[str, Any] = {}
                warmth = entry.attributes["warmth"]
                formality = entry.attributes["formality"]
                was = blank_before.get(garment_id)
                # Only a top carries the flag.
                graphic = (
                    entry.attributes["graphic"]
                    if was is not None and was.category == GarmentCategory.TOP
                    else None
                )
                progress = was is not None and (
                    (was.warmth is None and warmth is not None)
                    or (was.formality is None and formality is not None)
                    or (
                        was.category == GarmentCategory.TOP
                        and was.graphic is None
                        and graphic is not None
                    )
                )
                if not progress:
                    unusable.append(garment_id)
                if warmth is not None:
                    values["warmth"] = func.coalesce(Garment.warmth, warmth)
                if formality is not None:
                    values["formality"] = func.coalesce(Garment.formality, formality)
                    values["tag_scale"] = case(
                        (Garment.formality.is_(None), closet_tag.SCALE_VERSION),
                        else_=Garment.tag_scale,
                    )
                if graphic is not None:
                    values["graphic"] = func.coalesce(Garment.graphic, graphic)
                if values:
                    result = await session.execute(
                        update(Garment)
                        .where(
                            Garment.id == garment_id,
                            Garment.tag_source == GarmentTagSource.MANUAL,
                            Garment.status.in_(
                                (GarmentStatus.ACTIVE, GarmentStatus.PACKED)
                            ),
                            _blank(),
                        )
                        .values(**values, updated_at=Garment.updated_at)
                        .returning(
                            Garment.category,
                            Garment.warmth,
                            Garment.formality,
                            Garment.graphic,
                        )
                    )
                    # Filled means no longer blank, not merely written to.
                    after = result.first()
                    written += int(
                        after is not None
                        and None not in (after.warmth, after.formality)
                        and not (
                            after.category == GarmentCategory.TOP
                            and after.graphic is None
                        )
                    )
            # A piece the call gave nothing usable for takes a strike. One
            # that gained a field is not struck: it is asked again for the
            # rest. This still ends: once it is blank on one field only, a
            # call that leaves that field unusable gains nothing, so it is
            # struck on every later night and leaves after MAX_ATTEMPTS.
            if unusable:
                await session.execute(
                    update(Garment)
                    .where(
                        Garment.id.in_(unusable),
                        Garment.tag_source == GarmentTagSource.MANUAL,
                        _blank(),
                    )
                    .values(
                        tag_attempts=Garment.tag_attempts + 1,
                        updated_at=Garment.updated_at,
                    )
                )
            await session.commit()
            return {**idle, "tagged": written, "called": True}
        if mode == "retag":
            categories = dict(
                (
                    await session.execute(
                        select(Garment.id, Garment.category).where(Garment.id.in_(ids))
                    )
                ).all()
            )
            for garment_id, entry in zip(ids, tagged, strict=True):
                # Formality, the graphic flag (tops only) and the scale they
                # were read on, nothing else. An unusable formality keeps the
                # old one but still marks the piece done, or it would be asked
                # for every night. A top whose graphic is unusable is not
                # done: it keeps its scale and takes a strike, so it is asked
                # again on a later night and leaves after MAX_ATTEMPTS. No
                # `updated_at` is the photo's cache version: the column's
                # onupdate would move it, so it is set to itself.
                is_top = categories.get(garment_id) == GarmentCategory.TOP
                graphic = entry.attributes["graphic"]
                values: dict[str, Any] = {}
                if entry.attributes["formality"] is not None:
                    values["formality"] = entry.attributes["formality"]
                if is_top and isinstance(graphic, bool):
                    values["graphic"] = graphic
                if is_top and not isinstance(graphic, bool):
                    values["tag_attempts"] = Garment.tag_attempts + 1
                else:
                    values["tag_scale"] = closet_tag.SCALE_VERSION
                result = await session.execute(
                    update(Garment)
                    .where(
                        Garment.id == garment_id,
                        Garment.tag_source == GarmentTagSource.MODEL,
                        Garment.tag_scale < closet_tag.SCALE_VERSION,
                    )
                    .values(**values, updated_at=Garment.updated_at)
                )
                written += result.rowcount or 0
            await session.commit()
            return {**idle, "tagged": written, "called": True}
        for garment_id, entry in zip(ids, tagged, strict=True):
            values = dict(entry.attributes)
            values["category"] = GarmentCategory(values["category"])
            # A colour from a store or a hand edit is kept, and so is a
            # brand already set; decided in SQL so a save that lands during
            # the model call is respected too.
            fixed = Garment.color_source.in_(
                (GarmentColorSource.VENDOR, GarmentColorSource.MANUAL)
            )
            for field in closet_tag.COLOUR_FIELDS:
                values[field] = case(
                    (fixed, getattr(Garment, field)), else_=values[field]
                )
            values["brand"] = case(
                (fixed & Garment.brand.is_not(None), Garment.brand),
                else_=values["brand"],
            )
            # A store's own title is kept too (vendor only; manual keeps
            # just the colour).
            values["name"] = case(
                (
                    (Garment.color_source == GarmentColorSource.VENDOR)
                    & Garment.name.is_not(None)
                    & (Garment.name != ""),
                    Garment.name,
                ),
                else_=values["name"],
            )
            result = await session.execute(
                update(Garment)
                .where(
                    Garment.id == garment_id,
                    Garment.tag_source.is_(None),
                    Garment.status == GarmentStatus.UNTAGGED,
                )
                .values(
                    **values,
                    color_source=case(
                        (Garment.color_source.is_(None), GarmentColorSource.MODEL),
                        else_=Garment.color_source,
                    ),
                    tag_source=GarmentTagSource.MODEL,
                    # A top the model gave no usable graphic for is asked
                    # again by the re-tag.
                    tag_scale=(
                        closet_tag.SCALE_VERSION
                        if values["category"] != GarmentCategory.TOP
                        or values["graphic"] is not None
                        else closet_tag.SCALE_VERSION - 1
                    ),
                    status=GarmentStatus.ACTIVE,
                    updated_at=func.now(),
                )
            )
            written += result.rowcount or 0
        await session.commit()
        return {**idle, "tagged": written, "called": True}

    async def _run(
        session: AsyncSession,
        budget: int,
        batches: int | None = None,
        allow_retag: bool = True,
    ) -> dict[str, Any]:
        """Batches until `budget` calls are spent, a model error stops it,
        the queues are empty, or `batches` queue batches have been taken.
        The queues go in order: first-time, then fill (#549), then re-tag;
        a batch is all one mode. A rejected batch's singles are tried before
        the next batch, each one a call against the same budget. `allow_retag`
        False (Tag now) keeps to the first-time queue. `state` is the job's
        word for it."""
        done = {"new": 0, "fill": 0, "retag": 0}
        calls = taken = 0
        retrying = "new"  # the mode `pending` holds
        note = None
        state = "off" if budget == 0 else "ok"
        pending: list[uuid.UUID] = []
        sent: set[uuid.UUID] = set()  # ids asked this run (fill, re-tag skip them)
        while calls < budget:
            mode = "new"
            if pending:
                mode = retrying
                result = await tag_batch(
                    session, only=[pending.pop(0)], mode=mode, sent=sent
                )
            elif batches is not None and taken >= batches:
                break
            else:
                result = await tag_batch(session, sent=sent)
                taken += 1
                for later in ("fill", "retag") if allow_retag else ():
                    if result["called"] or result["stop"] or result["retry"]:
                        break
                    # Nothing in the earlier queues: the next one takes the call.
                    mode = later
                    result = await tag_batch(session, mode=mode, sent=sent)
            done[mode] += result["tagged"]
            calls += int(result["called"])
            note = result["note"] or note
            if result["retry"]:
                retrying = mode
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
        return {
            "state": state,
            "tagged": done["new"],
            "filled": done["fill"],
            "retagged": done["retag"],
            "calls": calls,
            "note": note,
        }

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

    @router.post("/tag", response_model=TagNowOut)
    async def tag_now(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The page's Tag now: one batch, whatever the nightly budget says."""
        if run_lock.locked():
            raise HTTPException(status_code=409, detail="Tagging is already running")
        async with run_lock:
            # One batch, and its photos one at a time if it is rejected.
            result = await _run(
                session, 1 + closet_tag.BATCH_SIZE, batches=1, allow_retag=False
            )
            return {
                "tagged": result["tagged"],
                "calls": result["calls"],
                "note": result["note"],
                "remaining": await _remaining(session),
                "retag_remaining": await _retag_remaining(session),
            }

    @router.post("/jobs/tag", response_model=TagJobOut)
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
            retag_remaining = await _retag_remaining(session)
            fill_remaining = await _fill_remaining(session)
            filled = result["filled"]
            retagged = result["retagged"]
            note = result["note"]
            if not note and result["calls"]:
                parts = []
                if filled or fill_remaining:
                    parts.append(f"Blanks filled: {filled}, {fill_remaining} left")
                if retagged or retag_remaining:
                    parts.append(
                        f"Formality re-tag: {retagged} done tonight, "
                        f"{retag_remaining} left"
                    )
                note = " · ".join(parts) or None
            state = result["state"]
            summary = {
                "at": at,
                "state": state,
                "ok": state not in ("failed", "stopped"),
                "tagged": result["tagged"],
                "calls": result["calls"],
                "remaining": remaining,
                "filled": filled,
                "fill_remaining": fill_remaining,
                "retagged": retagged,
                "retag_remaining": retag_remaining,
                "note": note,
            }
            await _write_tag_status(session, summary)
            logger.info("closet tag: %s", summary)
            return summary

    return router
