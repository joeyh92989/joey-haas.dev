"""The migration chain must produce exactly what the models describe.

conftest's engine fixture creates tables from Base.metadata, so every other test
in this suite passes whether or not a matching migration exists. This module is
the only place the migrations themselves are exercised, and the only thing that
would catch a column added to models.py and forgotten in a revision.

Everything here goes through asyncpg via run_sync rather than a synchronous
driver. Alembic's autogenerate machinery is synchronous, but adding psycopg2 to
the dependency set for one test would undo the same decision schema_check.py
documents for one startup query.
"""

import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest
import pytest_asyncio
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from db import connect_args_for, normalize_async_url
from models import Base

BACKEND = Path(__file__).resolve().parent.parent

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/postgres",
)

RUNNING_IN_CI = os.environ.get("CI", "").lower() in {"1", "true"}


def _alembic(*args: str) -> subprocess.CompletedProcess:
    """Runs alembic against the test database.

    env.py reads DATABASE_URL_DIRECT and nothing else, so pointing that at the
    test database is the whole of the setup -- no alembic.ini edit, and no risk
    of a test run reaching the real one.

    Invoked as `python -m alembic` through the interpreter running the tests,
    rather than by path. A hardcoded .venv/bin/alembic is correct locally and
    absent in CI, where dependencies are installed into the hosted Python --
    which is exactly how this first failed.
    """
    env = {**os.environ, "DATABASE_URL_DIRECT": TEST_DATABASE_URL}
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
    )


def _diff_against_models(connection) -> list:
    """Autogenerate's view of how the live schema differs from the models."""
    context = MigrationContext.configure(connection)
    return compare_metadata(context, Base.metadata)


@pytest_asyncio.fixture
async def clean_database():
    """A database with no tables and no leftover enum types.

    Dropping the schema rather than the tables matters: Postgres keeps enum
    types after their last column is gone, and a leftover one makes the next
    upgrade fail on "type already exists" -- the specific bug these tests
    exist to catch.
    """
    url = normalize_async_url(TEST_DATABASE_URL)
    engine = create_async_engine(url, connect_args=connect_args_for(url), future=True)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("DROP SCHEMA public CASCADE"))
            await connection.execute(text("CREATE SCHEMA public"))
    except OSError as error:
        await engine.dispose()
        if RUNNING_IN_CI:
            raise RuntimeError(
                f"CI could not reach the test database at {TEST_DATABASE_URL}. "
                "Skipping here would make a green suite meaningless."
            ) from error
        pytest.skip(f"no test Postgres reachable: {error}")
    yield engine
    await engine.dispose()


@pytest.mark.asyncio
async def test_upgrade_produces_the_schema_the_models_describe(clean_database):
    result = _alembic("upgrade", "head")
    assert result.returncode == 0, result.stderr

    async with clean_database.connect() as connection:
        diff = await connection.run_sync(_diff_against_models)

    assert diff == [], f"migrations and models disagree: {diff}"


@pytest.mark.asyncio
async def test_downgrade_then_upgrade_is_clean(clean_database):
    # A downgrade that drops columns but forgets their enum type fails the
    # *next* upgrade, a long way from its cause. Running the cycle twice is
    # what surfaces that here instead of on Joey's database.
    assert _alembic("upgrade", "head").returncode == 0

    down = _alembic("downgrade", "base")
    assert down.returncode == 0, down.stderr

    up = _alembic("upgrade", "head")
    assert up.returncode == 0, up.stderr


# --- Revision 0003: the copy columns. ------------------------------------
#
# The tests above prove head matches the models and survives a down/up cycle.
# These cover what they cannot see: the acquired_at backfill, and that a
# downgrade to 0002 leaves no enum type behind.

NEW_COLUMNS = {
    "release_date",
    "pinned_at",
    "acquired_at",
    "platform_id",
    "platform",
    "physical_format",
    "format_source",
    "cart_id",
    "region",
    "completeness",
}
NEW_TYPES = {"physical_format", "format_source", "completeness"}


async def _columns(engine) -> set[str]:
    async with engine.connect() as connection:
        rows = await connection.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'items'"
            )
        )
        return {row[0] for row in rows}


async def _types(engine) -> set[str]:
    async with engine.connect() as connection:
        rows = await connection.execute(text("SELECT typname FROM pg_type"))
        return {row[0] for row in rows}


@pytest.mark.asyncio
async def test_acquired_at_is_backfilled_from_created_at(clean_database):
    assert _alembic("upgrade", "0002").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status, created_at) VALUES "
                "(gen_random_uuid(), 'game', 'Old', 'backlog', "
                "'2026-03-04 23:30:00+00')"
            )
        )

    result = _alembic("upgrade", "0003")
    assert result.returncode == 0, result.stderr

    async with clean_database.connect() as connection:
        acquired = await connection.scalar(text("SELECT acquired_at FROM items"))
    # Cast in the database's time zone, UTC for the test server.
    assert str(acquired) == "2026-03-04"


@pytest.mark.asyncio
async def test_upgrade_adds_the_columns_and_types(clean_database):
    assert _alembic("upgrade", "0003").returncode == 0
    assert NEW_COLUMNS <= await _columns(clean_database)
    assert NEW_TYPES <= await _types(clean_database)


@pytest.mark.asyncio
async def test_downgrade_to_0002_removes_the_columns_and_types(clean_database):
    assert _alembic("upgrade", "0003").returncode == 0

    result = _alembic("downgrade", "0002")
    assert result.returncode == 0, result.stderr

    assert not NEW_COLUMNS & await _columns(clean_database)
    # A leftover type would fail the next upgrade on "already exists".
    assert not NEW_TYPES & await _types(clean_database)


# --- Revision 0004: pick_events. --------------------------------------------


@pytest.mark.asyncio
async def test_0004_adds_pick_events_and_its_type(clean_database):
    assert _alembic("upgrade", "0004").returncode == 0

    async with clean_database.connect() as connection:
        tables = await connection.scalar(
            text("SELECT count(*) FROM pg_tables WHERE tablename = 'pick_events'")
        )
    assert tables == 1
    assert "pick_action" in await _types(clean_database)


@pytest.mark.asyncio
async def test_0004_downgrade_removes_the_table_and_type(clean_database):
    assert _alembic("upgrade", "0004").returncode == 0
    result = _alembic("downgrade", "0003")
    assert result.returncode == 0, result.stderr

    async with clean_database.connect() as connection:
        tables = await connection.scalar(
            text("SELECT count(*) FROM pg_tables WHERE tablename = 'pick_events'")
        )
    assert tables == 0
    assert "pick_action" not in await _types(clean_database)


@pytest.mark.asyncio
async def test_deleting_an_item_deletes_its_pick_events(clean_database):
    assert _alembic("upgrade", "0004").returncode == 0
    async with clean_database.begin() as connection:
        item_id = await connection.scalar(
            text(
                "INSERT INTO items (id, type, title, status) VALUES "
                "(gen_random_uuid(), 'game', 'Gone', 'backlog') RETURNING id"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO pick_events (id, item_id, action) VALUES "
                "(gen_random_uuid(), :item, 'shown')"
            ),
            {"item": item_id},
        )
        await connection.execute(
            text("DELETE FROM items WHERE id = :item"), {"item": item_id}
        )
        remaining = await connection.scalar(text("SELECT count(*) FROM pick_events"))
    assert remaining == 0


# --- Revision 0005: the physical catalogue. ---------------------------------

CATALOGUE_TABLES = {
    "catalogue_games",
    "physical_editions",
    "store_listings",
    "catalogue_matches",
    "catalogue_runs",
}
CATALOGUE_TYPES = {
    "release_precision",
    "listing_availability",
    "match_confidence",
    "match_decision",
}
# Reused by 0005, owned by 0003 and 0004: a 0005 downgrade must leave them.
EARLIER_TYPES = {"physical_format", "format_source", "pick_action"}


async def _tables(engine) -> set[str]:
    async with engine.connect() as connection:
        rows = await connection.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        )
        return {row[0] for row in rows}


@pytest.mark.asyncio
async def test_0005_adds_the_catalogue_tables_and_types(clean_database):
    result = _alembic("upgrade", "0005")
    assert result.returncode == 0, result.stderr

    assert CATALOGUE_TABLES <= await _tables(clean_database)
    assert CATALOGUE_TYPES <= await _types(clean_database)


@pytest.mark.asyncio
async def test_0005_downgrade_removes_them_and_keeps_the_earlier_types(
    clean_database,
):
    assert _alembic("upgrade", "0005").returncode == 0
    result = _alembic("downgrade", "0004")
    assert result.returncode == 0, result.stderr

    assert not CATALOGUE_TABLES & await _tables(clean_database)
    types = await _types(clean_database)
    assert not CATALOGUE_TYPES & types
    assert EARLIER_TYPES <= types


RECOMMENDATION_TYPES = {"recommendation_kind", "reason_source", "recommendation_status"}


@pytest.mark.asyncio
async def test_0006_adds_the_recommendations_table_and_types(clean_database):
    result = _alembic("upgrade", "0006")
    assert result.returncode == 0, result.stderr
    assert "recommendations" in await _tables(clean_database)
    assert RECOMMENDATION_TYPES <= await _types(clean_database)


@pytest.mark.asyncio
async def test_0006_downgrade_removes_it_and_keeps_the_catalogue(clean_database):
    assert _alembic("upgrade", "0006").returncode == 0
    result = _alembic("downgrade", "0005")
    assert result.returncode == 0, result.stderr

    assert "recommendations" not in await _tables(clean_database)
    types = await _types(clean_database)
    assert not RECOMMENDATION_TYPES & types
    assert {"item_type", "physical_format", "format_source"} <= types
    assert CATALOGUE_TABLES <= await _tables(clean_database)


@pytest.mark.asyncio
async def test_deleting_a_catalogue_game_unlinks_its_editions_and_listings(
    clean_database,
):
    assert _alembic("upgrade", "0005").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO catalogue_games (igdb_id, title, snapshot) "
                "VALUES (42, 'Gone', '{}'::jsonb)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO physical_editions (id, source, source_ref, title, "
                "title_normalized, platform_id, platform, region, igdb_id) VALUES "
                "(gen_random_uuid(), 'nscollectors', 'gone|USA', 'Gone', 'gone', "
                "508, 'Nintendo Switch 2', 'USA', 42)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO store_listings (id, store, store_product_id, "
                "variant_id, handle, url, region, title, title_normalized, "
                "is_game, currency, availability, igdb_id) VALUES "
                "(gen_random_uuid(), 'super_rare', '1', '1', 'gone', "
                "'https://example.test/gone', 'EUR', 'Gone', 'gone', true, 'GBP', "
                "'in_stock', 42)"
            )
        )
        await connection.execute(text("DELETE FROM catalogue_games"))
        edition = await connection.scalar(
            text("SELECT count(*) FROM physical_editions WHERE igdb_id IS NULL")
        )
        listing = await connection.scalar(
            text("SELECT count(*) FROM store_listings WHERE igdb_id IS NULL")
        )
    # The rows stay; only the link goes.
    assert (edition, listing) == (1, 1)


@pytest.mark.asyncio
async def test_is_physical_keeps_null(clean_database):
    # NULL means "announced, card type not listed yet" and is filtered with
    # IS DISTINCT FROM false, so it must never be defaulted to either value.
    assert _alembic("upgrade", "0005").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO physical_editions (id, source, source_ref, title, "
                "title_normalized, platform_id, platform, region) VALUES "
                "(gen_random_uuid(), 'nscollectors', 'soon|EUR', 'Soon', 'soon', "
                "508, 'Nintendo Switch 2', 'EUR')"
            )
        )
        value = await connection.scalar(
            text("SELECT is_physical IS NULL FROM physical_editions")
        )
        # compare_metadata does not compare server defaults, so a default
        # added to the model alone would pass every other test.
        column_default = await connection.scalar(
            text(
                "SELECT column_default FROM information_schema.columns "
                "WHERE table_name = 'physical_editions' "
                "AND column_name = 'is_physical'"
            )
        )
    assert value is True
    assert column_default is None


# --- Revision 0007: play_sessions. -----------------------------------------


@pytest.mark.asyncio
async def test_0007_adds_play_sessions_and_downgrades_cleanly(clean_database):
    assert _alembic("upgrade", "0007").returncode == 0
    async with clean_database.connect() as connection:
        before = await connection.scalar(
            text("SELECT count(*) FROM pg_tables WHERE tablename = 'play_sessions'")
        )
    result = _alembic("downgrade", "0006")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        after = await connection.scalar(
            text("SELECT count(*) FROM pg_tables WHERE tablename = 'play_sessions'")
        )
        recommendations = await connection.scalar(
            text("SELECT count(*) FROM pg_tables WHERE tablename = 'recommendations'")
        )
    assert (before, after, recommendations) == (1, 0, 1)


# --- Revision 0008: analytics. ---------------------------------------------


@pytest.mark.asyncio
async def test_0008_adds_the_analytics_tables_and_downgrades_cleanly(clean_database):
    tables = text(
        "SELECT count(*) FROM pg_tables "
        "WHERE tablename IN ('page_views', 'daily_stats')"
    )
    assert _alembic("upgrade", "0008").returncode == 0
    async with clean_database.connect() as connection:
        before = await connection.scalar(tables)
    result = _alembic("downgrade", "0007")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        after = await connection.scalar(tables)
        journal = await connection.scalar(
            text("SELECT count(*) FROM pg_tables WHERE tablename = 'play_sessions'")
        )
    assert (before, after, journal) == (2, 0, 1)


# --- Revision 0009: pick event slot. ---------------------------------------


@pytest.mark.asyncio
async def test_0009_adds_a_nullable_slot_and_downgrades_cleanly(clean_database):
    column = text(
        "SELECT is_nullable FROM information_schema.columns "
        "WHERE table_name = 'pick_events' AND column_name = 'slot'"
    )
    assert _alembic("upgrade", "0009").returncode == 0
    async with clean_database.connect() as connection:
        before = await connection.scalar(column)
    result = _alembic("downgrade", "0008")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        after = await connection.scalar(column)
        events = await connection.scalar(
            text("SELECT count(*) FROM pg_tables WHERE tablename = 'pick_events'")
        )
    assert (before, after, events) == ("YES", None, 1)


# --- Revision 0010: comic columns. -----------------------------------------


@pytest.mark.asyncio
async def test_0010_adds_the_comic_columns_and_downgrades_cleanly(clean_database):
    columns = text(
        "SELECT column_name, is_nullable, column_default "
        "FROM information_schema.columns WHERE table_name = 'items' "
        "AND column_name IN ('issues_owned', 'issues_skipped', 'editions', "
        "'read_to', 'shelf_format', 'following') ORDER BY column_name"
    )
    shelf_type = text(
        "SELECT count(*) FROM pg_type WHERE typname = 'comic_shelf_format'"
    )
    assert _alembic("upgrade", "0009").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) VALUES "
                "(gen_random_uuid(), 'comic', 'Saga', 'backlog')"
            )
        )
    assert _alembic("upgrade", "0010").returncode == 0
    async with clean_database.connect() as connection:
        before = (await connection.execute(columns)).all()
        existing = await connection.scalar(text("SELECT following FROM items"))
        type_before = await connection.scalar(shelf_type)
    result = _alembic("downgrade", "0009")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        after = (await connection.execute(columns)).all()
        type_after = await connection.scalar(shelf_type)
    nullable = {name: is_nullable for name, is_nullable, _ in before}
    assert nullable == {
        "editions": "YES",
        "following": "NO",
        "issues_owned": "YES",
        "issues_skipped": "YES",
        "read_to": "YES",
        "shelf_format": "YES",
    }
    assert existing is False
    assert (type_before, after, type_after) == (1, [], 0)


# --- Revision 0011: playthroughs and paused. ------------------------------

BACKFILL_ROWS = [
    # title, status, started_at, finished_at, times_completed
    ("Never", "backlog", None, None, 0),
    ("Once", "finished", "2024-01-02", "2024-03-04", 1),
    ("Thrice", "finished", "2023-05-01", "2026-10-19", 3),
    ("Uncounted", "finished", None, "2025-06-01", 0),
    ("Playing", "active", "2026-10-24", None, 0),
    ("Replaying", "active", "2024-02-01", "2024-03-01", 1),
    ("Dropped", "abandoned", "2025-01-01", "2025-02-01", 0),
    ("Shelved again", "backlog", None, "2024-08-08", 2),
    # The two shapes no status matched at first: a start date left on a
    # backlog game, and a finish date on a game being played again.
    ("Put down", "backlog", "2026-05-01", None, 0),
    ("Back again", "active", "2025-03-01", "2025-04-01", 0),
]


@pytest.mark.asyncio
async def test_0011_backfills_runs_that_reproduce_the_columns(clean_database):
    assert _alembic("upgrade", "0010").returncode == 0
    async with clean_database.begin() as connection:
        for title, status, started, finished, completed in BACKFILL_ROWS:
            await connection.execute(
                text(
                    "INSERT INTO items (id, type, title, status, started_at, "
                    "finished_at, times_completed) VALUES (gen_random_uuid(), "
                    "'game', :title, :status, :started, :finished, :completed)"
                ),
                {
                    "title": title,
                    "status": status,
                    "started": started and date.fromisoformat(started),
                    "finished": finished and date.fromisoformat(finished),
                    "completed": completed,
                },
            )
    result = _alembic("upgrade", "0011")
    assert result.returncode == 0, result.stderr

    async with clean_database.connect() as connection:
        runs = (
            await connection.execute(
                text(
                    "SELECT i.title, p.number, p.started_on::text, "
                    "p.finished_on::text, p.outcome::text FROM playthroughs p "
                    "JOIN items i ON i.id = p.item_id ORDER BY i.title, p.number"
                )
            )
        ).all()
        columns = {
            row[0]: tuple(row[1:])
            for row in await connection.execute(
                text(
                    "SELECT title, started_at::text, finished_at::text, "
                    "times_completed FROM items"
                )
            )
        }
        paused = await connection.scalar(
            text(
                "SELECT count(*) FROM pg_enum e JOIN pg_type t "
                "ON t.oid = e.enumtypid WHERE t.typname = 'item_status' "
                "AND e.enumlabel = 'paused'"
            )
        )

    assert runs == [
        ("Back again", 1, "2025-03-01", "2025-04-01", "finished"),
        ("Back again", 2, None, None, None),
        ("Dropped", 1, "2025-01-01", "2025-02-01", "abandoned"),
        ("Once", 1, "2024-01-02", "2024-03-04", "finished"),
        ("Playing", 1, "2026-10-24", None, None),
        ("Put down", 1, "2026-05-01", None, "abandoned"),
        ("Replaying", 1, "2024-02-01", "2024-03-01", "finished"),
        ("Replaying", 2, None, None, None),
        ("Shelved again", 1, None, None, "finished"),
        ("Shelved again", 2, None, "2024-08-08", "finished"),
        ("Thrice", 1, "2023-05-01", None, "finished"),
        ("Thrice", 2, None, None, "finished"),
        ("Thrice", 3, None, "2026-10-19", "finished"),
        ("Uncounted", 1, None, "2025-06-01", "finished"),
    ]
    # Every consistent row keeps its three values exactly; the two the old
    # counter got wrong are corrected, and nothing is lost (Dropped's close
    # date is on its run).
    assert columns == {
        "Never": (None, None, 0),
        "Once": ("2024-01-02", "2024-03-04", 1),
        "Thrice": ("2023-05-01", "2026-10-19", 3),
        "Uncounted": (None, "2025-06-01", 1),
        "Playing": ("2026-10-24", None, 0),
        "Replaying": ("2024-02-01", "2024-03-01", 1),
        "Dropped": ("2025-01-01", None, 0),
        "Shelved again": (None, "2024-08-08", 2),
        "Put down": ("2026-05-01", None, 0),
        "Back again": ("2025-03-01", "2025-04-01", 1),
    }
    assert paused == 1


@pytest.mark.asyncio
async def test_0011_downgrade_drops_the_table_and_resets_paused(clean_database):
    assert _alembic("upgrade", "0011").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) VALUES "
                "(gen_random_uuid(), 'game', 'Parked', 'paused')"
            )
        )
    result = _alembic("downgrade", "0010")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        status = await connection.scalar(text("SELECT status::text FROM items"))
        tables = await connection.scalar(
            text("SELECT count(*) FROM pg_tables WHERE tablename = 'playthroughs'")
        )
    assert (status, tables) == ("active", 0)
    assert "playthrough_outcome" not in await _types(clean_database)
    # And back up: the enum value is already there, IF NOT EXISTS keeps it
    # from failing.
    up = _alembic("upgrade", "0011")
    assert up.returncode == 0, up.stderr


# --- Revision 0013: Denver spots. -------------------------------------------

SPOT_TABLES = {
    "spots",
    "visits",
    "candidates",
    "dismissals",
    "weather_hours",
    "spot_settings",
}


@pytest.mark.asyncio
async def test_0013_adds_the_spot_tables_and_type(clean_database):
    result = _alembic("upgrade", "0013")
    assert result.returncode == 0, result.stderr
    assert SPOT_TABLES <= await _tables(clean_database)
    assert "candidate_source" in await _types(clean_database)


@pytest.mark.asyncio
async def test_0013_downgrade_removes_them_and_keeps_the_rest(clean_database):
    assert _alembic("upgrade", "0013").returncode == 0
    result = _alembic("downgrade", "0012")
    assert result.returncode == 0, result.stderr

    tables = await _tables(clean_database)
    assert not SPOT_TABLES & tables
    assert {"items", "playthroughs", "recommendations"} <= tables
    assert "candidate_source" not in await _types(clean_database)


@pytest.mark.asyncio
async def test_deleting_a_spot_deletes_its_visits_and_unlinks_candidates(
    clean_database,
):
    assert _alembic("upgrade", "0013").returncode == 0
    async with clean_database.begin() as connection:
        spot_id = await connection.scalar(
            text(
                "INSERT INTO spots (id, name, slug, lat, lng, anchor) VALUES "
                "(gen_random_uuid(), 'Home', 'home', 39.74, -104.99, true) "
                "RETURNING id"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO visits (id, spot_id, visited_on) VALUES "
                "(gen_random_uuid(), :spot, '2026-11-08')"
            ),
            {"spot": spot_id},
        )
        await connection.execute(
            text(
                "INSERT INTO candidates (id, source, source_id, name, lat, lng, "
                "nearest_anchor_id) VALUES (gen_random_uuid(), 'osm', 'node/1', "
                "'Cafe', 39.75, -104.98, :spot)"
            ),
            {"spot": spot_id},
        )
        await connection.execute(
            text("DELETE FROM spots WHERE id = :spot"), {"spot": spot_id}
        )
        visits = await connection.scalar(text("SELECT count(*) FROM visits"))
        anchor = await connection.scalar(
            text("SELECT nearest_anchor_id FROM candidates")
        )
    assert (visits, anchor) == (0, None)


@pytest.mark.asyncio
async def test_0013_spot_defaults_are_private_and_denver(clean_database):
    assert _alembic("upgrade", "0013").returncode == 0
    async with clean_database.begin() as connection:
        row = (
            await connection.execute(
                text(
                    "INSERT INTO spots (id, name, slug, lat, lng) VALUES "
                    "(gen_random_uuid(), 'Park', 'park', 39.7, -105.0) "
                    "RETURNING is_public, anchor, city, tags"
                )
            )
        ).one()
    assert tuple(row) == (False, False, "denver", [])


# --- Revision 0014: Closet. ---------------------------------------------------

CLOSET_TABLES = {
    "garments",
    "garment_images",
    "outfits",
    "outfit_garments",
    "wears",
    "outfit_plans",
    "closet_profile",
    "garment_decisions",
    "closet_settings",
}
CLOSET_TYPES = {
    "garment_category",
    "garment_status",
    "outfit_source",
    "garment_tag_source",
    "garment_outcome",
}


@pytest.mark.asyncio
async def test_0014_adds_the_closet_tables_and_types(clean_database):
    result = _alembic("upgrade", "0014")
    assert result.returncode == 0, result.stderr
    assert CLOSET_TABLES <= await _tables(clean_database)
    assert CLOSET_TYPES <= await _types(clean_database)


@pytest.mark.asyncio
async def test_0014_downgrade_removes_them_and_keeps_the_rest(clean_database):
    assert _alembic("upgrade", "0014").returncode == 0
    result = _alembic("downgrade", "0013")
    assert result.returncode == 0, result.stderr

    tables = await _tables(clean_database)
    assert not CLOSET_TABLES & tables
    assert {"items", "spots", "spot_settings"} <= tables
    types = await _types(clean_database)
    assert not CLOSET_TYPES & types
    assert "candidate_source" in types


@pytest.mark.asyncio
async def test_0014_garment_defaults_and_cascade(clean_database):
    assert _alembic("upgrade", "0014").returncode == 0
    async with clean_database.begin() as connection:
        row = (
            await connection.execute(
                text(
                    "INSERT INTO garments (id) VALUES (gen_random_uuid()) "
                    "RETURNING id, status, tag_source, tag_attempts, seasons"
                )
            )
        ).one()
        garment_id = row[0]
        assert tuple(row[1:]) == ("untagged", None, 0, [])
        await connection.execute(
            text(
                "INSERT INTO garment_images (garment_id, webp, width, height) "
                "VALUES (:g, '\\x00'::bytea, 1, 1)"
            ),
            {"g": garment_id},
        )
        await connection.execute(
            text(
                "INSERT INTO wears (id, garment_id, worn_on) VALUES "
                "(gen_random_uuid(), :g, '2026-11-09')"
            ),
            {"g": garment_id},
        )
        await connection.execute(
            text("DELETE FROM garments WHERE id = :g"), {"g": garment_id}
        )
        images = await connection.scalar(text("SELECT count(*) FROM garment_images"))
        wears = await connection.scalar(text("SELECT count(*) FROM wears"))
    assert (images, wears) == (0, 0)


@pytest.mark.asyncio
async def test_0014_closet_profile_is_one_row(clean_database):
    assert _alembic("upgrade", "0014").returncode == 0
    async with clean_database.begin() as connection:
        row = (
            await connection.execute(
                text(
                    "INSERT INTO closet_profile (id) VALUES (1) RETURNING "
                    "repeat_top_days, repeat_outfit_weeks, tag_budget, "
                    "spring_turn, autumn_turn"
                )
            )
        ).one()
    assert tuple(row) == (5, 3, 5, "04-25", "10-25")
    with pytest.raises(Exception, match="closet_profile_single_row"):
        async with clean_database.begin() as connection:
            await connection.execute(text("INSERT INTO closet_profile (id) VALUES (2)"))
