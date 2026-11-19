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
from tests.volume_seed import seed_volumes

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


async def _patch(factory, seed: dict, body: dict, volumes: list | None = None):
    """`volumes` are edition-shaped dicts, seeded as owned volumes."""
    item_id = await _seed(factory, **seed)
    if volumes:
        async with factory() as session:
            await seed_volumes(session, await session.get(Item, item_id), volumes)
            await session.commit()
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


async def test_patch_refuses_a_skip_on_a_volume_issue(sessionmaker_for_test):
    books = [{"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}]
    response, _ = await _patch(
        sessionmaker_for_test, {}, {"issues_skipped": "4-5"}, volumes=books
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


async def test_the_admin_read_carries_issues_synced_on(sessionmaker_for_test):
    from datetime import date

    synced = await _seed(sessionmaker_for_test, issues_synced_on=date(2026, 11, 12))
    never = await _seed(sessionmaker_for_test, title="Monstress")
    async with client_for(sessionmaker_for_test) as client:
        first = await client.get(f"/api/items/{synced}")
        second = await client.get(f"/api/items/{never}")
    assert first.json()["issues_synced_on"] == "2026-11-12"
    assert second.json()["issues_synced_on"] is None


async def test_patch_relink_onto_a_held_match_with_a_range_change_is_a_409(
    sessionmaker_for_test,
):
    await _seed(
        sessionmaker_for_test,
        title="Other",
        external_source="comicvine",
        external_id="4363",
    )
    item_id = await _seed(sessionmaker_for_test, issues_owned="1")
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            f"/api/items/{item_id}",
            json={
                "external_source": "comicvine",
                "external_id": "4363",
                "issues_owned": "1-3",
            },
        )
    assert response.status_code == 409, response.text


async def test_patch_away_from_comic_clears_the_marks(sessionmaker_for_test):
    from sqlalchemy import select

    from models import ComicIssue

    async with client_for(sessionmaker_for_test) as client:
        made = await client.post("/api/items", json=_comic(issues_owned="1-2"))
        item_id = made.json()["id"]
        patched = await client.patch(f"/api/items/{item_id}", json={"type": "game"})
    assert patched.status_code == 200, patched.text
    async with sessionmaker_for_test() as session:
        rows = (await session.scalars(select(ComicIssue))).all()
    assert rows == []


async def test_the_admin_read_carries_the_title_kind_and_owned_volume_numbers(
    sessionmaker_for_test,
):
    """The admin shelf draws the same card words as the public one (#331): a
    title's kind, how many books it owns and their line numbers."""
    from models import ComicVolume

    def volume(item_id, slug, position, **fields):
        return ComicVolume(
            **{
                "id": uuid.uuid4(),
                "item_id": item_id,
                "position": position,
                "slug": slug,
                "label": slug,
                "kind": "trade",
                "kind_raw": "Trade",
                "owned": True,
            }
            | fields
        )

    run = await _seed(sessionmaker_for_test, issues_owned="1-3")
    line = await _seed(sessionmaker_for_test, title="Line")
    async with sessionmaker_for_test() as session:
        session.add_all(
            [
                volume(line, "vol-4", 0, line_number=4),
                volume(line, "vol-1", 1, line_number=1),
                volume(line, "vol-1b", 2, line_number=1),
                volume(line, "vol-x", 3),
                volume(line, "vol-9", 4, line_number=9, owned=False),
            ]
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        run_body = (await client.get(f"/api/items/{run}")).json()["comic_run"]
        line_body = (await client.get(f"/api/items/{line}")).json()["comic_run"]
    assert (run_body["kind"], run_body["volumes_owned"]) == ("run", 0)
    assert run_body["volume_numbers"] == []
    assert (line_body["kind"], line_body["volumes_owned"]) == ("book_line", 4)
    assert line_body["volume_numbers"] == [1, 4]
    # vol-1 and vol-1b share a number (numbered); only vol-x has none.
    assert (line_body["volumes_unnumbered"], run_body["volumes_unnumbered"]) == (1, 0)


# --- Editions are gone (5/5): a stray key is ignored -------------------------

TPB = [{"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}]


async def test_a_stray_editions_key_is_ignored_not_refused(sessionmaker_for_test):
    """The column and its schema field are dropped (0025): `editions` is an
    unknown key like any other, so an old client gets a 2xx, not a 422 or 500,
    and nothing is stored or echoed."""
    async with client_for(sessionmaker_for_test) as client:
        created = await client.post("/api/items", json=_comic(editions=TPB))
        assert created.status_code == 201, created.text
        bulk = await client.post(
            "/api/items/bulk", json={"items": [_comic(title="B", editions=TPB)]}
        )
        assert bulk.status_code == 201, bulk.text
        patched = await client.patch(
            f"/api/items/{created.json()['id']}",
            json={"editions": TPB, "issues_owned": "1-3"},
        )
    assert patched.status_code == 200, patched.text
    assert "editions" not in created.json()
    assert "editions" not in patched.json()
    assert patched.json()["issues_owned"] == "1–3"  # canonicalised
    async with sessionmaker_for_test() as session:
        stored = await session.get(Item, uuid.UUID(created.json()["id"]))
        assert not hasattr(stored, "editions")


async def test_the_edition_link_route_is_gone(sessionmaker_for_test):
    from comics_routes import create_comics_router

    app = FastAPI()
    app.include_router(create_comics_router(sessionmaker_for_test, {}))
    paths = set(app.openapi()["paths"])
    assert not any("/editions/" in path for path in paths)
