"""The forecast job (weather_routes.py): `POST /api/weather/refresh`.

The recorded NWS answers are in fixtures/nws_points.json and nws_hourly.json
(9 to 15 November 2026).
"""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx2
import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

import weather_routes
from models import ClosetSetting, WeatherHour
from weather_routes import STATUS_KEY, create_weather_router

pytestmark = pytest.mark.asyncio

FIXTURES = Path(__file__).parent / "fixtures"
POINTS = json.loads((FIXTURES / "nws_points.json").read_text())
HOURLY = json.loads((FIXTURES / "nws_hourly.json").read_text())
# An instant inside the recorded forecast (9 to 15 November 2026), so the job's
# two-day drop keeps every recorded hour.
RECORDED_WEEK = datetime(2026, 11, 11, 12, 0, tzinfo=UTC)


def nws(status=200, calls=None):
    """A client factory answering /points, then the hourly forecast."""

    def handler(request):
        if calls is not None:
            calls.append(request)
        if status != 200:
            return httpx2.Response(status, text="no")
        if "/points/" in str(request.url):
            return httpx2.Response(200, json=POINTS)
        return httpx2.Response(200, json=HOURLY)

    return lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(handler))


@asynccontextmanager
async def client_for(factory, *, http=None, lock=None, signed_in=True):
    app = FastAPI()
    app.include_router(
        create_weather_router(factory, http_client=http or nws(), lock=lock)
    )
    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def _setting(factory, key):
    async with factory() as session:
        row = await session.get(ClosetSetting, key)
        return None if row is None else row.value


# --- the weather job ----------------------------------------------------------


class _FrozenDatetime(datetime):
    """`datetime` whose `now()` is a fixed instant inside the recording's week."""

    @classmethod
    def now(cls, tz=None):
        return RECORDED_WEEK if tz is None else RECORDED_WEEK.astimezone(tz)


async def test_refresh_upserts_the_hours_and_records_the_run(
    sessionmaker_for_test, monkeypatch
):
    # The job drops hours more than two days before now, and the recording ends
    # on 15 November 2026, so on the real clock this test fails for good two
    # days after that. Freeze the job's clock inside the recorded week.
    monkeypatch.setattr(weather_routes, "datetime", _FrozenDatetime)
    calls = []
    async with client_for(sessionmaker_for_test, http=nws(calls=calls)) as client:
        first = await client.post("/api/weather/refresh")
        second = await client.post("/api/weather/refresh")
    assert first.status_code == 200, first.text
    body = first.json()
    periods = len(HOURLY["properties"]["periods"])
    assert body["state"] == "ok" and body["hours"] == periods
    assert body["gridpoint"].startswith(POINTS["properties"]["gridId"] + "/")
    assert second.status_code == 200
    assert len(calls) == 4  # points + hourly, twice
    async with sessionmaker_for_test() as session:
        count = await session.scalar(select(func.count()).select_from(WeatherHour))
    # The recording is days old, so its earliest hours may already be dropped;
    # the second run upserted rather than duplicating.
    assert 0 < count <= periods
    assert (await _setting(sessionmaker_for_test, STATUS_KEY))["state"] == "ok"


async def test_refresh_drops_hours_more_than_two_days_old(sessionmaker_for_test):
    old = datetime.now(UTC) - timedelta(days=3)
    async with sessionmaker_for_test() as session:
        session.add(
            WeatherHour(
                gridpoint="BOU/1,1",
                starts_at=old,
                temp_f=50,
                precip_pct=0,
                wind_mph=1,
                short="x",
            )
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/weather/refresh")
    async with sessionmaker_for_test() as session:
        left = await session.scalar(
            select(func.count())
            .select_from(WeatherHour)
            .where(WeatherHour.gridpoint == "BOU/1,1")
        )
    assert left == 0


async def test_a_failed_refresh_is_a_502_and_recorded(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, http=nws(status=503)) as client:
        response = await client.post("/api/weather/refresh")
    assert response.status_code == 502
    status = await _setting(sessionmaker_for_test, STATUS_KEY)
    assert status["state"] == "failed"
    assert "503" in status["note"]


async def test_a_second_refresh_while_one_runs_is_a_409(sessionmaker_for_test):
    lock = asyncio.Lock()
    await lock.acquire()
    try:
        async with client_for(sessionmaker_for_test, lock=lock) as client:
            response = await client.post("/api/weather/refresh")
    finally:
        lock.release()
    assert response.status_code == 409


async def test_the_route_needs_the_admin(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.post("/api/weather/refresh")
    assert response.status_code == 401
