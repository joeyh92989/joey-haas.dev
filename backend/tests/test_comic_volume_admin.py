"""#334 (PR 4a): the admin routes that add, edit, move, delete and link a
volume. Marks follow every touched title; the edition shim never resurrects
or overwrites what the admin did."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from comics import sync_marks
from comics_routes import create_comics_router
from models import (
    ComicVolume,
    ComicVolumeCollect,
    Item,
    ItemStatus,
    ItemType,
)
from public import create_public_router
from tests.test_comic_issues_sync import PagingComicVine, _cv
from tests.test_comic_volume_marks import ed, make, marks, volumes
from tests.test_comics_routes import client_for

pytestmark = pytest.mark.asyncio

BASE = "/api/comics"


def body(**extra) -> dict:
    return {"label": "Book", "kind": "trade", **extra}


def put_body(**extra) -> dict:
    return {
        "label": "Book",
        "kind": "trade",
        "owned": True,
        "read": False,
        "collects": [],
        **extra,
    }


async def create(client, item_id, **extra) -> dict:
    response = await client.post(f"{BASE}/{item_id}/volumes", json=body(**extra))
    assert response.status_code == 201, response.text
    return response.json()


async def get_volume(factory, volume_id) -> ComicVolume:
    async with factory() as session:
        return await session.get(ComicVolume, uuid.UUID(str(volume_id)))


async def collects_of(factory, volume_id) -> list[ComicVolumeCollect]:
    async with factory() as session:
        return list(
            await session.scalars(
                select(ComicVolumeCollect)
                .where(ComicVolumeCollect.volume_id == uuid.UUID(str(volume_id)))
                .order_by(ComicVolumeCollect.position)
            )
        )


def link(item_id, low, high) -> dict:
    return {"item_id": str(item_id), "from_number": low, "to_number": high}


# --- auth ---------------------------------------------------------------------


@asynccontextmanager
async def anonymous(factory):
    app = FastAPI()
    app.include_router(create_comics_router(factory, {}))
    app.add_middleware(SessionMiddleware, secret_key="s", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def test_every_volume_route_is_admin_only_and_auth_precedes_validation(
    sessionmaker_for_test,
):
    some = uuid.uuid4()
    calls = [
        ("get", f"{BASE}/volumes/{some}", None),
        ("post", f"{BASE}/{some}/volumes", {}),
        ("put", f"{BASE}/volumes/{some}", {}),
        ("post", f"{BASE}/volumes/{some}/move", {}),
        ("get", f"{BASE}/volumes/{some}/delete-preview", None),
        ("delete", f"{BASE}/volumes/{some}", None),
        ("put", f"{BASE}/volumes/{some}/link", {}),
    ]
    async with anonymous(sessionmaker_for_test) as client:
        for method, path, payload in calls:
            kwargs = {} if payload is None else {"json": payload}
            response = await getattr(client, method)(path, **kwargs)
            assert response.status_code == 401, (method, path)


# --- create -------------------------------------------------------------------


async def test_create_names_the_smallest_free_vol_slug_and_appends(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory)
    async with client_for(factory, PagingComicVine()) as client:
        first = await create(client, item_id, label=" One ", isbn="  ")
        second = await create(client, item_id, label="Two", line_number=2, pages=96)
        deleted = await client.delete(f"{BASE}/volumes/{first['id']}")
        assert deleted.status_code == 200
        third = await create(client, item_id, label="Three")
    assert (first["slug"], second["slug"], third["slug"]) == ("vol-1", "vol-2", "vol-1")
    assert first["label"] == "One" and first["isbn"] is None
    assert first["position"] == 0 and second["position"] == 1
    assert third["position"] == 2  # max + 1, never reused
    assert (first["owned"], first["read"], first["edited"]) == (True, False, True)
    assert second["kind_raw"] is None and second["pages"] == 96


async def test_create_422_and_404(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id = await make(factory)
    async with factory() as session:
        game = Item(type=ItemType.GAME, title="G", status=ItemStatus.BACKLOG)
        session.add(game)
        await session.commit()
        game_id = game.id
    async with client_for(factory, PagingComicVine()) as client:
        for bad in (
            body(label=""),
            body(label="x" * 81),
            body(kind="zine"),
            body(line_number=0),
            body(line_number=10000),
            body(cover_url="https://x"),
            {"kind": "trade"},
        ):
            response = await client.post(f"{BASE}/{item_id}/volumes", json=bad)
            assert response.status_code == 422, bad
        for target in (game_id, uuid.uuid4()):
            response = await client.post(f"{BASE}/{target}/volumes", json=body())
            assert response.status_code == 404


# --- read ---------------------------------------------------------------------


async def test_admin_view_shows_a_private_title_the_public_route_hides(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory, title="Secret", is_public=False)
    other = await make(factory, title="Other", is_public=True)
    async with client_for(factory, PagingComicVine()) as client:
        a = await create(client, item_id, label="A", line_number=2, owned=False)
        b = await create(client, item_id, label="B", line_number=1)
        c = await create(client, item_id, label="C")
        replaced = await client.put(
            f"{BASE}/volumes/{b['id']}",
            json=put_body(
                label="B",
                line_number=1,
                collects=[
                    {
                        "series_name": "Secret",
                        "issue_text": "#1-3",
                        "link": link(item_id, 1, 3),
                    },
                    {
                        "series_name": "Other",
                        "issue_text": "#4",
                        "link": link(other, 4, 4),
                    },
                    {"series_name": "Text only", "issue_text": ""},
                ],
            ),
        )
        assert replaced.status_code == 200, replaced.text
        view = (await client.get(f"{BASE}/volumes/{b['id']}")).json()
    assert view["title"] == {"id": str(item_id), "title": "Secret", "is_public": False}
    assert view["edited"] is True and view["held_issues"] == "1–3"
    assert view["held_count"] == 3
    assert [x["series_name"] for x in view["collects"]] == [
        "Secret",
        "Other",
        "Text only",
    ]
    assert view["collects"][0]["link"] == {
        "item_id": str(item_id),
        "title": "Secret",
        "from_number": 1,
        "to_number": 3,
        "is_public": False,
    }
    assert view["collects"][1]["link"]["is_public"] is True
    assert view["collects"][2]["link"] is None
    # The line: numbered books by number, then the rest; unowned shows to admin.
    assert view["prev"] is None and view["next"]["id"] == a["id"]
    assert view["next"]["owned"] is False
    async with anonymous_public(factory) as pub:
        assert (
            await pub.get(f"/api/public/items/{item_id}/volumes/{b['slug']}")
        ).status_code == 404
    assert c["slug"] == "vol-3"


@asynccontextmanager
async def anonymous_public(factory):
    app = FastAPI()
    app.include_router(create_public_router(factory))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def test_get_unknown_volume_is_404(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, PagingComicVine()) as client:
        for path in (
            f"{BASE}/volumes/{uuid.uuid4()}",
            f"{BASE}/volumes/{uuid.uuid4()}/delete-preview",
        ):
            assert (await client.get(path)).status_code == 404


# --- replace ------------------------------------------------------------------


async def test_replace_sets_fields_collects_in_order_and_marks_the_other_title(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    hellboy = await make(factory, title="Hellboy")
    bprd = await make(factory, title="BPRD")
    async with client_for(factory, PagingComicVine()) as client:
        volume = await create(client, hellboy)
        response = await client.put(
            f"{BASE}/volumes/{volume['id']}",
            json=put_body(
                label="Crossover",
                kind="omnibus",
                isbn="978-1",
                pages=300,
                description="About.",
                collects=[
                    {
                        "series_name": "BPRD",
                        "issue_text": "#1-3",
                        "link": link(bprd, 1, 3),
                    },
                    {"series_name": "Hellboy", "issue_text": "#9"},
                ],
            ),
        )
        assert response.status_code == 200, response.text
        out = response.json()
        assert out["label"] == "Crossover" and out["kind"] == "omnibus"
        assert [c["series_name"] for c in out["collects"]] == ["BPRD", "Hellboy"]
        assert all(c["source"] == "typed" for c in out["collects"])
        assert await marks(factory, bprd) == {
            1: (True, False, False),
            2: (True, False, False),
            3: (True, False, False),
        }
        assert await marks(factory, hellboy) == {}
        # Unlink it: the other title's marks go with the link.
        kept = out["collects"][1]
        cleared = await client.put(
            f"{BASE}/volumes/{volume['id']}",
            json=put_body(
                collects=[
                    {"id": kept["id"], "series_name": "Hellboy", "issue_text": "#9"}
                ]
            ),
        )
        assert cleared.status_code == 200, cleared.text
    assert await marks(factory, bprd) == {}
    assert cleared.json()["collects"][0]["id"] == kept["id"]


async def test_replace_keeps_the_source_and_id_of_an_unchanged_entry(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("Vol 1", 1, 6)])
    (volume,) = await volumes(factory, item_id)
    stored = (await collects_of(factory, volume.id))[0]
    assert stored.source == "migrated"
    entry = {
        "id": str(stored.id),
        "series_name": stored.series_name,
        "issue_text": stored.issue_text,
        "link": link(item_id, 1, 6),
    }
    async with client_for(factory, PagingComicVine()) as client:
        same = await client.put(
            f"{BASE}/volumes/{volume.id}", json=put_body(collects=[entry])
        )
        assert same.status_code == 200, same.text
        assert same.json()["collects"][0]["source"] == "migrated"
        assert same.json()["collects"][0]["id"] == str(stored.id)
        # Changed text with a stored source sent back: refused; typed: fine.
        changed = {**entry, "issue_text": "#1-5", "source": "migrated"}
        refused = await client.put(
            f"{BASE}/volumes/{volume.id}", json=put_body(collects=[changed])
        )
        assert refused.status_code == 422
        assert refused.json()["detail"][0]["loc"] == ["body", "collects", 0, "source"]
        changed["source"] = "typed"
        ok = await client.put(
            f"{BASE}/volumes/{volume.id}", json=put_body(collects=[changed])
        )
        assert ok.status_code == 200
        assert ok.json()["collects"][0]["source"] == "typed"
        assert ok.json()["collects"][0]["id"] == str(stored.id)
        # A new entry may not claim another source.
        new = {"series_name": "x", "issue_text": "", "source": "parsed"}
        assert (
            await client.put(
                f"{BASE}/volumes/{volume.id}", json=put_body(collects=[new])
            )
        ).status_code == 422


async def test_replace_422s_name_the_field(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id = await make(factory)
    game = None
    async with factory() as session:
        game = Item(type=ItemType.GAME, title="G", status=ItemStatus.BACKLOG)
        session.add(game)
        await session.commit()
    async with client_for(factory, PagingComicVine()) as client:
        volume = await create(client, item_id)
        path = f"{BASE}/volumes/{volume['id']}"

        async def refused(collects, loc_tail):
            response = await client.put(path, json=put_body(collects=collects))
            assert response.status_code == 422, collects
            locs = [e["loc"] for e in response.json()["detail"]]
            assert any(
                loc[:3] == ["body", "collects", 0] and loc[3:] == loc_tail
                for loc in locs
            ), locs

        name = {"series_name": "S", "issue_text": ""}
        await refused([{**name, "series_name": ""}], ["series_name"])
        await refused([{**name, "series_name": "x" * 121}], ["series_name"])
        await refused([{**name, "issue_text": "x" * 201}], ["issue_text"])
        await refused([{**name, "id": str(uuid.uuid4())}], ["id"])
        await refused([{**name, "link": link(item_id, 5, 2)}], ["link"])
        await refused([{**name, "link": link(item_id, 0, 2)}], ["link", "from_number"])
        await refused(
            [{**name, "link": link(item_id, 1, 10000)}], ["link", "to_number"]
        )
        await refused(
            [{**name, "link": {"item_id": str(item_id), "from_number": 1}}],
            ["link", "to_number"],
        )
        await refused([{**name, "link": link(uuid.uuid4(), 1, 2)}], ["link", "item_id"])
        await refused([{**name, "link": link(game.id, 1, 2)}], ["link", "item_id"])
        # Empty issue text is allowed.
        ok = await client.put(path, json=put_body(collects=[name]))
        assert ok.status_code == 200
        assert (await client.put(path, json=put_body(label=""))).status_code == 422
        assert (
            await client.put(path, json={**put_body(), "edited": False})
        ).status_code == 422
        assert (
            await client.put(f"{BASE}/volumes/{uuid.uuid4()}", json=put_body())
        ).status_code == 404


async def test_replace_404s_after_the_shim_drops_a_vanished_edition_volume(
    sessionmaker_for_test,
):
    """The shim runs after the title is locked and before the volume is read:
    a volume whose edition is gone is already gone by then."""
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("Vol 1", 1, 6)])
    (volume,) = await volumes(factory, item_id)
    async with factory() as session:
        item = await session.get(Item, item_id)
        item.editions = []  # a writer that skipped sync_marks
        await session.commit()
    async with client_for(factory, PagingComicVine()) as client:
        response = await client.put(f"{BASE}/volumes/{volume.id}", json=put_body())
    assert response.status_code == 404
    assert await volumes(factory, item_id) == []


async def test_an_edited_volume_is_not_overwritten_by_the_shim_afterwards(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("Vol 1", 1, 6)])
    (volume,) = await volumes(factory, item_id)
    async with client_for(factory, PagingComicVine()) as client:
        response = await client.put(
            f"{BASE}/volumes/{volume.id}", json=put_body(label="Mine", kind="ogn")
        )
        assert response.status_code == 200
    async with factory() as session:
        item = await session.get(Item, item_id)
        item.editions = [ed("Theirs", 1, 6, "Hardcover")]
        await sync_marks(session, item)
        await session.commit()
    (after,) = await volumes(factory, item_id)
    assert (after.label, after.kind, after.edited) == ("Mine", "ogn", True)


# --- move ---------------------------------------------------------------------


async def test_move_keeps_a_free_slug_and_renames_on_collision(sessionmaker_for_test):
    factory = sessionmaker_for_test
    a = await make(factory, title="A")
    b = await make(factory, title="B")
    async with client_for(factory, PagingComicVine()) as client:
        one = await create(client, a)  # vol-1 on A
        await create(client, b)  # vol-1 on B: a collision
        collided = await client.post(
            f"{BASE}/volumes/{one['id']}/move", json={"item_id": str(b)}
        )
        assert collided.status_code == 200, collided.text
        out = collided.json()
        assert (out["previous_slug"], out["slug_kept"]) == ("vol-1", False)
        assert out["volume"]["slug"] == "vol-2" and out["volume"]["item_id"] == str(b)
        assert out["volume"]["position"] == 1  # max + 1 on the new title
        assert sorted(out["touched"]) == sorted([str(a), str(b)])
        # vol-2 is free on A: moving it back keeps the slug.
        back = await client.post(
            f"{BASE}/volumes/{one['id']}/move", json={"item_id": str(a)}
        )
        assert back.json()["slug_kept"] is True
        assert back.json()["volume"]["slug"] == "vol-2"
        # Same title and non-comic targets.
        same = await client.post(
            f"{BASE}/volumes/{one['id']}/move", json={"item_id": str(a)}
        )
        assert same.status_code == 422
        missing = await client.post(
            f"{BASE}/volumes/{one['id']}/move", json={"item_id": str(uuid.uuid4())}
        )
        assert missing.status_code == 404


async def test_move_follows_the_marks_and_pulls_an_edition_entry_out(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    a = await make(factory, title="A", editions=[ed("V1", 1, 6), ed("V2", 7, 9)])
    b = await make(factory, title="B")
    v1 = (await volumes(factory, a))[0]
    assert await marks(factory, a) and v1.slug == "ed-1-6"
    async with client_for(factory, PagingComicVine()) as client:
        response = await client.post(
            f"{BASE}/volumes/{v1.id}/move", json={"item_id": str(b)}
        )
        assert response.status_code == 200, response.text
        assert response.json()["slug_kept"] is True  # ed-1-6 is free on B
    async with factory() as session:
        item = await session.get(Item, a)
        assert [e["label"] for e in item.editions] == ["V2"]
    # The moved book's collects still link A's 1-6, so A still holds them;
    # but the shim cannot recreate the book on A.
    for _ in range(2):
        async with factory() as session:
            await sync_marks(session, await session.get(Item, a))
            await session.commit()
    assert [v.slug for v in await volumes(factory, a)] == ["ed-7-9"]
    assert sorted(await marks(factory, a)) == list(range(1, 10))
    (moved,) = await volumes(factory, b)
    assert moved.id == v1.id and moved.edited is True


# --- delete -------------------------------------------------------------------


async def test_delete_preview_names_what_stops_being_held(sessionmaker_for_test):
    factory = sessionmaker_for_test
    a = await make(factory, title="A", issues_owned="3")
    b = await make(factory, title="B")
    async with client_for(factory, PagingComicVine()) as client:
        volume = await create(client, a, read=True)
        await client.put(
            f"{BASE}/volumes/{volume['id']}",
            json=put_body(
                read=True,
                collects=[
                    {"series_name": "A", "issue_text": "#1-4", "link": link(a, 1, 4)},
                    {"series_name": "B", "issue_text": "#1-2", "link": link(b, 1, 2)},
                ],
            ),
        )
        preview = await client.get(f"{BASE}/volumes/{volume['id']}/delete-preview")
    assert preview.status_code == 200, preview.text
    out = preview.json()
    assert (out["label"], out["title"], out["collects_count"]) == ("Book", "A", 2)
    by_title = {u["title"]: u for u in out["issues_unheld"]}
    # 3 stays held as a loose single, so it is not listed for A.
    assert by_title["A"]["numbers"] == "1–2, 4" and by_title["A"]["count"] == 3
    assert by_title["B"]["numbers"] == "1–2"
    assert out["read_marks_lost"] == 5
    # A preview changes nothing.
    assert (await get_volume(factory, volume["id"])) is not None
    assert sorted(await marks(factory, b)) == [1, 2]


async def test_delete_an_edition_volume_stays_gone_after_resyncs(sessionmaker_for_test):
    """The key regression: the shim must not recreate a deleted ed-* volume."""
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("V1", 1, 6), ed("V2", 7, 9)])
    v1 = (await volumes(factory, item_id))[0]
    async with client_for(factory, PagingComicVine()) as client:
        response = await client.delete(f"{BASE}/volumes/{v1.id}")
        assert response.status_code == 200, response.text
        assert response.json() == {
            "id": str(v1.id),
            "item_id": str(item_id),
            "touched": [str(item_id)],
        }
        assert (await client.delete(f"{BASE}/volumes/{v1.id}")).status_code == 404
    for _ in range(2):
        async with factory() as session:
            await sync_marks(session, await session.get(Item, item_id))
            await session.commit()
    assert [v.slug for v in await volumes(factory, item_id)] == ["ed-7-9"]
    assert sorted(await marks(factory, item_id)) == [7, 8, 9]
    async with factory() as session:
        item = await session.get(Item, item_id)
        assert [e["label"] for e in item.editions] == ["V2"]
        assert not list(
            await session.scalars(
                select(ComicVolumeCollect).where(ComicVolumeCollect.volume_id == v1.id)
            )
        )


async def test_delete_resyncs_a_cross_series_link_target(sessionmaker_for_test):
    factory = sessionmaker_for_test
    a = await make(factory, title="A")
    b = await make(factory, title="B")
    async with client_for(factory, PagingComicVine()) as client:
        volume = await create(client, a)
        await client.put(
            f"{BASE}/volumes/{volume['id']}",
            json=put_body(
                collects=[
                    {"series_name": "B", "issue_text": "#1-3", "link": link(b, 1, 3)}
                ]
            ),
        )
        assert sorted(await marks(factory, b)) == [1, 2, 3]
        response = await client.delete(f"{BASE}/volumes/{volume['id']}")
    assert response.status_code == 200
    assert sorted(response.json()["touched"]) == sorted([str(a), str(b)])
    assert await marks(factory, b) == {}


# --- Comic Vine link ------------------------------------------------------------


async def test_link_fetches_cover_and_description_server_side(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id = await make(factory)
    source = PagingComicVine()
    source.linkable[99] = _cv(99, 1)
    async with client_for(factory, source) as client:
        volume = await create(client, item_id)
        path = f"{BASE}/volumes/{volume['id']}/link"
        # Never from the client.
        assert (
            await client.put(path, json={"cv_id": 99, "cover_url": "https://x"})
        ).status_code == 422
        response = await client.put(path, json={"cv_id": 99})
        assert response.status_code == 200, response.text
        assert response.json() == {
            "id": volume["id"],
            "cv_id": 99,
            "cover_url": "https://img/99.jpg",
            "large_url": "https://img/99-large.jpg",
            "description": "Para.",
            "edited": True,
        }
        assert (await client.put(path, json={"cv_id": 5})).status_code == 422
        cleared = await client.put(path, json={"cv_id": None})
        assert cleared.status_code == 200
        assert (
            await client.put(f"{BASE}/volumes/{uuid.uuid4()}/link", json={"cv_id": 99})
        ).status_code == 404
    stored = await get_volume(factory, volume["id"])
    assert (stored.cv_id, stored.cover_url, stored.large_url, stored.description) == (
        None,
        None,
        None,
        None,
    )


async def test_link_marks_an_edition_volume_edited_so_the_shim_leaves_it(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("V1", 1, 6)])
    (volume,) = await volumes(factory, item_id)
    source = PagingComicVine()
    source.linkable[99] = _cv(99, 1)
    async with client_for(factory, source) as client:
        assert (
            await client.put(f"{BASE}/volumes/{volume.id}/link", json={"cv_id": 99})
        ).status_code == 200
    async with factory() as session:
        item = await session.get(Item, item_id)
        item.editions = [ed("V1", 1, 6)]  # no cover on the edition
        await sync_marks(session, item)
        await session.commit()
    assert (await get_volume(factory, volume.id)).cover_url == "https://img/99.jpg"


# --- review fixes: edited ed-* volumes, duplicate ids, kind_raw, cv_id cap -------


async def resync_twice(factory, item_id):
    for _ in range(2):
        async with factory() as session:
            await sync_marks(session, await session.get(Item, item_id))
            await session.commit()


async def editions_of(factory, item_id):
    async with factory() as session:
        return (await session.get(Item, item_id)).editions


async def test_deleting_an_edited_edition_volume_keeps_it_gone(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("V1", 1, 6), ed("V2", 7, 9)])
    v1 = (await volumes(factory, item_id))[0]
    async with client_for(factory, PagingComicVine()) as client:
        edited = await client.put(
            f"{BASE}/volumes/{v1.id}", json=put_body(label="Mine")
        )
        assert edited.status_code == 200
        assert (await client.delete(f"{BASE}/volumes/{v1.id}")).status_code == 200
    await resync_twice(factory, item_id)
    assert [v.slug for v in await volumes(factory, item_id)] == ["ed-7-9"]
    assert [e["label"] for e in await editions_of(factory, item_id)] == ["V2"]


async def test_moving_an_edited_edition_volume_does_not_duplicate_it(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    a = await make(factory, title="A", editions=[ed("V1", 1, 6)])
    b = await make(factory, title="B")
    (v1,) = await volumes(factory, a)
    async with client_for(factory, PagingComicVine()) as client:
        await client.put(f"{BASE}/volumes/{v1.id}", json=put_body(label="Mine"))
        moved = await client.post(
            f"{BASE}/volumes/{v1.id}/move", json={"item_id": str(b)}
        )
        assert moved.status_code == 200, moved.text
    await resync_twice(factory, a)
    await resync_twice(factory, b)
    assert await volumes(factory, a) == []
    assert await editions_of(factory, a) == []
    assert [v.id for v in await volumes(factory, b)] == [v1.id]


async def test_deleting_the_second_of_two_same_range_editions_removes_its_entry(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("A", 1, 3), ed("B", 1, 3)])
    first, second = await volumes(factory, item_id)
    assert (first.slug, second.slug) == ("ed-1-3", "ed-1-3-2")
    async with client_for(factory, PagingComicVine()) as client:
        await client.put(f"{BASE}/volumes/{second.id}", json=put_body(label="B2"))
        assert (await client.delete(f"{BASE}/volumes/{second.id}")).status_code == 200
    await resync_twice(factory, item_id)
    assert [e["label"] for e in await editions_of(factory, item_id)] == ["A"]
    assert [(v.id, v.slug) for v in await volumes(factory, item_id)] == [
        (first.id, "ed-1-3")
    ]


async def test_deleting_an_edited_edition_volume_whose_entry_is_gone_is_fine(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("V1", 1, 6)])
    (v1,) = await volumes(factory, item_id)
    async with client_for(factory, PagingComicVine()) as client:
        await client.put(f"{BASE}/volumes/{v1.id}", json=put_body(label="Mine"))
        async with factory() as session:
            (await session.get(Item, item_id)).editions = []
            await session.commit()
        response = await client.delete(f"{BASE}/volumes/{v1.id}")
    assert response.status_code == 200, response.text
    assert await volumes(factory, item_id) == []


async def test_replace_refuses_the_same_entry_id_twice(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("V1", 1, 6)])
    (v1,) = await volumes(factory, item_id)
    stored = (await collects_of(factory, v1.id))[0]
    entry = {
        "id": str(stored.id),
        "series_name": stored.series_name,
        "issue_text": stored.issue_text,
        "link": link(item_id, 1, 6),
    }
    async with client_for(factory, PagingComicVine()) as client:
        response = await client.put(
            f"{BASE}/volumes/{v1.id}", json=put_body(collects=[entry, entry])
        )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "collects", 1, "id"]
    assert len(await collects_of(factory, v1.id)) == 1


async def test_replace_clears_kind_raw_only_when_the_kind_changes(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id = await make(factory, editions=[ed("V1", 1, 6, "Trade")])
    (v1,) = await volumes(factory, item_id)
    assert v1.kind_raw == "Trade"
    async with client_for(factory, PagingComicVine()) as client:
        same = await client.put(f"{BASE}/volumes/{v1.id}", json=put_body(kind="trade"))
        assert same.json()["kind_raw"] == "Trade"
        changed = await client.put(
            f"{BASE}/volumes/{v1.id}", json=put_body(kind="omnibus")
        )
    assert changed.json()["kind_raw"] is None


async def test_link_refuses_a_cv_id_beyond_the_integer_column(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id = await make(factory)
    source = PagingComicVine()
    source.linkable[2147483648] = _cv(2147483648, 1)  # Comic Vine would answer
    async with client_for(factory, source) as client:
        volume = await create(client, item_id)
        path = f"{BASE}/volumes/{volume['id']}/link"
        response = await client.put(path, json={"cv_id": 2147483648})
        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["body", "cv_id"]
    assert ("issue", "2147483648") not in source.calls
