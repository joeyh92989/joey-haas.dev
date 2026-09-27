"""Discover's routes, on a real Postgres, with a fake model provider."""

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from physical_support import edition
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from llm import LLMError
from models import (
    CatalogueGame,
    Item,
    ItemType,
    OwnedFormat,
    PhysicalEdition,
    ReasonSource,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)
from physical_sources.catalogue import upsert_editions
from recommendations_routes import create_recommendations_router

pytestmark = pytest.mark.asyncio
TODAY = date.today()


class FakeProvider:
    """The model: a fixed answer or an error, recording each prompt."""

    def __init__(self, payload=None, raises=None):
        self._payload = payload
        self._raises = raises
        self.prompts: list[str] = []

    async def complete_json(self, prompt, schema, images=None):
        self.prompts.append(prompt)
        if self._raises:
            raise self._raises
        return self._payload


class FakeIgdb:
    """Radar's lane 3; Discover never calls it."""

    def configured(self):
        return False

    async def upcoming(self, platforms, now):
        return []


@asynccontextmanager
async def discover_client(factory, provider=None, no_provider=False):
    app = FastAPI()
    app.include_router(
        create_recommendations_router(
            factory,
            {ItemType.GAME: FakeIgdb()},
            asyncio.Lock(),
            provider_factory=None if no_provider else (lambda: provider),
        )
    )

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver", timeout=60
    ) as client:
        yield client


GAMES = {
    # igdb_id: (title, release date, platform)
    1: ("Released A", TODAY - timedelta(days=400), 508),
    2: ("Released B", TODAY - timedelta(days=30), 508),
    3: ("Released C", TODAY - timedelta(days=2000), 130),
    4: ("Coming Soon", TODAY + timedelta(days=60), 508),
    5: ("Owned Already", TODAY - timedelta(days=100), 508),
}


async def _seed(factory):
    """Four released games, one upcoming, and a favourite the owner owns."""
    async with factory() as session:
        for igdb_id, (title, _, _) in GAMES.items():
            session.add(
                CatalogueGame(
                    igdb_id=igdb_id,
                    title=title,
                    snapshot={
                        "genres": ["Roguelike"],
                        "similar_games": [],
                        "community_score": 80,
                        "community_votes": 50,
                    },
                )
            )
        session.add(
            Item(
                type=ItemType.GAME,
                title="Hades",
                status="finished",
                favorite=True,
                rating=9,
                owned_format=OwnedFormat.PHYSICAL,
                external_source="igdb",
                external_id="900",
                source_metadata={"genres": ["Roguelike"]},
            )
        )
        session.add(
            Item(
                type=ItemType.GAME,
                title="Owned Already",
                status="backlog",
                owned_format=OwnedFormat.PHYSICAL,
                external_source="igdb",
                external_id="5",
            )
        )
        await session.flush()
        await upsert_editions(
            session,
            [
                edition(title, release_date=released, platform_id=platform)
                for title, released, platform in GAMES.values()
            ],
            "nscollectors",
            retire=True,
        )
        for igdb_id, (title, _, _) in GAMES.items():
            for row in await session.scalars(
                select(PhysicalEdition).filter_by(title=title)
            ):
                row.igdb_id = igdb_id
        await session.commit()


async def _discover_rows(factory):
    async with factory() as session:
        return {
            row.external_id: row
            for row in await session.scalars(
                select(Recommendation).where(
                    Recommendation.kind == RecommendationKind.DISCOVER
                )
            )
        }


def _index_of(prompt, title):
    for line in prompt.splitlines():
        if line.startswith("[") and f"] {title}" in line:
            return int(line[1 : line.index("]")])
    raise AssertionError(f"{title} is not in the prompt")


class ChoosingProvider(FakeProvider):
    """Picks by title, reading the indices from the prompt it is sent."""

    def __init__(self, titles, based_on=(1,)):
        super().__init__()
        self.titles = titles
        self.based_on = list(based_on)

    async def complete_json(self, prompt, schema, images=None):
        self.prompts.append(prompt)
        return {
            "picks": [
                {
                    "index": _index_of(prompt, title),
                    "reason": f"Like Hades: {title}.",
                    "based_on": self.based_on,
                }
                for title in self.titles
            ]
        }


async def test_the_model_ranks_released_unowned_games(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    provider = ChoosingProvider(["Released B", "Released A"])
    async with discover_client(sessionmaker_for_test, provider) as client:
        result = (
            await client.post(
                "/api/recommendations/generate", json={"kind": "discover"}
            )
        ).json()
        listed = (await client.get("/api/recommendations?kind=discover")).json()

    assert result["count"] == 2
    assert result["ranked_by"] == "model"
    assert result["model_note"] is None
    (prompt,) = provider.prompts
    assert "Coming Soon" not in prompt and "Owned Already" not in prompt
    assert "Released C" in prompt  # the collection has no games on a platform
    assert "1. Hades ♥ (rated 9, finished)" in prompt
    assert [pick["title"] for pick in listed["picks"]] == ["Released B", "Released A"]
    first = listed["picks"][0]
    assert first["reasons"][0] == "Like Hades: Released B."
    assert first["based_on_titles"] == ["Hades"]
    assert first["genres"] == ["Roguelike"]
    assert listed["ranked_by"] == "model" and listed["personalised"] is True
    rows = await _discover_rows(sessionmaker_for_test)
    assert rows["2"].reason_source == ReasonSource.MODEL


async def test_bad_indices_are_dropped_and_nothing_valid_falls_back(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test)
    bad = FakeProvider({"picks": [{"index": 19, "reason": "x", "based_on": []}]})
    async with discover_client(sessionmaker_for_test, bad) as client:
        result = (
            await client.post(
                "/api/recommendations/generate", json={"kind": "discover"}
            )
        ).json()
    assert result["ranked_by"] == "template"
    assert result["model_note"] == "Gemini's picks did not hold up"
    assert result["count"] == 3  # the three released, unowned games
    rows = await _discover_rows(sessionmaker_for_test)
    assert set(rows) == {"1", "2", "3"}
    assert all(row.reason_source == ReasonSource.TEMPLATE for row in rows.values())
    assert all(row.reason for row in rows.values())


async def test_a_spent_quota_falls_back_and_says_so(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    spent = FakeProvider(raises=LLMError("gemini", "quota exceeded (429)"))
    async with discover_client(sessionmaker_for_test, spent) as client:
        result = (
            await client.post(
                "/api/recommendations/generate", json={"kind": "discover"}
            )
        ).json()
        listed = (await client.get("/api/recommendations?kind=discover")).json()
    assert result["ranked_by"] == "template"
    assert result["model_note"] == "Gemini's daily quota is used up"
    assert listed["model_note"] == "Gemini's daily quota is used up"
    assert len(listed["picks"]) == 3


async def test_an_unreadable_answer_falls_back(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    broken = FakeProvider(raises=ValueError("not json"))
    async with discover_client(sessionmaker_for_test, broken) as client:
        result = (
            await client.post(
                "/api/recommendations/generate", json={"kind": "discover"}
            )
        ).json()
    assert result["ranked_by"] == "template"
    assert result["count"] == 3


async def test_no_provider_still_generates(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with discover_client(sessionmaker_for_test, no_provider=True) as client:
        result = (
            await client.post(
                "/api/recommendations/generate", json={"kind": "discover"}
            )
        ).json()
    assert result["model_note"] == "No model is configured"
    assert result["count"] == 3


async def test_an_empty_catalogue_says_so(sessionmaker_for_test):
    provider = FakeProvider({"picks": []})
    async with discover_client(sessionmaker_for_test, provider) as client:
        result = (
            await client.post(
                "/api/recommendations/generate", json={"kind": "discover"}
            )
        ).json()
    assert result["count"] == 0
    assert result["model_note"] == "Nothing in the catalogue fits yet"
    assert provider.prompts == []  # no request spent on nothing


async def test_recent_leaves_out_older_games(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with discover_client(sessionmaker_for_test, no_provider=True) as client:
        await client.post(
            "/api/recommendations/generate",
            json={"kind": "discover", "window": "recent"},
        )
    assert set(await _discover_rows(sessionmaker_for_test)) == {"1", "2"}


async def test_regenerating_keeps_answers_and_leaves_radar_alone(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test)
    async with discover_client(sessionmaker_for_test, no_provider=True) as client:
        await client.post("/api/recommendations/generate", json={"kind": "discover"})
        rows = await _discover_rows(sessionmaker_for_test)
        await client.post(f"/api/recommendations/{rows['1'].id}/dismiss")
        await client.post(f"/api/recommendations/{rows['2'].id}/skip")
        async with sessionmaker_for_test() as session:
            session.add(
                Recommendation(
                    kind=RecommendationKind.RADAR,
                    type=ItemType.GAME,
                    external_source="igdb",
                    external_id="777",
                    platform_id=508,
                    title="Radar Row",
                    reason_source=ReasonSource.TEMPLATE,
                    batch_id=uuid.uuid4(),
                    score=1,
                    status=RecommendationStatus.PENDING,
                )
            )
            await session.commit()
        await client.post("/api/recommendations/generate", json={"kind": "discover"})
        listed = (await client.get("/api/recommendations?kind=discover")).json()

    rows = await _discover_rows(sessionmaker_for_test)
    assert rows["1"].status == RecommendationStatus.DISMISSED
    assert rows["2"].status == RecommendationStatus.PENDING  # a skip comes back
    assert {pick["title"] for pick in listed["picks"]} == {"Released B", "Released C"}
    async with sessionmaker_for_test() as session:
        radar = await session.scalar(
            select(Recommendation).where(Recommendation.external_id == "777")
        )
    assert radar is not None


async def test_discover_accepts_n64_and_refuses_other_platforms(
    sessionmaker_for_test,
):
    async with discover_client(sessionmaker_for_test, no_provider=True) as client:
        n64 = await client.post(
            "/api/recommendations/generate",
            json={"kind": "discover", "platforms": [4]},
        )
        other = await client.post(
            "/api/recommendations/generate",
            json={"kind": "discover", "platforms": [48]},
        )
        mode = await client.post(
            "/api/recommendations/generate",
            json={"kind": "discover", "popularity": "viral"},
        )
    assert n64.status_code == 200
    assert other.status_code == 422
    assert mode.status_code == 422


async def test_a_platform_subset_keeps_the_other_platforms_picks(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test)
    async with discover_client(sessionmaker_for_test, no_provider=True) as client:
        await client.post("/api/recommendations/generate", json={"kind": "discover"})
        await client.post(
            "/api/recommendations/generate",
            json={"kind": "discover", "platforms": [508]},
        )
    assert set(await _discover_rows(sessionmaker_for_test)) == {"1", "2", "3"}


async def test_own_from_discover_adds_a_private_owned_item(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with discover_client(sessionmaker_for_test, no_provider=True) as client:
        await client.post("/api/recommendations/generate", json={"kind": "discover"})
        row = (await _discover_rows(sessionmaker_for_test))["2"]
        response = await client.post(f"/api/recommendations/{row.id}/own")
        again = await client.post(
            "/api/recommendations/generate",
            json={"kind": "discover", "platforms": [130, 508]},
        )
    assert response.status_code == 201
    async with sessionmaker_for_test() as session:
        item = await session.scalar(select(Item).where(Item.external_id == "2"))
    assert item.is_public is False
    assert item.owned_format == OwnedFormat.PHYSICAL
    assert again.json()["count"] == 2  # an owned game is never suggested again
