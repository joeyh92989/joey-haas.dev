"""The Switch 1 registry's database side: the title list, decisions, links.

Against the test Postgres, with the fake IGDB from physical_support.
"""

from datetime import UTC, date, datetime

import pytest
from physical_support import FakeIgdb
from sqlalchemy import func, select

from matching import normalize_title
from models import (
    CatalogueGame,
    CatalogueMatch,
    ListingAvailability,
    MatchConfidence,
    MatchDecision,
    PhysicalEdition,
    StoreListing,
)
from physical_sources import resolve
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


def listing(key, **extra):
    fields = dict(
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
    return StoreListing(**{**fields, **extra})


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


EARLIER = datetime(2026, 1, 2, tzinfo=UTC)
CANDIDATES = [{"external_id": "99", "title": "Death's Door", "year": 2021}]


@pytest.mark.parametrize(
    ("decided_by", "confidence", "igdb_id", "candidates"),
    [
        (MatchDecision.AUTO, MatchConfidence.EXACT, 99, []),
        (MatchDecision.AUTO, MatchConfidence.PROBABLE, 99, []),
        (MatchDecision.MANUAL, MatchConfidence.MANUAL, 99, []),
        (MatchDecision.PENDING, None, None, CANDIDATES),
    ],
)
async def test_every_other_decision_survives_an_ingest(
    sessionmaker_for_test, decided_by, confidence, igdb_id, candidates
):
    await _seed(
        sessionmaker_for_test,
        CatalogueMatch(
            title_normalized="death s door",
            platform_id=130,
            igdb_id=igdb_id,
            match_confidence=confidence,
            decided_by=decided_by,
            candidates=candidates,
            decided_at=EARLIER,
        ),
    )
    result = await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], [igdb_row(7, "Death's Door")]
    )
    assert result.matched == 0
    decision = await _decision(sessionmaker_for_test, "death s door")
    assert (
        decision.decided_by,
        decision.match_confidence,
        decision.igdb_id,
        decision.candidates,
        decision.decided_at,
    ) == (decided_by, confidence, igdb_id, candidates, EARLIER)


async def test_a_manual_link_is_the_one_the_editions_carry(sessionmaker_for_test):
    await _seed(
        sessionmaker_for_test,
        CatalogueGame(igdb_id=99, title="Death's Door", snapshot={}),
        CatalogueMatch(
            title_normalized="death s door",
            platform_id=130,
            igdb_id=99,
            match_confidence=MatchConfidence.MANUAL,
            decided_by=MatchDecision.MANUAL,
        ),
    )
    await _ingest(
        sessionmaker_for_test, [ns1("Death's Door")], [igdb_row(7, "Death's Door")]
    )
    (edition,) = await _editions(sessionmaker_for_test)
    assert edition.igdb_id == 99


async def test_an_ignore_from_resolve_is_never_revisited(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        await resolve.ignore(session, "death s door", 130)
        await session.commit()
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


def edition_row(key, source="nscollectors_ns1", platform_id=130, retired=False):
    return PhysicalEdition(
        source=source,
        source_ref=f"{key}|{source}|{platform_id}",
        title=key,
        title_normalized=key,
        platform_id=platform_id,
        platform="Nintendo Switch",
        region="USA",
        is_physical=True,
        retired_at=EARLIER if retired else None,
    )


async def test_only_automatic_ignores_a_live_sheet_edition_carries_are_counted(
    sessionmaker_for_test,
):
    def automatic(key, platform_id=130):
        return CatalogueMatch(
            title_normalized=key,
            platform_id=platform_id,
            decided_by=MatchDecision.IGNORED,
            match_confidence=MatchConfidence.UNCERTAIN,
        )

    await _seed(
        sessionmaker_for_test,
        # Counted: an automatic ignore a live sheet edition carries.
        automatic("counted port"),
        edition_row("counted port"),
        # The sheet no longer lists it.
        automatic("retired port"),
        edition_row("retired port", retired=True),
        # No sheet edition; another source's live row does not count.
        automatic("store port"),
        edition_row("store port", source="nscollectors"),
        # A human's ignore is not a registry title.
        decided("human port", None),
        edition_row("human port"),
        # An automatic ignore on another platform.
        automatic("switch two port", platform_id=508),
        edition_row("switch two port"),
    )
    async with sessionmaker_for_test() as session:
        assert await count_unmatched(session) == 1


async def test_a_listed_key_loses_its_automatic_ignore(sessionmaker_for_test):
    await _seed(
        sessionmaker_for_test,
        listing("obscure port"),
        decided("obscure port", MatchConfidence.UNCERTAIN),
    )
    result = await _ingest(sessionmaker_for_test, [ns1("Obscure Port")])
    assert (result.unmatched, result.left_to_resolve) == (0, 1)
    assert await _decision(sessionmaker_for_test, "obscure port") is None


NOT_LIVE = pytest.mark.parametrize(
    "extra",
    [
        {"availability": ListingAvailability.ARCHIVED},
        {"is_game": False},
        {"platform_id": 508, "platform": "Nintendo Switch 2"},
    ],
    ids=["archived", "not_a_game", "switch_2"],
)


@NOT_LIVE
async def test_a_listing_that_is_not_live_on_switch_1_does_not_hold_a_key(
    sessionmaker_for_test, extra
):
    await _seed(sessionmaker_for_test, listing("obscure port", **extra))
    result = await _ingest(sessionmaker_for_test, [ns1("Obscure Port")])
    assert (result.unmatched, result.left_to_resolve) == (1, 0)
    decision = await _decision(sessionmaker_for_test, "obscure port")
    assert (decision.decided_by, decision.match_confidence) == (
        MatchDecision.IGNORED,
        MatchConfidence.UNCERTAIN,
    )


@NOT_LIVE
async def test_a_listing_that_is_not_live_on_switch_1_releases_nothing(
    sessionmaker_for_test, extra
):
    await _seed(
        sessionmaker_for_test,
        listing("obscure port", **extra),
        decided("obscure port", MatchConfidence.UNCERTAIN),
    )
    async with sessionmaker_for_test() as session:
        released = await release_listed_ignores(session)
        await session.commit()
    assert released == 0
    assert await _decision(sessionmaker_for_test, "obscure port") is not None
