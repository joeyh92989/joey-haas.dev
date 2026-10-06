"""The fingerprint cache in front of GET /api/public/next (#44; spec, D3).

A hit must not rebuild, and every input the body is built from must make
the next request rebuild. The writes go through the real admin routes where
one exists, because the point is that no write path slips past the
fingerprint, bulk statements included.
"""

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select, text
from starlette.middleware.sessions import SessionMiddleware

import public
from items import create_items_router
from models import (
    CatalogueRun,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalFormat,
    ReasonSource,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)
from physical_sources.stores import STORES
from public_next_cache import PublicNextCache, next_fingerprint
from public_outputs import load_public_next
from recommendations_routes import create_recommendations_router

pytestmark = pytest.mark.asyncio

NOW = datetime(2026, 9, 28, 15, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    """Freeze the public router's clock at NOW; call it to move the clock.

    The same shape as test_public_outputs.py's `clock`.
    """
    frozen = {"now": NOW}

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return frozen["now"].astimezone(tz) if tz else frozen["now"]

    monkeypatch.setattr(public, "datetime", FrozenDatetime)

    def move_to(when: datetime) -> None:
        frozen["now"] = when

    return move_to


class CountingBuild:
    """load_public_next, counting its calls."""

    def __init__(self, release: asyncio.Event | None = None) -> None:
        self.calls = 0
        self.release = release

    async def __call__(self, session, now):
        self.calls += 1
        if self.release is not None:
            await self.release.wait()
        return await load_public_next(session, now)


@pytest.fixture
def build(monkeypatch) -> CountingBuild:
    """The route's builder, counted. The route reads the module global at
    call time, so patching it here counts every build the route asks for."""
    counting = CountingBuild()
    monkeypatch.setattr(public, "load_public_next", counting)
    return counting


@asynccontextmanager
async def site_for(factory):
    """One app, so one cache, for the whole test: the public router and the
    admin routes whose writes must invalidate it, signed in."""
    app = FastAPI()
    app.include_router(public.create_public_router(factory))
    app.include_router(create_items_router(factory))
    app.include_router(
        create_recommendations_router(factory, {}, asyncio.Lock()),
    )

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def _game(title: str, **fields) -> Item:
    base = dict(
        id=uuid.uuid4(),
        type=ItemType.GAME,
        title=title,
        status=ItemStatus.BACKLOG,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        source_metadata={"genres": ["Roguelike", "Indie"]},
    )
    return Item(**{**base, **fields})


def _radar(title: str, **fields) -> Recommendation:
    base = dict(
        id=uuid.uuid4(),
        kind=RecommendationKind.RADAR,
        type=ItemType.GAME,
        title=title,
        external_source="igdb",
        external_id=title.lower().replace(" ", "-"),
        release_date=NOW.date() + timedelta(days=60),
        reason="Out in two months",
        reason_source=ReasonSource.TEMPLATE,
        score=50,
        batch_id=uuid.uuid4(),
        generated_at=NOW - timedelta(hours=1),
        status=RecommendationStatus.PENDING,
        platform_id=508,
        platform="Nintendo Switch 2",
        physical_format=PhysicalFormat.GAME_CARD,
        source_metadata={"release_precision": "day", "release_source": "registry"},
    )
    return Recommendation(**{**base, **fields})


async def _add(factory, *rows):
    async with factory() as session:
        session.add_all(rows)
        await session.commit()


def _titles(body: dict, key: str) -> list[str]:
    return [row["title"] for row in body[key]]


def _suggested(body: dict) -> list[str]:
    keys = ("buy_now", "preorders", "later", "not_on_cartridge")
    return sorted(title for key in keys for title in _titles(body, key))


@pytest_asyncio.fixture
async def seeded(sessionmaker_for_test):
    """A wanted game, an owned one, a second owned one, and two Radar rows of
    one batch: enough for each invalidation to show in the rebuilt body."""
    wanted = _game("Wanted Game", owned_format=OwnedFormat.NONE)
    owned = _game("Owned Game")
    other = _game("Other Game")
    batch = uuid.uuid4()
    first = _radar("First Cart", batch_id=batch)
    second = _radar("Second Cart", batch_id=batch)
    await _add(sessionmaker_for_test, wanted, owned, other, first, second)
    return {
        "wanted": wanted,
        "owned": owned,
        "other": other,
        "first": first,
        "second": second,
    }


async def _next(client) -> dict:
    response = await client.get("/api/public/next")
    assert response.status_code == 200
    return response.json()


async def _warm(client, build) -> dict:
    """Two requests, one build: the cache is warm before the write under test."""
    body = await _next(client)
    assert await _next(client) == body
    assert build.calls == 1
    return body


async def test_a_second_request_is_served_from_the_cache(
    sessionmaker_for_test, seeded, build
):
    async with site_for(sessionmaker_for_test) as client:
        first = await _next(client)
        second = await _next(client)

    assert build.calls == 1
    assert second == first
    assert _titles(first, "wanted") == ["Wanted Game"]


async def test_a_title_edit_rebuilds(sessionmaker_for_test, seeded, build):
    async with site_for(sessionmaker_for_test) as client:
        await _warm(client, build)
        edit = await client.patch(
            f"/api/items/{seeded['wanted'].id}", json={"title": "Renamed Game"}
        )
        assert edit.status_code == 200
        body = await _next(client)

    assert build.calls == 2
    assert _titles(body, "wanted") == ["Renamed Game"]


async def test_deleting_an_item_rebuilds(sessionmaker_for_test, seeded, build):
    async with site_for(sessionmaker_for_test) as client:
        await _warm(client, build)
        gone = await client.delete(f"/api/items/{seeded['wanted'].id}")
        assert gone.status_code == 204
        body = await _next(client)

    assert build.calls == 2
    assert body["wanted"] == []


async def test_unpublishing_and_publishing_in_bulk_rebuild(
    sessionmaker_for_test, seeded, build
):
    """The visibility route is one Core UPDATE, not an ORM flush."""
    wanted = str(seeded["wanted"].id)
    async with site_for(sessionmaker_for_test) as client:
        await _warm(client, build)
        hide = await client.post(
            "/api/items/visibility", json={"ids": [wanted], "is_public": False}
        )
        assert hide.json() == {"updated": 1}
        hidden = await _next(client)
        show = await client.post(
            "/api/items/visibility", json={"ids": [wanted], "is_public": True}
        )
        assert show.json() == {"updated": 1}
        shown = await _next(client)

    assert build.calls == 3
    assert hidden["wanted"] == []
    assert _titles(shown, "wanted") == ["Wanted Game"]


async def test_pinning_moving_the_pin_and_unpinning_rebuild(
    sessionmaker_for_test, seeded, build
):
    """Moving the pin clears the old one with a bulk UPDATE."""
    owned, other = seeded["owned"].id, seeded["other"].id
    async with site_for(sessionmaker_for_test) as client:
        before = await _warm(client, build)
        assert (await client.post(f"/api/items/{owned}/pin")).status_code == 200
        pinned = await _next(client)
        assert (await client.post(f"/api/items/{other}/pin")).status_code == 200
        moved = await _next(client)
        assert (await client.delete(f"/api/items/{other}/pin")).status_code == 200
        unpinned = await _next(client)

    assert build.calls == 4
    assert before["tonight"]["up_next"] is None
    assert pinned["tonight"]["up_next"]["title"] == "Owned Game"
    assert moved["tonight"]["up_next"]["title"] == "Other Game"
    assert unpinned["tonight"]["up_next"] is None


async def test_answering_a_suggestion_rebuilds(sessionmaker_for_test, seeded, build):
    async with site_for(sessionmaker_for_test) as client:
        await _warm(client, build)
        answer = await client.post(f"/api/recommendations/{seeded['first'].id}/dismiss")
        assert answer.status_code == 200
        await _next(client)

    assert build.calls == 2


async def test_a_new_generation_rebuilds(sessionmaker_for_test, seeded, build):
    async with site_for(sessionmaker_for_test) as client:
        before = await _warm(client, build)
        await _add(sessionmaker_for_test, _radar("Third Cart", generated_at=NOW))
        after = await _next(client)

    assert build.calls == 2
    assert "Third Cart" not in _suggested(before)
    assert "Third Cart" in _suggested(after)


async def test_a_catalogue_run_rebuilds(sessionmaker_for_test, seeded, build):
    async with site_for(sessionmaker_for_test) as client:
        before = await _warm(client, build)
        await _add(
            sessionmaker_for_test,
            *[
                CatalogueRun(
                    source=source,
                    started_at=NOW - timedelta(minutes=5),
                    finished_at=NOW - timedelta(minutes=1),
                    ok=True,
                )
                for source in STORES
            ],
        )
        after = await _next(client)

    assert build.calls == 2
    assert before["generated_at"]["catalogue"] is None
    assert after["generated_at"]["catalogue"] == NOW.date().isoformat()


async def test_the_next_utc_day_rebuilds(sessionmaker_for_test, seeded, build, clock):
    async with site_for(sessionmaker_for_test) as client:
        await _warm(client, build)
        clock(NOW + timedelta(hours=8))  # 23:00, the same UTC day
        await _next(client)
        clock(NOW + timedelta(hours=10))  # 01:00 the next day
        await _next(client)

    assert build.calls == 2


async def test_a_write_that_bypasses_updated_at_still_rebuilds(
    sessionmaker_for_test, seeded, build
):
    """onupdate is SQLAlchemy's, not the database's: SQL written by hand
    leaves updated_at alone, and the fingerprint must not depend on it."""
    async with site_for(sessionmaker_for_test) as client:
        await _warm(client, build)
        async with sessionmaker_for_test() as session:
            await session.execute(
                text("UPDATE items SET title = 'Hand Edited' WHERE id = :id"),
                {"id": seeded["wanted"].id},
            )
            await session.commit()
        body = await _next(client)

    assert build.calls == 2
    assert _titles(body, "wanted") == ["Hand Edited"]


async def test_an_earlier_transaction_committing_later_still_rebuilds(
    sessionmaker_for_test, seeded, build
):
    """updated_at is the transaction's start time, so commits can land out
    of order: max(updated_at) would not move when the earlier one commits."""
    async with site_for(sessionmaker_for_test) as client:
        async with sessionmaker_for_test() as slow:
            row = await slow.get(Item, seeded["wanted"].id)
            row.title = "Committed Late"
            await slow.flush()  # updated_at = now(), this transaction's start
            async with sessionmaker_for_test() as quick:
                other = await quick.get(Item, seeded["other"].id)
                other.rating = 9
                await quick.commit()  # a later updated_at, committed first
            await _warm(client, build)
            await slow.commit()
        async with sessionmaker_for_test() as check:
            stamps = dict(
                (await check.execute(select(Item.title, Item.updated_at))).all()
            )
        assert stamps["Committed Late"] < stamps["Other Game"]
        body = await _next(client)

    assert build.calls == 2
    assert _titles(body, "wanted") == ["Committed Late"]


async def test_concurrent_misses_build_once(sessionmaker_for_test, seeded):
    cache = PublicNextCache()
    release = asyncio.Event()
    counting = CountingBuild(release)

    async def request():
        async with sessionmaker_for_test() as session:
            return await cache.get(session, NOW, counting)

    both = asyncio.gather(request(), request())
    await asyncio.sleep(0.2)  # both fingerprints taken, one build waiting
    release.set()
    first, second = await both

    assert counting.calls == 1
    assert first is second


async def test_a_hit_does_not_wait_for_a_build_in_progress(
    sessionmaker_for_test, seeded
):
    """The lock guards the build alone: a request whose fingerprint matches
    the stored body is answered while another request rebuilds."""
    cache = PublicNextCache()
    warm = CountingBuild()
    async with sessionmaker_for_test() as session:
        today = await cache.get(session, NOW, warm)

    release = asyncio.Event()
    slow = CountingBuild(release)

    async def tomorrow():
        async with sessionmaker_for_test() as session:
            return await cache.get(session, NOW + timedelta(days=1), slow)

    rebuilding = asyncio.create_task(tomorrow())
    await asyncio.sleep(0.2)
    assert slow.calls == 1  # holding the lock, waiting on `release`
    async with sessionmaker_for_test() as session:
        hit = await asyncio.wait_for(cache.get(session, NOW, slow), timeout=2)
    release.set()
    await rebuilding

    assert hit is today
    assert slow.calls == 1


async def test_a_failed_build_is_not_cached(sessionmaker_for_test, seeded):
    cache = PublicNextCache()

    async def broken(session, now):
        raise RuntimeError("build failed")

    async with sessionmaker_for_test() as session:
        with pytest.raises(RuntimeError):
            await cache.get(session, NOW, broken)
        counting = CountingBuild()
        await cache.get(session, NOW, counting)

    assert counting.calls == 1


async def test_the_fingerprint_is_unchanged_by_reads(sessionmaker_for_test, seeded):
    async with sessionmaker_for_test() as session:
        before = await next_fingerprint(session, NOW)
        await load_public_next(session, NOW)
        after = await next_fingerprint(session, NOW)

    assert after == before
