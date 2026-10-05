"""next_load: the database side of What's next (Spine Next spec, K9)."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from models import (
    CatalogueRun,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalFormat,
    ReasonSource,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)
from next_load import catalogue_times, load_next
from physical_sources.stores import STORES

pytestmark = pytest.mark.asyncio

TODAY = date(2026, 9, 28)


def _game(title: str, **fields) -> Item:
    base = dict(
        type=ItemType.GAME,
        title=title,
        status=ItemStatus.BACKLOG,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        source_metadata={"genres": ["Roguelike", "Indie"]},
    )
    return Item(**{**base, **fields})


def _radar(title: str, **fields) -> Recommendation:
    metadata = {
        "lane": "preorder",
        "section": "suggested",
        "release_precision": "day",
        "release_source": "registry",
        "hypes": 40,
        "store_lines": [
            {
                "store": "Limited Run Games",
                "price": "59.99",
                "currency": "USD",
                "availability": "preorder",
                "preorder_closes_at": "2026-11-08T00:00:00+00:00",
                "url": "https://limitedrungames.com/products/x",
            }
        ],
        "snapshot": {"url": f"https://www.igdb.com/games/{title.lower()}"},
    }
    base = dict(
        kind=RecommendationKind.RADAR,
        type=ItemType.GAME,
        title=title,
        external_source="igdb",
        external_id=title.lower().replace(" ", "-"),
        release_date=TODAY + timedelta(days=60),
        cover_url=f"https://images.igdb.com/{title}.jpg",
        reason="Pre-orders close Nov 8 at Limited Run Games · $59.99",
        reason_source=ReasonSource.TEMPLATE,
        based_on=["x"],
        score=50,
        batch_id=uuid.uuid4(),
        status=RecommendationStatus.PENDING,
        platform_id=508,
        platform="Nintendo Switch 2",
        physical_format=PhysicalFormat.GAME_CARD,
        source_metadata=metadata,
    )
    overrides = fields.pop("source_metadata", None)
    row = Recommendation(**{**base, **fields})
    if overrides is not None:
        row.source_metadata = {**metadata, **overrides}
    return row


async def _add(factory, *rows):
    async with factory() as session:
        session.add_all(rows)
        await session.commit()


async def test_candidates_are_pending_rows_of_both_kinds(sessionmaker_for_test):
    discover = _radar(
        "Pick", kind=RecommendationKind.DISCOVER, source_metadata={"rank": 2}
    )
    answered = _radar("Gone", status=RecommendationStatus.DISMISSED)
    await _add(sessionmaker_for_test, _radar("Coming"), discover, answered)
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    by_title = {c.title: c for c in data.candidates}
    assert set(by_title) == {"Coming", "Pick"}
    assert by_title["Pick"].kind == "discover" and by_title["Pick"].rank == 2
    assert by_title["Coming"].release_source == "registry"
    assert by_title["Coming"].payload.title == "Coming"


async def test_taste_holds_public_games_and_private_titles(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _game("Shown", rating=9),
        _game("Hidden", is_public=False),
    )
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    assert [item.title for item in data.public_games] == ["Shown"]
    assert data.taste.private_titles == ("Hidden",)
    assert len(data.taste.public_ids) == 1


async def test_generated_at_is_each_kinds_last_generation(sessionmaker_for_test):
    await _add(sessionmaker_for_test, _radar("Coming"))
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    assert data.generated_at["radar"] is not None
    assert data.generated_at["discover"] is None


async def test_catalogue_times_is_the_stalest_good_store_run(sessionmaker_for_test):
    first, second = list(STORES)[:2]
    older = datetime(2026, 9, 20, 6, 0, tzinfo=UTC)
    newer = datetime(2026, 9, 27, 6, 0, tzinfo=UTC)

    def run(source: str, finished: datetime, ok: bool) -> CatalogueRun:
        return CatalogueRun(
            source=source,
            started_at=finished - timedelta(minutes=1),
            finished_at=finished,
            ok=ok,
        )

    await _add(
        sessionmaker_for_test,
        run(first, older, True),
        run(second, newer, True),
        run(first, newer + timedelta(days=1), False),
        run("nscollectors", newer, True),
    )
    async with sessionmaker_for_test() as session:
        times = await catalogue_times(session)
    assert times["stores_at"] == older
    assert times["registry_at"] == newer
