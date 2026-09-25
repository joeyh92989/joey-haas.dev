"""Needs match, links, the registry note and the disagreements list."""

import uuid

import pytest
from sqlalchemy import select
from test_physical_resolve import FakeIgdb, edition, listing
from test_physical_routes import client_for

from models import (
    CatalogueGame,
    CatalogueMatch,
    FormatSource,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalEdition,
    PhysicalFormat,
    StoreListing,
)
from physical_sources.catalogue import upsert_editions, upsert_listings
from physical_sources.resolve import pending_keys, resolve_batch
from sources.base import SourceError, SourceNotConfigured, SourceResult

pytestmark = pytest.mark.asyncio


async def _seed_pending(factory):
    """One uncertain key with candidates, and one store key with no platform."""
    async with factory() as session:
        await upsert_editions(
            session, [edition("Star Fox")], "nscollectors", retire=True
        )
        await upsert_listings(
            session,
            [listing("he man", "1", platform_id=None, label=None)],
            "limited_run",
            archive=True,
        )
        found = [SourceResult(str(i), f"Star Fox {i}", 2026) for i in (1, 2, 3, 4)]
        await resolve_batch(session, FakeIgdb({"Star Fox": found}))
        await session.commit()


async def test_needs_match_lists_pending_and_platformless_keys(sessionmaker_for_test):
    await _seed_pending(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/physical/needs-match")).json()
    assert body["total"] == 2
    by_key = {(k["title_normalized"], k["platform_id"]): k for k in body["keys"]}
    star_fox = by_key[("star fox", 508)]
    assert (star_fox["title"], star_fox["sources"], star_fox["rows"]) == (
        "Star Fox",
        ["nscollectors"],
        1,
    )
    assert len(star_fox["candidates"]) == 3
    he_man = by_key[("he man", 0)]
    assert (he_man["platform"], he_man["sources"], he_man["candidates"]) == (
        None,
        ["limited_run"],
        [],
    )


async def test_linking_by_hand(sessionmaker_for_test):
    await _seed_pending(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/matches",
            json={"title_normalized": "star fox", "platform_id": 508, "igdb_id": 2},
        )
        remaining = (await client.get("/api/physical/needs-match")).json()
    assert response.json() == {"action": "linked", "moved": 0}
    assert ("star fox", 508) not in {
        (k["title_normalized"], k["platform_id"]) for k in remaining["keys"]
    }
    async with sessionmaker_for_test() as session:
        match = await session.get(CatalogueMatch, ("star fox", 508))
        assert (match.decided_by.value, match.igdb_id) == ("manual", 2)
        assert await session.get(CatalogueGame, 2) is not None
        (row,) = await session.scalars(select(PhysicalEdition))
        assert row.igdb_id == 2


async def test_ignoring_removes_the_key(sessionmaker_for_test):
    await _seed_pending(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/physical/matches",
            json={"title_normalized": "he man", "platform_id": 0, "ignored": True},
        )
        body = (await client.get("/api/physical/needs-match")).json()
    assert [k["title_normalized"] for k in body["keys"]] == ["star fox"]


async def test_giving_a_platformless_key_a_platform_requeues_it(sessionmaker_for_test):
    await _seed_pending(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/matches",
            json={
                "title_normalized": "he man",
                "platform_id": 0,
                "new_platform_id": 130,
            },
        )
    assert response.json() == {"action": "rekeyed", "moved": 1}
    async with sessionmaker_for_test() as session:
        (row,) = await session.scalars(select(StoreListing))
        assert (row.platform_id, row.platform) == (130, "Nintendo Switch")
        assert ("he man", 130, None, "he man") in await pending_keys(session, 10)


async def test_a_match_body_needs_exactly_one_action(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        both = await client.post(
            "/api/physical/matches",
            json={
                "title_normalized": "x",
                "platform_id": 508,
                "igdb_id": 1,
                "ignored": True,
            },
        )
        none = await client.post(
            "/api/physical/matches", json={"title_normalized": "x", "platform_id": 508}
        )
    assert (both.status_code, none.status_code) == (422, 422)


# --- The registry note and disagreements -----------------------------------------


async def _copy(factory, platform_id=508, **fields) -> uuid.UUID:
    async with factory() as session:
        session.add(CatalogueGame(igdb_id=50, title="A Game", snapshot={}))
        session.add(
            PhysicalEdition(
                source="nscollectors",
                source_ref="a game|USA|pub|game-key card",
                title="A Game",
                title_normalized="a game",
                platform_id=508,
                platform="Nintendo Switch 2",
                region="USA",
                is_physical=True,
                physical_format="game_key_card",
                format_source="registry",
                cart_id="LP-AAC4B-USA-0",
                igdb_id=50,
            )
        )
        item = Item(
            type=ItemType.GAME,
            title="A Game",
            status=ItemStatus.BACKLOG,
            owned_format=OwnedFormat.PHYSICAL,
            external_source="igdb",
            external_id="50",
            platform_id=platform_id,
            **fields,
        )
        session.add(item)
        await session.commit()
        return item.id


async def test_the_registry_note_on_a_disagreeing_copy(sessionmaker_for_test):
    item_id = await _copy(
        sessionmaker_for_test,
        physical_format=PhysicalFormat.GAME_CARD,
        format_source=FormatSource.MANUAL,
    )
    async with client_for(sessionmaker_for_test) as client:
        note = (await client.get(f"/api/physical/items/{item_id}/registry")).json()
        listed = (await client.get("/api/physical/disagreements")).json()
    assert note["agrees"] is False
    assert "LP-AAC4B-USA-0" in note["note"]
    assert note["edition"]["format_words"] == "Game-Key Card"
    (row,) = listed["items"]
    assert (row["title"], row["yours"], row["registry"]) == (
        "A Game",
        "game_card",
        "game_key_card",
    )


async def test_a_switch_1_copy_has_no_registry_line(sessionmaker_for_test):
    item_id = await _copy(sessionmaker_for_test, platform_id=130)
    async with client_for(sessionmaker_for_test) as client:
        note = (await client.get(f"/api/physical/items/{item_id}/registry")).json()
    assert note == {"edition": None, "agrees": None, "note": None}


async def test_an_unknown_item_is_404(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(f"/api/physical/items/{uuid.uuid4()}/registry")
    assert response.status_code == 404


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/physical/needs-match"),
        ("post", "/api/physical/matches"),
        ("get", f"/api/physical/items/{uuid.uuid4()}/registry"),
        ("get", "/api/physical/disagreements"),
    ],
)
async def test_every_route_needs_the_admin(sessionmaker_for_test, method, path):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        assert (await getattr(client, method)(path)).status_code == 401


@pytest.mark.parametrize(
    ("igdb", "status"),
    [
        (FakeIgdb(missing={"2"}), 404),
        (FakeIgdb(fetch_error=SourceNotConfigured("igdb", "no key")), 503),
        (FakeIgdb(fetch_error=SourceError("igdb", "HTTP 500")), 502),
    ],
)
async def test_a_link_that_cannot_be_made_decides_nothing(
    sessionmaker_for_test, igdb, status
):
    await _seed_pending(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, igdb=igdb) as client:
        response = await client.post(
            "/api/physical/matches",
            json={"title_normalized": "star fox", "platform_id": 508, "igdb_id": 2},
        )
    assert response.status_code == status
    async with sessionmaker_for_test() as session:
        match = await session.get(CatalogueMatch, ("star fox", 508))
        assert match.decided_by.value == "pending"


async def test_an_unknown_platform_is_422(sessionmaker_for_test):
    await _seed_pending(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/matches",
            json={
                "title_normalized": "he man",
                "platform_id": 0,
                "new_platform_id": 9999,
            },
        )
    assert response.status_code == 422


async def test_a_rekeyed_platform_survives_the_next_store_refresh(
    sessionmaker_for_test,
):
    await _seed_pending(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/physical/matches",
            json={
                "title_normalized": "he man",
                "platform_id": 0,
                "new_platform_id": 130,
            },
        )
    async with sessionmaker_for_test() as session:
        await upsert_listings(
            session,
            [listing("he man", "1", platform_id=None, label=None)],
            "limited_run",
            archive=True,
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/physical/needs-match")).json()
    assert ("he man", 0) not in {
        (k["title_normalized"], k["platform_id"]) for k in body["keys"]
    }
