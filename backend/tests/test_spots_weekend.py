"""The weekend planner's routes (spots_weekend_routes.py): weather job, plan,
answers and constraints.

Today is Wednesday 11 November 2026 in Denver, so the weekend is Saturday 14
and Sunday 15, ISO week 46.
"""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx2
import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

from models import Spot, SpotSetting, Visit, WeatherHour
from spots_weekend_routes import STATUS_KEY, create_weekend_router, week_key
from weather import DENVER_TZ

pytestmark = pytest.mark.asyncio

FIXTURES = Path(__file__).parent / "fixtures"
POINTS = json.loads((FIXTURES / "nws_points.json").read_text())
HOURLY = json.loads((FIXTURES / "nws_hourly.json").read_text())
WEDNESDAY = date(2026, 11, 11)
SATURDAY = date(2026, 11, 14)
SUNDAY = date(2026, 11, 15)
WEEK = "plan:2026-W46"


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
async def client_for(factory, *, http=None, lock=None, signed_in=True, today=None):
    app = FastAPI()
    app.include_router(
        create_weekend_router(
            factory,
            http_client=http or nws(),
            lock=lock,
            today=lambda: today or WEDNESDAY,
        )
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


async def _spots(factory):
    """Home, a park, a library and a cafe; ids by short name."""
    rows = {
        "home": Spot(name="Home", slug="home", lat=39.7392, lng=-104.9903, anchor=True),
        "park": Spot(
            name="City Park",
            slug="city-park",
            lat=39.7492,
            lng=-104.9903,
            tags=["park", "kid-ok", "bike-friendly"],
        ),
        "library": Spot(
            name="Central Library",
            slug="central-library",
            lat=39.7592,
            lng=-104.9903,
            tags=["rainy-day", "kid-ok"],
        ),
        "cafe": Spot(
            name="Corner Cafe",
            slug="corner-cafe",
            lat=39.7442,
            lng=-104.9903,
            tags=["coffee", "kid-ok"],
        ),
    }
    async with factory() as session:
        session.add_all(rows.values())
        await session.commit()
        return {k: str(v.id) for k, v in rows.items()}


async def _dry_weekend(factory, gridpoint="BOU/63,62"):
    """Saturday and Sunday, rideable 10a to 3p."""
    async with factory() as session:
        for day in (SATURDAY, SUNDAY):
            for at in range(24):
                ok = 10 <= at < 15
                session.add(
                    WeatherHour(
                        gridpoint=gridpoint,
                        starts_at=datetime(
                            day.year, day.month, day.day, at, tzinfo=DENVER_TZ
                        ),
                        temp_f=58 if ok else 40,
                        precip_pct=0,
                        wind_mph=5,
                        short="Sunny",
                    )
                )
        await session.commit()


async def _setting(factory, key):
    async with factory() as session:
        row = await session.get(SpotSetting, key)
        return None if row is None else row.value


async def test_the_week_key_is_the_weekend_s_iso_week():
    assert week_key(WEDNESDAY) == WEEK
    assert week_key(SUNDAY) == WEEK
    assert week_key(date(2026, 11, 16)) == "plan:2026-W47"
    assert week_key(date(2026, 12, 30)) == "plan:2026-W53"


# --- the weather job ----------------------------------------------------------


async def test_refresh_upserts_the_hours_and_records_the_run(sessionmaker_for_test):
    calls = []
    async with client_for(sessionmaker_for_test, http=nws(calls=calls)) as client:
        first = await client.post("/api/spots/weather/refresh")
        second = await client.post("/api/spots/weather/refresh")
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
        await client.post("/api/spots/weather/refresh")
    async with sessionmaker_for_test() as session:
        left = await session.scalar(
            select(func.count())
            .select_from(WeatherHour)
            .where(WeatherHour.gridpoint == "BOU/1,1")
        )
    assert left == 0


async def test_a_failed_refresh_is_a_502_and_recorded(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, http=nws(status=503)) as client:
        response = await client.post("/api/spots/weather/refresh")
    assert response.status_code == 502
    status = await _setting(sessionmaker_for_test, STATUS_KEY)
    assert status["state"] == "failed"
    assert "503" in status["note"]


async def test_a_second_refresh_while_one_runs_is_a_409(sessionmaker_for_test):
    lock = asyncio.Lock()
    await lock.acquire()
    try:
        async with client_for(sessionmaker_for_test, lock=lock) as client:
            response = await client.post("/api/spots/weather/refresh")
    finally:
        lock.release()
    assert response.status_code == 409


async def test_every_route_needs_the_admin(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        responses = [
            await client.post("/api/spots/weather/refresh"),
            await client.get("/api/spots/plan"),
            await client.put("/api/spots/constraints", json={}),
            await client.post("/api/spots/plan/unsave", json={"slot_key": "best"}),
        ]
    assert {r.status_code for r in responses} == {401}


# --- the plan -----------------------------------------------------------------


async def test_the_plan_reads_the_cached_weekend(sessionmaker_for_test):
    ids = await _spots(sessionmaker_for_test)
    await _dry_weekend(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        session.add(Visit(spot_id=ids["library"], visited_on=date(2026, 9, 1)))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/spots/plan")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["week"] == "2026-W46"
    assert [d["date"] for d in body["days"]] == ["2026-11-14", "2026-11-15"]
    assert body["days"][0]["verdict"]["text"] == "Ride window 10a–3p"
    slots = {s["slot_key"]: s for s in body["suggestions"]}
    assert slots["best"]["spot_id"] == ids["park"]
    assert slots["best"]["day"] == "2026-11-14"
    assert slots["while"]["spot_id"] == ids["library"]
    assert ids["home"] not in {s["spot_id"] for s in body["suggestions"]}
    assert body["constraints"]["kid_along"] is True
    assert body["recent_visits"] == [
        {
            "id": body["recent_visits"][0]["id"],
            "spot_id": ids["library"],
            "name": "Central Library",
            "visited_on": "2026-09-01",
        }
    ]
    assert body["skips"] == []


async def test_no_forecast_is_a_plan_not_an_error(sessionmaker_for_test):
    await _spots(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/spots/plan")).json()
    assert body["weather"] is None
    assert body["days"][0]["verdict"]["text"] == "No forecast for this day yet"
    assert body["suggestions"][0]["slot"] == "Snow day"


async def test_the_plan_reads_the_gridpoint_fetched_last(sessionmaker_for_test):
    await _spots(sessionmaker_for_test)
    await _dry_weekend(sessionmaker_for_test, gridpoint="OLD/1,1")
    async with sessionmaker_for_test() as session:
        await session.execute(
            WeatherHour.__table__.update().values(
                fetched_at=datetime.now(UTC) - timedelta(days=1)
            )
        )
        await session.commit()
    async with sessionmaker_for_test() as session:
        session.add(
            WeatherHour(
                gridpoint="NEW/2,2",
                starts_at=datetime(2026, 11, 14, 12, tzinfo=DENVER_TZ),
                temp_f=30,
                precip_pct=90,
                wind_mph=5,
                short="Snow",
            )
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/spots/plan")).json()
    assert len(body["days"][0]["hours"]) == 1


async def test_reroll_is_the_seed(sessionmaker_for_test):
    await _spots(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        session.add(
            Spot(
                name="Creek Trail",
                slug="creek-trail",
                lat=39.7692,
                lng=-104.9903,
                tags=["park", "kid-ok"],
            )
        )
        await session.commit()
    await _dry_weekend(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        picks = set()
        for seed in range(3):
            body = (await client.get(f"/api/spots/plan?seed={seed}")).json()
            assert body["seed"] == seed
            picks.add(body["suggestions"][0]["spot_id"])
        refused = await client.get("/api/spots/plan?seed=-1")
    assert len(picks) > 1
    assert refused.status_code == 422


# --- answers ------------------------------------------------------------------


async def test_a_saved_card_keeps_its_slot_through_a_reroll(sessionmaker_for_test):
    ids = await _spots(sessionmaker_for_test)
    await _dry_weekend(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        saved = await client.post(
            "/api/spots/plan/save",
            json={"slot_key": "best", "spot_id": ids["cafe"], "day": "2026-11-14"},
        )
        assert saved.status_code == 200, saved.text
        for seed in range(3):
            body = (await client.get(f"/api/spots/plan?seed={seed}")).json()
            best = body["suggestions"][0]
            assert (best["spot_id"], best["saved"]) == (ids["cafe"], True)
    stored = await _setting(sessionmaker_for_test, WEEK)
    assert stored["saved"] == {"best": ids["cafe"]}
    assert stored["days"] == {"best": "2026-11-14"}


async def test_one_saved_card_per_day(sessionmaker_for_test):
    ids = await _spots(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/spots/plan/save",
            json={"slot_key": "best", "spot_id": ids["park"], "day": "2026-11-14"},
        )
        await client.post(
            "/api/spots/plan/save",
            json={"slot_key": "new", "spot_id": ids["cafe"], "day": "2026-11-15"},
        )
        await client.post(
            "/api/spots/plan/save",
            json={"slot_key": "while", "spot_id": ids["library"], "day": "2026-11-14"},
        )
    stored = await _setting(sessionmaker_for_test, WEEK)
    assert stored["saved"] == {"new": ids["cafe"], "while": ids["library"]}


async def test_an_undated_save_releases_nothing(sessionmaker_for_test):
    ids = await _spots(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/spots/plan/save",
            json={"slot_key": "best", "spot_id": ids["park"], "day": "2026-11-14"},
        )
        await client.post(
            "/api/spots/plan/save",
            json={"slot_key": "while", "spot_id": ids["library"]},
        )
    stored = await _setting(sessionmaker_for_test, WEEK)
    assert stored["saved"] == {"best": ids["park"], "while": ids["library"]}
    assert stored["days"] == {"best": "2026-11-14"}


async def test_a_spot_sits_in_one_slot(sessionmaker_for_test):
    ids = await _spots(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/spots/plan/save", json={"slot_key": "best", "spot_id": ids["park"]}
        )
        await client.post(
            "/api/spots/plan/save", json={"slot_key": "new", "spot_id": ids["park"]}
        )
    assert (await _setting(sessionmaker_for_test, WEEK))["saved"] == {
        "new": ids["park"]
    }


async def test_unsave(sessionmaker_for_test):
    ids = await _spots(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/spots/plan/save",
            json={"slot_key": "best", "spot_id": ids["park"], "day": "2026-11-14"},
        )
        response = await client.post(
            "/api/spots/plan/unsave", json={"slot_key": "best"}
        )
    assert response.status_code == 200
    stored = await _setting(sessionmaker_for_test, WEEK)
    assert stored["saved"] == {} and stored["days"] == {}


async def test_saving_an_anchor_or_a_missing_spot_is_a_404(sessionmaker_for_test):
    ids = await _spots(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        home = await client.post(
            "/api/spots/plan/save", json={"slot_key": "best", "spot_id": ids["home"]}
        )
        gone = await client.post(
            "/api/spots/plan/skip",
            json={"spot_id": "00000000-0000-0000-0000-000000000000"},
        )
        bad_slot = await client.post(
            "/api/spots/plan/save", json={"slot_key": "nope", "spot_id": ids["park"]}
        )
    assert home.status_code == 404
    assert gone.status_code == 404
    assert bad_slot.status_code == 422


async def test_skip_lasts_the_weekend(sessionmaker_for_test):
    ids = await _spots(sessionmaker_for_test)
    await _dry_weekend(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/spots/plan/save", json={"slot_key": "best", "spot_id": ids["park"]}
        )
        skipped = await client.post(
            "/api/spots/plan/skip", json={"spot_id": ids["park"]}
        )
        assert skipped.status_code == 200
        body = (await client.get("/api/spots/plan")).json()
    assert ids["park"] not in {s["spot_id"] for s in body["suggestions"]}
    assert body["skips"] == [{"spot_id": ids["park"], "name": "City Park"}]
    stored = await _setting(sessionmaker_for_test, WEEK)
    assert stored["saved"] == {}  # skipping a saved spot releases it
    async with client_for(sessionmaker_for_test, today=date(2026, 11, 16)) as client:
        next_week = (await client.get("/api/spots/plan")).json()
    assert next_week["skips"] == []


async def test_unskip_and_save_both_lift_a_skip(sessionmaker_for_test):
    ids = await _spots(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/spots/plan/skip", json={"spot_id": ids["park"]})
        await client.post("/api/spots/plan/skip", json={"spot_id": ids["cafe"]})
        await client.post("/api/spots/plan/unskip", json={"spot_id": ids["park"]})
        await client.post(
            "/api/spots/plan/save", json={"slot_key": "new", "spot_id": ids["cafe"]}
        )
    assert (await _setting(sessionmaker_for_test, WEEK))["skips"] == []


async def test_a_malformed_stored_week_reads_as_empty(sessionmaker_for_test):
    await _spots(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        session.add(SpotSetting(key=WEEK, value={"saved": [1], "skips": "x"}))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/spots/plan")
    assert response.status_code == 200
    assert response.json()["skips"] == []


# --- constraints --------------------------------------------------------------


async def test_constraints_are_stored_and_read_by_the_plan(sessionmaker_for_test):
    await _spots(sessionmaker_for_test)
    await _dry_weekend(sessionmaker_for_test)
    pills = {"kid_along": False, "bike_if_dry": True, "max_miles": 1, "home_by": 13}
    async with client_for(sessionmaker_for_test) as client:
        put = await client.put("/api/spots/constraints", json=pills)
        body = (await client.get("/api/spots/plan")).json()
    assert put.status_code == 200
    assert put.json() == {**pills, "max_miles": 1.0}
    assert body["constraints"]["home_by"] == 13
    assert body["suggestions"][0]["reasons"][0].endswith("go at 10a, home by 1p.")


@pytest.mark.parametrize(
    "pills",
    [{"max_miles": 0}, {"max_miles": 51}, {"home_by": 8}, {"home_by": 23}],
)
async def test_out_of_range_constraints_are_refused(sessionmaker_for_test, pills):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.put("/api/spots/constraints", json=pills)
    assert response.status_code == 422
