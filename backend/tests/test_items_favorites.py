"""The favourites cap: four, like the four covers the shelf has room for.

Enforced here rather than only in the shelf, because the edit page, the
create form and the photo importer can all set the flag too, and a fifth
favourite is saved but never shown -- the bug this exists to prevent.
"""

import uuid
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

from items import FAVORITES_LIMIT, create_items_router
from models import Item, ItemStatus, ItemType

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def client_for(factory):
    app = FastAPI()
    app.include_router(create_items_router(factory))

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def _seed(factory, favorites: int, others: int = 1) -> list[uuid.UUID]:
    """Seeds `favorites` favourites then `others` plain items; returns ids."""
    items = [
        Item(
            type=ItemType.GAME,
            title=f"Game {index}",
            status=ItemStatus.BACKLOG,
            favorite=index < favorites,
        )
        for index in range(favorites + others)
    ]
    async with factory() as session:
        session.add_all(items)
        await session.commit()
        return [item.id for item in items]


async def _favorite_count(factory) -> int:
    async with factory() as session:
        return await session.scalar(
            select(func.count()).select_from(Item).where(Item.favorite.is_(True))
        )


def _new(title: str, favorite: bool = False) -> dict:
    return {"type": "game", "title": title, "status": "backlog", "favorite": favorite}


async def test_the_limit_is_four():
    assert FAVORITES_LIMIT == 4


async def test_a_fourth_favourite_is_allowed(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test, favorites=3)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(f"/api/items/{ids[3]}", json={"favorite": True})

    assert response.status_code == 200
    assert await _favorite_count(sessionmaker_for_test) == 4


async def test_a_fifth_favourite_is_refused_by_patch(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test, favorites=4)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(f"/api/items/{ids[4]}", json={"favorite": True})

    assert response.status_code == 409
    assert "Unfavourite one first" in response.json()["detail"]
    assert await _favorite_count(sessionmaker_for_test) == 4


async def test_a_refused_patch_changes_nothing_else(sessionmaker_for_test):
    # The request is refused whole: a rating sent beside the fifth favourite
    # is not half-applied.
    ids = await _seed(sessionmaker_for_test, favorites=4)
    async with client_for(sessionmaker_for_test) as client:
        await client.patch(f"/api/items/{ids[4]}", json={"favorite": True, "rating": 9})
        item = (await client.get(f"/api/items/{ids[4]}")).json()

    assert item["rating"] is None
    assert item["favorite"] is False


async def test_patches_that_do_not_add_a_favourite_are_unaffected(
    sessionmaker_for_test,
):
    ids = await _seed(sessionmaker_for_test, favorites=4)
    async with client_for(sessionmaker_for_test) as client:
        other = await client.patch(f"/api/items/{ids[4]}", json={"rating": 7})
        # Re-sending true for an item that is already a favourite, as the
        # edit page does when saving other fields, is a no-op.
        again = await client.patch(f"/api/items/{ids[0]}", json={"favorite": True})
        unset = await client.patch(f"/api/items/{ids[4]}", json={"favorite": False})

    assert other.status_code == 200
    assert again.status_code == 200
    assert unset.status_code == 200


async def test_unfavouriting_always_works_and_frees_a_slot(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test, favorites=4)
    async with client_for(sessionmaker_for_test) as client:
        freed = await client.patch(f"/api/items/{ids[0]}", json={"favorite": False})
        added = await client.patch(f"/api/items/{ids[4]}", json={"favorite": True})

    assert freed.status_code == 200
    assert added.status_code == 200


async def test_existing_extras_are_kept_but_block_new_favourites(
    sessionmaker_for_test,
):
    # Rows favourited before the cap existed are left alone; nothing is
    # silently unfavourited. Until they are trimmed, no new one is added.
    ids = await _seed(sessionmaker_for_test, favorites=6)
    async with client_for(sessionmaker_for_test) as client:
        refused = await client.patch(f"/api/items/{ids[6]}", json={"favorite": True})
        await client.patch(f"/api/items/{ids[0]}", json={"favorite": False})
        still_refused = await client.patch(
            f"/api/items/{ids[6]}", json={"favorite": True}
        )

    assert refused.status_code == 409
    assert still_refused.status_code == 409
    assert await _favorite_count(sessionmaker_for_test) == 5


async def test_a_fifth_favourite_is_refused_on_create(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, favorites=4, others=0)
    async with client_for(sessionmaker_for_test) as client:
        refused = await client.post("/api/items", json=_new("Fifth", favorite=True))
        plain = await client.post("/api/items", json=_new("Plain"))

    assert refused.status_code == 409
    assert plain.status_code == 201
    assert await _favorite_count(sessionmaker_for_test) == 4


async def test_a_bulk_batch_past_the_limit_is_refused_whole(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, favorites=3, others=0)
    batch = {
        "items": [
            _new("One", favorite=True),
            _new("Two", favorite=True),
            _new("Plain"),
        ]
    }
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/items/bulk", json=batch)

    assert response.status_code == 409
    async with sessionmaker_for_test() as session:
        total = await session.scalar(select(func.count()).select_from(Item))
    assert total == 3


async def test_a_bulk_batch_within_the_limit_is_created(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, favorites=3, others=0)
    batch = {"items": [_new("One", favorite=True), _new("Plain")]}
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/items/bulk", json=batch)

    assert response.status_code == 201
    assert await _favorite_count(sessionmaker_for_test) == 4
