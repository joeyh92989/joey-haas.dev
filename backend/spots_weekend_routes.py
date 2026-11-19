"""The weekend planner's routes: the weather job, the plan and its answers.

`POST /api/spots/weather/refresh` is the job (nightly.yml calls it through
`items.JOB_ROUTES`): NWS's hourly forecast for downtown, upserted into
`weather_hours` by `(gridpoint, starts_at)`, hours more than two days old
dropped, and a summary in `spot_settings["weather.last_run"]`. It is the
only code that reaches NWS; the plan reads the table.

`GET /api/spots/plan` builds the coming weekend with `planner.plan` from
the spots, the visits, the cached hours and the stored constraints. The
week's answers live in one `spot_settings` row, `plan:<ISO week>`:
`saved` maps a slot to the spot kept in it (one saved card per day, so
saving a second card for a day releases the first) and `skips` lists the
spots skipped this weekend. A new week starts empty, which is how a skip
lasts one weekend. Reroll is the `seed` query parameter: the page steps it
and the unsaved slots move. Been is the visits route in `spots_routes.py`.

`didnt` lists the slots answered "Didn't" (`POST /plan/didnt`). `GET /plan`
also returns `asks`: `planner.did_you_go` over the last four plan rows and
the day visits, with `now` (injectable beside `today`) in Denver.

Admin only, at the router. Its own lock, for the job alone; the answers are
single-row upserts. Spec and plan:
docs/planning/2026-11-08-denver-spots-design.md.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import asdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal

import httpx2
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import planner
import weather
from items import require_admin
from models import OutingPrecision, Spot, SpotSetting, Visit, WeatherHour
from public import OWNER_TZ
from spots_schemas import ConstraintsOut, DidntOut, PlanOut, WeatherRunOut, WeekOut

logger = logging.getLogger(__name__)

STATUS_KEY = "weather.last_run"
CONSTRAINTS_KEY = "constraints"
# Forecast hours older than this are dropped on each run.
KEEP_PAST = timedelta(days=2)
RECENT_VISITS = 5
SlotKey = Literal["best", "new", "while"]
WEEK_PATTERN = r"^\d{4}-W\d{2}$"


class ConstraintsIn(BaseModel):
    """The pills. `max_miles` and `home_by` are off when null."""

    kid_along: bool = True
    bike_if_dry: bool = True
    max_miles: float | None = Field(default=None, gt=0, le=50)
    home_by: int | None = Field(default=None, ge=9, le=22)


class SaveIn(BaseModel):
    slot_key: SlotKey
    spot_id: uuid.UUID
    # The card's ISO date; null for "Either afternoon".
    day: date | None = None


class UnsaveIn(BaseModel):
    slot_key: SlotKey


class SkipIn(BaseModel):
    spot_id: uuid.UUID


class DidntIn(BaseModel):
    """Answers a slot "Didn't": `week` is the ISO week the slot was saved in."""

    week: str = Field(pattern=WEEK_PATTERN)
    slot: SlotKey


def week_key(today: date) -> str:
    """`plan:2026-W46` for the weekend ahead of `today`."""
    year, week, _ = planner.weekend_of(today)[0].isocalendar()
    return f"plan:{year}-W{week:02d}"


def _empty_week() -> dict[str, Any]:
    return {"saved": {}, "days": {}, "skips": [], "didnt": []}


def _owner_now() -> datetime:
    return datetime.now(OWNER_TZ)


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return False
    return True


def create_weekend_router(
    factory: async_sessionmaker[AsyncSession],
    http_client: Callable[[], httpx2.AsyncClient] | None = None,
    lock: asyncio.Lock | None = None,
    today: Callable[[], date] | None = None,
    now: Callable[[], datetime] | None = None,
) -> APIRouter:
    """`http_client` builds the client NWS is read with (main.py passes the
    catalogue's: NWS asks every caller for an identifying User-Agent);
    `now` is the owner's Denver moment (the Sunday-evening rule reads it) and
    `today` the Denver day, both injectable for tests. A request reads the
    clock once: with only `today` given, the moment is noon on that day;
    with neither, both come from one `_owner_now()`."""
    router = APIRouter(
        prefix="/api/spots",
        tags=["spots"],
        dependencies=[Depends(require_admin)],
    )

    def moment() -> datetime:
        if now is not None:
            return now()
        if today is not None:
            return datetime.combine(today(), time(12), OWNER_TZ)
        return _owner_now()

    def day_of(at: datetime) -> date:
        return today() if today is not None else at.date()

    run_lock = lock or asyncio.Lock()
    client_factory = http_client or httpx2.AsyncClient

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def _put(session: AsyncSession, key: str, value: Any) -> None:
        await session.execute(
            insert(SpotSetting)
            .values(key=key, value=value)
            .on_conflict_do_update(
                index_elements=[SpotSetting.key],
                set_={"value": value, "updated_at": func.now()},
            )
        )

    async def _get(session: AsyncSession, key: str) -> Any:
        row = await session.get(SpotSetting, key)
        return None if row is None else row.value

    def _clean_week(stored: Any) -> dict[str, Any]:
        week = _empty_week()
        if isinstance(stored, dict):
            for field, kind in (
                ("saved", dict),
                ("days", dict),
                ("skips", list),
                ("didnt", list),
            ):
                value = stored.get(field)
                if isinstance(value, kind):
                    week[field] = kind(value)
        return week

    async def _week(session: AsyncSession, key: str) -> dict[str, Any]:
        return _clean_week(await _get(session, key))

    def _release(week: dict[str, Any], slot: str) -> None:
        week["saved"].pop(slot, None)
        week["days"].pop(slot, None)
        # An answer belongs to what was in the slot; the next spot is asked.
        week["didnt"] = [s for s in week["didnt"] if s != slot]

    # --- the job ---------------------------------------------------------------

    async def run(session: AsyncSession) -> dict[str, Any]:
        now = datetime.now(UTC)
        try:
            async with client_factory() as client:
                gridpoint, payload = await weather.fetch_hourly(client)
        except weather.WeatherError as error:
            logger.warning("weather: %s", error)
            summary = {"at": now.isoformat(), "state": "failed", "note": str(error)}
            await _put(session, STATUS_KEY, summary)
            await session.commit()
            raise HTTPException(status_code=502, detail=str(error)) from error

        hours = weather.parse_periods(payload)
        if hours:
            rows = [
                {
                    "gridpoint": gridpoint,
                    "starts_at": h.starts_at,
                    "temp_f": h.temp_f,
                    "precip_pct": h.precip_pct,
                    "wind_mph": h.wind_mph,
                    "short": h.short,
                }
                for h in hours
            ]
            statement = insert(WeatherHour).values(rows)
            await session.execute(
                statement.on_conflict_do_update(
                    index_elements=[WeatherHour.gridpoint, WeatherHour.starts_at],
                    set_={
                        "temp_f": statement.excluded.temp_f,
                        "precip_pct": statement.excluded.precip_pct,
                        "wind_mph": statement.excluded.wind_mph,
                        "short": statement.excluded.short,
                        "fetched_at": func.now(),
                    },
                )
            )
        await session.execute(
            delete(WeatherHour).where(WeatherHour.starts_at < now - KEEP_PAST)
        )
        summary = {
            "at": now.isoformat(),
            "state": "ok" if hours else "empty",
            "gridpoint": gridpoint,
            "hours": len(hours),
        }
        await _put(session, STATUS_KEY, summary)
        await session.commit()
        logger.info("weather: %s", summary)
        return summary

    @router.post("/weather/refresh", response_model=WeatherRunOut)
    async def refresh_weather(
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """The nightly job. A second call while one runs is a 409."""
        if run_lock.locked():
            raise HTTPException(status_code=409, detail="A refresh is already running")
        async with run_lock:
            return await run(session)

    # --- the plan --------------------------------------------------------------

    async def _recent(session: AsyncSession) -> list[dict[str, Any]]:
        rows = await session.execute(
            select(Visit.id, Visit.spot_id, Spot.name, Visit.visited_on)
            .join(Spot, Spot.id == Visit.spot_id)
            .order_by(Visit.visited_on.desc(), Visit.created_at.desc())
            .limit(RECENT_VISITS)
        )
        return [
            {"id": str(i), "spot_id": str(s), "name": n, "visited_on": d.isoformat()}
            for i, s, n, d in rows
        ]

    async def _asks(session: AsyncSession, at: datetime) -> list[dict[str, Any]]:
        """The open "Did you go?" prompts, oldest first."""
        keys = [
            week_key(at.date() - timedelta(weeks=back))
            for back in range(planner.LOOK_BACK_WEEKS)
        ]
        stored = {
            row.key: row.value
            for row in (
                await session.scalars(
                    select(SpotSetting).where(SpotSetting.key.in_(keys))
                )
            ).all()
        }
        weeks = []
        for key in keys:
            week = _clean_week(stored.get(key))
            weeks.append({"week_key": key.removeprefix("plan:"), **week})
        # A pure optimisation: a slot older than the look-back is never read, so
        # an older visit could not change an ask. Not observable in a test.
        oldest = at.date() - timedelta(
            days=at.weekday(), weeks=planner.LOOK_BACK_WEEKS - 1
        )
        visits = (
            await session.execute(
                select(Visit.spot_id, Visit.visited_on).where(
                    Visit.precision == OutingPrecision.DAY,
                    Visit.visited_on >= oldest,
                )
            )
        ).all()
        found = planner.did_you_go(
            weeks, {(str(spot_id), on) for spot_id, on in visits}, at
        )
        spots = {
            str(s.id): s
            for s in (
                await session.scalars(
                    select(Spot).where(
                        Spot.id.in_(
                            [uuid.UUID(a.spot_id) for a in found if _is_uuid(a.spot_id)]
                        )
                    )
                )
            ).all()
        }
        return [
            {
                "week": a.week,
                "slot": a.slot,
                "spot_id": a.spot_id,
                "spot_name": spots[a.spot_id].name,
                "neighbourhood": spots[a.spot_id].neighbourhood,
                "day": a.day.isoformat(),
                "slot_label": planner.SLOT_LABELS[a.slot],
            }
            for a in found
            if a.spot_id in spots and a.slot in planner.SLOT_LABELS
        ]

    @router.get("/plan", response_model=PlanOut)
    async def get_plan(
        seed: int = Query(default=0, ge=0, le=10_000),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """The coming weekend: two day views and up to three suggestions."""
        at = moment()
        day = day_of(at)
        key = week_key(day)
        week = await _week(session, key)
        constraints_blob = await _get(session, CONSTRAINTS_KEY)
        constraints = planner.Constraints.from_blob(constraints_blob)

        spot_rows = (await session.scalars(select(Spot))).all()
        names = {str(s.id): s.name for s in spot_rows}
        visits = (await session.execute(select(Visit.spot_id, Visit.visited_on))).all()
        weekend = planner.weekend_of(day)
        hours = await weather.hours_for_day(session, weekend[0], weekend[-1])

        result = planner.plan(
            [
                planner.PlanSpot(
                    str(s.id), s.name, s.lat, s.lng, tuple(s.tags or []), s.anchor
                )
                for s in spot_rows
            ],
            [(str(spot_id), on) for spot_id, on in visits],
            hours,
            constraints,
            day,
            skips=week["skips"],
            pinned=week["saved"],
            seed=seed,
        )
        return {
            "today": day.isoformat(),
            "week": key.removeprefix("plan:"),
            "days": result.days,
            "suggestions": [asdict(s) for s in result.suggestions],
            "constraints": asdict(constraints),
            "skips": [
                {"spot_id": spot_id, "name": names[spot_id]}
                for spot_id in week["skips"]
                if spot_id in names
            ],
            "weather": await _get(session, STATUS_KEY),
            "recent_visits": await _recent(session),
            "asks": await _asks(session, at),
            "seed": seed,
        }

    @router.put("/constraints", response_model=ConstraintsOut)
    async def put_constraints(
        payload: ConstraintsIn, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Replaces the pills; they last until changed."""
        value = payload.model_dump()
        await _put(session, CONSTRAINTS_KEY, value)
        await session.commit()
        return asdict(planner.Constraints.from_blob(value))

    async def _spot(session: AsyncSession, spot_id: uuid.UUID) -> Spot:
        row = await session.get(Spot, spot_id)
        if row is None or row.anchor:
            raise HTTPException(status_code=404, detail="Spot not found")
        return row

    @router.post("/plan/save", response_model=WeekOut)
    async def save(
        payload: SaveIn, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Keeps a spot in its slot for this weekend. A day carries one
        plan, so another saved card on the same day is released, and a spot
        sits in one slot. Saving also lifts the spot's skip."""
        await _spot(session, payload.spot_id)
        key = week_key(day_of(moment()))
        week = await _week(session, key)
        target = str(payload.spot_id)
        day = payload.day.isoformat() if payload.day else None
        for slot in list(week["saved"]):
            if slot == payload.slot_key:
                continue
            same_day = day is not None and week["days"].get(slot) == day
            if same_day or week["saved"][slot] == target:
                _release(week, slot)
        # A new occupant is a new question; the same spot kept (say, with a
        # new day) keeps its answer.
        if week["saved"].get(payload.slot_key) != target:
            week["didnt"] = [s for s in week["didnt"] if s != payload.slot_key]
        week["saved"][payload.slot_key] = target
        if day is None:
            week["days"].pop(payload.slot_key, None)
        else:
            week["days"][payload.slot_key] = day
        week["skips"] = [s for s in week["skips"] if s != target]
        await _put(session, key, week)
        await session.commit()
        return week

    @router.post("/plan/unsave", response_model=WeekOut)
    async def unsave(
        payload: UnsaveIn, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        key = week_key(day_of(moment()))
        week = await _week(session, key)
        _release(week, payload.slot_key)
        await _put(session, key, week)
        await session.commit()
        return week

    async def _set_skip(
        session: AsyncSession, spot_id: uuid.UUID, skipped: bool
    ) -> dict[str, Any]:
        key = week_key(day_of(moment()))
        week = await _week(session, key)
        target = str(spot_id)
        week["skips"] = [s for s in week["skips"] if s != target]
        if skipped:
            week["skips"].append(target)
            for slot, held in list(week["saved"].items()):
                if held == target:
                    _release(week, slot)
        await _put(session, key, week)
        await session.commit()
        return week

    @router.post("/plan/skip", response_model=WeekOut)
    async def skip(
        payload: SkipIn, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Leaves a spot out of this weekend's plan; next weekend forgets."""
        await _spot(session, payload.spot_id)
        return await _set_skip(session, payload.spot_id, True)

    @router.post("/plan/unskip", response_model=WeekOut)
    async def unskip(
        payload: SkipIn, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Undo for Skip."""
        return await _set_skip(session, payload.spot_id, False)

    @router.post("/plan/didnt", response_model=DidntOut)
    async def didnt(
        payload: DidntIn, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Answers "Didn't" for a saved slot: it is not asked again. Safe to
        repeat. The slot has to be saved in that week's row (a week older
        than the look-back is written but never asked)."""
        key = f"plan:{payload.week}"
        if planner.parse_week(key) is None:
            raise HTTPException(status_code=422, detail="Not a week")
        week = await _week(session, key)
        if payload.slot not in week["saved"]:
            raise HTTPException(status_code=404, detail="Nothing saved there")
        if payload.slot not in week["didnt"]:
            week["didnt"].append(payload.slot)
            await _put(session, key, week)
            await session.commit()
        return {"asks": await _asks(session, moment())}

    return router
