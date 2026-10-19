"""The play journal's admin routes (journal_routes.py)."""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from journal_routes import create_journal_router
from models import Item, ItemType, PlaySession

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def client_for(factory, signed_in=True):
    app = FastAPI()
    app.include_router(create_journal_router(factory))
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


async def _item(factory) -> str:
    async with factory() as session:
        item = Item(type=ItemType.GAME, title="Hades II", status="active")
        session.add(item)
        await session.commit()
        return str(item.id)


async def test_a_session_is_logged_listed_and_deleted(sessionmaker_for_test):
    item_id = await _item(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        made = await client.post(
            f"/api/items/{item_id}/sessions",
            json={"played_on": "2026-10-01", "minutes": 90, "note": "  boss 3  "},
        )
        today = await client.post(f"/api/items/{item_id}/sessions", json={})
        listed = (await client.get(f"/api/items/{item_id}/sessions")).json()
        gone = await client.delete(f"/api/items/{item_id}/sessions/{made.json()['id']}")
        after = (await client.get(f"/api/items/{item_id}/sessions")).json()

    assert made.status_code == 201
    assert made.json()["note"] == "boss 3"
    assert today.json()["played_on"] == datetime.now(UTC).date().isoformat()
    assert [row["played_on"] for row in listed][-1] == "2026-10-01"
    assert gone.status_code == 204
    assert len(after) == 1


async def test_a_future_day_and_a_bad_minute_count_are_refused(sessionmaker_for_test):
    item_id = await _item(sessionmaker_for_test)
    tomorrow = (datetime.now(UTC).date() + timedelta(days=1)).isoformat()
    async with client_for(sessionmaker_for_test) as client:
        future = await client.post(
            f"/api/items/{item_id}/sessions", json={"played_on": tomorrow}
        )
        zero = await client.post(f"/api/items/{item_id}/sessions", json={"minutes": 0})
        huge = await client.post(
            f"/api/items/{item_id}/sessions", json={"minutes": 5000}
        )
    assert (future.status_code, zero.status_code, huge.status_code) == (422, 422, 422)


async def test_an_unknown_item_or_session_is_404(sessionmaker_for_test):
    item_id = await _item(sessionmaker_for_test)
    other = "00000000-0000-4000-8000-000000000000"
    async with client_for(sessionmaker_for_test) as client:
        missing_item = await client.post(f"/api/items/{other}/sessions", json={})
        missing_session = await client.delete(f"/api/items/{item_id}/sessions/{other}")
    assert (missing_item.status_code, missing_session.status_code) == (404, 404)


async def test_a_session_on_another_item_is_not_deleted_through_this_one(
    sessionmaker_for_test,
):
    first = await _item(sessionmaker_for_test)
    second = await _item(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        made = (await client.post(f"/api/items/{first}/sessions", json={})).json()
        response = await client.delete(f"/api/items/{second}/sessions/{made['id']}")
    assert response.status_code == 404
    async with sessionmaker_for_test() as session:
        assert len(list(await session.scalars(select(PlaySession)))) == 1


async def test_the_journal_requires_the_admin_session(sessionmaker_for_test):
    item_id = await _item(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.post(f"/api/items/{item_id}/sessions", json={})
    assert response.status_code == 401


async def test_deleting_an_item_deletes_its_sessions(sessionmaker_for_test):
    item_id = await _item(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            f"/api/items/{item_id}/sessions", json={"played_on": "2026-01-02"}
        )
    async with sessionmaker_for_test() as session:
        item = await session.get(Item, uuid.UUID(item_id))
        await session.delete(item)
        await session.commit()
        assert list(await session.scalars(select(PlaySession))) == []
