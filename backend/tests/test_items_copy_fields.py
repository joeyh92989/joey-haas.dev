"""The copy fields through every write path, and the bulk set.

formats.py is tested on its own; this proves each route actually sends its
changes through it, and that a refused bulk set writes nothing at all.
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


async def _seed(factory, *rows: dict) -> list[uuid.UUID]:
    items = [
        Item(
            type=ItemType.GAME,
            title=row.pop("title", f"Game {index}"),
            status=ItemStatus.BACKLOG,
            **row,
        )
        for index, row in enumerate(rows)
    ]
    async with factory() as session:
        session.add_all(items)
        await session.commit()
        return [item.id for item in items]


def _new(**fields) -> dict:
    return {"type": "game", "title": "New", "status": "backlog", **fields}


async def test_patch_resolves_the_platform_and_ignores_a_supplied_name(
    sessionmaker_for_test,
):
    [item_id] = await _seed(sessionmaker_for_test, {})
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            f"/api/items/{item_id}", json={"platform_id": 508, "platform": "Wrong"}
        )

    assert response.status_code == 200
    assert response.json()["platform"] == "Nintendo Switch 2"


async def test_patch_a_cart_id_sets_format_source_and_region(sessionmaker_for_test):
    [item_id] = await _seed(sessionmaker_for_test, {})
    async with client_for(sessionmaker_for_test) as client:
        body = (
            await client.patch(
                f"/api/items/{item_id}", json={"cart_id": "lp-aac4b-usa-0"}
            )
        ).json()

    assert body["cart_id"] == "LP-AAC4B-USA-0"
    assert body["physical_format"] == "game_key_card"
    assert body["format_source"] == "cart_id"
    assert body["region"] == "USA"


async def test_a_bad_cart_id_is_a_422_and_changes_nothing(sessionmaker_for_test):
    [item_id] = await _seed(sessionmaker_for_test, {})
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            f"/api/items/{item_id}", json={"cart_id": "nope", "rating": 7}
        )
        item = (await client.get(f"/api/items/{item_id}")).json()

    assert response.status_code == 422
    assert "does not look like" in response.json()["detail"]
    assert item["cart_id"] is None
    assert item["rating"] is None


async def test_a_format_contradicting_the_stored_cart_id_is_refused(
    sessionmaker_for_test,
):
    [item_id] = await _seed(
        sessionmaker_for_test,
        {"cart_id": "LP-AAC4B-USA-0", "physical_format": "game_key_card"},
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            f"/api/items/{item_id}", json={"physical_format": "game_card"}
        )

    assert response.status_code == 422
    assert "clear the cart ID" in response.json()["detail"]


async def test_a_format_without_a_cart_id_is_manual(sessionmaker_for_test):
    [item_id] = await _seed(sessionmaker_for_test, {})
    async with client_for(sessionmaker_for_test) as client:
        body = (
            await client.patch(
                f"/api/items/{item_id}", json={"physical_format": "game_card"}
            )
        ).json()

    assert body["format_source"] == "manual"


async def test_clearing_the_format_clears_the_source_and_cart(sessionmaker_for_test):
    [item_id] = await _seed(
        sessionmaker_for_test,
        {
            "cart_id": "LP-AAC4B-USA-0",
            "physical_format": "game_key_card",
            "format_source": "cart_id",
        },
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (
            await client.patch(f"/api/items/{item_id}", json={"physical_format": None})
        ).json()

    assert body["physical_format"] is None
    assert body["format_source"] is None
    assert body["cart_id"] is None


async def test_derived_and_unwritable_fields_are_ignored_on_patch(
    sessionmaker_for_test,
):
    [item_id] = await _seed(sessionmaker_for_test, {})
    async with client_for(sessionmaker_for_test) as client:
        body = (
            await client.patch(
                f"/api/items/{item_id}",
                json={
                    "format_source": "registry",
                    "pinned_at": "2026-09-23T00:00:00Z",
                },
            )
        ).json()

    assert body["format_source"] is None
    assert body["pinned_at"] is None


async def test_create_applies_the_rules(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        created = await client.post(
            "/api/items", json=_new(platform_id=4, completeness="cib")
        )
        refused = await client.post("/api/items", json=_new(platform_id=999))

    assert created.status_code == 201
    assert created.json()["platform"] == "Nintendo 64"
    assert created.json()["completeness"] == "cib"
    assert refused.status_code == 422


async def test_bulk_create_applies_the_rules_and_refuses_the_batch_whole(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        refused = await client.post(
            "/api/items/bulk",
            json={"items": [_new(title="Fine"), _new(title="Bad", cart_id="x")]},
        )
        created = await client.post(
            "/api/items/bulk", json={"items": [_new(title="Ok", platform_id=130)]}
        )
        listed = (await client.get("/api/items")).json()

    assert refused.status_code == 422
    assert "Bad" in refused.json()["detail"]
    assert created.status_code == 201
    assert [row["platform"] for row in listed] == ["Nintendo Switch"]


async def test_bulk_set_updates_every_selected_row(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test, {}, {}, {}, {"title": "Untouched"})
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            "/api/items/bulk",
            json={"ids": [str(i) for i in ids[:3]], "changes": {"platform_id": 508}},
        )
        listed = {row["title"]: row for row in (await client.get("/api/items")).json()}

    assert response.status_code == 200
    assert response.json() == {"updated": 3}
    assert listed["Game 0"]["platform"] == "Nintendo Switch 2"
    assert listed["Untouched"]["platform"] is None


async def test_a_bulk_set_conflict_names_the_row_and_writes_nothing(
    sessionmaker_for_test,
):
    ids = await _seed(
        sessionmaker_for_test,
        {"title": "Plain"},
        {
            "title": "Key Card",
            "cart_id": "LP-AAC4B-USA-0",
            "physical_format": "game_key_card",
        },
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            "/api/items/bulk",
            json={
                "ids": [str(i) for i in ids],
                "changes": {"physical_format": "game_card"},
            },
        )
        listed = {row["title"]: row for row in (await client.get("/api/items")).json()}

    assert response.status_code == 422
    assert "Key Card" in response.json()["detail"]
    assert listed["Plain"]["physical_format"] is None


async def test_a_bulk_set_needs_a_change_and_at_most_500_ids(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test, {})
    async with client_for(sessionmaker_for_test) as client:
        empty = await client.patch(
            "/api/items/bulk", json={"ids": [str(ids[0])], "changes": {}}
        )
        too_many = await client.patch(
            "/api/items/bulk",
            json={
                "ids": [str(uuid.uuid4()) for _ in range(501)],
                "changes": {"platform_id": 508},
            },
        )

    assert empty.status_code == 422
    assert too_many.status_code == 422


async def test_a_bulk_set_needs_a_session(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.patch(
            "/api/items/bulk",
            json={"ids": [str(uuid.uuid4())], "changes": {"platform_id": 508}},
        )

    assert response.status_code == 401
