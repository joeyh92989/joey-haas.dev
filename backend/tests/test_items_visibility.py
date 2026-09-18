"""Bulk visibility: publishing the collection to the public showcase.

Exists because nothing else could set is_public. The public API, the
/collection page and the filter all shipped without a control to flip the
flag, so every imported row stayed private and the showcase had nothing to
show.
"""

import uuid
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

from items import create_items_router
from models import Item, ItemStatus, ItemType

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def client_for(factory, signed_in: bool = True):
    app = FastAPI()
    app.include_router(create_items_router(factory))

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


async def _seed(factory, count: int = 3) -> list[uuid.UUID]:
    async with factory() as session:
        items = [
            Item(
                type=ItemType.GAME,
                title=f"Game {index}",
                status=ItemStatus.BACKLOG,
                is_public=False,
            )
            for index in range(count)
        ]
        session.add_all(items)
        await session.commit()
        for item in items:
            await session.refresh(item)
        return [item.id for item in items]


async def _public_titles(client) -> set[str]:
    listed = (await client.get("/api/items")).json()
    return {row["title"] for row in listed if row["is_public"]}


async def test_null_ids_publishes_everything(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)

    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/items/visibility", json={"is_public": True})
        published = await _public_titles(client)

    assert response.status_code == 200
    assert response.json()["updated"] == 3
    assert published == {"Game 0", "Game 1", "Game 2"}


async def test_an_id_list_publishes_only_those(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test)

    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/visibility",
            json={"is_public": True, "ids": [str(ids[0]), str(ids[2])]},
        )
        published = await _public_titles(client)

    assert response.json()["updated"] == 2
    assert published == {"Game 0", "Game 2"}


async def test_an_empty_list_changes_nothing(sessionmaker_for_test):
    # Distinct from null, which means everything. A caller that sent [] meaning
    # "all" would otherwise publish the entire collection by accident.
    await _seed(sessionmaker_for_test)

    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/visibility", json={"is_public": True, "ids": []}
        )
        published = await _public_titles(client)

    assert response.json()["updated"] == 0
    assert published == set()


async def test_hiding_works_the_same_way(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)

    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/items/visibility", json={"is_public": True})
        response = await client.post("/api/items/visibility", json={"is_public": False})
        published = await _public_titles(client)

    assert response.json()["updated"] == 3
    assert published == set()


async def test_unknown_ids_are_ignored_rather_than_erroring(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test)

    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/visibility",
            json={"is_public": True, "ids": [str(ids[0]), str(uuid.uuid4())]},
        )

    assert response.status_code == 200
    # The count reports what actually changed, not what was asked for.
    assert response.json()["updated"] == 1


async def test_visibility_requires_the_admin_session(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.post("/api/items/visibility", json={"is_public": True})

    # 401, never 422: the router-level dependency runs before validation, so an
    # anonymous caller cannot probe the body schema.
    assert response.status_code == 401


async def test_visibility_is_not_shadowed_by_the_id_route(sessionmaker_for_test):
    # /{item_id} is typed uuid.UUID and has swallowed two routes already.
    # Declared after it, this path would answer 422 instead of running.
    await _seed(sessionmaker_for_test)

    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/items/visibility", json={"is_public": True})

    assert response.status_code != 422
    assert response.status_code == 200
