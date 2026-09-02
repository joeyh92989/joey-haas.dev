"""The public router. The leak tests here are the point of the module."""

from contextlib import asynccontextmanager
from datetime import date

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient

from models import Item, ItemStatus, ItemType, OwnedFormat
from public import create_public_router

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def client_for(factory):
    app = FastAPI()
    app.include_router(create_public_router(factory))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def _seed(factory) -> None:
    async with factory() as session:
        session.add_all(
            [
                Item(
                    type=ItemType.MOVIE,
                    title="Public Film",
                    status=ItemStatus.FINISHED,
                    rating=9,
                    favorite=True,
                    is_public=True,
                    year=2021,
                    creator="Denis Villeneuve",
                    cover_url="https://image.tmdb.org/t/p/w342/a.jpg",
                    finished_at=date(2026, 3, 14),
                    notes="a private thought",
                    owned_format=OwnedFormat.PHYSICAL,
                    source_metadata={
                        "genres": ["Science Fiction"],
                        "community_score": 7.8,
                        "description": "not published",
                    },
                ),
                Item(
                    type=ItemType.GAME,
                    title="Public Game",
                    status=ItemStatus.BACKLOG,
                    is_public=True,
                    finished_at=None,
                    owned_format=OwnedFormat.NONE,
                ),
                Item(
                    type=ItemType.COMIC,
                    title="Private Thing",
                    status=ItemStatus.ACTIVE,
                    rating=4,
                    is_public=False,
                    notes="secret",
                    finished_at=date(2026, 3, 20),
                ),
            ]
        )
        await session.commit()


async def test_private_fields_are_absent_from_the_response(sessionmaker_for_test):
    # The whole reason the response model is written by hand. Serializing the
    # ORM object would publish any column added later, silently.
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    assert body
    for row in body:
        assert "notes" not in row
        assert "owned_format" not in row
        assert "is_public" not in row
        assert "source_metadata" not in row
        assert "created_at" not in row


async def test_non_public_rows_are_never_returned(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    assert {row["title"] for row in body} == {"Public Film", "Public Game"}


async def test_the_public_routes_need_no_session(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        assert (await client.get("/api/public/items")).status_code == 200
        assert (await client.get("/api/public/stats")).status_code == 200


async def test_display_fields_survive_the_mapping(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    film = next(row for row in body if row["title"] == "Public Film")
    assert film["year"] == 2021
    assert film["creator"] == "Denis Villeneuve"
    assert film["cover_url"].startswith("https://image.tmdb.org/")
    assert film["favorite"] is True
    assert film["finished_at"] == "2026-03-14"
    # Lifted out of the snapshot rather than publishing the snapshot itself.
    assert film["genres"] == ["Science Fiction"]
    assert film["community_score"] == 7.8


async def test_an_item_with_no_snapshot_still_renders(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    game = next(row for row in body if row["title"] == "Public Game")
    assert game["genres"] == []
    assert game["community_score"] is None


async def test_stats_count_only_public_rows(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        stats = (await client.get("/api/public/stats")).json()

    assert stats["total"] == 2
    assert stats["by_type"] == {"movie": 1, "game": 1}
    assert stats["by_status"] == {"finished": 1, "backlog": 1}
    # The private row is rated 4 and finished in March; neither may appear.
    assert stats["rating_histogram"] == {"9": 1}
    assert stats["finishes_by_month"] == {"2026-03": 1}


async def test_stats_on_an_empty_collection_are_zeroes_not_an_error(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/stats")

    assert response.status_code == 200
    assert response.json() == {
        "total": 0,
        "by_type": {},
        "by_status": {},
        "rating_histogram": {},
        "finishes_by_month": {},
    }


async def test_items_are_ordered_by_most_recently_finished(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    # The finished film first; the unfinished game sorts after it rather than
    # ahead of everything on a NULL date.
    assert body[0]["title"] == "Public Film"
