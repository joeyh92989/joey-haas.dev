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
