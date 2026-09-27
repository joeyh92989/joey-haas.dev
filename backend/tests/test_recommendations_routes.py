"""Radar's routes, on a real Postgres, with a fake IGDB for lane 3."""

import asyncio
import dataclasses
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from physical_support import edition, listing
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from models import (
    CatalogueGame,
    CatalogueRun,
    Item,
    ItemType,
    OwnedFormat,
    PhysicalEdition,
    PhysicalFormat,
    ReasonSource,
    Recommendation,
    RecommendationKind,
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
        ("post", "/api/recommendations/00000000-0000-0000-0000-000000000000/want"),
        ("post", "/api/recommendations/00000000-0000-0000-0000-000000000000/own"),
        ("get", "/api/recommendations?kind=discover"),
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


async def test_unknown_kinds_and_radar_on_n64_are_refused(sessionmaker_for_test):
    async with radar_client(sessionmaker_for_test) as client:
        films = await client.post(
            "/api/recommendations/generate", json={"kind": "films"}
        )
        n64 = await client.post(
            "/api/recommendations/generate", json={"kind": "radar", "platforms": [4]}
        )
    assert films.status_code == 422
    assert n64.status_code == 422


async def test_generate_waits_for_no_one_during_a_refresh(sessionmaker_for_test):
    lock = asyncio.Lock()
    await lock.acquire()
    try:
        async with radar_client(sessionmaker_for_test, lock=lock) as client:
            # A generate that waited for the lock would hang: fail fast instead.
            response = await asyncio.wait_for(
                client.post("/api/recommendations/generate", json={"kind": "radar"}),
                timeout=10,
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


async def test_want_adds_a_public_wanted_item_once(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        rows = await _rows(sessionmaker_for_test)
        first = await client.post(f"/api/recommendations/{rows['1'].id}/want")
        second = await client.post(f"/api/recommendations/{rows['1'].id}/want")
        watching = (await client.get("/api/recommendations/watching")).json()
        regenerated = (
            await client.post("/api/recommendations/generate", json={"kind": "radar"})
        ).json()

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["detail"] == "Already answered (wanted)"
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


async def test_the_list_says_whether_it_is_ranked_by_taste(sessionmaker_for_test):
    async with radar_client(sessionmaker_for_test) as client:
        empty = (await client.get("/api/recommendations?kind=radar")).json()
    async with sessionmaker_for_test() as session:
        session.add(
            Item(
                type=ItemType.GAME,
                title="Loved",
                status="finished",
                favorite=True,
                owned_format=OwnedFormat.PHYSICAL,
                platform_id=508,
            )
        )
        await session.commit()
    async with radar_client(sessionmaker_for_test) as client:
        loved = (await client.get("/api/recommendations?kind=radar")).json()
    assert (empty["personalised"], loved["personalised"]) == (False, True)


async def test_a_settled_answer_is_not_undone_by_a_stale_press(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        rows = await _rows(sessionmaker_for_test)
        await client.post(f"/api/recommendations/{rows['1'].id}/dismiss")
        skip = await client.post(f"/api/recommendations/{rows['1'].id}/skip")
        watch = await client.post(f"/api/recommendations/{rows['1'].id}/want")
        await client.post(f"/api/recommendations/{rows['3'].id}/skip")
        skip_again = await client.post(f"/api/recommendations/{rows['3'].id}/skip")
        dismiss_skipped = await client.post(
            f"/api/recommendations/{rows['3'].id}/dismiss"
        )
    assert (skip.status_code, watch.status_code) == (409, 409)
    assert skip.json()["detail"] == "Already answered (dismissed)"
    assert (skip_again.status_code, dismiss_skipped.status_code) == (409, 200)
    after = await _rows(sessionmaker_for_test)
    assert after["1"].status == RecommendationStatus.DISMISSED


async def test_platforms_are_radars_only_and_a_subset_keeps_the_rest(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        bad = await client.post(
            "/api/recommendations/generate",
            json={"kind": "radar", "platforms": [99999]},
        )
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        before = set(await _rows(sessionmaker_for_test))
        await client.post(
            "/api/recommendations/generate", json={"kind": "radar", "platforms": [130]}
        )
    assert bad.status_code == 422
    assert set(await _rows(sessionmaker_for_test)) == before  # Switch 2 rows kept


async def test_an_unreadable_lane_three_keeps_lanes_one_and_two(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    igdb = FakeUpcoming(error=ValueError("not JSON"))
    async with radar_client(sessionmaker_for_test, igdb=igdb) as client:
        result = (
            await client.post("/api/recommendations/generate", json={"kind": "radar"})
        ).json()
    assert result["digital_error"] == "IGDB answer could not be read (ValueError)"
    assert result["counts"]["suggested"] == 2


async def test_a_game_that_leaves_the_pool_leaves_radar(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        async with sessionmaker_for_test() as session:
            for row in await session.scalars(
                select(PhysicalEdition).filter_by(title="Dated")
            ):
                row.release_date = date(2020, 1, 1)
            await session.commit()
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
    assert "1" not in await _rows(sessionmaker_for_test)


async def test_answering_everything_keeps_the_generation_time(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        for row in (await _rows(sessionmaker_for_test)).values():
            await client.post(f"/api/recommendations/{row.id}/skip")
        listed = (await client.get("/api/recommendations?kind=radar")).json()
    assert listed["generated_at"] is not None
    assert all(not rows for rows in listed["sections"].values())


async def test_a_format_only_a_store_claims_is_not_recorded_on_want(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        session.add(CatalogueGame(igdb_id=50, title="Store Only", snapshot={}))
        await session.flush()
        await upsert_listings(
            session,
            [
                dataclasses.replace(
                    listing("store only", "s1"),
                    preorder_closes_at=TODAY + timedelta(days=5),
                    format_hint="game_card",
                    format_tier="store_text",
                )
            ],
            "super_rare",
            archive=True,
        )
        for row in await session.scalars(select(StoreListing)):
            row.igdb_id = 50
        await session.commit()
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        row = (await _rows(sessionmaker_for_test))["50"]
        await client.post(f"/api/recommendations/{row.id}/want")
    assert row.physical_format == PhysicalFormat.GAME_CARD
    async with sessionmaker_for_test() as session:
        (item,) = await session.scalars(select(Item))
    assert (item.physical_format, item.format_source) == (None, None)


async def test_watching_a_game_added_by_hand_is_409(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        async with sessionmaker_for_test() as session:
            session.add(
                Item(
                    type=ItemType.GAME,
                    title="Dated",
                    status="backlog",
                    external_source="igdb",
                    external_id="1",
                    owned_format=OwnedFormat.PHYSICAL,
                )
            )
            await session.commit()
        row = (await _rows(sessionmaker_for_test))["1"]
        response = await client.post(f"/api/recommendations/{row.id}/want")
    assert response.status_code == 409
    assert response.json()["detail"] == "Already on your shelf"


async def test_a_wanted_game_cannot_be_dismissed_but_a_skipped_one_can_be_wanted(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        rows = await _rows(sessionmaker_for_test)
        await client.post(f"/api/recommendations/{rows['1'].id}/want")
        dismiss_watched = await client.post(
            f"/api/recommendations/{rows['1'].id}/dismiss"
        )
        await client.post(f"/api/recommendations/{rows['3'].id}/skip")
        watch_skipped = await client.post(f"/api/recommendations/{rows['3'].id}/want")
    assert (dismiss_watched.status_code, watch_skipped.status_code) == (409, 201)


async def test_a_platform_left_out_of_the_default_loses_its_stale_rows(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        session.add(
            Item(
                type=ItemType.GAME,
                title="Mine",
                status="backlog",
                owned_format=OwnedFormat.PHYSICAL,
                platform_id=508,
            )
        )
        session.add(
            Recommendation(
                kind=RecommendationKind.RADAR,
                type=ItemType.GAME,
                title="Old Switch Row",
                external_source="igdb",
                external_id="777",
                reason_source=ReasonSource.TEMPLATE,
                score=10,
                batch_id=uuid.uuid4(),
                status=RecommendationStatus.PENDING,
                platform_id=130,
            )
        )
        await session.commit()
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
    assert "777" not in await _rows(sessionmaker_for_test)


async def test_the_catalogue_age_is_the_stalest_stores_last_good_run(
    sessionmaker_for_test,
):
    old = datetime(2026, 9, 1, tzinfo=UTC)
    newer = datetime(2026, 9, 20, tzinfo=UTC)
    async with sessionmaker_for_test() as session:
        session.add_all(
            [
                CatalogueRun(source="super_rare", ok=True, finished_at=newer),
                CatalogueRun(source="nicalis", ok=True, finished_at=old),
                CatalogueRun(
                    source="nicalis",
                    ok=False,
                    finished_at=newer + timedelta(days=1),
                ),
            ]
        )
        await session.commit()
    async with radar_client(sessionmaker_for_test) as client:
        listed = (await client.get("/api/recommendations?kind=radar")).json()
    assert listed["catalogue"]["stores_at"].startswith("2026-09-01")


async def test_already_own_adds_a_private_owned_item(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        await client.post("/api/recommendations/generate", json={"kind": "radar"})
        rows = await _rows(sessionmaker_for_test)
        first = await client.post(f"/api/recommendations/{rows['1'].id}/own")
        again = await client.post(f"/api/recommendations/{rows['1'].id}/own")
        await client.post(f"/api/recommendations/{rows['3'].id}/dismiss")
        own_dismissed = await client.post(f"/api/recommendations/{rows['3'].id}/own")
        regenerated = (
            await client.post("/api/recommendations/generate", json={"kind": "radar"})
        ).json()
    assert (first.status_code, again.status_code, own_dismissed.status_code) == (
        201,
        409,
        409,
    )
    async with sessionmaker_for_test() as session:
        (item,) = await session.scalars(select(Item))
    assert (item.owned_format, item.is_public, item.status.value) == (
        OwnedFormat.PHYSICAL,
        False,
        "backlog",
    )
    assert (await _rows(sessionmaker_for_test))[
        "1"
    ].status == RecommendationStatus.OWNED
    assert regenerated["counts"]["suggested"] == 1  # owned and dismissed are out
