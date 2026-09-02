"""Bulk creation and the dedupe behaviour the photo importer depends on."""

from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

from items import create_items_router

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


def _item(title, **overrides):
    row = {
        "type": "movie",
        "title": title,
        "status": "backlog",
        "owned_format": "physical",
    }
    row.update(overrides)
    return row


async def test_bulk_creates_rows_and_reports_what_it_did(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk",
            json={
                "items": [
                    _item("Dune", external_source="tmdb", external_id="438631"),
                    _item("Arrival", external_source="tmdb", external_id="329865"),
                ]
            },
        )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 2
    assert body["skipped_duplicates"] == 0
    assert len(body["ids"]) == 2


async def test_reimporting_the_same_shelf_skips_rather_than_errors(
    sessionmaker_for_test,
):
    # Photographing a shelf twice is expected behaviour, not a mistake.
    payload = {"items": [_item("Dune", external_source="tmdb", external_id="438631")]}

    async with client_for(sessionmaker_for_test) as client:
        first = await client.post("/api/items/bulk", json=payload)
        second = await client.post("/api/items/bulk", json=payload)

    assert first.json()["created"] == 1
    assert second.status_code == 201
    assert second.json() == {"created": 0, "skipped_duplicates": 1, "ids": []}


async def test_a_duplicate_inside_one_batch_is_also_skipped(sessionmaker_for_test):
    # ON CONFLICT does not deduplicate rows within a single statement, so
    # without the in-Python pass both of these would be written.
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk",
            json={
                "items": [
                    _item("Dune", external_source="tmdb", external_id="438631"),
                    _item("Dune", external_source="tmdb", external_id="438631"),
                ]
            },
        )

    body = response.json()
    assert body["created"] == 1
    assert body["skipped_duplicates"] == 1


async def test_two_manual_rows_both_insert(sessionmaker_for_test):
    # The unique index is partial. Without the predicate these would collide
    # on (NULL, NULL) and one would be silently dropped.
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk",
            json={"items": [_item("Some Comic"), _item("Another Comic")]},
        )

    assert response.json()["created"] == 2


async def test_the_same_id_at_two_different_sources_is_not_a_duplicate(
    sessionmaker_for_test,
):
    # External ids are only unique within their own source; "1" at TMDB and
    # "1" at BGG are different things.
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk",
            json={
                "items": [
                    _item("A Film", external_source="tmdb", external_id="1"),
                    _item(
                        "A Game",
                        type="boardgame",
                        external_source="bgg",
                        external_id="1",
                    ),
                ]
            },
        )

    assert response.json()["created"] == 2


async def test_imported_rows_keep_the_fields_they_were_given(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/items/bulk",
            json={
                "items": [
                    _item(
                        "Dune",
                        external_source="tmdb",
                        external_id="438631",
                        year=2021,
                    )
                ]
            },
        )
        listed = (await client.get("/api/items")).json()

    assert listed[0]["owned_format"] == "physical"
    assert listed[0]["year"] == 2021
    assert listed[0]["external_source"] == "tmdb"


async def test_an_empty_batch_is_rejected(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/items/bulk", json={"items": []})
    assert response.status_code == 422


async def test_bulk_requires_the_admin_session(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.post("/api/items/bulk", json={"items": [_item("Dune")]})
    assert response.status_code == 401


async def test_bulk_is_not_shadowed_by_the_id_route(sessionmaker_for_test):
    # /{item_id} is typed uuid.UUID; declared first it would answer 422 here.
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/items/bulk", json={"items": [_item("Dune")]})
    assert response.status_code == 201
