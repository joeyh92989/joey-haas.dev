import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

from items import create_items_router

pytestmark = pytest.mark.asyncio


def build_app(factory, signed_in: bool) -> TestClient:
    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    app.include_router(create_items_router(factory))

    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    return TestClient(app)


async def test_unauthenticated_requests_are_rejected(sessionmaker_for_test):
    client = build_app(sessionmaker_for_test, signed_in=False)
    unknown = str(uuid.uuid4())

    assert client.get("/api/items").status_code == 401
    assert client.post("/api/items", json={}).status_code == 401
    assert client.patch(f"/api/items/{unknown}", json={}).status_code == 401
    assert client.delete(f"/api/items/{unknown}").status_code == 401
    # 401 rather than 404: an unauthenticated caller must not learn whether an
    # id exists by guessing at them.
    assert client.get(f"/api/items/{unknown}").status_code == 401


async def test_create_then_read_back(sessionmaker_for_test):
    client = build_app(sessionmaker_for_test, signed_in=True)
    response = client.post(
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

    fetched = client.get(f"/api/items/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["rating"] == 10


async def test_rating_outside_range_is_rejected(sessionmaker_for_test):
    client = build_app(sessionmaker_for_test, signed_in=True)
    for rating in (0, 11):
        response = client.post(
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
    client = build_app(sessionmaker_for_test, signed_in=True)
    created = client.post(
        "/api/items",
        json={"type": "movie", "title": "Arrival", "status": "backlog", "rating": 8},
    ).json()

    patched = client.patch(f"/api/items/{created['id']}", json={"status": "finished"})
    assert patched.status_code == 200
    body = patched.json()
    assert body["status"] == "finished"
    assert body["title"] == "Arrival"
    assert body["rating"] == 8


async def test_delete_then_get_is_404(sessionmaker_for_test):
    client = build_app(sessionmaker_for_test, signed_in=True)
    created = client.post(
        "/api/items", json={"type": "comic", "title": "Saga", "status": "active"}
    ).json()

    assert client.delete(f"/api/items/{created['id']}").status_code == 204
    assert client.get(f"/api/items/{created['id']}").status_code == 404


async def test_unknown_id_is_404_when_signed_in(sessionmaker_for_test):
    client = build_app(sessionmaker_for_test, signed_in=True)
    assert client.get(f"/api/items/{uuid.uuid4()}").status_code == 404


async def test_list_filters_by_type_and_status(sessionmaker_for_test):
    client = build_app(sessionmaker_for_test, signed_in=True)
    client.post("/api/items", json={"type": "game", "title": "A", "status": "backlog"})
    client.post(
        "/api/items", json={"type": "movie", "title": "B", "status": "finished"}
    )

    games = client.get("/api/items", params={"type": "game"}).json()
    assert [i["title"] for i in games] == ["A"]

    finished = client.get("/api/items", params={"status": "finished"}).json()
    assert [i["title"] for i in finished] == ["B"]

    assert len(client.get("/api/items").json()) == 2
