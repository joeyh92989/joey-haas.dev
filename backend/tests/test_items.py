import uuid
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

from items import create_items_router

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def client_for(factory, signed_in: bool):
    """An async client driving the app in the caller's event loop.

    Deliberately not TestClient: that runs the app in its own event loop via an
    anyio portal, while the engine and its asyncpg connections belong to the
    test's loop. Crossing loops raises "attached to a different loop" from deep
    inside the driver.
    """
    app = FastAPI()
    app.include_router(create_items_router(factory))

    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    # Added last, so it is outermost. Starlette builds the stack in reverse
    # registration order: registering SessionMiddleware first would place the
    # sign-in shim outside it, and request.session would not exist yet.
    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def test_unauthenticated_requests_are_rejected(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        unknown = str(uuid.uuid4())

        assert (await client.get("/api/items")).status_code == 401
        assert (await client.post("/api/items", json={})).status_code == 401
        assert (await client.patch(f"/api/items/{unknown}", json={})).status_code == 401
        assert (await client.delete(f"/api/items/{unknown}")).status_code == 401
        # 401 rather than 404: an unauthenticated caller must not learn whether
        # an id exists by guessing at them.
        assert (await client.get(f"/api/items/{unknown}")).status_code == 401


async def test_authentication_precedes_validation(sessionmaker_for_test):
    # Regression: with the gate called inside each route, FastAPI validated the
    # body and path first, so an anonymous caller got 422 and could map the
    # request schema. The gate is a router dependency precisely to run earlier.
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        malformed_body = await client.post("/api/items", json={"type": "not-a-type"})
        assert malformed_body.status_code == 401

        malformed_path = await client.get("/api/items/not-a-uuid")
        assert malformed_path.status_code == 401


async def test_create_then_read_back(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        response = await client.post(
            "/api/items",
            json={
                "type": "game",
                "title": "Outer Wilds",
                "status": "finished",
                "rating": 10,
            },
        )
        assert response.status_code == 201, response.text
        created = response.json()
        assert created["title"] == "Outer Wilds"
        # Not supplied by the caller: a new row must be private by default.
        assert created["is_public"] is False

        fetched = await client.get(f"/api/items/{created['id']}")
        assert fetched.status_code == 200
        assert fetched.json()["rating"] == 10


async def test_rating_outside_range_is_rejected(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        for rating in (0, 11):
            response = await client.post(
                "/api/items",
                json={
                    "type": "game",
                    "title": "Bad",
                    "status": "backlog",
                    "rating": rating,
                },
            )
            assert response.status_code == 422, rating


async def test_patch_changes_only_the_given_field(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        created = (
            await client.post(
                "/api/items",
                json={
                    "type": "movie",
                    "title": "Arrival",
                    "status": "backlog",
                    "rating": 8,
                },
            )
        ).json()

        patched = await client.patch(
            f"/api/items/{created['id']}", json={"status": "finished"}
        )
        assert patched.status_code == 200
        body = patched.json()
        assert body["status"] == "finished"
        assert body["title"] == "Arrival"
        assert body["rating"] == 8


async def test_delete_then_get_is_404(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        created = (
            await client.post(
                "/api/items",
                json={"type": "comic", "title": "Saga", "status": "active"},
            )
        ).json()

        assert (await client.delete(f"/api/items/{created['id']}")).status_code == 204
        assert (await client.get(f"/api/items/{created['id']}")).status_code == 404


async def test_unknown_id_is_404_when_signed_in(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        assert (await client.get(f"/api/items/{uuid.uuid4()}")).status_code == 404


async def test_list_filters_by_type_and_status(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        await client.post(
            "/api/items", json={"type": "game", "title": "A", "status": "backlog"}
        )
        await client.post(
            "/api/items", json={"type": "movie", "title": "B", "status": "finished"}
        )

        games = (await client.get("/api/items", params={"type": "game"})).json()
        assert [item["title"] for item in games] == ["A"]

        finished = (
            await client.get("/api/items", params={"status": "finished"})
        ).json()
        assert [item["title"] for item in finished] == ["B"]

        assert len((await client.get("/api/items")).json()) == 2
