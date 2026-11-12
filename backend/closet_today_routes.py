"""Today: the day's outfit plan, its re-plans, Wore this and the nightly plan.

- **A plan is one row per day x occasion x bike** (`outfit_plans`), its
  `body` the whole answer the page renders: the weather read, the lead and
  two alternatives, `ranked_by`, `model_note` and the footnote. GET
  `/today` answers the stored plan, or plans on open and stores it; POST
  `/plan` re-plans (an occasion chip, Build around, Not this) and
  overwrites it. GET re-plans a stored plan that names an inactive garment
  (keeping a still-active Build-around lock); `stored_only` lets the Home
  card read without planning and answers no plan when the stored one is stale.
- **One model call per plan**, Discover's contract (`rank`, never raises):
  `closet.py` filters and ranks, `closet_rank.py` asks the model to choose
  by indices, and any failure is the template plan with the reason in
  `model_note`. Nothing is read from the database during the call.
- **Not this** stores the turned-down lead as an `outfits` row with
  `not_this` set and no `wears`, so the reason is kept as feedback (the
  prompt reads the five most recent) without counting as worn. Every
  history read below takes `not_this IS NULL` only.
- **Match this** (`POST /match`) tags one photo in one call and plans
  around it as a transient garment: nothing is written. `POST
  /garments/from-match` (Save as owned) is the only way it persists.
- **Wore this** (`POST /wore`) writes one `outfits` row and a `wears` row
  per garment for today in Denver. A second Wore this the same day (the
  "Change" path) replaces the first, wears and all.
- **The nightly step** (`POST /jobs/plan`, a job route) plans tomorrow once
  per occasion chip in the profile's default week, with tomorrow's default
  bike, so Today paints from a stored row whichever chip is pressed; it
  writes `plan.last_run`.

Admin only, at the router. A separate module from `closet_routes.py`, which
owns garments, the profile and tagging; this one reads those and writes
only plans, outfits and wears (and a garment on Save as owned).
Spec and plan: docs/planning/2026-11-09-outfit-design.md (PR C, task 14).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import closet
import closet_rank
import closet_tag
import weather
from closet_images import ClosetImageError, make_thumbnail, read_capped
from closet_routes import (
    DEFAULT_WEEK,
    OCCASIONS,
    _image_url,
    garment_out,
    load_profile,
    profile_out,
)
from importer import ACCEPTED_MEDIA_TYPES
from items import require_admin
from llm import Image, LLMError, LLMProvider
from models import (
    ClosetSetting,
    Garment,
    GarmentCategory,
    GarmentImage,
    GarmentStatus,
    GarmentTagSource,
    Outfit,
    OutfitGarment,
    OutfitPlan,
    OutfitSource,
    Wear,
)
from public import OWNER_TZ
from recommendations_routes import _failure_note

logger = logging.getLogger(__name__)

PLAN_STATUS_KEY = "plan.last_run"
TRANSIENT_ID = "match"
WEARS_WINDOW_DAYS = 30
NOTHING_TO_WEAR = "Nothing in the closet fits today yet"
# The nightly job must finish inside nightly.yml's 300 s curl timeout, and a
# model call can take up to 150 s: past this many seconds, the job's
# remaining chips are planned from the template without a call.
JOB_MODEL_BUDGET_S = 200
JOB_SKIP_FAILED = "Planned from the template: the model failed earlier in this run"
JOB_SKIP_TIME = "Planned from the template: the run was out of time for the model"


def owner_today() -> date:
    return datetime.now(OWNER_TZ).date()


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=422, detail=detail)


class WornGarment(BaseModel):
    slot: GarmentCategory
    id: uuid.UUID


class PlanIn(BaseModel):
    occasion: str | None = None
    bike: bool | None = None
    lock: uuid.UUID | None = None
    not_this: str | None = Field(default=None, max_length=40)
    # Not this: the lead as it was on screen (after any swap), so what is
    # recorded is what was turned down. The stored lead stands in without it.
    declined: list[WornGarment] | None = Field(default=None, min_length=1, max_length=6)


class WoreIn(BaseModel):
    occasion: str
    bike: bool = False
    source: OutfitSource = OutfitSource.PLANNED
    garments: list[WornGarment] = Field(min_length=1, max_length=6)


# --- reading the closet ------------------------------------------------------


def _piece(row: Garment, last_worn: date | None, wears_30: int) -> closet.Piece:
    category = row.category.value
    return closet.Piece(
        id=str(row.id),
        name=row.name or f"unnamed {category}",
        category=category,
        subtype=row.subtype,
        primary_color=row.primary_color,
        primary_hex=row.primary_hex,
        secondary_hex=row.secondary_hex,
        pattern=row.pattern,
        material=row.material,
        warmth=row.warmth,
        formality=row.formality,
        seasons=tuple(row.seasons or ()),
        last_worn=last_worn,
        wears_30=wears_30,
    )


def _transient(attributes: dict[str, Any]) -> closet.Piece:
    return closet.Piece(
        id=TRANSIENT_ID,
        name=attributes.get("name") or f"{attributes['category']} from the photo",
        category=attributes["category"],
        subtype=attributes.get("subtype"),
        primary_color=attributes.get("primary_color"),
        primary_hex=attributes.get("primary_hex"),
        secondary_hex=attributes.get("secondary_hex"),
        pattern=attributes.get("pattern"),
        material=attributes.get("material"),
        warmth=attributes.get("warmth"),
        formality=attributes.get("formality"),
        seasons=tuple(attributes.get("seasons") or ()),
        transient=True,
    )


async def load_pieces(
    session: AsyncSession, day: date
) -> tuple[list[closet.Piece], dict[str, Garment], set[str]]:
    """The active garments as pieces, the rows by id, and the ids with a
    photo. Last worn and the month's wears count up to `day`."""
    rows = (
        await session.scalars(
            select(Garment).where(
                Garment.status == GarmentStatus.ACTIVE,
                Garment.category.is_not(None),
            )
        )
    ).all()
    ids = [row.id for row in rows]
    if not ids:
        return [], {}, set()
    since = day - timedelta(days=WEARS_WINDOW_DAYS)
    worn = (
        await session.execute(
            select(
                Wear.garment_id,
                func.max(Wear.worn_on),
                func.count(Wear.id).filter(Wear.worn_on > since),
            )
            .where(Wear.garment_id.in_(ids), Wear.worn_on <= day)
            .group_by(Wear.garment_id)
        )
    ).all()
    by_id = {garment_id: (last, count) for garment_id, last, count in worn}
    photos = set(
        await session.scalars(
            select(GarmentImage.garment_id).where(GarmentImage.garment_id.in_(ids))
        )
    )
    pieces = [_piece(row, *by_id.get(row.id, (None, 0))) for row in rows]
    return pieces, {str(row.id): row for row in rows}, {str(i) for i in photos}


async def worn_outfits(
    session: AsyncSession, since: date, until: date
) -> list[tuple[date, list[tuple[str, str]]]]:
    """Outfits worn (not turned down) from `since` up to `until`, as
    `(worn_on, [(slot, garment id)])`."""
    rows = (
        await session.execute(
            select(
                Outfit.id, Outfit.worn_on, OutfitGarment.slot, OutfitGarment.garment_id
            )
            .join(OutfitGarment, OutfitGarment.outfit_id == Outfit.id)
            .where(
                Outfit.not_this.is_(None),
                Outfit.worn_on >= since,
                Outfit.worn_on <= until,
            )
        )
    ).all()
    grouped: dict[uuid.UUID, tuple[date, list[tuple[str, str]]]] = {}
    for outfit_id, worn_on, slot, garment_id in rows:
        grouped.setdefault(outfit_id, (worn_on, []))[1].append(
            (slot.value, str(garment_id))
        )
    return list(grouped.values())


async def declined_today(
    session: AsyncSession, day: date, occasion: str, bike: bool
) -> set[frozenset[str]]:
    """The keys of the outfits turned down today for this occasion and
    bike, so a second Not this cannot bring the first one back."""
    rows = (
        await session.execute(
            select(Outfit.id, OutfitGarment.slot, OutfitGarment.garment_id)
            .join(OutfitGarment, OutfitGarment.outfit_id == Outfit.id)
            .where(
                Outfit.not_this.is_not(None),
                Outfit.worn_on == day,
                Outfit.occasion == occasion,
                Outfit.bike == bike,
            )
        )
    ).all()
    grouped: dict[uuid.UUID, list[tuple[str, str]]] = {}
    for outfit_id, slot, garment_id in rows:
        grouped.setdefault(outfit_id, []).append((slot.value, str(garment_id)))
    return {closet.outfit_key(slots) for slots in grouped.values()}


async def recent_not_this(session: AsyncSession) -> list[str]:
    """The Not-this reasons, newest first, as many as the prompt reads."""
    return list(
        await session.scalars(
            select(Outfit.not_this)
            .where(Outfit.not_this.is_not(None))
            .order_by(Outfit.created_at.desc())
            .limit(closet_rank.NOT_THIS_RECENT)
        )
    )


async def worn_today(session: AsyncSession, day: date) -> dict[str, Any] | None:
    row = await session.scalar(
        select(Outfit)
        .where(Outfit.worn_on == day, Outfit.not_this.is_(None))
        .order_by(Outfit.created_at.desc())
        .limit(1)
    )
    if row is None:
        return None
    garments = (
        await session.execute(
            select(OutfitGarment.slot, OutfitGarment.garment_id).where(
                OutfitGarment.outfit_id == row.id
            )
        )
    ).all()
    return {
        "id": str(row.id),
        "occasion": row.occasion,
        "bike": row.bike,
        "source": row.source.value,
        "garments": [{"slot": s.value, "id": str(g)} for s, g in garments],
    }


async def require_active(session: AsyncSession, ids: list[uuid.UUID]) -> None:
    """422 unless every id is an active garment in the closet."""
    statuses = dict(
        (
            await session.execute(
                select(Garment.id, Garment.status).where(Garment.id.in_(ids))
            )
        ).all()
    )
    if set(statuses) != set(ids):
        raise _unprocessable("Save the garment from the photo as owned first")
    if any(status != GarmentStatus.ACTIVE for status in statuses.values()):
        raise _unprocessable("Only an active garment can be worn or turned down")


def defaults_for(profile: dict[str, Any], day: date) -> tuple[str, bool]:
    """The profile's default occasion and bike for `day` (Monday first)."""
    week = profile.get("weekly_occasions") or DEFAULT_WEEK
    bikes = profile.get("weekly_bike") or [False] * 7
    occasion = week[day.weekday()] if len(week) == 7 else DEFAULT_WEEK[day.weekday()]
    bike = bool(bikes[day.weekday()]) if len(bikes) == 7 else False
    return (occasion if occasion in OCCASIONS else "weekend"), bike


# --- the plan's body ---------------------------------------------------------


def _tile(
    slot: str, piece: closet.Piece, day: date, bike: bool, photos: set[str], rows
) -> dict[str, Any]:
    row = rows.get(piece.id)
    image = _image_url(row, piece.id in photos) if row is not None else None
    return {
        "slot": slot,
        "id": piece.id,
        "name": piece.name,
        "primary_hex": piece.primary_hex,
        "secondary_hex": piece.secondary_hex,
        "image": image,
        "qualifier": closet.qualifier(piece, slot, day, bike),
        "transient": piece.transient,
    }


def _outfit_out(outfit, day, bike, photos, rows) -> dict[str, Any]:
    return {
        "garments": [
            _tile(slot, piece, day, bike, photos, rows) for slot, piece in outfit.pieces
        ],
        "reason": outfit.reason,
        "ranked_by": outfit.ranked_by,
    }


def _weather_out(read: closet.WeatherRead, bike: bool, day: date) -> dict[str, Any]:
    return {
        "low": read.low,
        "high": read.high,
        "swing": read.swing,
        "wet": read.wet,
        "snow": read.snow,
        "forecast": read.forecast,
        "sentence": closet.read_sentence(read, bike, f"{day:%B}"),
        "hours": [{"label": label, "temp": temp} for label, temp in read.hours],
    }


# --- the router ----------------------------------------------------------------


def create_closet_today_router(
    factory: async_sessionmaker[AsyncSession],
    provider_factory: Callable[[], LLMProvider] | None = None,
    lock: asyncio.Lock | None = None,
    today: Callable[[], date] = owner_today,
) -> APIRouter:
    """`provider_factory` builds the model per call, so a missing key falls
    back to the template plan, never fails the boot. `today` is the owner's
    day (Denver); tests pass their own."""
    job_lock = lock or asyncio.Lock()
    wore_locks: dict[date, asyncio.Lock] = {}

    def wore_lock(day: date) -> asyncio.Lock:
        """The day's Wore this lock; other days' idle locks are dropped."""
        for other in [d for d, held in wore_locks.items() if d != day]:
            if not wore_locks[other].locked():
                del wore_locks[other]
        return wore_locks.setdefault(day, asyncio.Lock())

    router = APIRouter(
        prefix="/api/closet",
        tags=["closet"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def rank(
        prompt: str, budget: dict[str, Any] | None = None
    ) -> tuple[dict | None, str | None]:
        """One model call, or why there was none. Never raises.

        `budget` is the nightly job's: once a call has failed (quota,
        overload, timeout) or the run is past `JOB_MODEL_BUDGET_S`, the
        rest of the run is the template, so the job ends inside the
        workflow's timeout."""
        if provider_factory is None:
            return None, "No model is configured"
        if budget is not None:
            if budget.get("failed"):
                return None, JOB_SKIP_FAILED
            if time.monotonic() - budget["started"] > JOB_MODEL_BUDGET_S:
                return None, JOB_SKIP_TIME
        try:
            provider = provider_factory()
            payload = await provider.complete_json(prompt, closet_rank.SCHEMA)
        except LLMError as error:
            logger.warning("closet plan model call failed: %s", error)
            if budget is not None:
                budget["failed"] = True
            return None, _failure_note(str(error))
        except Exception as error:  # a malformed answer must not stop Today
            logger.exception("closet plan model call failed unexpectedly")
            return None, f"The model’s answer couldn’t be read ({type(error).__name__})"
        return payload, None

    def _occasion(value: str | None, fallback: str) -> str:
        if value is None:
            return fallback
        if value not in OCCASIONS:
            raise _unprocessable(f"{value} is not an occasion")
        return value

    async def make_plan(
        session: AsyncSession,
        day: date,
        occasion: str,
        bike: bool,
        *,
        lock_id: str | None = None,
        extra: closet.Piece | None = None,
        not_this: list[str] | None = None,
        declined: frozenset[str] | None = None,
        budget: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """The plan's body for one day, occasion and bike; stores nothing."""
        profile_row = await load_profile(session)
        profile = profile_out(profile_row)
        pieces, rows, photos = await load_pieces(session, day)
        if lock_id is not None and lock_id not in rows:
            raise _unprocessable("Only an active garment can be built around")
        request = closet.Request(
            day=day,
            occasion=occasion,
            bike=bike,
            repeat_top_days=profile["repeat_top_days"],
            repeat_outfit_weeks=profile["repeat_outfit_weeks"],
            lock=lock_id,
            extra=extra,
        )
        read = closet.read_weather(await weather.hours_for_day(session, day), day)
        since = day - timedelta(weeks=request.repeat_outfit_weeks)
        recent = closet.recent_keys(
            await worn_outfits(session, since, day - timedelta(days=1)), request
        )
        recent |= await declined_today(session, day, occasion, bike)
        if declined:
            recent = recent | {declined}
        reasons = (not_this or []) + await recent_not_this(session)
        # Done reading: no connection is held through the model call.
        await session.commit()

        found = closet.candidates(pieces, request, read)
        sentence = closet.read_sentence(read, bike, f"{day:%B}")
        if not closet.template(found, recent):
            outfits, note = [], NOTHING_TO_WEAR
        else:
            payload, note = await rank(
                closet_rank.build_prompt(
                    found, request, read, sentence, profile, reasons
                ),
                budget,
            )
            outfits, note = closet_rank.outcome(payload, note, found, recent)
        shaped = [_outfit_out(o, day, bike, photos, rows) for o in outfits]
        return {
            "day": day.isoformat(),
            "occasion": occasion,
            "bike": bike,
            "planned_at": datetime.now(UTC).isoformat(),
            "ranked_by": outfits[0].ranked_by if outfits else "template",
            "model_note": note,
            "weather": _weather_out(read, bike, day),
            "lead": shaped[0] if shaped else None,
            "alternatives": shaped[1:],
            "footnote": {
                "active": found.active,
                "fit": found.fit,
                "skipped_recent": found.skipped_recent,
            },
            "lock": lock_id,
        }

    async def store(session: AsyncSession, body: dict[str, Any]) -> None:
        values = {
            "day": date.fromisoformat(body["day"]),
            "occasion": body["occasion"],
            "bike": body["bike"],
            "body": body,
        }
        await session.execute(
            insert(OutfitPlan)
            .values(**values)
            .on_conflict_do_update(
                index_elements=[OutfitPlan.day, OutfitPlan.occasion, OutfitPlan.bike],
                set_={"body": body, "planned_at": func.now()},
            )
        )
        await session.commit()

    async def stored(
        session: AsyncSession, day: date, occasion: str, bike: bool
    ) -> dict[str, Any] | None:
        row = await session.get(OutfitPlan, (day, occasion, bike))
        return dict(row.body) if row is not None else None

    async def active_ids(session: AsyncSession, ids: set[uuid.UUID]) -> set[uuid.UUID]:
        """The subset of `ids` that are active garments."""
        if not ids:
            return set()
        return set(
            (
                await session.scalars(
                    select(Garment.id).where(
                        Garment.id.in_(ids), Garment.status == GarmentStatus.ACTIVE
                    )
                )
            ).all()
        )

    async def names_inactive(session: AsyncSession, plan: dict[str, Any]) -> bool:
        """True when the plan names a garment that is deleted or not active.

        A body that cannot be read (null alternatives, a non-UUID id) counts as
        stale, so it is planned again instead of locking Today out."""
        try:
            outfits = [plan.get("lead"), *(plan.get("alternatives") or [])]
            named = {
                uuid.UUID(g["id"])
                for outfit in outfits
                if outfit
                for g in outfit["garments"]
                if not g.get("transient")
            }
        except (KeyError, TypeError, ValueError, AttributeError):
            return True
        return bool(named) and await active_ids(session, named) != named

    async def kept_lock(session: AsyncSession, plan: dict[str, Any]) -> str | None:
        """The stale plan's Build-around lock, when that garment is still active."""
        try:
            lock = uuid.UUID(str(plan.get("lock")))
        except ValueError:
            return None
        return str(lock) if lock in await active_ids(session, {lock}) else None

    async def answer(
        session: AsyncSession, day: date, plan: dict | None, just_now: bool
    ) -> dict[str, Any]:
        profile = profile_out(await load_profile(session))
        occasion, bike = defaults_for(profile, day)
        return {
            "plan": plan,
            "planned_just_now": just_now,
            "worn": await worn_today(session, day),
            "defaults": {"occasion": occasion, "bike": bike},
            "occasions": list(OCCASIONS),
        }

    @router.get("/today")
    async def get_today(
        occasion: str | None = None,
        bike: bool | None = None,
        stored_only: bool = False,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Today's stored plan for the occasion and bike (the day's defaults
        when not given), or a plan made now and stored."""
        day = today()
        default_occasion, default_bike = defaults_for(
            profile_out(await load_profile(session)), day
        )
        occasion = _occasion(occasion, default_occasion)
        bike = default_bike if bike is None else bike
        plan = await stored(session, day, occasion, bike)
        # A plan naming a garment since deleted, packed, listed or gone is
        # stale: plan again for the same occasion and bike it was stored under.
        lock_id = None
        stale = plan is not None and await names_inactive(session, plan)
        if stale:
            lock_id = await kept_lock(session, plan)
            plan = None
            if stored_only:  # never shown stale, never planned here
                return await answer(session, day, None, False)
        elif plan is not None or stored_only:
            return await answer(session, day, plan, False)
        plan = await make_plan(session, day, occasion, bike, lock_id=lock_id)
        if plan["lead"] is not None:
            await store(session, plan)
        elif stale:
            # No new lead: drop the stale row so later reads (and stored_only)
            # don't recheck it and agree there is no plan.
            await session.execute(
                delete(OutfitPlan).where(
                    OutfitPlan.day == day,
                    OutfitPlan.occasion == occasion,
                    OutfitPlan.bike == bike,
                )
            )
            await session.commit()
        return await answer(session, day, plan, True)

    @router.post("/plan")
    async def replan(
        body: PlanIn, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Re-plan today: another occasion or bike, Build around (`lock`),
        or Not this (`not_this`, which records the turned-down lead first)."""
        day = today()
        default_occasion, default_bike = defaults_for(
            profile_out(await load_profile(session)), day
        )
        occasion = _occasion(body.occasion, default_occasion)
        bike = default_bike if body.bike is None else body.bike
        declined = None
        if body.not_this is not None:
            if body.not_this not in closet_rank.NOT_THIS:
                raise _unprocessable(f"{body.not_this} is not a reason")
            if body.declined is not None:
                await require_active(session, [g.id for g in body.declined])
                owned = [{"slot": g.slot.value, "id": str(g.id)} for g in body.declined]
            else:
                previous = await stored(session, day, occasion, bike)
                lead = (previous or {}).get("lead")
                held = [
                    {"slot": g["slot"], "id": g["id"]}
                    for g in (lead or {}).get("garments", [])
                    if not g["transient"]
                ]
                # A stale lead may name a garment since deleted or packed.
                live = await active_ids(session, {uuid.UUID(g["id"]) for g in held})
                owned = [g for g in held if uuid.UUID(g["id"]) in live]
            if owned:
                outfit = Outfit(
                    worn_on=day,
                    occasion=occasion,
                    bike=bike,
                    source=OutfitSource.PLANNED,
                    not_this=body.not_this,
                )
                session.add(outfit)
                await session.flush()
                for garment in owned:
                    session.add(
                        OutfitGarment(
                            outfit_id=outfit.id,
                            garment_id=uuid.UUID(garment["id"]),
                            slot=GarmentCategory(garment["slot"]),
                        )
                    )
                await session.commit()
                declined = closet.outfit_key((g["slot"], g["id"]) for g in owned)
        plan = await make_plan(
            session,
            day,
            occasion,
            bike,
            lock_id=str(body.lock) if body.lock else None,
            not_this=[body.not_this] if body.not_this and declined is None else None,
            declined=declined,
        )
        # A locked plan is the moment's, not the day's: unlocking reads the
        # stored plan again, so it must not be overwritten.
        if plan["lead"] is not None and plan["lock"] is None:
            await store(session, plan)
        return await answer(session, day, plan, True)

    @router.get("/candidates")
    async def candidates(
        slot: GarmentCategory,
        occasion: str | None = None,
        bike: bool | None = None,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Swap a piece: the slot's candidates from the filter, ranked. No
        model; the choice is the owner's."""
        day = today()
        profile = profile_out(await load_profile(session))
        default_occasion, default_bike = defaults_for(profile, day)
        occasion = _occasion(occasion, default_occasion)
        bike = default_bike if bike is None else bike
        pieces, rows, photos = await load_pieces(session, day)
        read = closet.read_weather(await weather.hours_for_day(session, day), day)
        request = closet.Request(
            day=day,
            occasion=occasion,
            bike=bike,
            repeat_top_days=profile["repeat_top_days"],
            repeat_outfit_weeks=profile["repeat_outfit_weeks"],
        )
        found = closet.candidates(pieces, request, read)
        listed = found.by_slot.get(slot.value)
        if listed is None:
            # A slot the day does not need (a layer on a warm day): the
            # garments that pass the same rules, least worn first.
            listed = closet.slot_fallback(pieces, slot.value, request)
        return {
            "slot": slot.value,
            "candidates": [
                _tile(slot.value, s.piece, day, bike, photos, rows) for s in listed
            ],
        }

    async def _thumbnail(photo: UploadFile):
        if photo.content_type not in ACCEPTED_MEDIA_TYPES:
            raise HTTPException(
                status_code=415,
                detail=(
                    f"{photo.filename or 'file'} is {photo.content_type}; "
                    "upload a JPEG, PNG, WebP, or HEIC image"
                ),
            )
        try:
            data = read_capped(photo.file, photo.size)
            return await asyncio.to_thread(make_thumbnail, data)
        except ClosetImageError as error:
            too_large = "too large" in str(error)
            raise HTTPException(
                status_code=413 if too_large else 422, detail=str(error)
            ) from error
        finally:
            await photo.close()

    @router.post("/match")
    async def match(
        photo: UploadFile = File(),
        occasion: str | None = Form(default=None),
        bike: bool | None = Form(default=None),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Match this, from a photo: one call tags it, a second plans
        around it as a garment not owned. Nothing is written."""
        day = today()
        default_occasion, default_bike = defaults_for(
            profile_out(await load_profile(session)), day
        )
        occasion = _occasion(occasion, default_occasion)
        bike = default_bike if bike is None else bike
        thumbnail = await _thumbnail(photo)
        if provider_factory is None:
            raise HTTPException(status_code=503, detail="No model is configured")
        try:
            provider = provider_factory()
            payload = await provider.complete_json(
                closet_tag.build_prompt(1),
                closet_tag.TAG_SCHEMA,
                images=[Image("image/webp", thumbnail.webp)],
            )
            attributes = closet_tag.validate(payload, 1)[0].attributes
        except LLMError as error:
            logger.warning("closet match tag failed: %s", error)
            raise HTTPException(
                status_code=502, detail=_failure_note(str(error))
            ) from error
        except closet_tag.TagBatchError as error:
            raise HTTPException(
                status_code=502, detail="The model couldn’t tell what the photo shows"
            ) from error
        plan = await make_plan(
            session, day, occasion, bike, extra=_transient(attributes)
        )
        plan["match"] = attributes
        return await answer(session, day, plan, True)

    @router.post("/garments/from-match", status_code=201)
    async def save_match(
        photo: UploadFile = File(),
        attributes: str = Form(),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Save as owned: the matched photo and its tags as an active
        garment, the model's tags kept as they were."""
        try:
            values = closet_tag.clean_attributes(json.loads(attributes))
        except (ValueError, closet_tag.TagBatchError) as error:
            raise _unprocessable(
                f"The garment's details are not usable: {error}"
            ) from error
        thumbnail = await _thumbnail(photo)
        values["category"] = GarmentCategory(values["category"])
        row = Garment(
            **values,
            status=GarmentStatus.ACTIVE,
            tag_source=GarmentTagSource.MODEL,
            tag_attempts=0,
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
        await session.commit()
        await session.refresh(row)
        return garment_out(row, has_image=True).model_dump(mode="json")

    @router.post("/wore", status_code=201)
    async def wore(body: WoreIn, session: AsyncSession = Depends(get_session)) -> dict:
        """Wore this: today's outfit and a wear per garment. A second call
        today replaces the first (Change)."""
        day = today()
        if body.occasion not in OCCASIONS:
            raise _unprocessable(f"{body.occasion} is not an occasion")
        ids = [g.id for g in body.garments]
        if len(set(ids)) != len(ids):
            raise _unprocessable("A garment can be worn once per outfit")
        await require_active(session, ids)
        # Two Wore this at once would each find no earlier outfit and both
        # write one: the day's replace-the-first is serialised in-process
        # (one web worker), which needs no migration.
        async with wore_lock(day):
            return await _record_wore(session, day, body)

    async def _record_wore(session: AsyncSession, day: date, body: WoreIn) -> dict:
        earlier = list(
            await session.scalars(
                select(Outfit.id).where(
                    Outfit.worn_on == day, Outfit.not_this.is_(None)
                )
            )
        )
        if earlier:
            await session.execute(delete(Wear).where(Wear.outfit_id.in_(earlier)))
            await session.execute(delete(Outfit).where(Outfit.id.in_(earlier)))
        outfit = Outfit(
            worn_on=day, occasion=body.occasion, bike=body.bike, source=body.source
        )
        session.add(outfit)
        await session.flush()
        for garment in body.garments:
            session.add(
                OutfitGarment(
                    outfit_id=outfit.id, garment_id=garment.id, slot=garment.slot
                )
            )
        await session.execute(
            insert(Wear)
            .values(
                [
                    {
                        "id": uuid.uuid4(),
                        "garment_id": g.id,
                        "worn_on": day,
                        "outfit_id": outfit.id,
                    }
                    for g in body.garments
                ]
            )
            .on_conflict_do_update(
                constraint="ux_wears_garment_day", set_={"outfit_id": outfit.id}
            )
        )
        await session.commit()
        return {"worn": await worn_today(session, day)}

    async def _write_status(session: AsyncSession, summary: dict[str, Any]) -> None:
        await session.execute(
            insert(ClosetSetting)
            .values(key=PLAN_STATUS_KEY, value=summary)
            .on_conflict_do_update(
                index_elements=[ClosetSetting.key],
                set_={"value": summary, "updated_at": func.now()},
            )
        )
        await session.commit()

    @router.post("/jobs/plan")
    async def plan_job(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The nightly step: tomorrow's plans, one per occasion chip in the
        profile's default week (tomorrow's default first), each with
        tomorrow's default bike and one model call. Writes `plan.last_run`."""
        if job_lock.locked():
            raise HTTPException(status_code=409, detail="Planning is already running")
        async with job_lock:
            at = datetime.now(UTC).isoformat()
            try:
                return await _plan_tomorrow(session, at)
            except Exception as error:
                logger.exception("closet plan job failed")
                await session.rollback()
                await _write_status(
                    session,
                    {
                        "at": at,
                        "state": "failed",
                        "ok": False,
                        "note": f"{type(error).__name__}: {error}"[:300],
                    },
                )
                raise

    async def _plan_tomorrow(session: AsyncSession, at: str) -> dict[str, Any]:
        day = today() + timedelta(days=1)
        profile = profile_out(await load_profile(session))
        occasion, bike = defaults_for(profile, day)
        week = [o for o in profile.get("weekly_occasions") or [] if o in OCCASIONS]
        budget: dict[str, Any] = {"started": time.monotonic(), "failed": False}
        plans = []
        for chip in dict.fromkeys([occasion, *week]):
            plan = await make_plan(session, day, chip, bike, budget=budget)
            if plan["lead"] is not None:
                await store(session, plan)
            plans.append(
                {
                    "occasion": chip,
                    "ranked_by": plan["ranked_by"] if plan["lead"] else None,
                    "note": plan["model_note"],
                }
            )
        if all(p["ranked_by"] is None for p in plans):
            state = "empty"
        elif all(p["ranked_by"] in ("model", None) for p in plans):
            state = "ok"
        else:
            state = "template"
        summary = {
            "at": at,
            "state": state,
            # The run did its job even on the template: every chip has a
            # plan. `ok` is false only when it raised; the reason a plan is
            # the template's is in `note`.
            "ok": True,
            "day": day.isoformat(),
            "occasion": occasion,
            "bike": bike,
            "ranked_by": plans[0]["ranked_by"],
            "note": next((p["note"] for p in plans if p["note"]), None),
            "plans": plans,
        }
        await _write_status(session, summary)
        logger.info("closet plan: %s", summary)
        return summary

    return router
