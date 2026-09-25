"""The catalogue persistence layer, against a real Postgres."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select

from models import CatalogueGame, CatalogueRun, PhysicalEdition, StoreListing
from physical_sources.base import EditionRow, StoreProduct
from physical_sources.catalogue import (
    consecutive_failures,
    count_live,
    failure_streaks,
    finish_run,
    is_short,
    latest_runs,
    previous_rows_seen,
    recently_checked_handles,
    start_run,
    upsert_editions,
    upsert_listings,
)


def edition(ref="a|USA|pub|game card", fmt="game_card", **extra):
    fields = {
        "source": "nscollectors",
        "source_ref": ref,
        "title": "A",
        "title_normalized": "a",
        "platform_id": 508,
        "region": "USA",
        "is_physical": True,
        "physical_format": fmt,
        "format_source": "registry",
        "release_date": date(2026, 11, 19),
        "release_precision": "day",
        **extra,
    }
    return EditionRow(**fields)


def listing(variant="1", **extra):
    fields = {
        "store": "super_rare",
        "store_product_id": "p1",
        "variant_id": variant,
        "handle": "a-game",
        "url": "https://example.test/products/a-game",
        "region": "EUR",
        "title": "A Game",
        "title_normalized": "a game",
        "edition_label": None,
        "platform_id": 508,
        "platform_label": "Nintendo Switch 2",
        "is_game": True,
        "collections_seen": ("switch-2",),
        "price": Decimal("44.99"),
        "currency": "GBP",
        "availability": "in_stock",
        "format_hint": "game_card",
        "format_tier": "store_text",
        "format_evidence": "game with cartridge",
        "raw": {"body": "x"},
        **extra,
    }
    return StoreProduct(**fields)


def _v(value):
    """An enum column's value, whether the session holds the enum or the str."""
    return getattr(value, "value", value)


@pytest_asyncio.fixture
async def session(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        yield session


# --- Runs -------------------------------------------------------------------


def test_is_short():
    assert is_short(40, 100) and not is_short(50, 100)
    assert not is_short(0, None) and not is_short(0, 0)


@pytest.mark.asyncio
async def test_runs_record_and_read_back(session):
    run = await start_run(session, "super_rare")
    assert run.ok is None
    await finish_run(
        session, run, ok=True, rows_seen=10, errors=[{"code": "info", "detail": "x"}]
    )
    await session.commit()
    assert await previous_rows_seen(session, "super_rare") == 10
    latest = await latest_runs(session)
    assert latest["super_rare"].errors == [{"code": "info", "detail": "x"}]


@pytest.mark.asyncio
async def test_consecutive_failures_count_back_to_the_last_success(session):
    now = datetime.now(UTC)
    for minutes, ok in ((50, True), (40, False), (30, False), (20, None)):
        session.add(
            CatalogueRun(
                source="atlus", started_at=now - timedelta(minutes=minutes), ok=ok
            )
        )
    await session.commit()
    # The open run started 20 minutes ago is still running, not failed...
    assert await consecutive_failures(session, "atlus", now) == 2
    # ...until it is older than STALE_RUN_MINUTES.
    later = now + timedelta(minutes=15)
    assert await consecutive_failures(session, "atlus", later) == 3


# --- Editions ---------------------------------------------------------------


async def _editions(session):
    return list(await session.scalars(select(PhysicalEdition)))


@pytest.mark.asyncio
async def test_the_same_rows_twice_change_nothing(session):
    assert await upsert_editions(session, [edition()], "nscollectors", retire=True) == (
        1,
        0,
    )
    await session.commit()
    assert await upsert_editions(session, [edition()], "nscollectors", retire=True) == (
        0,
        0,
    )
    (row,) = await _editions(session)
    assert row.platform == "Nintendo Switch 2"


@pytest.mark.asyncio
async def test_a_changed_row_counts_and_first_seen_stays(session):
    await upsert_editions(session, [edition()], "nscollectors", retire=True)
    await session.commit()
    (before,) = await _editions(session)
    first, last = before.first_seen_at, before.last_seen_at
    changed = await upsert_editions(
        session, [edition(fmt="game_key_card")], "nscollectors", retire=True
    )
    await session.commit()
    (after,) = await _editions(session)
    assert changed == (1, 0)
    assert after.first_seen_at == first and after.last_seen_at > last


@pytest.mark.asyncio
async def test_absent_rows_retire_and_return(session):
    rows = [edition("a"), edition("b")]
    await upsert_editions(session, rows, "nscollectors", retire=True)
    assert await upsert_editions(session, rows[:1], "nscollectors", retire=True) == (
        0,
        1,
    )
    await session.commit()
    retired = {e.source_ref: e.retired_at for e in await _editions(session)}
    assert retired["a"] is None and retired["b"] is not None
    assert await upsert_editions(session, rows, "nscollectors", retire=True) == (1, 0)
    assert all(e.retired_at is None for e in await _editions(session))


@pytest.mark.asyncio
async def test_a_short_run_retires_nothing(session):
    await upsert_editions(
        session, [edition("a"), edition("b")], "nscollectors", retire=True
    )
    assert await upsert_editions(
        session, [edition("a")], "nscollectors", retire=False
    ) == (0, 0)
    assert all(e.retired_at is None for e in await _editions(session))


@pytest.mark.asyncio
async def test_sources_are_retired_separately(session):
    await upsert_editions(session, [edition("a")], "nscollectors", retire=True)
    tracker = edition("a|USA", source="switch2tracker")
    assert await upsert_editions(session, [tracker], "switch2tracker", retire=True) == (
        1,
        0,
    )
    assert all(e.retired_at is None for e in await _editions(session))


@pytest.mark.asyncio
async def test_an_upsert_keeps_the_resolved_game(session):
    session.add(CatalogueGame(igdb_id=7, title="A", snapshot={}))
    await upsert_editions(session, [edition()], "nscollectors", retire=True)
    await session.commit()
    (row,) = await _editions(session)
    row.igdb_id = 7
    await session.commit()
    await upsert_editions(
        session, [edition(fmt="game_key_card")], "nscollectors", retire=True
    )
    (row,) = await _editions(session)
    assert row.igdb_id == 7


# --- Listings ---------------------------------------------------------------


async def _listings(session):
    return list(await session.scalars(select(StoreListing)))


@pytest.mark.asyncio
async def test_listings_upsert_and_archive_keeping_their_evidence(session):
    session.add(CatalogueGame(igdb_id=9, title="A", snapshot={}))
    rows = [listing("1"), listing("2")]
    assert await upsert_listings(session, rows, "super_rare", archive=True) == (2, 0)
    await session.commit()
    for row in await _listings(session):
        row.igdb_id = 9
    await session.commit()
    assert await upsert_listings(session, rows[:1], "super_rare", archive=True) == (
        0,
        1,
    )
    await session.commit()
    gone = next(r for r in await _listings(session) if r.variant_id == "2")
    assert (_v(gone.availability), gone.igdb_id, _v(gone.format_hint)) == (
        "archived",
        9,
        "game_card",
    )
    assert gone.raw == {"body": "x"}


@pytest.mark.asyncio
async def test_a_short_store_run_archives_nothing(session):
    await upsert_listings(
        session, [listing("1"), listing("2")], "super_rare", archive=True
    )
    assert await upsert_listings(
        session, [listing("1")], "super_rare", archive=False
    ) == (0, 0)
    assert {_v(r.availability) for r in await _listings(session)} == {"in_stock"}


@pytest.mark.asyncio
async def test_an_archived_listing_comes_back(session):
    await upsert_listings(session, [listing("1")], "super_rare", archive=True)
    await upsert_listings(session, [], "super_rare", archive=True)
    assert await upsert_listings(
        session, [listing("1")], "super_rare", archive=True
    ) == (1, 0)
    (row,) = await _listings(session)
    assert _v(row.availability) == "in_stock"


@pytest.mark.asyncio
async def test_listing_timestamps(session):
    await upsert_listings(session, [listing("1")], "super_rare", archive=True)
    await session.commit()
    (before,) = await _listings(session)
    first, updated = before.first_seen_at, before.updated_at
    await upsert_listings(session, [listing("1")], "super_rare", archive=True)
    await session.commit()
    (same,) = await _listings(session)
    assert (same.first_seen_at, same.updated_at) == (first, updated)
    await upsert_listings(
        session, [listing("1", price=Decimal("39.99"))], "super_rare", archive=True
    )
    await session.commit()
    (moved,) = await _listings(session)
    assert moved.first_seen_at == first and moved.updated_at > updated


@pytest.mark.asyncio
async def test_a_skipped_page_keeps_what_the_last_read_found(session):
    checked = listing(
        "1",
        format_hint="game_key_card",
        format_tier="store_text",
        format_evidence="Game Key Card",
        release_date=date(2027, 1, 1),
        release_precision="month",
        release_text="Estimated ship date Jan 12 – 31, 2027",
        raw={"html_checked_at": date.today().isoformat()},
    )
    await upsert_listings(session, [checked], "limited_run", archive=True)
    fresh = listing("1", format_hint="game_card", format_tier="store_policy")
    await upsert_listings(session, [fresh], "limited_run", archive=True)
    (row,) = await _listings(session)
    assert (_v(row.format_hint), row.format_evidence) == (
        "game_key_card",
        "Game Key Card",
    )
    assert row.release_date == date(2027, 1, 1)
    assert await recently_checked_handles(session, "limited_run") == {"a-game"}
    assert await recently_checked_handles(session, "super_rare") == frozenset()


@pytest.mark.asyncio
async def test_count_live(session):
    await upsert_editions(
        session, [edition("a"), edition("b")], "nscollectors", retire=True
    )
    await upsert_editions(session, [edition("a")], "nscollectors", retire=True)
    await upsert_listings(session, [listing("1")], "super_rare", archive=True)
    assert await count_live(session) == {"live_editions": 1, "live_listings": 1}


@pytest.mark.asyncio
async def test_failure_streaks_agree_with_consecutive_failures(session):
    now = datetime.now(UTC)
    for source, history in {
        "a": (True, False, False),
        "b": (False, True),
        "c": (True,),
    }.items():
        for minutes, ok in enumerate(history):
            session.add(
                CatalogueRun(
                    source=source,
                    ok=ok,
                    started_at=now - timedelta(minutes=10 - minutes),
                )
            )
    await session.commit()
    streaks = await failure_streaks(session, now)
    for source in ("a", "b", "c"):
        assert streaks[source] == await consecutive_failures(session, source, now)
    assert streaks == {"a": 2, "b": 0, "c": 0}
