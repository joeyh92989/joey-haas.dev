"""Registry sync onto owned items, and the disagreements list."""

from datetime import UTC, datetime

import pytest
import pytest_asyncio

from models import (
    CatalogueGame,
    FormatSource,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalEdition,
    PhysicalFormat,
)
from physical_sources.sync import disagreements, sync_items

GAME = 100


@pytest_asyncio.fixture
async def session(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add(CatalogueGame(igdb_id=GAME, title="A Game", snapshot={}))
        await session.flush()
        yield session


def edition(
    fmt="game_key_card", region="USA", is_physical=True, cart_id=None, ref=None
):
    return PhysicalEdition(
        source="nscollectors",
        source_ref=ref or f"a game|{region}|pub|{fmt}",
        title="A Game",
        title_normalized="a game",
        platform_id=508,
        platform="Nintendo Switch 2",
        region=region,
        is_physical=is_physical,
        physical_format=fmt,
        format_source="registry" if fmt else None,
        cart_id=cart_id,
        igdb_id=GAME,
    )


def item(fmt=None, source=None, region=None, owned=OwnedFormat.PHYSICAL, **extra):
    return Item(
        type=ItemType.GAME,
        title="A Game",
        status=ItemStatus.BACKLOG,
        owned_format=owned,
        external_source="igdb",
        external_id=str(GAME),
        platform_id=508,
        platform="Nintendo Switch 2",
        physical_format=fmt,
        format_source=source,
        region=region,
        **extra,
    )


def _v(value):
    return getattr(value, "value", value)


async def _run(session, *rows):
    session.add_all(rows)
    await session.flush()
    return await sync_items(session)


@pytest.mark.asyncio
async def test_an_unrecorded_format_is_written_from_the_home_row(session):
    copy = item()
    assert await _run(session, edition(), copy) == 1
    assert (_v(copy.physical_format), _v(copy.format_source)) == (
        "game_key_card",
        "registry",
    )


@pytest.mark.asyncio
async def test_a_manual_format_never_changes_and_is_a_disagreement(session):
    copy = item(PhysicalFormat.GAME_CARD, FormatSource.MANUAL)
    assert await _run(session, edition(cart_id="LP-AAC4B-USA-0"), copy) == 0
    assert _v(copy.physical_format) == "game_card"
    (found,) = await disagreements(session)
    assert (found.yours, found.registry, found.cart_id) == (
        "game_card",
        "game_key_card",
        "LP-AAC4B-USA-0",
    )
    assert found.note.startswith(
        "r/NSCollectors lists the USA edition as Game-Key Card"
    )


@pytest.mark.asyncio
async def test_a_registry_format_follows_the_registry(session):
    copy = item(PhysicalFormat.GAME_KEY_CARD, FormatSource.REGISTRY)
    assert await _run(session, edition("game_card"), copy) == 1
    assert _v(copy.physical_format) == "game_card"
    assert await sync_items(session) == 0  # nothing left to change


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("region", "expected"), [("EUR", "game_card"), (None, "game_key_card")]
)
async def test_the_copys_region_picks_its_row(session, region, expected):
    copy = item(region=region)
    await _run(
        session, edition("game_card", region="EUR"), edition("game_key_card"), copy
    )
    assert _v(copy.physical_format) == expected


@pytest.mark.asyncio
async def test_digital_writes_nothing(session):
    copy = item()
    assert await _run(session, edition(None, is_physical=False), copy) == 0
    assert copy.physical_format is None


@pytest.mark.asyncio
async def test_the_want_list_is_skipped(session):
    copy = item(owned=OwnedFormat.NONE)
    assert await _run(session, edition(), copy) == 0
    assert copy.physical_format is None


@pytest.mark.asyncio
async def test_two_formats_in_one_region_write_nothing(session):
    copy = item(region="EUR")
    rows = (
        edition("game_key_card", region="EUR"),
        edition("code_in_box", region="EUR"),
    )
    assert await _run(session, *rows, copy) == 0
    assert copy.physical_format is None


@pytest.mark.asyncio
async def test_a_retired_or_tracker_row_is_not_the_registry(session):
    retired = edition()
    retired.retired_at = datetime.now(UTC)
    tracker = edition(ref="a game|USA")
    tracker.source = "switch2tracker"
    copy = item()
    assert await _run(session, retired, tracker, copy) == 0


@pytest.mark.asyncio
async def test_an_agreeing_manual_copy_is_not_listed(session):
    copy = item(PhysicalFormat.GAME_KEY_CARD, FormatSource.MANUAL)
    await _run(session, edition(), copy)
    assert await disagreements(session) == []


@pytest.mark.asyncio
async def test_a_retired_edition_never_erases_a_synced_format(session):
    # The registry writes formats; it never takes one away. A copy synced
    # from an edition that later leaves the sheet keeps what it was given.
    retired = edition("game_key_card")
    retired.retired_at = datetime.now(UTC)
    copy = item(PhysicalFormat.GAME_KEY_CARD, FormatSource.REGISTRY)
    assert await _run(session, retired, copy) == 0
    assert (_v(copy.physical_format), _v(copy.format_source)) == (
        "game_key_card",
        "registry",
    )
