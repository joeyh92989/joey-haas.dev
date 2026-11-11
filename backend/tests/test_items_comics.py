"""Comic fields through the item routes (comics.apply_comic_fields).

comics.py is tested on its own; this proves create, PATCH and bulk create send
the comic fields through it, answer a bad range with the parser's words, and
that the admin read carries the run summary.
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


def _comic(**fields) -> dict:
    return {"type": "comic", "title": "Saga", "status": "backlog", **fields}


async def _seed(factory, **fields) -> uuid.UUID:
    item = Item(
        **{"type": ItemType.COMIC, "title": "Saga", "status": ItemStatus.BACKLOG}
        | fields
    )
    async with factory() as session:
        session.add(item)
        await session.commit()
        return item.id


async def test_create_stores_canonical_ranges_and_returns_the_run(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items",
            json=_comic(
                issues_owned="7-10, 1-6",
                editions=[{"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}],
                read_to=4,
                shelf_format="singles",
                following=True,
                source_metadata={"released": 12, "ongoing": True},
            ),
        )
    assert response.status_code == 201
    body = response.json()
    assert body["issues_owned"] == "1–10"
    assert (body["shelf_format"], body["following"]) == ("singles", True)
    assert body["comic_run"]["missing"] == 2
    assert body["comic_run"]["read"] == 4


async def test_a_bad_range_is_a_422_in_the_parsers_words(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test, issues_owned="1–3")
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            f"/api/items/{item_id}", json={"issues_owned": "1-3-5"}
        )
        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Issues owned: '1-3-5' is not an issue number or range"
        )
        unchanged = await client.get(f"/api/items/{item_id}")
    assert unchanged.json()["issues_owned"] == "1–3"


async def test_patch_canonicalises_and_the_read_recomputes_the_run(
    sessionmaker_for_test,
):
    item_id = await _seed(sessionmaker_for_test, source_metadata={"released": 5})
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            f"/api/items/{item_id}", json={"issues_owned": "5,1-2", "read_to": 2}
        )
    body = response.json()
    assert body["issues_owned"] == "1–2, 5"
    assert body["comic_run"]["segments"] == [
        {"kind": "owned", "length": 2},
        {"kind": "missing", "length": 2},
        {"kind": "owned", "length": 1},
    ]


async def test_comic_fields_are_refused_on_a_game(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        created = await client.post(
            "/api/items",
            json={"type": "game", "title": "Hades", "status": "backlog"},
        )
        assert created.json()["comic_run"] is None
        response = await client.patch(
            f"/api/items/{created.json()['id']}", json={"issues_owned": "1"}
        )
    assert response.status_code == 422
    assert "comics only" in response.json()["detail"]


async def test_bulk_create_refuses_a_bad_range_naming_the_row(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk",
            json={"items": [_comic(title="Y", issues_owned="0")]},
        )
    assert response.status_code == 422
    assert response.json()["detail"] == "Y: Issues owned: issue numbers start at 1"


async def _patch(factory, seed: dict, body: dict):
    item_id = await _seed(factory, **seed)
    async with client_for(factory) as client:
        response = await client.patch(f"/api/items/{item_id}", json=body)
        stored = (await client.get(f"/api/items/{item_id}")).json()
    return response, stored


async def test_patch_refuses_a_skip_on_an_owned_issue(sessionmaker_for_test):
    response, stored = await _patch(
        sessionmaker_for_test, {"issues_owned": "1-10"}, {"issues_skipped": "7"}
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "#7 is owned, so it can't be skipped"
    assert stored["issues_skipped"] is None


async def test_patch_refuses_a_skip_on_an_edition_issue(sessionmaker_for_test):
    editions = [{"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}]
    response, _ = await _patch(
        sessionmaker_for_test, {"editions": editions}, {"issues_skipped": "4-5"}
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "#4 is owned, so it can't be skipped"


async def test_patch_refuses_owning_an_issue_left_skipped(sessionmaker_for_test):
    response, stored = await _patch(
        sessionmaker_for_test,
        {"issues_owned": "1-6", "issues_skipped": "7"},
        {"issues_owned": "1-7"},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "#7 is owned, so it can't be skipped"
    assert stored["issues_owned"] == "1-6"  # as seeded, unchanged


async def test_patch_owns_and_unskips_in_one_request(sessionmaker_for_test):
    response, stored = await _patch(
        sessionmaker_for_test,
        {"issues_owned": "1-6", "issues_skipped": "7, 9"},
        {"issues_owned": "1-7", "issues_skipped": "9"},
    )
    assert response.status_code == 200, response.text
    assert (stored["issues_owned"], stored["issues_skipped"]) == ("1–7", "9")


async def test_patch_takes_a_write_on_a_row_that_already_clashes(
    sessionmaker_for_test,
):
    # Saved before the rule: #5 is skipped and owned. An unrelated write to
    # the owned issues must not be refused for it.
    response, stored = await _patch(
        sessionmaker_for_test,
        {"issues_owned": "1–10", "issues_skipped": "5"},
        {"issues_owned": "1-11"},
    )
    assert response.status_code == 200, response.text
    assert stored["issues_owned"] == "1–11"


async def test_create_refuses_a_skip_on_an_owned_issue(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items", json=_comic(issues_owned="1-3", issues_skipped="2")
        )
    assert response.status_code == 422
    assert response.json()["detail"] == "#2 is owned, so it can't be skipped"
