"""The forecast job: `POST /api/weather/refresh`.

nightly.yml calls it through `items.JOB_ROUTES`. It reads NWS's hourly
forecast for downtown, upserts it into `weather_hours` by
`(gridpoint, starts_at)`, drops hours more than two days old, and stores a
summary in `closet_settings["weather.last_run"]`, which
`GET /api/closet/status` reads for the Jobs page. It is the only code that
reaches NWS; the Closet's Today reads the table (`weather.hours_for_day`).

A failed fetch answers 502 and keeps the last forecast. A second call while
one runs is a 409. Admin only, at the router.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx2
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import weather
from items import require_admin
from models import ClosetSetting, WeatherHour

logger = logging.getLogger(__name__)

STATUS_KEY = "weather.last_run"
KEEP_PAST = timedelta(days=2)


class WeatherRunOut(BaseModel):
    """`POST /weather/refresh`: the summary it also stores."""

    at: str
    state: str
    gridpoint: str
    hours: int


def create_weather_router(
    factory: async_sessionmaker[AsyncSession],
    http_client: Callable[[], httpx2.AsyncClient] | None = None,
    lock: asyncio.Lock | None = None,
) -> APIRouter:
    """`http_client` builds the client NWS is read with (main.py passes the
    catalogue's: NWS asks every caller for an identifying User-Agent)."""
    router = APIRouter(
        prefix="/api/weather",
        tags=["weather"],
        dependencies=[Depends(require_admin)],
    )
    run_lock = lock or asyncio.Lock()
    client_factory = http_client or httpx2.AsyncClient

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def _put(session: AsyncSession, value: Any) -> None:
        await session.execute(
            insert(ClosetSetting)
            .values(key=STATUS_KEY, value=value)
            .on_conflict_do_update(
                index_elements=[ClosetSetting.key],
                set_={"value": value, "updated_at": func.now()},
            )
        )

    async def run(session: AsyncSession) -> dict[str, Any]:
        now = datetime.now(UTC)
        try:
            async with client_factory() as client:
                gridpoint, payload = await weather.fetch_hourly(client)
        except weather.WeatherError as error:
            logger.warning("weather: %s", error)
            summary = {"at": now.isoformat(), "state": "failed", "note": str(error)}
            await _put(session, summary)
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
        await _put(session, summary)
        await session.commit()
        logger.info("weather: %s", summary)
        return summary

    @router.post("/refresh", response_model=WeatherRunOut)
    async def refresh_weather(
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """The nightly job. A second call while one runs is a 409."""
        if run_lock.locked():
            raise HTTPException(status_code=409, detail="A refresh is already running")
        async with run_lock:
            return await run(session)

    return router
