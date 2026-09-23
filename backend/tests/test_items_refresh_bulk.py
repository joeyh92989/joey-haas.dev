"""The batched metadata refresh for games.

The adapter is stubbed at the SourceAdapter contract, as in
test_items_metadata.py; the IGDB side of fetch_many is tested against
recorded fixtures in test_sources_igdb.py.
"""

from contextlib import asynccontextmanager
from datetime import date

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

import items
from items import create_items_router
from models import Item, ItemStatus, ItemType
from sources.base import SourceDetail, SourceError

pytestmark = pytest.mark.asyncio


class StubIgdb:
    """Answers fetch_many from memory; can fail any batch holding one id."""

    source_name = "igdb"
    item_type = ItemType.GAME

    def __init__(self, details: dict[str, SourceDetail], fail_on: str | None = None):
        self._details = details
        self._fail_on = fail_on
        self.batches: list[list[str]] = []

    def configured(self) -> bool:
        return True

    async def search(self, query, year=None, platform=None):
        return []

    async def fetch(self, external_id):
        return self._details[external_id]

    async def fetch_many(self, external_ids):
        self.batches.append(list(external_ids))
        if self._fail_on in external_ids:
            raise SourceError("igdb", "HTTP 500 from IGDB")
        return [self._details[i] for i in external_ids if i in self._details]


def _detail(external_id: str, platform_ids: list[int], released: str | None):
    snapshot = {"genres": ["Action"], "platform_ids": platform_ids}
    if released:
        snapshot["first_release_date"] = released
    return SourceDetail(
        external_id=external_id,
        title="ignored",
        year=2026,
        creator=f"Studio {external_id}",
        cover_url=f"https://images.igdb.com/{external_id}.jpg",
        source_metadata=snapshot,
    )


@asynccontextmanager
async def client_for(factory, registry, signed_in: bool = True):
    app = FastAPI()
    app.include_router(create_items_router(factory, registry))

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


async def _seed(factory, *rows: dict) -> None:
    async with factory() as session:
        session.add_all(
            [
                Item(
                    type=row.pop("type", ItemType.GAME),
                    status=row.pop("status", ItemStatus.BACKLOG),
                    **row,
                )
                for row in rows
            ]
        )
        await session.commit()


async def _rows(factory) -> dict[str, Item]:
    from sqlalchemy import select

    async with factory() as session:
        result = await session.execute(select(Item))
        return {item.title: item for item in result.scalars()}


def _linked(title: str, external_id: str, **fields) -> dict:
    return {
        "title": title,
        "external_source": "igdb",
        "external_id": external_id,
        **fields,
    }


async def test_linked_games_are_refreshed(sessionmaker_for_test):
    await _seed(
        sessionmaker_for_test,
        _linked("One Platform", "1"),
        _linked("Many Platforms", "2"),
        _linked("Owner Set", "3", platform_id=130, platform="Nintendo Switch"),
        {"title": "Manual"},
    )
    adapter = StubIgdb(
        {
            "1": _detail("1", [508], "2026-06-05"),
            "2": _detail("2", [508, 130, 6], "2025-01-02"),
            "3": _detail("3", [508], None),
        }
    )

    async with client_for(sessionmaker_for_test, {ItemType.GAME: adapter}) as client:
        response = await client.post("/api/items/refresh-metadata/bulk?type=game")

    assert response.status_code == 200
    assert response.json() == {"updated": 3, "skipped": 0, "failed": 0}
    rows = await _rows(sessionmaker_for_test)
    assert rows["One Platform"].creator == "Studio 1"
    assert rows["One Platform"].release_date == date(2026, 6, 5)
    # Exactly one platform in the snapshot fills an empty platform.
    assert rows["One Platform"].platform == "Nintendo Switch 2"
    # Several platforms cannot say which copy this is.
    assert rows["Many Platforms"].platform_id is None
    # An owner-set platform is never replaced.
    assert rows["Owner Set"].platform_id == 130
    assert rows["Manual"].creator is None


async def test_owner_fields_are_never_touched(sessionmaker_for_test):
    owned = dict(
        rating=8,
        status=ItemStatus.FINISHED,
        favorite=True,
        notes="mine",
        physical_format="game_key_card",
        cart_id="LP-AAC4B-USA-0",
        region="EUR",
        completeness="cib",
        is_public=True,
        acquired_at=date(2020, 1, 1),
        started_at=date(2021, 1, 1),
        finished_at=date(2022, 1, 1),
    )
    await _seed(sessionmaker_for_test, _linked("Kept", "1", **owned))
    adapter = StubIgdb({"1": _detail("1", [508], "2026-06-05")})

    async with client_for(sessionmaker_for_test, {ItemType.GAME: adapter}) as client:
        await client.post("/api/items/refresh-metadata/bulk?type=game")

    row = (await _rows(sessionmaker_for_test))["Kept"]
    for field, value in owned.items():
        stored = getattr(row, field)
        assert getattr(stored, "value", stored) == getattr(value, "value", value), field


async def test_a_failed_batch_is_counted_and_the_rest_still_update(
    sessionmaker_for_test, monkeypatch
):
    monkeypatch.setattr(items, "REFRESH_BATCH", 2)
    await _seed(
        sessionmaker_for_test,
        *[_linked(f"Game {n}", str(n)) for n in range(1, 6)],
    )
    adapter = StubIgdb(
        {str(n): _detail(str(n), [508], None) for n in range(1, 6)}, fail_on="3"
    )

    async with client_for(sessionmaker_for_test, {ItemType.GAME: adapter}) as client:
        response = await client.post("/api/items/refresh-metadata/bulk?type=game")

    assert [len(batch) for batch in adapter.batches] == [2, 2, 1]
    assert response.json() == {"updated": 3, "skipped": 0, "failed": 2}


async def test_a_game_igdb_does_not_return_is_skipped(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, _linked("Gone", "404"), _linked("Here", "1"))
    adapter = StubIgdb({"1": _detail("1", [508], None)})

    async with client_for(sessionmaker_for_test, {ItemType.GAME: adapter}) as client:
        response = await client.post("/api/items/refresh-metadata/bulk?type=game")

    assert response.json() == {"updated": 1, "skipped": 1, "failed": 0}


async def test_only_games_can_be_bulk_refreshed(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, {}) as client:
        response = await client.post("/api/items/refresh-metadata/bulk?type=movie")

    assert response.status_code == 422


async def test_the_bulk_refresh_needs_a_session(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, {}, signed_in=False) as client:
        response = await client.post("/api/items/refresh-metadata/bulk?type=game")

    assert response.status_code == 401


async def test_the_single_refresh_sets_the_release_date(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, _linked("Solo", "1"))
    adapter = StubIgdb({"1": _detail("1", [508, 130], "2027-03-01")})
    solo = (await _rows(sessionmaker_for_test))["Solo"]

    async with client_for(sessionmaker_for_test, {ItemType.GAME: adapter}) as client:
        body = (await client.post(f"/api/items/{solo.id}/refresh-metadata")).json()

    assert body["release_date"] == "2027-03-01"


async def test_a_single_unknown_platform_is_left_empty(sessionmaker_for_test):
    # A platform the site has no name for is never written, and never stops
    # the refresh.
    await _seed(sessionmaker_for_test, _linked("Saturn Game", "1"))
    adapter = StubIgdb({"1": _detail("1", [32], None)})

    async with client_for(sessionmaker_for_test, {ItemType.GAME: adapter}) as client:
        response = await client.post("/api/items/refresh-metadata/bulk?type=game")

    assert response.json() == {"updated": 1, "skipped": 0, "failed": 0}
    assert (await _rows(sessionmaker_for_test))["Saturn Game"].platform_id is None
