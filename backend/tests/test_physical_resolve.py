"""Resolution to IGDB and the N64 ingest, with a fake IGDB adapter.

The fake answers with the shapes the recorded fixtures pin (SourceResult,
SourceDetail, the N64 id page); no request leaves the process.
"""

import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import select

from matching import normalize_title
from models import CatalogueGame, CatalogueMatch, PhysicalEdition, StoreListing
from physical_sources.base import EditionRow, StoreProduct
from physical_sources.catalogue import upsert_editions, upsert_listings
from physical_sources.platform_policy import ingest_platform
from physical_sources.resolve import count_pending, pending_keys, resolve_batch
from sources.base import SourceDetail, SourceRateLimited, SourceResult

N64_PAGE = Path(__file__).parent / "fixtures" / "physical" / "igdb" / "n64_page1.json"


class FakeIgdb:
    """Stands in for IgdbSource: search, fetch_many and the one raw query."""

    def __init__(self, results=None, configured=True, limit_after=None):
        self.results = results or {}
        self._configured = configured
        self.limit_after = limit_after
        self.searches: list[tuple[str, int | None, str | None]] = []
        self.fetched: list[list[str]] = []
        self.fetch_limited = False

    def configured(self):
        return self._configured

    async def search(self, query, year=None, platform=None):
        if self.limit_after is not None and len(self.searches) >= self.limit_after:
            raise SourceRateLimited("igdb", "rate limited by IGDB")
        self.searches.append((query, year, platform))
        return self.results.get(query, [])

    async def fetch_many(self, ids):
        if self.fetch_limited:
            raise SourceRateLimited("igdb", "rate limited by IGDB")
        self.fetched.append(list(ids))
        return [
            SourceDetail(
                external_id=i,
                title=f"Game {i}",
                cover_url=f"https://images.igdb.com/{i}.jpg" if int(i) % 2 else None,
                source_metadata={"first_release_date": "1999-05-18", "genres": []},
            )
            for i in ids
        ]

    async def _query(self, body, endpoint="games"):
        rows = json.loads(N64_PAGE.read_text())
        return [{"id": row["id"]} for row in rows]


def result(igdb_id, title, year=2026):
    return SourceResult(external_id=str(igdb_id), title=title, year=year)


def edition(title, ref=None, platform_id=508, **extra):
    return EditionRow(
        source="nscollectors",
        source_ref=ref or f"{normalize_title(title)}|USA|pub|game card",
        title=title,
        title_normalized=normalize_title(title),
        platform_id=platform_id,
        region="USA",
        is_physical=True,
        physical_format="game_card",
        format_source="registry",
        **{"release_date": date(2026, 11, 19), "release_precision": "day", **extra},
    )


def listing(title_normalized, variant="1", platform_id=508, label="Nintendo Switch 2"):
    return StoreProduct(
        store="super_rare",
        store_product_id=variant,
        variant_id=variant,
        handle=title_normalized.replace(" ", "-"),
        url="https://example.test/x",
        region="EUR",
        title=title_normalized,
        title_normalized=title_normalized,
        edition_label=None,
        platform_id=platform_id,
        platform_label=label,
        is_game=True,
        collections_seen=("switch-2",),
        price=Decimal("40"),
        currency="GBP",
        availability="preorder",
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
