"""Resolution to IGDB and the N64 ingest, with a fake IGDB adapter.

The fake answers with the shapes the recorded fixtures pin (SourceResult,
SourceDetail, the N64 id page); no request leaves the process.
"""

import dataclasses
from datetime import UTC, date, datetime, timedelta

import pytest
import pytest_asyncio
from physical_support import FakeIgdb, edition, listing, result
from sqlalchemy import select

from models import CatalogueGame, CatalogueMatch, PhysicalEdition, StoreListing
from physical_sources.base import EditionRow
from physical_sources.catalogue import upsert_editions, upsert_listings
from physical_sources.platform_policy import ingest_platform
from physical_sources.resolve import (
    STALE_REFRESH_LIMIT,
    count_pending,
    fill_games,
    pending_keys,
    resolve_batch,
)
from sources.base import (
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
)


@pytest_asyncio.fixture
async def session(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        yield session


async def _all(session, model):
    return list(await session.scalars(select(model)))


@pytest.mark.asyncio
async def test_an_exact_match_links_the_edition_and_the_listing(session):
    await upsert_editions(
        session, [edition("The Midnight Walk")], "nscollectors", retire=True
    )
    await upsert_listings(
        session, [listing("the midnight walk")], "super_rare", archive=True
    )
    igdb = FakeIgdb({"The Midnight Walk": [result(11, "The Midnight Walk")]})

    outcome = await resolve_batch(session, igdb)

    assert (outcome.resolved, outcome.pending, outcome.unresolved_remaining) == (
        1,
        0,
        0,
    )
    assert igdb.searches == [("The Midnight Walk", 2026, "Nintendo Switch 2")]
    (match,) = await _all(session, CatalogueMatch)
    assert (match.decided_by.value, match.igdb_id) == ("auto", 11)
    assert [e.igdb_id for e in await _all(session, PhysicalEdition)] == [11]
    assert [x.igdb_id for x in await _all(session, StoreListing)] == [11]
    (game,) = await _all(session, CatalogueGame)
    assert game.igdb_id == 11 and game.release_date == date(1999, 5, 18)


@pytest.mark.asyncio
async def test_an_uncertain_match_waits_with_three_candidates(session):
    await upsert_editions(session, [edition("Star Fox")], "nscollectors", retire=True)
    found = [
        result(i, name)
        for i, name in enumerate(
            ("Star Fox 64", "Star Fox Zero", "Star Fox Adventures", "Star Fox 2"), 1
        )
    ]
    outcome = await resolve_batch(session, FakeIgdb({"Star Fox": found}))
    assert (outcome.resolved, outcome.pending) == (0, 1)
    (match,) = await _all(session, CatalogueMatch)
    assert match.decided_by.value == "pending" and match.igdb_id is None
    assert [c["title"] for c in match.candidates] == [
        "Star Fox 64",
        "Star Fox Zero",
        "Star Fox Adventures",
    ]
    assert [e.igdb_id for e in await _all(session, PhysicalEdition)] == [None]
    assert await _all(session, CatalogueGame) == []


@pytest.mark.asyncio
async def test_platformless_and_other_platform_keys_are_never_searched(session):
    await upsert_listings(
        session,
        [
            listing("he man", "1", platform_id=None, label=None),
            listing("riven", "2", platform_id=167, label="PlayStation 5"),
            listing("snow bros", "3", platform_id=None, label="Game Boy"),
        ],
        "super_rare",
        archive=True,
    )
    igdb = FakeIgdb()
    outcome = await resolve_batch(session, igdb)
    assert igdb.searches == []
    assert outcome.unresolved_remaining == 0
    assert await pending_keys(session, 100) == []


@pytest.mark.asyncio
async def test_games_are_fetched_once_and_refreshed_when_stale(session):
    await upsert_editions(session, [edition("A Game")], "nscollectors", retire=True)
    igdb = FakeIgdb({"A Game": [result(5, "A Game")]})
    await resolve_batch(session, igdb)
    assert igdb.fetched == [["5"]]
    await resolve_batch(session, igdb)
    assert igdb.fetched == [["5"]]
    game = await session.get(CatalogueGame, 5)
    game.fetched_at = datetime.now(UTC) - timedelta(days=31)
    await session.flush()
    await resolve_batch(session, igdb)
    assert igdb.fetched == [["5"], ["5"]]


@pytest.mark.asyncio
async def test_without_igdb_nothing_is_written(session):
    await upsert_editions(session, [edition("A Game")], "nscollectors", retire=True)
    outcome = await resolve_batch(session, FakeIgdb(configured=False))
    assert [e["code"] for e in outcome.errors] == ["igdb_not_configured"]
    assert await _all(session, CatalogueMatch) == []
    assert outcome.unresolved_remaining == 1


@pytest.mark.asyncio
async def test_without_igdb_a_decided_key_still_links_its_rows(session):
    """A refresh that re-keys a row onto an already decided key relinks it
    whether or not IGDB is configured: linking needs no search."""
    await upsert_editions(
        session, [edition("The Midnight Walk")], "nscollectors", retire=True
    )
    igdb = FakeIgdb({"The Midnight Walk": [result(11, "The Midnight Walk")]})
    await resolve_batch(session, igdb)
    await upsert_listings(
        session, [listing("the midnight walk")], "super_rare", archive=True
    )

    await resolve_batch(session, FakeIgdb(configured=False))

    assert [x.igdb_id for x in await _all(session, StoreListing)] == [11]


@pytest.mark.asyncio
async def test_a_rate_limit_keeps_what_was_decided(session):
    titles = ["Alpha", "Bravo", "Charlie", "Delta"]
    await upsert_editions(
        session, [edition(t) for t in titles], "nscollectors", retire=True
    )
    igdb = FakeIgdb({t: [result(i, t)] for i, t in enumerate(titles, 1)}, limit_after=2)
    outcome = await resolve_batch(session, igdb)
    assert [e["code"] for e in outcome.errors] == ["igdb_rate_limited"]
    assert outcome.resolved == 2
    assert len(await _all(session, CatalogueMatch)) == 2
    assert outcome.unresolved_remaining == 2


@pytest.mark.asyncio
async def test_a_game_fetch_cut_short_links_on_the_next_press(session):
    await upsert_editions(session, [edition("A Game")], "nscollectors", retire=True)
    igdb = FakeIgdb({"A Game": [result(5, "A Game")]})
    igdb.fetch_limited = True
    outcome = await resolve_batch(session, igdb)
    assert [e["code"] for e in outcome.errors] == ["igdb_rate_limited"]
    assert [e.igdb_id for e in await _all(session, PhysicalEdition)] == [None]
    assert outcome.unresolved_remaining == 0  # decided, just not linked yet
    igdb.fetch_limited = False
    await resolve_batch(session, igdb)
    assert [e.igdb_id for e in await _all(session, PhysicalEdition)] == [5]


@pytest.mark.asyncio
async def test_a_quarter_date_does_not_narrow_the_search_year(session):
    row = edition("Soon", release_date=date(2027, 1, 1), release_precision="quarter")
    await upsert_editions(session, [row], "nscollectors", retire=True)
    igdb = FakeIgdb()
    await resolve_batch(session, igdb)
    assert igdb.searches == [("Soon", None, "Nintendo Switch 2")]


@pytest.mark.asyncio
async def test_a_registry_spelling_is_searched_as_the_base_game(session):
    row = edition("Duskbloods, The", title_normalized="the duskbloods")
    await upsert_editions(session, [row], "nscollectors", retire=True)
    igdb = FakeIgdb({"The Duskbloods": [result(7, "The Duskbloods")]})

    outcome = await resolve_batch(session, igdb)

    assert igdb.searches == [("The Duskbloods", 2026, "Nintendo Switch 2")]
    assert outcome.resolved == 1
    assert [e.igdb_id for e in await _all(session, PhysicalEdition)] == [7]


@pytest.mark.asyncio
async def test_a_switch_2_edition_is_searched_as_the_switch_1_game(session):
    """IGDB tags the base game Switch 1 only, and dates it years earlier."""
    raw = "Kirby and the Forgotten Land Nintendo Switch 2 Edition + Star-Crossed World"
    row = edition(raw, title_normalized="kirby and the forgotten land")
    await upsert_editions(session, [row], "nscollectors", retire=True)
    sold = dataclasses.replace(
        listing("citizen sleeper 2"),
        title="Citizen Sleeper 2 – Nintendo Switch 2 Edition",
    )
    await upsert_listings(session, [sold], "super_rare", archive=True)
    igdb = FakeIgdb()

    await resolve_batch(session, igdb)

    assert igdb.searches == [
        ("citizen sleeper 2", None, "Nintendo Switch"),
        ("Kirby and the Forgotten Land", None, "Nintendo Switch"),
    ]


# --- The N64 ingest -----------------------------------------------------------


@pytest.mark.asyncio
async def test_ingest_n64_writes_policy_editions_and_games(session):
    outcome = await ingest_platform(session, FakeIgdb(), 4)
    rows = await _all(session, PhysicalEdition)
    assert outcome.rows == len(rows) == 234
    assert {
        (
            e.source,
            e.region,
            e.physical_format.value,
            e.format_source.value,
            e.is_physical,
        )
        for e in rows
    } == {("igdb_platform", "ALL", "game_card", "platform_policy", True)}
    assert all(e.igdb_id == int(e.source_ref) for e in rows)
    assert len(await _all(session, CatalogueGame)) == 234
    assert outcome.with_cover == sum(1 for e in rows if e.igdb_id % 2)


@pytest.mark.asyncio
async def test_ingest_decides_matches_so_n64_listings_link(session):
    await ingest_platform(session, FakeIgdb(), 4)
    await upsert_listings(
        session,
        [listing("game 154", "9", platform_id=4, label="Nintendo 64")],
        "x",
        archive=True,
    )
    igdb = FakeIgdb()
    await resolve_batch(session, igdb)
    assert igdb.searches == []
    (row,) = await _all(session, StoreListing)
    assert row.igdb_id == 154


@pytest.mark.asyncio
async def test_switch_1_is_never_ingested(session):
    with pytest.raises(ValueError):
        await ingest_platform(session, FakeIgdb(), 130)


@pytest.mark.asyncio
async def test_count_pending_counts_keys_not_rows(session):
    await upsert_editions(
        session,
        [
            edition("A Game", ref="a|USA|x|game card"),
            edition("A Game", ref="a|EUR|x|game card"),
        ],
        "nscollectors",
        retire=True,
    )
    await upsert_listings(session, [listing("a game")], "super_rare", archive=True)
    assert await count_pending(session) == 1


# --- Finish-gate review -----------------------------------------------------------


@pytest.mark.asyncio
async def test_two_n64_games_with_one_title_keep_their_own_ids(session):
    # IGDB has two games that normalize to "bomberman 64": 3451 and 80368,
    # both in the recorded N64 page.
    titles = {"3451": "Bomberman 64", "80368": "Bomberman 64"}
    igdb = FakeIgdb(titles=titles)
    await ingest_platform(session, igdb, 4)
    await resolve_batch(session, igdb)
    ids = {
        e.source_ref: e.igdb_id
        for e in await _all(session, PhysicalEdition)
        if e.source_ref in titles
    }
    assert ids == {"3451": 3451, "80368": 80368}
    matches = [
        m
        for m in await _all(session, CatalogueMatch)
        if m.title_normalized == "bomberman 64"
    ]
    assert len(matches) == 1


@pytest.mark.asyncio
async def test_a_short_n64_run_retires_nothing(session):
    await upsert_editions(
        session,
        [
            EditionRow(
                source="igdb_platform",
                source_ref="999999",
                title="Gone",
                title_normalized="gone",
                platform_id=4,
                region="ALL",
                is_physical=True,
                physical_format="game_card",
                format_source="platform_policy",
            )
        ],
        "igdb_platform",
        retire=True,
    )
    outcome = await ingest_platform(session, FakeIgdb(), 4, previous=10_000)
    assert (outcome.short, outcome.retired) == (True, 0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("igdb", "code"),
    [
        (FakeIgdb(configured=False), "igdb_not_configured"),
        (FakeIgdb(fetch_error=SourceRateLimited("igdb", "slow")), "igdb_rate_limited"),
        (
            FakeIgdb(fetch_error=SourceNotConfigured("igdb", "no key")),
            "igdb_not_configured",
        ),
        (FakeIgdb(fetch_error=SourceError("igdb", "HTTP 500")), "http_error"),
    ],
)
async def test_n64_ingest_failures_write_nothing(session, igdb, code):
    outcome = await ingest_platform(session, igdb, 4)
    assert [e["code"] for e in outcome.errors] == [code]
    assert outcome.rows == 0 and await _all(session, PhysicalEdition) == []


@pytest.mark.asyncio
async def test_a_failed_search_parks_the_key_for_a_human(session):
    await upsert_editions(session, [edition("A Game")], "nscollectors", retire=True)
    igdb = FakeIgdb(search_error=SourceError("igdb", "HTTP 500"))
    outcome = await resolve_batch(session, igdb)
    (match,) = await _all(session, CatalogueMatch)
    assert (match.decided_by.value, match.candidates, outcome.pending) == (
        "pending",
        [],
        1,
    )
    assert outcome.unresolved_remaining == 0


@pytest.mark.asyncio
async def test_a_failed_game_fetch_is_an_http_error(session):
    await upsert_editions(session, [edition("A Game")], "nscollectors", retire=True)
    igdb = FakeIgdb(
        {"A Game": [result(5, "A Game")]}, fetch_error=SourceError("igdb", "HTTP 500")
    )
    outcome = await resolve_batch(session, igdb)
    assert [e["code"] for e in outcome.errors] == ["http_error"]
    assert [e.igdb_id for e in await _all(session, PhysicalEdition)] == [None]


@pytest.mark.asyncio
async def test_stale_snapshots_are_refreshed_a_bounded_number_per_press(session):
    old = datetime.now(UTC) - timedelta(days=40)
    for igdb_id in range(1, STALE_REFRESH_LIMIT + 51):
        session.add(
            CatalogueGame(igdb_id=igdb_id, title="x", snapshot={}, fetched_at=old)
        )
    await session.flush()
    igdb = FakeIgdb()
    ids = list(range(1, STALE_REFRESH_LIMIT + 51)) + [99_999]
    assert await fill_games(session, igdb, ids) == STALE_REFRESH_LIMIT + 1
    fetched = [int(i) for batch in igdb.fetched for i in batch]
    assert 99_999 in fetched  # a missing game is never held back
