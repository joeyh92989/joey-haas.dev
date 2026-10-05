"""The catalogue's refresh, resolve and status routes, end to end.

A fake HTTP client serves the recorded fixtures by URL and a fake IGDB
adapter stands in for IGDB, so a full refresh runs against the test Postgres
without a request leaving the process.
"""

import asyncio
import json
from datetime import UTC, datetime, timedelta

import pytest
from physical_support import PHYSICAL, FakeIgdb, client_for, serve_fixtures
from sqlalchemy import func, select

import physical_routes
from models import (
    CatalogueMatch,
    CatalogueRun,
    Item,
    ItemStatus,
    ItemType,
    MatchConfidence,
    MatchDecision,
    OwnedFormat,
    PhysicalEdition,
    StoreListing,
)
from physical_sources import registry_switch1, shopify
from physical_sources.registry import rows_from_values
from sources.base import SourceResult

pytestmark = pytest.mark.asyncio


async def _count(factory, model, *where):
    async with factory() as session:
        return await session.scalar(
            select(func.count()).select_from(model).where(*where)
        )


# --- Gatekeeping ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/physical/refresh"),
        ("post", "/api/physical/refresh-registry"),
        ("post", "/api/physical/refresh-switch1"),
        ("post", "/api/physical/refresh-platform?platform_id=4"),
        ("post", "/api/physical/resolve"),
        ("get", "/api/physical/status"),
    ],
)
async def test_every_route_needs_the_admin(sessionmaker_for_test, method, path):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        assert (await getattr(client, method)(path)).status_code == 401


async def test_an_unknown_store_is_422(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/refresh", json={"stores": ["atari"]}
        )
    assert response.status_code == 422


async def test_switch_1_is_never_ingested(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/physical/refresh-platform?platform_id=130")
    assert response.status_code == 422


# --- Store refresh -------------------------------------------------------------


async def test_refreshing_one_store_writes_its_listings(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/refresh", json={"stores": ["super_rare"]}
        )
    assert response.status_code == 200
    body = response.json()
    (run,) = body["runs"]
    assert (run["source"], run["ok"], run["errors"]) == ("super_rare", True, [])
    assert run["rows_seen"] == run["rows_changed"] > 0
    assert "unresolved_remaining" in body
    assert await _count(sessionmaker_for_test, StoreListing) == run["rows_seen"]


async def test_refreshing_a_woocommerce_store_writes_its_listings(
    sessionmaker_for_test,
):
    """The fixture server answers WooCommerce by category and page."""
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/refresh", json={"stores": ["pixelheart"]}
        )
    (run,) = response.json()["runs"]
    assert (run["source"], run["ok"], run["errors"]) == ("pixelheart", True, [])
    assert run["rows_seen"] > 0
    assert await _count(sessionmaker_for_test, StoreListing) == run["rows_seen"]


async def test_a_robots_refusal_skips_only_that_store(sessionmaker_for_test):
    handler = serve_fixtures(
        robots={"superraregames.com": "User-agent: *\nDisallow: /collections/\n"}
    )
    async with client_for(sessionmaker_for_test, handler=handler) as client:
        body = (
            await client.post(
                "/api/physical/refresh", json={"stores": ["super_rare", "nicalis"]}
            )
        ).json()
    rare, nicalis = body["runs"]
    assert rare["ok"] is False and {e["code"] for e in rare["errors"]} == {
        "robots_disallowed"
    }
    assert nicalis["ok"] is True
    assert (
        await _count(
            sessionmaker_for_test, StoreListing, StoreListing.store == "super_rare"
        )
        == 0
    )
    assert (
        await _count(
            sessionmaker_for_test, StoreListing, StoreListing.store == "nicalis"
        )
        > 0
    )


async def test_an_empty_handle_is_an_error_and_the_rest_write(sessionmaker_for_test):
    handler = serve_fixtures(empty={"switch-2"})
    async with client_for(sessionmaker_for_test, handler=handler) as client:
        (run,) = (
            await client.post("/api/physical/refresh", json={"stores": ["super_rare"]})
        ).json()["runs"]
    assert run["ok"] is True
    assert [e["code"] for e in run["errors"]] == ["empty_collection"]
    assert run["rows_seen"] > 0


async def test_a_second_refresh_during_the_first_is_409(sessionmaker_for_test):
    gate, entered = asyncio.Event(), asyncio.Event()
    handler = serve_fixtures(gate=gate, entered=entered)
    async with client_for(sessionmaker_for_test, handler=handler) as client:
        first = asyncio.create_task(
            client.post("/api/physical/refresh", json={"stores": ["nicalis"]})
        )
        # The first refresh holds the lock once it is waiting on the store.
        await asyncio.wait_for(entered.wait(), timeout=10)
        # Committed at the start, so another session sees it running.
        async with sessionmaker_for_test() as session:
            open_runs = (
                await session.scalars(
                    select(CatalogueRun).where(CatalogueRun.ok.is_(None))
                )
            ).all()
        assert [run.source for run in open_runs] == ["nicalis"]
        second = await client.post("/api/physical/resolve")
        gate.set()
        assert (await first).status_code == 200
    assert second.status_code == 409
    assert second.json()["detail"] == "A refresh is already running"


# --- Registry refresh -----------------------------------------------------------


async def test_the_registry_refresh_reads_both_sources_and_syncs(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add(
            Item(
                type=ItemType.GAME,
                title="A-Train9 Evolution",
                status=ItemStatus.BACKLOG,
                owned_format=OwnedFormat.PHYSICAL,
                external_source="igdb",
                external_id="4242",
                platform_id=508,
                region="JPN",
            )
        )
        await session.commit()
    igdb = FakeIgdb(
        {"A-Train9 Evolution": [SourceResult("4242", "A-Train9 Evolution", 2026)]}
    )
    async with client_for(sessionmaker_for_test, igdb=igdb) as client:
        body = (await client.post("/api/physical/refresh-registry")).json()
    sheet, tracker = body["runs"]
    assert (sheet["source"], sheet["ok"], tracker["source"], tracker["ok"]) == (
        "nscollectors",
        True,
        "switch2tracker",
        True,
    )
    assert sheet["rows_seen"] > 900 and tracker["rows_seen"] > 0
    assert sheet["items_synced"] == 1
    async with sessionmaker_for_test() as session:
        item = (await session.scalars(select(Item))).one()
    assert (item.physical_format.value, item.format_source.value) == (
        "game_key_card",
        "registry",
    )


async def test_without_a_sheets_key_the_tracker_still_runs(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, sheets_key=None) as client:
        body = (await client.post("/api/physical/refresh-registry")).json()
    sheet, tracker = body["runs"]
    assert sheet["ok"] is False
    assert [e["code"] for e in sheet["errors"]] == ["sheets_not_configured"]
    assert tracker["ok"] is True
    assert (
        await _count(
            sessionmaker_for_test,
            PhysicalEdition,
            PhysicalEdition.source == "nscollectors",
        )
        == 0
    )
    assert (
        await _count(
            sessionmaker_for_test,
            PhysicalEdition,
            PhysicalEdition.source == "switch2tracker",
        )
        > 0
    )


# --- N64 and resolve ------------------------------------------------------------


async def test_the_n64_ingest_records_cover_coverage_once(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        first = (
            await client.post("/api/physical/refresh-platform?platform_id=4")
        ).json()
        again = (
            await client.post("/api/physical/refresh-platform?platform_id=4")
        ).json()
    assert first["ok"] is True and first["rows_seen"] == 234
    assert [e["code"] for e in first["errors"]] == ["info"]
    assert "of 234 with a cover" in first["errors"][0]["detail"]
    assert again["errors"] == [] and again["rows_changed"] == 0


async def test_resolve_honours_its_limit(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        # Resolving needs IGDB off here, or the refresh's own batch would
        # clear the work list first.
        async with client_for(
            sessionmaker_for_test, igdb=FakeIgdb(configured=False)
        ) as quiet:
            before = (
                await quiet.post("/api/physical/refresh", json={"stores": ["nicalis"]})
            ).json()["unresolved_remaining"]
        body = (await client.post("/api/physical/resolve?limit=5")).json()
        too_many = await client.post("/api/physical/resolve?limit=201")
    assert before > 5
    assert (body["resolved"] + body["pending"], body["errors"]) == (5, [])
    assert body["unresolved_remaining"] == before - 5
    assert too_many.status_code == 422


# --- Status ---------------------------------------------------------------------


async def test_status_flags_a_source_after_three_failures(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add_all(CatalogueRun(source="gamefairy", ok=False) for _ in range(3))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/physical/status")).json()
    by_source = {s["source"]: s for s in body["sources"]}
    assert len(by_source) == 17
    assert by_source["gamefairy"]["needs_attention"] is True
    assert by_source["nicalis"]["needs_attention"] is False
    assert set(body["totals"]) == {
        "live_editions",
        "live_listings",
        "cached_games",
        "pending_keys",
        "unresolved_keys",
        "keys_without_platform",
        "disagreements",
        "switch1_unmatched",
    }


# --- Failures are recorded, never a 500 (finish-gate review) -------------------


async def test_a_dropped_product_page_does_not_stop_the_refresh(sessionmaker_for_test):
    handler = serve_fixtures(fail_paths=("/products/",))
    async with client_for(sessionmaker_for_test, handler=handler) as client:
        response = await client.post(
            "/api/physical/refresh", json={"stores": ["limited_run", "nicalis"]}
        )
    assert response.status_code == 200
    assert [(run["source"], run["ok"]) for run in response.json()["runs"]] == [
        ("limited_run", True),
        ("nicalis", True),
    ]


async def test_an_unexpected_error_is_that_sources_failed_run(
    sessionmaker_for_test, monkeypatch
):
    real = shopify.list_products

    async def breaking(config, *args, **kwargs):
        if config.key == "super_rare":
            raise RuntimeError("boom")
        return await real(config, *args, **kwargs)

    monkeypatch.setattr(shopify, "list_products", breaking)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/refresh", json={"stores": ["super_rare", "nicalis"]}
        )
    assert response.status_code == 200
    rare, nicalis = response.json()["runs"]
    assert (rare["ok"], rare["errors"]) == (
        False,
        [{"code": "internal", "detail": "RuntimeError"}],
    )
    assert nicalis["ok"] is True


async def test_an_open_run_past_the_stale_window_reads_as_interrupted(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        session.add(
            CatalogueRun(
                source="nicalis",
                started_at=datetime.now(UTC) - timedelta(minutes=45),
                ok=None,
            )
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/physical/status")).json()
    nicalis = next(s for s in body["sources"] if s["source"] == "nicalis")
    assert nicalis["last_run"]["interrupted"] is True
    assert nicalis["consecutive_failures"] == 1


async def _seed_listing(factory, store="super_rare", variant="gone"):
    async with factory() as session:
        session.add(
            StoreListing(
                store=store,
                store_product_id=variant,
                variant_id=variant,
                handle=variant,
                url="https://example.test/gone",
                region="EUR",
                title="Gone",
                title_normalized="gone",
                is_game=True,
                currency="GBP",
                availability="in_stock",
            )
        )
        session.add(CatalogueRun(source=store, ok=True, rows_seen=40))
        await session.commit()


async def test_a_store_run_with_a_failed_handle_archives_nothing(sessionmaker_for_test):
    await _seed_listing(sessionmaker_for_test)
    handler = serve_fixtures(empty={"switch-2"})
    async with client_for(sessionmaker_for_test, handler=handler) as client:
        (run,) = (
            await client.post("/api/physical/refresh", json={"stores": ["super_rare"]})
        ).json()["runs"]
    assert run["ok"] is True and run["rows_retired"] == 0
    async with sessionmaker_for_test() as session:
        gone = await session.scalar(
            select(StoreListing).where(StoreListing.variant_id == "gone")
        )
    assert gone.availability.value == "in_stock"


async def test_a_clean_store_run_archives_what_it_no_longer_saw(sessionmaker_for_test):
    await _seed_listing(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        (run,) = (
            await client.post("/api/physical/refresh", json={"stores": ["super_rare"]})
        ).json()["runs"]
    assert run["rows_retired"] == 1


async def test_a_short_registry_run_retires_nothing(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add(
            PhysicalEdition(
                source="switch2tracker",
                source_ref="gone|USA",
                title="Gone",
                title_normalized="gone",
                platform_id=508,
                platform="Nintendo Switch 2",
                region="USA",
            )
        )
        session.add(CatalogueRun(source="switch2tracker", ok=True, rows_seen=10_000))
        await session.commit()
    async with client_for(sessionmaker_for_test, sheets_key=None) as client:
        _, tracker_run = (await client.post("/api/physical/refresh-registry")).json()[
            "runs"
        ]
    assert tracker_run["short_run"] is True and tracker_run["rows_retired"] == 0


async def test_ignored_platformless_titles_leave_the_total(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add(
            StoreListing(
                store="limited_run",
                store_product_id="1",
                variant_id="1",
                handle="he-man",
                url="https://example.test/he-man",
                region="USA",
                title="He-Man",
                title_normalized="he man",
                is_game=True,
                currency="USD",
                availability="preorder",
            )
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        before = (await client.get("/api/physical/status")).json()["totals"]
        await client.post(
            "/api/physical/matches",
            json={"title_normalized": "he man", "platform_id": 0, "ignored": True},
        )
        after = (await client.get("/api/physical/status")).json()["totals"]
    assert (before["keys_without_platform"], after["keys_without_platform"]) == (1, 0)


@pytest.mark.parametrize("broken", ["super_rare", "nicalis"])
async def test_a_failure_in_any_source_position_is_recorded(
    sessionmaker_for_test, monkeypatch, broken
):
    real = shopify.list_products

    async def breaking(config, *args, **kwargs):
        if config.key == broken:
            raise RuntimeError("boom")
        return await real(config, *args, **kwargs)

    monkeypatch.setattr(shopify, "list_products", breaking)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/refresh", json={"stores": ["super_rare", "nicalis"]}
        )
    assert response.status_code == 200
    runs = {run["source"]: run["ok"] for run in response.json()["runs"]}
    assert runs == {
        "super_rare": broken != "super_rare",
        "nicalis": broken != "nicalis",
    }


async def test_a_failed_resolve_after_the_stores_is_recorded(
    sessionmaker_for_test, monkeypatch
):
    async def failing(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(physical_routes, "resolve_batch", failing)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/physical/refresh", json={"stores": ["nicalis"]}
        )
    assert response.status_code == 200
    assert response.json()["runs"][0]["ok"] is True


async def test_a_failed_registry_sync_is_recorded_on_the_sheet_run(
    sessionmaker_for_test, monkeypatch
):
    async def failing(session):
        raise RuntimeError("boom")

    monkeypatch.setattr(physical_routes, "sync_items", failing)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/physical/refresh-registry")
    assert response.status_code == 200
    sheet, tracker = response.json()["runs"]
    assert {"code": "sync_failed", "detail": "RuntimeError"} in sheet["errors"]
    assert tracker["ok"] is True


# --- Switch 1 registry ----------------------------------------------------------


def _switch_1_editions():
    def tab(name):
        path = PHYSICAL / "registry_switch1" / f"{name}.json"
        return rows_from_values(json.loads(path.read_text()))

    master, _ = registry_switch1.parse_master(tab("master"))
    ciab, _ = registry_switch1.parse_ciab(tab("ciab"))
    return registry_switch1.to_editions(master, ciab)


DEATHS_DOOR = next(
    row["id"]
    for row in json.loads(
        (PHYSICAL / "igdb" / "switch_titles_deaths_door.json").read_text()
    )
    if row["name"] == "Death's Door"
)


async def test_the_switch_1_refresh_writes_decides_and_links(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/physical/refresh-switch1")
        totals = (await client.get("/api/physical/status")).json()["totals"]
    assert response.status_code == 200
    run = response.json()
    assert (run["source"], run["name"], run["ok"]) == (
        "nscollectors_ns1",
        "Switch 1 registry",
        True,
    )
    assert [error["code"] for error in run["errors"]] == ["info"]
    live = await _count(
        sessionmaker_for_test,
        PhysicalEdition,
        PhysicalEdition.source == "nscollectors_ns1",
        PhysicalEdition.platform_id == 130,
    )
    assert run["rows_seen"] == live == len(_switch_1_editions())
    async with sessionmaker_for_test() as session:
        decision = await session.get(CatalogueMatch, ("death s door", 130))
        linked = set(
            await session.scalars(
                select(PhysicalEdition.igdb_id).where(
                    PhysicalEdition.source == "nscollectors_ns1",
                    PhysicalEdition.title_normalized == "death s door",
                )
            )
        )
        automatic = await session.scalar(
            select(func.count())
            .select_from(CatalogueMatch)
            .where(
                CatalogueMatch.platform_id == 130,
                CatalogueMatch.decided_by == MatchDecision.IGNORED,
                CatalogueMatch.match_confidence == MatchConfidence.UNCERTAIN,
            )
        )
    assert (decision.decided_by, decision.match_confidence, decision.igdb_id) == (
        MatchDecision.AUTO,
        MatchConfidence.EXACT,
        DEATHS_DOOR,
    )
    assert linked == {DEATHS_DOOR}
    assert totals["switch1_unmatched"] == automatic > 0


async def test_a_second_switch_1_refresh_changes_nothing(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/physical/refresh-switch1")
        again = (await client.post("/api/physical/refresh-switch1")).json()
    assert (again["ok"], again["rows_changed"], again["rows_retired"]) == (True, 0, 0)


async def test_without_a_sheets_key_the_switch_1_refresh_writes_nothing(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test, sheets_key=None) as client:
        run = (await client.post("/api/physical/refresh-switch1")).json()
    assert run["ok"] is False
    assert [error["code"] for error in run["errors"]] == ["sheets_not_configured"]
    assert await _count(sessionmaker_for_test, PhysicalEdition) == 0


async def test_without_igdb_the_switch_1_refresh_writes_nothing(sessionmaker_for_test):
    igdb = FakeIgdb(configured=False)
    async with client_for(sessionmaker_for_test, igdb=igdb) as client:
        run = (await client.post("/api/physical/refresh-switch1")).json()
    assert (run["ok"], run["rows_seen"]) == (False, 0)
    assert [error["code"] for error in run["errors"]] == ["igdb_not_configured"]
    assert await _count(sessionmaker_for_test, PhysicalEdition) == 0
    assert await _count(sessionmaker_for_test, CatalogueMatch) == 0


async def test_a_switch_1_key_a_store_lists_is_left_to_resolve(sessionmaker_for_test):
    key = next(
        row.title_normalized
        for row in _switch_1_editions()
        if row.title_normalized != "death s door"
    )
    async with sessionmaker_for_test() as session:
        session.add(
            StoreListing(
                store="super_rare",
                store_product_id="s1",
                variant_id="s1",
                handle="s1",
                url="https://example.test/s1",
                region="EUR",
                title=key,
                title_normalized=key,
                platform_id=130,
                platform="Nintendo Switch",
                is_game=True,
                currency="GBP",
                availability="in_stock",
            )
        )
        await session.commit()
    igdb = FakeIgdb(switch_titles=[])
    async with client_for(sessionmaker_for_test, igdb=igdb) as client:
        run = (await client.post("/api/physical/refresh-switch1")).json()
    assert run["ok"] is True and run["unresolved_remaining"] >= 1
    async with sessionmaker_for_test() as session:
        assert await session.get(CatalogueMatch, (key, 130)) is None


async def test_a_switch_1_refresh_during_another_write_is_409(sessionmaker_for_test):
    gate, entered = asyncio.Event(), asyncio.Event()
    handler = serve_fixtures(gate=gate, entered=entered)
    async with client_for(sessionmaker_for_test, handler=handler) as client:
        first = asyncio.create_task(client.post("/api/physical/refresh-switch1"))
        await asyncio.wait_for(entered.wait(), timeout=10)
        second = await client.post("/api/physical/resolve")
        gate.set()
        assert (await first).status_code == 200
    assert second.status_code == 409


async def test_status_lists_the_switch_1_registry(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/physical/status")).json()
    source = next(s for s in body["sources"] if s["source"] == "nscollectors_ns1")
    assert (source["name"], source["kind"], source["last_run"]) == (
        "Switch 1 registry",
        "registry",
        None,
    )
    assert body["totals"]["switch1_unmatched"] == 0


async def test_a_store_refresh_hands_a_hidden_switch_1_title_to_resolve(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        for key, confidence in (
            ("hidden port", MatchConfidence.UNCERTAIN),
            ("kept port", None),
        ):
            session.add(
                StoreListing(
                    store="super_rare",
                    store_product_id=key,
                    variant_id=key,
                    handle=key.replace(" ", "-"),
                    url="https://example.test/x",
                    region="EUR",
                    title=key,
                    title_normalized=key,
                    platform_id=130,
                    platform="Nintendo Switch",
                    is_game=True,
                    currency="GBP",
                    availability="in_stock",
                )
            )
            session.add(
                CatalogueMatch(
                    title_normalized=key,
                    platform_id=130,
                    decided_by=MatchDecision.IGNORED,
                    match_confidence=confidence,
                )
            )
        await session.commit()
    # IGDB off, so the refresh's resolve batch only counts what is open.
    igdb = FakeIgdb(configured=False)
    async with client_for(sessionmaker_for_test, igdb=igdb) as client:
        response = await client.post(
            "/api/physical/refresh", json={"stores": ["nicalis"]}
        )
    assert response.status_code == 200
    async with sessionmaker_for_test() as session:
        assert await session.get(CatalogueMatch, ("hidden port", 130)) is None
        kept = await session.get(CatalogueMatch, ("kept port", 130))
    assert kept.decided_by == MatchDecision.IGNORED
