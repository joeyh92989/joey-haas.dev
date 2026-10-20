"""The beacon, the admin read and the rollup (analytics_routes.py)."""

import json
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from analytics_routes import (
    SummaryCache,
    _read_capped,
    create_analytics_router,
    create_track_router,
)
from models import DailyStat, PageView
from origin_check import add_origin_check

pytestmark = pytest.mark.asyncio

SITE = "https://joey-haas.dev"
SECRET = "test-session-secret"
IP = "203.0.113.7"
UA = "Mozilla/5.0 (Macintosh) Test"
ITEM = "/spine/0b7c6f3e-1111-4c1c-9a50-000000000001/"


class Clock:
    """A settable now(), so a test can move to the next UTC day."""

    def __init__(self, at: datetime) -> None:
        self.at = at

    def __call__(self) -> datetime:
        return self.at


@asynccontextmanager
async def client_for(factory, clock=None, signed_in=False, cache=None):
    clock = clock or Clock(datetime(2026, 10, 20, 12, tzinfo=UTC))
    app = FastAPI()
    app.include_router(create_track_router(factory, SECRET, now=clock))
    app.include_router(create_analytics_router(factory, now=clock, cache=cache))
    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    add_origin_check(app, [SITE])
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def beacon(path="/", ref="", device="desktop", ip=IP, ua=UA, **headers):
    """A request as sendBeacon makes it: a text/plain JSON string."""
    return {
        "content": json.dumps({"path": path, "ref": ref, "device": device}),
        "headers": {
            "content-type": "text/plain;charset=UTF-8",
            "origin": SITE,
            "cf-connecting-ip": ip,
            "user-agent": ua,
            **headers,
        },
    }


async def rows(factory) -> list[PageView]:
    async with factory() as session:
        return list((await session.scalars(select(PageView))).all())


# --- POST /api/track. ------------------------------------------------------


async def test_two_views_from_one_client_are_one_visitor(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        first = await client.post("/api/track", **beacon("/"))
        second = await client.post("/api/track", **beacon("/about/"))
    assert (first.status_code, second.status_code) == (204, 204)
    stored = await rows(sessionmaker_for_test)
    assert [row.path for row in stored] == ["/", "/about"]
    assert len({row.visitor_hash for row in stored}) == 1
    assert {row.day for row in stored} == {date(2026, 10, 20)}


async def test_the_same_client_the_next_day_is_a_new_visitor(sessionmaker_for_test):
    clock = Clock(datetime(2026, 10, 20, 23, 59, tzinfo=UTC))
    async with client_for(sessionmaker_for_test, clock) as client:
        await client.post("/api/track", **beacon())
        clock.at += timedelta(minutes=2)
        await client.post("/api/track", **beacon())
    stored = await rows(sessionmaker_for_test)
    assert len({row.visitor_hash for row in stored}) == 2


async def test_the_stored_row_holds_no_ip_and_no_user_agent(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/track", **beacon(ITEM, ref="News.Example.com"))
    (row,) = await rows(sessionmaker_for_test)
    stored = " ".join(
        str(getattr(row, column)) for column in PageView.__table__.columns.keys()
    )
    assert IP not in stored and "203.0.113" not in stored
    assert "Mozilla" not in stored and "Macintosh" not in stored
    assert row.path == ITEM.rstrip("/")
    assert row.referrer_host == "news.example.com"


async def test_a_spoofed_forwarded_for_does_not_split_a_visitor(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/track", **beacon(**{"x-forwarded-for": "1.1.1.1"}))
        await client.post("/api/track", **beacon(**{"x-forwarded-for": "2.2.2.2"}))
    stored = await rows(sessionmaker_for_test)
    assert len({row.visitor_hash for row in stored}) == 1


@pytest.mark.parametrize(
    "request_args",
    [
        beacon("/admin"),
        beacon(device="fridge"),
        beacon(ref="https://x.com/"),
        {"content": "not json", "headers": {"origin": SITE}},
        {"content": "x" * 2000, "headers": {"origin": SITE}},
        beacon(**{"sec-gpc": "1"}),
        beacon(dnt="1"),
    ],
)
async def test_a_bad_or_opted_out_view_is_dropped_with_a_204(
    sessionmaker_for_test, request_args
):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/track", **request_args)
    assert response.status_code == 204
    assert response.content == b""
    assert await rows(sessionmaker_for_test) == []


async def test_the_track_route_needs_no_session(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/track", **beacon())
    assert response.status_code == 204
    assert len(await rows(sessionmaker_for_test)) == 1


async def test_the_admin_is_not_counted(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        response = await client.post("/api/track", **beacon())
    assert response.status_code == 204
    assert await rows(sessionmaker_for_test) == []


async def test_a_foreign_origin_is_refused(sessionmaker_for_test):
    args = beacon()
    args["headers"]["origin"] = "https://evil.example"
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/track", **args)
    assert response.status_code == 403
    assert await rows(sessionmaker_for_test) == []


async def test_one_ip_counts_100_views_a_day_whatever_its_user_agent(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        for n in range(101):
            await client.post("/api/track", **beacon(ua=f"bot {n}"))
        other = await client.post("/api/track", **beacon(ip="198.51.100.1"))
    assert other.status_code == 204
    assert len(await rows(sessionmaker_for_test)) == 101


async def test_the_body_is_read_no_further_than_the_cap():
    pulled = []

    class Streaming:
        async def stream(self):
            for n in range(100):
                pulled.append(n)
                yield b"x" * 512

    assert await _read_capped(Streaming()) is None
    assert len(pulled) == 3


async def test_a_database_failure_still_answers_204():
    def broken():
        raise RuntimeError("no database")

    async with client_for(broken) as client:
        response = await client.post("/api/track", **beacon())
    assert response.status_code == 204


# --- GET /api/analytics and POST /api/analytics/rollup. --------------------


async def test_the_read_and_the_rollup_need_a_session(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        read = await client.get("/api/analytics")
        rollup = await client.post("/api/analytics/rollup", headers={"origin": SITE})
    assert (read.status_code, rollup.status_code) == (401, 401)


async def test_an_empty_read_is_all_zeros_with_the_launch_date(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        response = await client.get("/api/analytics?range=7d")
        default = await client.get("/api/analytics")
        everything = await client.get("/api/analytics?range=all")
        bad = await client.get("/api/analytics?range=1y")
    body = response.json()
    assert response.status_code == 200
    assert body["range"] == "7d"
    assert (body["views"], body["visitors"], body["best_day"]) == (0, 0, None)
    assert len(body["series"]) == 7
    assert body["live_since"] == "2026-10-19"
    assert (default.json()["range"], len(default.json()["series"])) == ("30d", 30)
    assert everything.json()["start"] == "2026-10-19"
    assert bad.status_code == 422


async def _view(factory, day, path="/", ref=None, device="desktop", visitor="v"):
    async with factory() as session:
        session.add(
            PageView(
                day=day,
                path=path,
                referrer_host=ref,
                device=device,
                visitor_hash=visitor,
            )
        )
        await session.commit()


async def test_the_rollup_matches_the_raw_counts_and_drops_old_rows(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    today = date(2026, 10, 20)
    yesterday = today - timedelta(days=1)
    old = today - timedelta(days=91)
    for visitor, path in (("a", "/"), ("a", "/about"), ("b", "/")):
        await _view(factory, yesterday, path=path, visitor=visitor)
    await _view(factory, old, visitor="z")
    await _view(factory, today, visitor="c")

    clock = Clock(datetime(2026, 10, 20, 0, 17, tzinfo=UTC))
    async with client_for(factory, clock, signed_in=True) as client:
        before = (await client.get("/api/analytics?range=7d")).json()
        first = await client.post("/api/analytics/rollup", headers={"origin": SITE})
        again = await client.post("/api/analytics/rollup", headers={"origin": SITE})
        after = (await client.get("/api/analytics?range=7d")).json()

    assert first.json() == {"days": 2, "deleted": 1}
    assert again.json() == {"days": 1, "deleted": 0}
    async with factory() as session:
        stats = {
            (row.day, row.dimension, row.value): (row.views, row.visitors)
            for row in (await session.scalars(select(DailyStat))).all()
        }
    # Views and visitors both equal the raw counts for the day.
    assert stats[(yesterday, "total", "")] == (3, 2)
    assert stats[(yesterday, "path", "/")] == (2, 2)
    # The old day's rollup outlives its raw rows; today is never rolled up.
    assert stats[(old, "total", "")] == (1, 1)
    assert not any(day == today for day, _, _ in stats)
    remaining = {row.day for row in await rows(factory)}
    assert remaining == {yesterday, today}
    # The read says the same before and after: raw rows stand in until then.
    for body in (before, after):
        assert (body["views"], body["visitors"]) == (4, 3)


async def test_the_read_is_cached_for_a_minute():
    ticks = iter([0.0, 30.0, 61.0])
    cache = SummaryCache(clock=lambda: next(ticks))
    builds = []

    async def build():
        builds.append(1)
        return {"n": len(builds)}

    assert await cache.get("7d", build) == {"n": 1}
    assert await cache.get("7d", build) == {"n": 1}
    assert await cache.get("7d", build) == {"n": 2}


async def test_a_rollup_clears_the_cached_read(sessionmaker_for_test):
    factory = sessionmaker_for_test
    yesterday = date(2026, 10, 19)
    await _view(factory, yesterday, visitor="a")
    clock = Clock(datetime(2026, 10, 20, 0, 17, tzinfo=UTC))
    # A clock that never moves: only the rollup's clear can refresh the read.
    cache = SummaryCache(clock=lambda: 0.0)
    async with client_for(factory, clock, signed_in=True, cache=cache) as client:
        before = (await client.get("/api/analytics?range=7d")).json()
        await _view(factory, yesterday, visitor="b")
        await client.post("/api/analytics/rollup", headers={"origin": SITE})
        after = (await client.get("/api/analytics?range=7d")).json()
    # Yesterday is now rolled up with its raw rows kept: counted once.
    assert (before["views"], after["views"]) == (1, 2)
    assert after["visitors"] == 2
