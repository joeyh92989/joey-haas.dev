"""The Switch 1 registry's database side: the title list, decisions, links.

Against the test Postgres, with the fake IGDB from physical_support.
"""

from datetime import UTC, date, datetime

import pytest
from physical_support import FakeIgdb
from sqlalchemy import func, select

from matching import normalize_title
from models import (
    CatalogueMatch,
    MatchConfidence,
    MatchDecision,
    PhysicalEdition,
    StoreListing,
)
from physical_sources.base import EditionRow
from physical_sources.switch1_ingest import (
    count_unmatched,
    ingest_switch1,
    load_switch_titles,
    release_listed_ignores,
)
from sources.base import SourceRateLimited

pytestmark = pytest.mark.asyncio


def ns1(title, region="USA", year=2021):
    key = normalize_title(title)
    return EditionRow(
        source="nscollectors_ns1",
        source_ref=f"{key}|{region}||master|",
        title=title,
        title_normalized=key,
        platform_id=130,
        region=region,
        is_physical=True,
        physical_format="game_card",
        format_source="registry",
        cart_id="LA-H-AAAAA-USA",
        release_date=date(year, 7, 20),
        release_precision="day",
    )


def igdb_row(igdb_id, name, year=2021):
    return {
        "id": igdb_id,
        "name": name,
        "first_release_date": int(datetime(year, 7, 20, tzinfo=UTC).timestamp()),
    }


def listing(key):
    return StoreListing(
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


def decided(key, confidence):
    return CatalogueMatch(
        title_normalized=key,
        platform_id=130,
        decided_by=MatchDecision.IGNORED,
        match_confidence=confidence,
    )


async def _seed(factory, *rows):
    async with factory() as session:
        session.add_all(rows)
        await session.commit()


async def _ingest(factory, rows, titles=(), igdb=None):
    igdb = igdb or FakeIgdb(switch_titles=list(titles))
    async with factory() as session:
        result = await ingest_switch1(session, igdb, rows, previous=None)
        await session.commit()
    return result


async def _decision(factory, key):
    async with factory() as session:
        return await session.get(CatalogueMatch, (key, 130))


async def _editions(factory):
    async with factory() as session:
        return list(await session.scalars(select(PhysicalEdition)))


async def test_the_title_list_is_paged_until_a_short_page():
    igdb = FakeIgdb(switch_titles=[igdb_row(i, f"Game {i}") for i in range(1, 1201)])
    rows = await load_switch_titles(igdb)
    assert len(rows) == 1200
    assert [query.rsplit("offset ", 1)[1] for query in igdb.queries] == [
        "0;",
        "500;",
        "1000;",
    ]


async def test_a_unique_title_is_decided_and_linked(sessionmaker_for_test):
    result = await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], [igdb_row(7, "Death's Door")]
    )
    assert (result.matched, result.unmatched, result.left_to_resolve) == (1, 0, 0)
    assert (result.fatal, result.errors, result.games_fetched) == (False, [], 1)
    decision = await _decision(sessionmaker_for_test, "death s door")
    assert (decision.decided_by, decision.match_confidence, decision.igdb_id) == (
        MatchDecision.AUTO,
        MatchConfidence.EXACT,
        7,
    )
    (edition,) = await _editions(sessionmaker_for_test)
    assert edition.igdb_id == 7


async def test_an_unmatched_title_is_ignored_automatically(sessionmaker_for_test):
    result = await _ingest(
        sessionmaker_for_test, [ns1("Obscure Port")], [igdb_row(7, "Death's Door")]
    )
    assert (result.matched, result.unmatched) == (0, 1)
    decision = await _decision(sessionmaker_for_test, "obscure port")
    assert (decision.decided_by, decision.match_confidence, decision.igdb_id) == (
        MatchDecision.IGNORED,
        MatchConfidence.UNCERTAIN,
        None,
    )
    async with sessionmaker_for_test() as session:
        assert await count_unmatched(session) == 1


async def test_a_title_a_store_lists_is_left_to_resolve(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, listing("obscure port"))
    result = await _ingest(sessionmaker_for_test, [ns1("Obscure Port")])
    assert (result.unmatched, result.left_to_resolve) == (0, 1)
    assert await _decision(sessionmaker_for_test, "obscure port") is None


async def test_a_humans_ignore_is_never_touched(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, decided("death s door", None))
    result = await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], [igdb_row(7, "Death's Door")]
    )
    assert result.matched == 0
    decision = await _decision(sessionmaker_for_test, "death s door")
    assert (decision.decided_by, decision.match_confidence) == (
        MatchDecision.IGNORED,
        None,
    )
    (edition,) = await _editions(sessionmaker_for_test)
    assert edition.igdb_id is None


async def test_an_automatic_ignore_is_reconsidered(sessionmaker_for_test):
    await _seed(
        sessionmaker_for_test, decided("death s door", MatchConfidence.UNCERTAIN)
    )
    result = await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], [igdb_row(7, "Death's Door")]
    )
    assert result.matched == 1
    decision = await _decision(sessionmaker_for_test, "death s door")
    assert (decision.decided_by, decision.igdb_id) == (MatchDecision.AUTO, 7)


async def test_only_automatic_ignores_a_store_now_lists_are_released(
    sessionmaker_for_test,
):
    await _seed(
        sessionmaker_for_test,
        listing("obscure port"),
        decided("obscure port", MatchConfidence.UNCERTAIN),
        listing("kept port"),
        decided("kept port", None),
        decided("unlisted port", MatchConfidence.UNCERTAIN),
    )
    async with sessionmaker_for_test() as session:
        released = await release_listed_ignores(session)
        await session.commit()
    assert released == 1
    assert await _decision(sessionmaker_for_test, "obscure port") is None
    assert (await _decision(sessionmaker_for_test, "kept port")) is not None
    assert (await _decision(sessionmaker_for_test, "unlisted port")) is not None


async def test_without_igdb_nothing_is_written(sessionmaker_for_test):
    result = await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], igdb=FakeIgdb(configured=False)
    )
    assert result.fatal
    assert [error["code"] for error in result.errors] == ["igdb_not_configured"]
    assert await _editions(sessionmaker_for_test) == []


async def test_a_rate_limited_title_list_writes_nothing(sessionmaker_for_test):
    igdb = FakeIgdb(titles_error=SourceRateLimited("igdb", "rate limited by IGDB"))
    result = await _ingest(sessionmaker_for_test, [ns1("Death's Door")], igdb=igdb)
    assert result.fatal
    assert [error["code"] for error in result.errors] == ["igdb_rate_limited"]
    assert await _editions(sessionmaker_for_test) == []


async def test_a_rate_limit_filling_games_keeps_the_decisions(sessionmaker_for_test):
    igdb = FakeIgdb(switch_titles=[igdb_row(7, "Death's Door")])
    igdb.fetch_limited = True
    result = await _ingest(sessionmaker_for_test, [ns1("Death's Door")], igdb=igdb)
    assert result.fatal is False
    assert [error["code"] for error in result.errors] == ["igdb_rate_limited"]
    decision = await _decision(sessionmaker_for_test, "death s door")
    assert (decision.decided_by, decision.igdb_id) == (MatchDecision.AUTO, 7)
    # No game row yet, so nothing linked: the next Resolve fills and links it.
    (edition,) = await _editions(sessionmaker_for_test)
    assert edition.igdb_id is None


async def test_a_short_run_retires_nothing(sessionmaker_for_test):
    await _ingest(sessionmaker_for_test, [ns1("A"), ns1("B"), ns1("C")])
    async with sessionmaker_for_test() as session:
        result = await ingest_switch1(
            session, FakeIgdb(switch_titles=[]), [ns1("A")], previous=3
        )
        await session.commit()
        live = await session.scalar(
            select(func.count())
            .select_from(PhysicalEdition)
            .where(PhysicalEdition.retired_at.is_(None))
        )
    assert (result.short, result.retired, live) == (True, 0, 3)
