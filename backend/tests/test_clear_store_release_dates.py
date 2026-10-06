"""The #41 data script: finds and clears store-sourced dates copied onto items."""

import importlib.util
import sys
import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from models import (
    Item,
    ItemStatus,
    ItemType,
    ReasonSource,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)

SCRIPT = Path(__file__).parents[1] / "scripts" / "clear_store_release_dates.py"
spec = importlib.util.spec_from_file_location("clear_store_release_dates", SCRIPT)
script = importlib.util.module_from_spec(spec)
# A dataclass looks its module up in sys.modules while it is being built.
sys.modules[spec.name] = script
spec.loader.exec_module(script)

pytestmark = pytest.mark.asyncio
DAY = date(2026, 11, 20)


def _game(title: str, release_date: date | None = DAY) -> Item:
    return Item(
        type=ItemType.GAME,
        title=title,
        status=ItemStatus.BACKLOG,
        external_source="igdb",
        external_id=title.lower().replace(" ", "-"),
        platform="Nintendo Switch 2",
        release_date=release_date,
    )


def _recommendation(
    title: str,
    status: RecommendationStatus,
    metadata: dict,
    release_date: date | None = DAY,
    kind: RecommendationKind = RecommendationKind.RADAR,
) -> Recommendation:
    return Recommendation(
        kind=kind,
        type=ItemType.GAME,
        title=title,
        external_source="igdb",
        external_id=title.lower().replace(" ", "-"),
        release_date=release_date,
        reason_source=ReasonSource.TEMPLATE,
        score=50,
        batch_id=uuid.uuid4(),
        status=status,
        platform_id=508,
        source_metadata=metadata,
    )


STORE_DAY = {"release_source": "store", "release_precision": "day"}
REGISTRY_DAY = {"release_source": "registry", "release_precision": "day"}


async def _seed(factory) -> None:
    async with factory() as session:
        session.add_all(
            [
                _game("Store Want"),
                _recommendation("Store Want", RecommendationStatus.WANTED, STORE_DAY),
                _game("Discover Own"),
                _recommendation(
                    "Discover Own",
                    RecommendationStatus.OWNED,
                    {},
                    kind=RecommendationKind.DISCOVER,
                ),
                _game("Registry Want"),
                _recommendation(
                    "Registry Want", RecommendationStatus.WANTED, REGISTRY_DAY
                ),
                _game("Edited Since", release_date=date(2026, 12, 1)),
                _recommendation("Edited Since", RecommendationStatus.WANTED, STORE_DAY),
                _game("Still Pending"),
                _recommendation(
                    "Still Pending", RecommendationStatus.PENDING, STORE_DAY
                ),
            ]
        )
        await session.commit()


async def test_selects_only_items_holding_a_copied_non_public_date(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        rows = await script.find_store_dated(session)
    assert [r.title for r in rows] == ["Discover Own", "Store Want"]
    by_title = {r.title: r for r in rows}
    assert by_title["Store Want"].release_source == "store"
    assert by_title["Store Want"].release_precision == "day"
    assert by_title["Store Want"].release_date == DAY
    assert by_title["Discover Own"].release_source is None


async def test_a_registry_month_date_is_not_public_and_is_selected(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        session.add_all(
            [
                _game("Month Only"),
                _recommendation(
                    "Month Only",
                    RecommendationStatus.WANTED,
                    {"release_source": "registry", "release_precision": "month"},
                ),
            ]
        )
        await session.commit()
        rows = await script.find_store_dated(session)
    assert [r.title for r in rows] == ["Month Only"]


async def test_an_item_a_public_row_also_explains_is_kept(sessionmaker_for_test):
    """Radar and Discover can both hold a row for one game; if either would
    have copied the date, it is the registry's and stays."""
    async with sessionmaker_for_test() as session:
        session.add_all(
            [
                _game("Both Kinds"),
                _recommendation("Both Kinds", RecommendationStatus.WANTED, STORE_DAY),
                _recommendation(
                    "Both Kinds",
                    RecommendationStatus.WANTED,
                    REGISTRY_DAY,
                    kind=RecommendationKind.DISCOVER,
                ),
            ]
        )
        await session.commit()
        assert await script.find_store_dated(session) == []


async def test_clear_nulls_the_selected_dates_and_leaves_the_rest(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        rows = await script.find_store_dated(session)
        assert await script.clear(session, rows) == 2
    async with sessionmaker_for_test() as session:
        dates = {
            item.title: item.release_date
            for item in (await session.scalars(select(Item))).all()
        }
        assert await script.find_store_dated(session) == []
    assert dates == {
        "Store Want": None,
        "Discover Own": None,
        "Registry Want": DAY,
        "Edited Since": date(2026, 12, 1),
        "Still Pending": DAY,
    }


async def test_clear_with_nothing_to_clear_returns_zero(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        assert await script.clear(session, []) == 0
