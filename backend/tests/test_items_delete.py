"""Delete preview, bulk delete and redo: the counts a confirm quotes, the
cascade that follows, and the intake entry a redo leaves behind."""

import uuid
from contextlib import asynccontextmanager
from datetime import date

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

from items import create_items_router
from models import (
    ComicIssue,
    IntakeArea,
    IntakeEntry,
    IntakeEntryState,
    IntakeSitting,
    Item,
    ItemStatus,
    ItemType,
    PickAction,
    PickEvent,
    PlaySession,
    Playthrough,
    PlaythroughOutcome,
)

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


async def _item(factory, title="Hades", item_type=ItemType.GAME, **fields) -> uuid.UUID:
    async with factory() as session:
        item = Item(
            type=item_type,
            title=title,
            status=ItemStatus.BACKLOG,
            is_public=False,
            **fields,
        )
        session.add(item)
        await session.commit()
        return item.id


async def _attach(factory, item_id, *, runs=0, days=0, picks=0, issues=0) -> None:
    async with factory() as session:
        for number in range(1, runs + 1):
            session.add(
                Playthrough(
                    item_id=item_id, number=number, outcome=PlaythroughOutcome.FINISHED
                )
            )
        for day in range(1, days + 1):
            session.add(PlaySession(item_id=item_id, played_on=date(2026, 1, day)))
        for _ in range(picks):
            session.add(PickEvent(item_id=item_id, action=PickAction.SHOWN))
        for number in range(1, issues + 1):
            session.add(
                ComicIssue(
                    item_id=item_id,
                    number=number,
                    cv_id=number,
                    fetched_on=date(2026, 1, 1),
                )
            )
        await session.commit()


async def _count(factory, model) -> int:
    async with factory() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def test_preview_counts_what_goes_with_the_rows(sessionmaker_for_test):
    game = await _item(sessionmaker_for_test, "Hollow Knight")
    comic = await _item(sessionmaker_for_test, "Waterworld", ItemType.COMIC)
    await _attach(sessionmaker_for_test, game, runs=2, days=3, picks=4)
    await _attach(sessionmaker_for_test, comic, issues=5)
    async with client_for(sessionmaker_for_test) as client:
        one = await client.post("/api/items/delete-preview", json={"ids": [str(game)]})
        both = await client.post(
            "/api/items/delete-preview", json={"ids": [str(game), str(comic)]}
        )
    assert one.status_code == 200, one.text
    assert one.json() == {
        "items": 1,
        "playthroughs": 2,
        "play_sessions": 3,
        "comic_issues": 0,
        "pick_events": 4,
        "titles": ["Hollow Knight"],
    }
    assert both.json()["comic_issues"] == 5
    assert both.json()["items"] == 2
    assert sorted(both.json()["titles"]) == ["Hollow Knight", "Waterworld"]


async def test_preview_names_at_most_three_titles(sessionmaker_for_test):
    ids = [await _item(sessionmaker_for_test, f"Game {n}") for n in range(5)]
    async with client_for(sessionmaker_for_test) as client:
        body = (
            await client.post(
                "/api/items/delete-preview", json={"ids": [str(i) for i in ids]}
            )
        ).json()
    assert body["items"] == 5
    assert len(body["titles"]) == 3


async def test_preview_ignores_unknown_ids(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        body = (
            await client.post(
                "/api/items/delete-preview", json={"ids": [str(uuid.uuid4())]}
            )
        ).json()
    assert body["items"] == 0 and body["titles"] == []


async def test_bulk_delete_removes_rows_and_their_children(sessionmaker_for_test):
    comic = await _item(sessionmaker_for_test, "Waterworld", ItemType.COMIC)
    game = await _item(sessionmaker_for_test, "Hollow Knight")
    keep = await _item(sessionmaker_for_test, "Keeper")
    await _attach(sessionmaker_for_test, comic, issues=4)
    await _attach(sessionmaker_for_test, game, runs=1, days=2, picks=1)
    await _attach(sessionmaker_for_test, keep, runs=1)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk-delete", json={"ids": [str(comic), str(game)]}
        )
    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 2}
    assert await _count(sessionmaker_for_test, Item) == 1
    assert await _count(sessionmaker_for_test, ComicIssue) == 0
    assert await _count(sessionmaker_for_test, PlaySession) == 0
    assert await _count(sessionmaker_for_test, PickEvent) == 0
    assert await _count(sessionmaker_for_test, Playthrough) == 1


async def test_bulk_delete_with_an_unknown_id_deletes_nothing(sessionmaker_for_test):
    game = await _item(sessionmaker_for_test)
    ghost = uuid.uuid4()
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk-delete", json={"ids": [str(game), str(ghost)]}
        )
    assert response.status_code == 404
    assert str(ghost) in response.json()["detail"]
    assert await _count(sessionmaker_for_test, Item) == 1


async def test_ids_are_capped_and_required(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        for path in ("/api/items/bulk-delete", "/api/items/delete-preview"):
            empty = await client.post(path, json={"ids": []})
            many = await client.post(
                path, json={"ids": [str(uuid.uuid4()) for _ in range(501)]}
            )
            assert empty.status_code == 422
            assert many.status_code == 422


async def test_signed_out_gets_401(sessionmaker_for_test):
    game = await _item(sessionmaker_for_test)
    body = {"ids": [str(game)]}
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        assert (
            await client.post("/api/items/bulk-delete", json=body)
        ).status_code == 401
        assert (
            await client.post("/api/items/delete-preview", json=body)
        ).status_code == 401
        assert (await client.post(f"/api/items/{game}/redo")).status_code == 401
    assert await _count(sessionmaker_for_test, Item) == 1


async def _entries(factory) -> list[IntakeEntry]:
    async with factory() as session:
        return list((await session.scalars(select(IntakeEntry))).all())


async def test_redo_leaves_one_entry_and_no_item(sessionmaker_for_test):
    game = await _item(
        sessionmaker_for_test,
        "Hades",
        external_source="igdb",
        external_id="113112",
        year=2020,
        creator="Supergiant",
    )
    await _attach(sessionmaker_for_test, game, runs=1, days=1)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(f"/api/items/{game}/redo")
    assert response.status_code == 200, response.text
    body = response.json()
    assert await _count(sessionmaker_for_test, Item) == 0
    assert await _count(sessionmaker_for_test, Playthrough) == 0
    [entry] = await _entries(sessionmaker_for_test)
    assert str(entry.id) == body["entry_id"]
    assert str(entry.sitting_id) == body["sitting_id"]
    assert entry.kind == "game"
    assert entry.state is IntakeEntryState.CHECK
    assert entry.payload["detected_title"] == "Hades"
    assert entry.chosen["title"] == "Hades"
    assert entry.chosen["external_source"] == "igdb"
    assert entry.chosen["external_id"] == "113112"
    async with sessionmaker_for_test() as session:
        sitting = await session.get(IntakeSitting, entry.sitting_id)
    assert sitting.area is IntakeArea.SHELF and sitting.kind == "game"


async def test_redo_of_a_comic_uses_the_comic_kind(sessionmaker_for_test):
    comic = await _item(sessionmaker_for_test, "Waterworld", ItemType.COMIC)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(f"/api/items/{comic}/redo")
    assert response.status_code == 200
    [entry] = await _entries(sessionmaker_for_test)
    assert entry.kind == "comic"
    assert entry.chosen is None


async def test_redo_reuses_the_newest_open_sitting_of_the_same_kind(
    sessionmaker_for_test,
):
    first = await _item(sessionmaker_for_test, "One")
    second = await _item(sessionmaker_for_test, "Two")
    comic = await _item(sessionmaker_for_test, "Three", ItemType.COMIC)
    async with client_for(sessionmaker_for_test) as client:
        a = (await client.post(f"/api/items/{first}/redo")).json()
        b = (await client.post(f"/api/items/{second}/redo")).json()
        c = (await client.post(f"/api/items/{comic}/redo")).json()
    assert a["sitting_id"] == b["sitting_id"]
    assert c["sitting_id"] != a["sitting_id"]
    assert await _count(sessionmaker_for_test, IntakeSitting) == 2
    assert await _count(sessionmaker_for_test, IntakeEntry) == 3


async def test_redo_of_a_missing_item_is_404(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(f"/api/items/{uuid.uuid4()}/redo")
    assert response.status_code == 404
    assert await _count(sessionmaker_for_test, IntakeSitting) == 0
