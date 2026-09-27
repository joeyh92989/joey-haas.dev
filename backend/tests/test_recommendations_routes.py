"""Radar's routes, on a real Postgres, with a fake IGDB for lane 3."""

import asyncio
import dataclasses
from contextlib import asynccontextmanager
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from physical_support import edition, listing
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from models import (
    CatalogueGame,
    Item,
    ItemType,
    OwnedFormat,
    PhysicalEdition,
    PhysicalFormat,
    Recommendation,
    RecommendationStatus,
    StoreListing,
)
from physical_sources.catalogue import upsert_editions, upsert_listings
from recommendations_routes import create_recommendations_router
from sources.base import SourceError

pytestmark = pytest.mark.asyncio
TODAY = date.today()


class FakeUpcoming:
    """IGDB for lane 3: a fixed list of upcoming games, or an error."""

    def __init__(self, rows=None, error=None, configured=True):
        self.rows = rows or []
        self.error = error
        self._configured = configured

    def configured(self):
        return self._configured

    async def upcoming(self, platforms, now):
        if self.error is not None:
            raise self.error
        return [row for row in self.rows if row["platform_id"] in platforms]


def _upcoming(igdb_id, platform_id=508):
    return {
        "igdb_id": igdb_id,
        "title": f"Digital {igdb_id}",
        "cover_url": None,
        "platform_id": platform_id,
        "release_date": (TODAY + timedelta(days=90)).isoformat(),
        "release_precision": "day",
        "hypes": 30,
        "snapshot": {"genres": ["Puzzle"], "similar_games": [], "hypes": 30},
    }


@asynccontextmanager
async def radar_client(factory, igdb=None, lock=None, signed_in=True):
    app = FastAPI()
    app.include_router(
        create_recommendations_router(
            factory, {ItemType.GAME: igdb or FakeUpcoming()}, lock or asyncio.Lock()
        )
    )
    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver", timeout=60
    ) as client:
        yield client


async def _seed(factory):
    """A dated game (1), a pre-order (2) and a year-dated one (3), on Switch 2."""
    async with factory() as session:
        for igdb_id, title in ((1, "Dated"), (2, "Preorder"), (3, "Next Year")):
            session.add(
                CatalogueGame(
                    igdb_id=igdb_id,
                    title=title,
                    snapshot={"genres": ["Roguelike"], "similar_games": []},
                    hypes=20,
                )
            )
        await session.flush()
        await upsert_editions(
            session,
            [
                edition("Dated", release_date=TODAY + timedelta(days=30)),
                edition(
                    "Next Year",
                    release_date=date(TODAY.year + 1, 1, 1),
                    release_precision="year",
                ),
            ],
            "nscollectors",
            retire=True,
        )
        for igdb_id, title in ((1, "Dated"), (3, "Next Year")):
            for row in await session.scalars(
                select(PhysicalEdition).filter_by(title=title)
            ):
                row.igdb_id = igdb_id
        await upsert_listings(
            session,
            [
                dataclasses.replace(
                    listing("preorder", "p1"),
                    preorder_closes_at=TODAY + timedelta(days=10),
                )
            ],
            "super_rare",
            archive=True,
        )
        for row in await session.scalars(select(StoreListing)):
            row.igdb_id = 2
        await session.commit()


async def _rows(factory):
    async with factory() as session:
        return {
            row.external_id: row
            for row in await session.scalars(select(Recommendation))
        }


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/recommendations/generate"),
        ("get", "/api/recommendations?kind=radar"),
        ("get", "/api/recommendations/watching"),
        ("post", "/api/recommendations/00000000-0000-0000-0000-000000000000/watch"),
        ("post", "/api/recommendations/00000000-0000-0000-0000-000000000000/dismiss"),
        ("post", "/api/recommendations/00000000-0000-0000-0000-000000000000/skip"),
    ],
)
async def test_every_route_needs_the_admin(sessionmaker_for_test, method, path):
    async with radar_client(sessionmaker_for_test, signed_in=False) as client:
        response = await getattr(client, method)(path)
    assert response.status_code == 401


async def test_generate_fills_the_three_sections(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    igdb = FakeUpcoming([_upcoming(40), _upcoming(1)])
    async with radar_client(sessionmaker_for_test, igdb=igdb) as client:
        result = (
            await client.post("/api/recommendations/generate", json={"kind": "radar"})
        ).json()
        listed = (await client.get("/api/recommendations?kind=radar")).json()

    assert result["counts"] == {"suggested": 2, "dated_later": 1, "digital": 1}
    assert result["digital_error"] is None
    sections = listed["sections"]
    assert [row["title"] for row in sections["suggested"]][0] == "Preorder"
    assert [row["title"] for row in sections["dated_later"]] == ["Next Year"]
    assert [row["title"] for row in sections["digital"]] == ["Digital 40"]
    preorder = sections["suggested"][0]
    assert preorder["reasons"] and preorder["lane"] == "preorder"
    assert preorder["store_lines"][0]["store"] == "Super Rare Games"
    assert listed["generated_at"] is not None


async def test_a_lane_three_failure_keeps_lanes_one_and_two(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    igdb = FakeUpcoming(error=SourceError("igdb", "rate limited by IGDB"))
    async with radar_client(sessionmaker_for_test, igdb=igdb) as client:
        result = (
            await client.post("/api/recommendations/generate", json={"kind": "radar"})
        ).json()
    assert result["digital_error"] == "igdb: rate limited by IGDB"
    assert result["counts"]["suggested"] == 2


async def test_only_radar_can_be_generated_here(sessionmaker_for_test):
    async with radar_client(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/recommendations/generate", json={"kind": "discover"}
        )
    assert response.status_code == 422


async def test_generate_waits_for_no_one_during_a_refresh(sessionmaker_for_test):
    lock = asyncio.Lock()
    await lock.acquire()
    try:
        async with radar_client(sessionmaker_for_test, lock=lock) as client:
            response = await client.post(
                "/api/recommendations/generate", json={"kind": "radar"}
            )
    finally:
        lock.release()
    assert response.status_code == 409


async def test_a_regeneration_keeps_the_owners_answers(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        rows = await _rows(sessionmaker_for_test)
        await client.post(f"/api/recommendations/{rows['1'].id}/dismiss")
        await client.post(f"/api/recommendations/{rows['3'].id}/skip")
        hidden = (await client.get("/api/recommendations?kind=radar")).json()
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        again = await _rows(sessionmaker_for_test)

    shown = {row["title"] for rows_ in hidden["sections"].values() for row in rows_}
    assert shown == {"Preorder"}  # dismissed and skipped are both hidden
    assert again["1"].status == RecommendationStatus.DISMISSED
    assert again["3"].status == RecommendationStatus.PENDING  # skipped comes back
    assert again["2"].status == RecommendationStatus.PENDING


async def test_watch_adds_a_public_watched_item_once(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        rows = await _rows(sessionmaker_for_test)
        first = await client.post(f"/api/recommendations/{rows['1'].id}/watch")
        second = await client.post(f"/api/recommendations/{rows['1'].id}/watch")
        watching = (await client.get("/api/recommendations/watching")).json()
        regenerated = (
            await client.post("/api/recommendations/generate", json={"kind": "radar"})
        ).json()

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["detail"] == "Already on your shelf"
    async with sessionmaker_for_test() as session:
        (item,) = await session.scalars(select(Item))
    assert (item.owned_format, item.is_public, item.external_id) == (
        OwnedFormat.NONE,
        True,
        "1",
    )
    assert item.platform == "Nintendo Switch 2"
    assert item.physical_format == PhysicalFormat.GAME_CARD
    assert item.release_date == TODAY + timedelta(days=30)
    assert [row["item"]["title"] for row in watching] == ["Dated"]
    assert (await _rows(sessionmaker_for_test))[
        "1"
    ].status == RecommendationStatus.WANTED
    assert regenerated["counts"]["suggested"] == 1  # the watched game is out


async def test_an_unknown_suggestion_is_404(sessionmaker_for_test):
    async with radar_client(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/recommendations/00000000-0000-0000-0000-000000000000/skip"
        )
    assert response.status_code == 404
