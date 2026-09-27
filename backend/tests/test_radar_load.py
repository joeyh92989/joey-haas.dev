"""Radar's database reads, on a real Postgres."""

import dataclasses
import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from physical_support import edition, listing
from sqlalchemy import select

from models import (
    CatalogueGame,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalEdition,
    ReasonSource,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
    StoreListing,
)
from physical_sources.catalogue import upsert_editions, upsert_listings
from radar_load import (
    RADAR_PLATFORMS,
    collection_platforms,
    excluded_games,
    load_pool,
    load_profile,
    watching,
)

pytestmark = pytest.mark.asyncio
TODAY = date.today()


@pytest_asyncio.fixture
async def session(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        yield session


async def _link(session, model, igdb_id, **match):
    rows = await session.scalars(select(model).filter_by(**match))
    for row in rows:
        row.igdb_id = igdb_id
    await session.flush()


async def _seed_catalogue(session):
    for igdb_id, title in ((1, "Dated Game"), (2, "Preorder Game"), (3, "Old Game")):
        session.add(
            CatalogueGame(
                igdb_id=igdb_id,
                title=title,
                snapshot={"genres": ["Roguelike"], "similar_games": [9]},
                hypes=40 + igdb_id,
            )
        )
    await session.flush()
    await upsert_editions(
        session,
        [
            edition("Dated Game", release_date=TODAY + timedelta(days=40)),
            edition("Old Game", release_date=date(2020, 1, 1)),
        ],
        "nscollectors",
        retire=True,
    )
    await _link(session, PhysicalEdition, 1, title="Dated Game")
    await _link(session, PhysicalEdition, 3, title="Old Game")
    closes = TODAY + timedelta(days=12)
    await upsert_listings(
        session,
        [
            dataclasses.replace(
                listing("preorder game", "p1"), preorder_closes_at=closes
            ),
            listing("unlinked game", "p2"),
        ],
        "super_rare",
        archive=True,
    )
    await _link(session, StoreListing, 2, variant_id="p1")
    await session.flush()
    return closes


async def test_the_pool_holds_every_linked_game_with_its_lane(session):
    closes = await _seed_catalogue(session)
    pool = {
        game.candidate.igdb_id: game for game in await load_pool(session, (508,), TODAY)
    }

    assert set(pool) == {1, 2, 3}  # the unlinked listing never reaches Radar
    assert (pool[1].lane, pool[2].lane) == ("dated", "preorder")
    assert pool[2].closes_at == closes
    assert pool[1].candidate.physical_format == "game_card"
    assert pool[1].snapshot["genres"] == ["Roguelike"] and pool[1].hypes == 41
    assert pool[3].candidate.release_date == date(2020, 1, 1)


async def test_another_platform_is_not_in_the_pool(session):
    await _seed_catalogue(session)
    assert await load_pool(session, (130,), TODAY) == []


def _item(title, external_id, owned=OwnedFormat.PHYSICAL, **fields):
    values = {
        "type": ItemType.GAME,
        "title": title,
        "status": ItemStatus.BACKLOG,
        "external_source": "igdb",
        "external_id": external_id,
        "owned_format": owned,
        "platform_id": 508,
        **fields,
    }
    return Item(**values)


def _recommendation(external_id, status):
    return Recommendation(
        kind=RecommendationKind.DISCOVER,
        type=ItemType.GAME,
        title="Suggested",
        external_source="igdb",
        external_id=external_id,
        reason_source=ReasonSource.TEMPLATE,
        score=50,
        batch_id=uuid.uuid4(),
        status=status,
        platform_id=508,
    )


async def test_owned_watched_and_dismissed_games_are_excluded(session):
    session.add_all(
        [
            _item("Owned", "10"),
            _item("Watched", "11", owned=OwnedFormat.NONE),
            _item("Manual", None, external_source=None),
            _recommendation("12", RecommendationStatus.DISMISSED),
            _recommendation("13", RecommendationStatus.SKIPPED),
            _recommendation("14", RecommendationStatus.PENDING),
        ]
    )
    await session.flush()
    assert await excluded_games(session) == {10, 11, 12}


async def test_the_profile_reads_every_game(session):
    session.add_all([_item("One", "20", favorite=True), _item("Two", "21")])
    await session.flush()
    profile = await load_profile(session)
    assert {item.title for item in profile} == {"One", "Two"}
    assert all(item.owned for item in profile)


async def test_collection_platforms_fall_back_to_both(session):
    assert await collection_platforms(session) == RADAR_PLATFORMS
    session.add(_item("Switch game", "30", platform_id=130))
    await session.flush()
    assert await collection_platforms(session) == (130,)


async def test_watching_lists_upcoming_and_preordered_games(session):
    closes = await _seed_catalogue(session)
    session.add_all(
        [
            _item(
                "Coming",
                "1",
                owned=OwnedFormat.NONE,
                release_date=TODAY + timedelta(days=40),
            ),
            _item("On preorder", "2", owned=OwnedFormat.NONE),
            _item(
                "Out already",
                "3",
                owned=OwnedFormat.NONE,
                release_date=date(2020, 1, 1),
            ),
            _item("Owned", "4", release_date=TODAY + timedelta(days=5)),
        ]
    )
    await session.flush()

    rows = await watching(session, TODAY)

    assert [row["item"]["title"] for row in rows] == ["On preorder", "Coming"]
    assert rows[0]["preorder"]["closes_at"] == closes.isoformat()
    assert rows[0]["preorder"]["store"] == "Super Rare Games"
    assert rows[1]["preorder"] is None
