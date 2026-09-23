"""Pinning a game as Up next, and the Play Next exclusion flag on items."""

import uuid
from contextlib import asynccontextmanager
from datetime import date

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from items import create_items_router
from models import Item, ItemStatus, ItemType, OwnedFormat, PickAction, PickEvent

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
            status=row.pop("status", ItemStatus.BACKLOG),
            owned_format=row.pop("owned_format", OwnedFormat.PHYSICAL),
            **row,
        )
        for index, row in enumerate(rows)
    ]
    async with factory() as session:
        session.add_all(items)
        await session.commit()
        return [item.id for item in items]


async def _events(factory, item_id) -> list[str]:
    async with factory() as session:
        rows = await session.execute(
            select(PickEvent.action).where(PickEvent.item_id == item_id)
        )
        return [action.value for action in rows.scalars()]


async def test_pinning_commits_to_the_game(sessionmaker_for_test):
    [item_id] = await _seed(sessionmaker_for_test, {})
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(f"/api/items/{item_id}/pin")

    assert response.status_code == 200
    body = response.json()
    assert body["pinned_at"] is not None
    assert body["status"] == "active"
    # Today, in the server's own terms.
    assert body["started_at"] == date.today().isoformat()
    assert await _events(sessionmaker_for_test, item_id) == ["pinned"]


async def test_pinning_keeps_an_existing_start_date(sessionmaker_for_test):
    [item_id] = await _seed(sessionmaker_for_test, {"started_at": date(2026, 1, 2)})
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.post(f"/api/items/{item_id}/pin")).json()

    assert body["started_at"] == "2026-01-02"


async def test_only_one_game_is_pinned_at_a_time(sessionmaker_for_test):
    first, second = await _seed(sessionmaker_for_test, {}, {})
    async with client_for(sessionmaker_for_test) as client:
        await client.post(f"/api/items/{first}/pin")
        await client.post(f"/api/items/{second}/pin")
        listed = {row["id"]: row for row in (await client.get("/api/items")).json()}

    assert listed[str(first)]["pinned_at"] is None
    assert listed[str(second)]["pinned_at"] is not None


async def test_unpinning_clears_the_pin(sessionmaker_for_test):
    [item_id] = await _seed(sessionmaker_for_test, {})
    async with client_for(sessionmaker_for_test) as client:
        await client.post(f"/api/items/{item_id}/pin")
        body = (await client.delete(f"/api/items/{item_id}/pin")).json()

    assert body["pinned_at"] is None


async def test_a_game_on_the_want_list_cannot_be_pinned(sessionmaker_for_test):
    [item_id] = await _seed(sessionmaker_for_test, {"owned_format": OwnedFormat.NONE})
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(f"/api/items/{item_id}/pin")

    assert response.status_code == 422
    assert await _events(sessionmaker_for_test, item_id) == []


async def test_pin_needs_a_known_item_and_a_session(sessionmaker_for_test):
    unknown = uuid.uuid4()
    async with client_for(sessionmaker_for_test) as client:
        missing = await client.post(f"/api/items/{unknown}/pin")
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        pin = await client.post(f"/api/items/{unknown}/pin")
        unpin = await client.delete(f"/api/items/{unknown}/pin")

    assert missing.status_code == 404
    assert pin.status_code == 401
    assert unpin.status_code == 401


async def test_items_say_when_play_next_excludes_them(sessionmaker_for_test):
    excluded, kept = await _seed(sessionmaker_for_test, {}, {})
    async with sessionmaker_for_test() as session:
        session.add(PickEvent(item_id=excluded, action=PickAction.NEVER))
        session.add(PickEvent(item_id=kept, action=PickAction.SKIPPED))
        await session.commit()

    async with client_for(sessionmaker_for_test) as client:
        listed = {row["id"]: row for row in (await client.get("/api/items")).json()}
        one = (await client.get(f"/api/items/{excluded}")).json()
        patched = (
            await client.patch(f"/api/items/{excluded}", json={"rating": 7})
        ).json()

    assert listed[str(excluded)]["play_next_excluded"] is True
    assert listed[str(kept)]["play_next_excluded"] is False
    assert one["play_next_excluded"] is True
    assert patched["play_next_excluded"] is True
