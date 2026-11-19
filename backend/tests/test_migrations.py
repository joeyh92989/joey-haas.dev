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

import asyncio
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest
import pytest_asyncio
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from conftest import TEST_DATABASE_URL, mark_schema_dirty
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from db import connect_args_for, normalize_async_url
from models import Base

BACKEND = Path(__file__).resolve().parent.parent

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


def _diff_against_models(connection, before_0025: bool = False) -> list:
    """Autogenerate's view of how the live schema differs from the models."""
    context = MigrationContext.configure(connection)
    diff = compare_metadata(context, Base.metadata)
    # The models no longer carry items.editions (its drop is a later
    # migration), so a schema that still has the column is not drift. A schema
    # older than 0025 lacks the four outings columns on visits; that is the
    # revision, not drift. Only a caller that stopped below 0025 says so
    # (`before_0025=True`): at head a missing visits column is still reported.
    outings = {"title", "verdict", "kid_along", "precision"} if before_0025 else set()
    return [
        entry
        for entry in diff
        if not (
            entry[0] == "remove_column"
            and entry[2] == "items"
            and entry[3].name == "editions"
        )
        and not (
            entry[0] == "add_column"
            and entry[2] == "visits"
            and entry[3].name in outings
        )
    ]


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
    # The schema is replaced here, so the next ordinary test must rebuild it.
    mark_schema_dirty()
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
    try:
        yield engine
    finally:
        await engine.dispose()
        mark_schema_dirty()


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


def test_there_is_exactly_one_migration_head():
    # Two branches that each add a revision off the same parent give two heads,
    # and `alembic upgrade head` then refuses with an error that reads as a
    # tooling problem. Failing here names the cause.
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    heads = ScriptDirectory.from_config(config).get_heads()
    assert len(heads) == 1, f"merge the migration heads: {heads}"


def _start_upgrade(timeout_seconds: int) -> subprocess.Popen:
    env = {
        **os.environ,
        "DATABASE_URL_DIRECT": TEST_DATABASE_URL,
        "MIGRATION_LOCK_TIMEOUT_SECONDS": str(timeout_seconds),
    }
    return subprocess.Popen(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


async def _hold_lock(engine):
    from migration_lock import MIGRATION_LOCK_KEY

    connection = await engine.connect()
    await connection.execute(
        text("SELECT pg_advisory_lock(:key)"), {"key": MIGRATION_LOCK_KEY}
    )
    return connection


async def _release_lock(connection) -> None:
    """Unlock, then close. Closing alone only returns the connection to the
    pool, and the session-level lock would stay held."""
    from migration_lock import MIGRATION_LOCK_KEY

    await connection.execute(
        text("SELECT pg_advisory_unlock(:key)"), {"key": MIGRATION_LOCK_KEY}
    )
    await connection.close()


@pytest.mark.asyncio
async def test_an_upgrade_gives_up_when_the_lock_is_held_past_its_deadline(
    clean_database,
):
    # A run that died without closing its connection keeps the lock; the next
    # deploy has to fail with a reason, not wait out the CI job limit.
    holder = await _hold_lock(clean_database)
    try:
        process = _start_upgrade(timeout_seconds=2)
        _, err = await asyncio.to_thread(process.communicate, None, 120)
    finally:
        await _release_lock(holder)

    assert process.returncode != 0
    assert "migration lock" in err
    assert "items" not in await _tables(clean_database)


@pytest.mark.asyncio
async def test_an_upgrade_waits_for_the_lock_then_runs(clean_database):
    holder = await _hold_lock(clean_database)
    process = _start_upgrade(timeout_seconds=120)
    try:
        # Long enough for Alembic to start and reach the lock.
        await asyncio.sleep(4)
        assert process.poll() is None, "upgrade finished while the lock was held"
        assert "items" not in await _tables(clean_database)
        await _release_lock(holder)
        _, err = await asyncio.to_thread(process.communicate, None, 120)
    except BaseException:
        await _release_lock(holder)
        raise
    finally:
        if process.poll() is None:
            process.kill()

    assert process.returncode == 0, err
    # It really queued behind the lock rather than just starting late.
    assert "Waiting for another migration run" in err
    assert "items" in await _tables(clean_database)


@pytest.mark.asyncio
async def test_two_simultaneous_upgrades_apply_each_revision_once(clean_database):
    first, second = _start_upgrade(120), _start_upgrade(120)
    try:
        results = await asyncio.gather(
            asyncio.to_thread(first.communicate, None, 240),
            asyncio.to_thread(second.communicate, None, 240),
        )
    finally:
        for process in (first, second):
            if process.poll() is None:
                process.kill()

    assert first.returncode == 0 and second.returncode == 0, results
    applied = sum(err.count("Running upgrade") for _, err in results)
    async with clean_database.connect() as connection:
        revisions = await connection.scalar(
            text("SELECT count(*) FROM alembic_version")
        )
    assert revisions == 1
    # One run applied the whole chain; the other found nothing left to do.
    assert applied == len(_revisions_in_chain()), results


@pytest.mark.asyncio
async def test_read_only_commands_do_not_wait_for_the_lock(clean_database):
    # `current` is the check run before an upgrade; it must answer while one
    # holds the lock, not queue behind it.
    holder = await _hold_lock(clean_database)
    try:
        result = await asyncio.to_thread(_alembic, "current")
    finally:
        await _release_lock(holder)
    assert result.returncode == 0, result.stderr


def _revisions_in_chain() -> list[str]:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    return list(ScriptDirectory.from_config(config).walk_revisions())


async def _tables(engine) -> set[str]:
    async with engine.connect() as connection:
        rows = await connection.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        )
        return {row[0] for row in rows}


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


# --- Revision 0015: Intake. ---------------------------------------------------

INTAKE_TABLES = {
    "intake_sittings",
    "intake_photos",
    "intake_entries",
    "llm_usage",
    "intake_settings",
}
INTAKE_TYPES = {
    "movie_disc_format",
    "intake_area",
    "intake_photo_state",
    "intake_entry_state",
}


@pytest.mark.asyncio
async def test_0015_adds_the_intake_tables_and_types(clean_database):
    result = _alembic("upgrade", "0015")
    assert result.returncode == 0, result.stderr
    assert INTAKE_TABLES <= await _tables(clean_database)
    assert INTAKE_TYPES <= await _types(clean_database)


@pytest.mark.asyncio
async def test_0015_downgrade_removes_them_and_keeps_the_closet(clean_database):
    assert _alembic("upgrade", "0015").returncode == 0
    result = _alembic("downgrade", "0014")
    assert result.returncode == 0, result.stderr

    tables = await _tables(clean_database)
    assert not INTAKE_TABLES & tables
    assert CLOSET_TABLES <= tables
    types = await _types(clean_database)
    assert not INTAKE_TYPES & types
    assert "garment_status" in types
    async with clean_database.connect() as connection:
        columns = await connection.scalar(
            text(
                "SELECT count(*) FROM information_schema.columns "
                "WHERE table_name = 'items' AND column_name = 'disc_format'"
            )
        )
    assert columns == 0


@pytest.mark.asyncio
async def test_0015_sitting_delete_cascades_and_garment_delete_cascades_entry(
    clean_database,
):
    assert _alembic("upgrade", "0015").returncode == 0
    async with clean_database.begin() as connection:
        sitting = await connection.scalar(
            text(
                "INSERT INTO intake_sittings (id, area) VALUES "
                "(gen_random_uuid(), 'shelf') RETURNING id"
            )
        )
        photo = await connection.scalar(
            text(
                "INSERT INTO intake_photos (id, sitting_id, thumb_webp, width, "
                "height) VALUES (gen_random_uuid(), :s, '\\x00'::bytea, 1, 1) "
                "RETURNING id"
            ),
            {"s": sitting},
        )
        state, attempts = (
            await connection.execute(
                text("SELECT state, attempts FROM intake_photos WHERE id = :p"),
                {"p": photo},
            )
        ).one()
        assert (state, attempts) == ("uploaded", 0)
        garment = await connection.scalar(
            text("INSERT INTO garments (id) VALUES (gen_random_uuid()) RETURNING id")
        )
        await connection.execute(
            text(
                "INSERT INTO intake_entries (id, sitting_id, photo_id, kind, "
                "garment_id) VALUES (gen_random_uuid(), :s, :p, 'garment', :g)"
            ),
            {"s": sitting, "p": photo, "g": garment},
        )
        await connection.execute(
            text("DELETE FROM garments WHERE id = :g"), {"g": garment}
        )
        assert await connection.scalar(text("SELECT count(*) FROM intake_entries")) == 0
        await connection.execute(
            text(
                "INSERT INTO intake_entries (id, sitting_id, photo_id, kind) "
                "VALUES (gen_random_uuid(), :s, :p, 'game')"
            ),
            {"s": sitting, "p": photo},
        )
        await connection.execute(
            text("DELETE FROM intake_sittings WHERE id = :s"), {"s": sitting}
        )
        photos = await connection.scalar(text("SELECT count(*) FROM intake_photos"))
        entries = await connection.scalar(text("SELECT count(*) FROM intake_entries"))
    assert (photos, entries) == (0, 0)


@pytest.mark.asyncio
async def test_0015_llm_usage_is_one_row_per_day_and_model(clean_database):
    assert _alembic("upgrade", "0015").returncode == 0
    async with clean_database.begin() as connection:
        row = (
            await connection.execute(
                text(
                    "INSERT INTO llm_usage (day, model) VALUES ('2026-11-10', 'm') "
                    "RETURNING calls, exhausted"
                )
            )
        ).one()
    assert tuple(row) == (0, False)
    with pytest.raises(Exception, match="duplicate key"):
        async with clean_database.begin() as connection:
            await connection.execute(
                text("INSERT INTO llm_usage (day, model) VALUES ('2026-11-10', 'm')")
            )


# --- Revision 0017: comic issue marks. --------------------------------------


async def _seed_issue_rows(engine) -> None:
    """A series with one synced issue (#1) and one stub (#2, no Comic Vine
    id), written at revision 0017."""
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) VALUES "
                "('00000000-0000-0000-0000-000000000001', 'comic', 'S', 'backlog')"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO comic_issues (item_id, number, cv_id, fetched_on, owned) "
                "VALUES ('00000000-0000-0000-0000-000000000001', 1, 11, "
                "'2026-11-01', true)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO comic_issues (item_id, number, owned, skipped) "
                "VALUES ('00000000-0000-0000-0000-000000000001', 2, false, true)"
            )
        )


@pytest.mark.asyncio
async def test_0017_adds_marks_without_touching_rows(clean_database):
    assert _alembic("upgrade", "0016").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) VALUES "
                "('00000000-0000-0000-0000-000000000001', 'comic', 'S', 'backlog')"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO comic_issues (item_id, number, cv_id, fetched_on) "
                "VALUES ('00000000-0000-0000-0000-000000000001', 1, 11, "
                "'2026-11-01')"
            )
        )

    result = _alembic("upgrade", "0017")
    assert result.returncode == 0, result.stderr

    async with clean_database.connect() as connection:
        rows = (
            await connection.execute(
                text("SELECT number, owned, read, skipped FROM comic_issues")
            )
        ).all()
    # Marked false by the default, and no stub row inserted.
    assert [tuple(row) for row in rows] == [(1, False, False, False)]


@pytest.mark.asyncio
async def test_0017_downgrade_deletes_stubs_and_keeps_synced_rows(clean_database):
    assert _alembic("upgrade", "0017").returncode == 0
    await _seed_issue_rows(clean_database)

    result = _alembic("downgrade", "0016")
    assert result.returncode == 0, result.stderr

    async with clean_database.connect() as connection:
        numbers = (
            (await connection.execute(text("SELECT number FROM comic_issues")))
            .scalars()
            .all()
        )
        columns = {
            row[0]
            for row in await connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'comic_issues'"
                )
            )
        }
    assert list(numbers) == [1]
    assert not {"owned", "read", "skipped"} & columns
    # And the cycle closes: the next upgrade is clean.
    assert _alembic("upgrade", "head").returncode == 0


# --- Revision 0018: item tags. ----------------------------------------------


@pytest.mark.asyncio
async def test_0018_adds_tags_with_defaults_and_keeps_rows(clean_database):
    assert _alembic("upgrade", "0017").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) VALUES "
                "('00000000-0000-0000-0000-000000000001', 'game', 'G', 'backlog')"
            )
        )

    result = _alembic("upgrade", "0018")
    assert result.returncode == 0, result.stderr

    async with clean_database.connect() as connection:
        row = (
            await connection.execute(text("SELECT title, tags, tags_edited FROM items"))
        ).one()
    assert tuple(row) == ("G", [], False)


@pytest.mark.asyncio
async def test_0018_downgrade_drops_the_columns_and_the_cycle_closes(clean_database):
    assert _alembic("upgrade", "0018").returncode == 0
    result = _alembic("downgrade", "0017")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        columns = {
            row[0]
            for row in await connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'items'"
                )
            )
        }
    assert not {"tags", "tags_edited"} & columns
    assert _alembic("upgrade", "head").returncode == 0


# --- Revision 0019: item tag attempts. ---------------------------------------


@pytest.mark.asyncio
async def test_0019_adds_tag_attempts_at_zero_and_keeps_rows(clean_database):
    assert _alembic("upgrade", "0018").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) VALUES "
                "('00000000-0000-0000-0000-000000000001', 'comic', 'C', 'backlog')"
            )
        )

    result = _alembic("upgrade", "0019")
    assert result.returncode == 0, result.stderr

    async with clean_database.connect() as connection:
        row = (
            await connection.execute(text("SELECT title, tag_attempts FROM items"))
        ).one()
    assert tuple(row) == ("C", 0)


@pytest.mark.asyncio
async def test_0019_downgrade_drops_the_column_and_the_cycle_closes(clean_database):
    assert _alembic("upgrade", "0019").returncode == 0
    result = _alembic("downgrade", "0018")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        columns = {
            row[0]
            for row in await connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'items'"
                )
            )
        }
    assert "tag_attempts" not in columns
    assert _alembic("upgrade", "head").returncode == 0


# --- Revision 0020: garment products. ----------------------------------------


@pytest.mark.asyncio
async def test_0020_adds_colour_size_and_the_products_table(clean_database):
    assert _alembic("upgrade", "0019").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO garments (id, name) VALUES "
                "('00000000-0000-0000-0000-000000000001', 'Tee')"
            )
        )

    result = _alembic("upgrade", "0020")
    assert result.returncode == 0, result.stderr

    async with clean_database.begin() as connection:
        row = (
            await connection.execute(
                text("SELECT name, color_name, color_source, size FROM garments")
            )
        ).one()
        assert tuple(row) == ("Tee", None, None, None)
        await connection.execute(
            text(
                "INSERT INTO garment_products (id, garment_id, source, price) "
                "VALUES ('00000000-0000-0000-0000-0000000000a1', "
                "'00000000-0000-0000-0000-000000000001', 'duer', 59.00)"
            )
        )
        await connection.execute(
            text(
                "DELETE FROM garments WHERE id = '00000000-0000-0000-0000-000000000001'"
            )
        )
        count = await connection.scalar(text("SELECT count(*) FROM garment_products"))
    assert count == 0


@pytest.mark.asyncio
async def test_0020_downgrade_drops_columns_table_and_types(clean_database):
    assert _alembic("upgrade", "0020").returncode == 0
    result = _alembic("downgrade", "0019")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        columns = {
            row[0]
            for row in await connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'garments'"
                )
            )
        }
        tables = {
            row[0]
            for row in await connection.execute(
                text("SELECT table_name FROM information_schema.tables")
            )
        }
        types = {
            row[0]
            for row in await connection.execute(text("SELECT typname FROM pg_type"))
        }
    assert not {"color_name", "color_source", "size"} & columns
    assert "garment_products" not in tables
    assert not {"garment_color_source", "garment_product_source"} & types
    assert _alembic("upgrade", "head").returncode == 0


# --- Revision 0021: comic volumes and collects. ------------------------------

_ITEM_A = "00000000-0000-0000-0000-0000000000a1"
_ITEM_B = "00000000-0000-0000-0000-0000000000b2"
_ITEM_C = "00000000-0000-0000-0000-0000000000c3"
_ITEM_D = "00000000-0000-0000-0000-0000000000d4"


async def _seed_editions(engine) -> int:
    """Items holding editions at 0020; returns the entry count."""
    import json

    items = {
        # Three editions, a repeated range (-2 slug), a single-issue range.
        _ITEM_A: (
            "Saga",
            [
                {"kind": "Trade", "label": "Vol 1", "from": 1, "to": 6},
                {"kind": "Hardcover", "label": "Deluxe 1", "from": 1, "to": 6},
                {"kind": "omnibus", "label": "Book One", "from": 7, "to": 7},
            ],
        ),
        # An odd kind, and a Comic Vine link with its server-written keys.
        _ITEM_B: (
            "Hellboy",
            [
                {"kind": "Compendium TPB", "label": "Compendium", "from": 1, "to": 40},
                {
                    "kind": "Trade",
                    "label": "Linked",
                    "from": 41,
                    "to": 45,
                    "cv_id": 777,
                    "cover_url": "https://img/c.jpg",
                    "large_url": "https://img/l.jpg",
                    "description": ["One.", "Two."],
                },
            ],
        ),
        _ITEM_C: ("Empty", []),
        _ITEM_D: ("Plain", None),
    }
    async with engine.begin() as connection:
        for item_id, (title, editions) in items.items():
            await connection.execute(
                text(
                    "INSERT INTO items (id, type, title, status, editions) "
                    "VALUES (:id, 'comic', :title, 'backlog', "
                    "CAST(:editions AS jsonb))"
                ),
                {
                    "id": item_id,
                    "title": title,
                    "editions": None if editions is None else json.dumps(editions),
                },
            )
        # A repeated range on a fourth title.
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status, editions) VALUES "
                "('00000000-0000-0000-0000-0000000000e5', 'comic', 'Twice', "
                "'backlog', CAST(:editions AS jsonb))"
            ),
            {
                "editions": json.dumps(
                    [
                        {"kind": "Trade", "label": "A", "from": 1, "to": 4},
                        {"kind": "Trade", "label": "B", "from": 1, "to": 4},
                        {"kind": "Trade", "label": "C", "from": 1, "to": 4},
                    ]
                )
            },
        )
    return 3 + 2 + 3


@pytest.mark.asyncio
async def test_0021_backfills_one_volume_per_edition(clean_database):
    assert _alembic("upgrade", "0020").returncode == 0
    expected = await _seed_editions(clean_database)

    result = _alembic("upgrade", "0021")
    assert result.returncode == 0, result.stderr

    async with clean_database.connect() as connection:
        assert await connection.scalar(text("SELECT count(*) FROM comic_volumes")) == (
            expected
        )
        assert await connection.scalar(
            text("SELECT count(*) FROM comic_volume_collects")
        ) == (expected)
        rows = (
            await connection.execute(
                text(
                    "SELECT i.title, v.position, v.slug, v.label, v.kind, "
                    "v.kind_raw, v.owned, v.read, v.cv_id, v.cover_url, "
                    "v.large_url, v.description FROM comic_volumes v "
                    "JOIN items i ON i.id = v.item_id ORDER BY i.title, v.position"
                )
            )
        ).all()
        by_title: dict[str, list] = {}
        for row in rows:
            by_title.setdefault(row[0], []).append(row)

        saga = by_title["Saga"]
        assert [r.slug for r in saga] == ["ed-1-6", "ed-1-6-2", "ed-7-7"]
        assert [r.position for r in saga] == [0, 1, 2]
        assert [(r.kind, r.kind_raw) for r in saga] == [
            ("trade", "Trade"),
            ("hardcover", "Hardcover"),
            ("omnibus", "omnibus"),
        ]
        assert all(r.owned and not r.read for r in saga)
        assert saga[0].label == "Vol 1"

        assert [r.slug for r in by_title["Twice"]] == [
            "ed-1-4",
            "ed-1-4-2",
            "ed-1-4-3",
        ]

        hellboy = by_title["Hellboy"]
        assert (hellboy[0].kind, hellboy[0].kind_raw) == ("trade", "Compendium TPB")
        linked = hellboy[1]
        assert linked.cv_id == 777
        assert linked.cover_url == "https://img/c.jpg"
        assert linked.large_url == "https://img/l.jpg"
        assert linked.description == "One.\n\nTwo."
        assert hellboy[0].cv_id is None

        assert "Empty" not in by_title and "Plain" not in by_title

        collects = (
            await connection.execute(
                text(
                    "SELECT i.title, v.slug, c.series_name, c.issue_text, c.source, "
                    "c.item_id::text, c.from_number, c.to_number, c.position "
                    "FROM comic_volume_collects c "
                    "JOIN comic_volumes v ON v.id = c.volume_id "
                    "JOIN items i ON i.id = v.item_id "
                    "ORDER BY i.title, v.position"
                )
            )
        ).all()
        saga_collects = [tuple(r) for r in collects if r[0] == "Saga"]
        assert saga_collects == [
            ("Saga", "ed-1-6", "Saga", "#1-6", "migrated", _ITEM_A, 1, 6, 0),
            ("Saga", "ed-1-6-2", "Saga", "#1-6", "migrated", _ITEM_A, 1, 6, 0),
            ("Saga", "ed-7-7", "Saga", "#7", "migrated", _ITEM_A, 7, 7, 0),
        ]

        # items.editions is untouched.
        kept = await connection.scalar(
            text("SELECT jsonb_array_length(editions) FROM items WHERE id = :id"),
            {"id": _ITEM_A},
        )
    assert kept == 3


@pytest.mark.asyncio
async def test_0021_cycle_copies_again_and_matches_models(clean_database):
    assert _alembic("upgrade", "0020").returncode == 0
    expected = await _seed_editions(clean_database)
    assert _alembic("upgrade", "0021").returncode == 0
    assert _alembic("downgrade", "0020").returncode == 0
    async with clean_database.connect() as connection:
        tables = {
            row[0]
            for row in await connection.execute(
                text("SELECT table_name FROM information_schema.tables")
            )
        }
        editions = await connection.scalar(
            text("SELECT jsonb_array_length(editions) FROM items WHERE id = :id"),
            {"id": _ITEM_A},
        )
    assert not {"comic_volumes", "comic_volume_collects"} & tables
    assert editions == 3
    assert _alembic("upgrade", "head").returncode == 0
    async with clean_database.connect() as connection:
        assert (
            await connection.scalar(text("SELECT count(*) FROM comic_volumes"))
            == expected
        )
        diff = await connection.run_sync(_diff_against_models)
    assert diff == []


@pytest.mark.asyncio
async def test_0021_malformed_editions_are_copied_not_dropped(clean_database):
    import json

    assert _alembic("upgrade", "0020").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status, editions) VALUES "
                "(:id, 'comic', 'Odd', 'backlog', CAST(:editions AS jsonb))"
            ),
            {
                "id": _ITEM_A,
                "editions": json.dumps(
                    [
                        {"kind": "Trade"},
                        "junk",
                        {"label": "No kind", "from": 3, "to": 1},
                    ]
                ),
            },
        )
    assert _alembic("upgrade", "0021").returncode == 0
    async with clean_database.connect() as connection:
        rows = (
            await connection.execute(
                text(
                    "SELECT slug, label, kind, kind_raw FROM comic_volumes "
                    "ORDER BY position"
                )
            )
        ).all()
    assert [tuple(r) for r in rows] == [
        ("ed-None-None", "Odd", "trade", "Trade"),
        ("ed-None-None-2", "Odd", "trade", None),
        ("ed-3-1", "No kind", "trade", None),
    ]


@pytest.mark.asyncio
async def test_0021_backfill_survives_editions_that_are_not_lists(clean_database):
    """Production's first 0021 run failed with "cannot get array length of a
    scalar": the old WHERE clause relied on `jsonb_typeof(...) = 'array'`
    running before `jsonb_array_length`, and Postgres does not order AND.
    Any non-list `editions` value must be skipped, not fatal."""
    import json
    import uuid

    assert _alembic("upgrade", "0020").returncode == 0
    odd = {
        "scalar number": "5",
        "scalar string": json.dumps("trade"),
        "json null": "null",
        "object": json.dumps({"kind": "Trade", "from": 1, "to": 2}),
        "empty list": "[]",
    }
    good_id = str(uuid.uuid4())
    async with clean_database.begin() as connection:
        for title, value in odd.items():
            await connection.execute(
                text(
                    "INSERT INTO items (id, type, title, status, editions) VALUES "
                    "(CAST(:id AS uuid), 'comic', :title, 'backlog', "
                    "CAST(:editions AS jsonb))"
                ),
                {"id": str(uuid.uuid4()), "title": title, "editions": value},
            )
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status, editions) VALUES "
                "(CAST(:id AS uuid), 'comic', 'Good', 'backlog', "
                "CAST(:editions AS jsonb))"
            ),
            {
                "id": good_id,
                "editions": json.dumps(
                    [{"kind": "Trade", "label": "Vol 1", "from": 1, "to": 6}]
                ),
            },
        )
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) "
                "VALUES (CAST(:id AS uuid), 'comic', 'Null', 'backlog')"
            ),
            {"id": str(uuid.uuid4())},
        )
    result = _alembic("upgrade", "0021")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        rows = (
            await connection.execute(
                text("SELECT item_id::text, slug FROM comic_volumes")
            )
        ).all()
    assert [tuple(r) for r in rows] == [(good_id, "ed-1-6")]


@pytest.mark.asyncio
async def test_0021_cascades_and_keeps_issue_rows(clean_database):
    assert _alembic("upgrade", "0020").returncode == 0
    await _seed_editions(clean_database)
    assert _alembic("upgrade", "0021").returncode == 0

    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO comic_issues (item_id, number, cv_id, fetched_on) "
                "VALUES (:id, 1, 11, '2026-11-01')"
            ),
            {"id": _ITEM_A},
        )
        # Deleting one volume leaves the issue rows (and its collects go).
        await connection.execute(
            text("DELETE FROM comic_volumes WHERE item_id = :id AND slug = 'ed-7-7'"),
            {"id": _ITEM_A},
        )
        assert await connection.scalar(text("SELECT count(*) FROM comic_issues")) == 1
        assert (
            await connection.scalar(
                text(
                    "SELECT count(*) FROM comic_volume_collects c "
                    "JOIN comic_volumes v ON v.id = c.volume_id "
                    "WHERE v.item_id = :id"
                ),
                {"id": _ITEM_A},
            )
            == 2
        )
        # Deleting the title deletes its volumes and their collects.
        await connection.execute(
            text("DELETE FROM items WHERE id = :id"), {"id": _ITEM_A}
        )
        assert (
            await connection.scalar(
                text("SELECT count(*) FROM comic_volumes WHERE item_id = :id"),
                {"id": _ITEM_A},
            )
            == 0
        )
        assert await connection.scalar(text("SELECT count(*) FROM comic_issues")) == 0
        remaining = await connection.scalar(
            text("SELECT count(*) FROM comic_volume_collects")
        )
    assert remaining == 5


@pytest.mark.asyncio
async def test_0021_constraints(clean_database):
    from sqlalchemy.exc import IntegrityError

    assert _alembic("upgrade", "0021").returncode == 0
    insert = (
        "INSERT INTO comic_volumes (id, item_id, position, slug, label, kind) "
        "VALUES (gen_random_uuid(), :id, 0, :slug, 'L', :kind)"
    )
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) "
                "VALUES (:id, 'comic', 'T', 'backlog')"
            ),
            {"id": _ITEM_A},
        )
        await connection.execute(
            text(insert), {"id": _ITEM_A, "slug": "vol-1", "kind": "ogn"}
        )
    with pytest.raises(IntegrityError):
        async with clean_database.begin() as connection:
            await connection.execute(
                text(insert), {"id": _ITEM_A, "slug": "vol-1", "kind": "trade"}
            )
    with pytest.raises(IntegrityError):
        async with clean_database.begin() as connection:
            await connection.execute(
                text(insert), {"id": _ITEM_A, "slug": "vol-2", "kind": "zine"}
            )
    async with clean_database.begin() as connection:
        # Defaults: owned true, read false.
        row = (
            await connection.execute(text("SELECT owned, read FROM comic_volumes"))
        ).one()
    assert tuple(row) == (True, False)


# --- Revision 0023: comic_volumes.intake_entry_id. ---------------------------

_ENTRY = "00000000-0000-0000-0000-0000000000e1"


async def _seed_volumes_at_0022(engine) -> None:
    """One title with three volumes, none of them from intake."""
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) "
                "VALUES (:id, 'comic', 'T', 'backlog')"
            ),
            {"id": _ITEM_A},
        )
        for position, slug in enumerate(("ed-1-6", "vol-1", "vol-2")):
            await connection.execute(
                text(
                    "INSERT INTO comic_volumes (id, item_id, position, slug, label, "
                    "kind) VALUES (gen_random_uuid(), :id, :p, :slug, 'L', 'trade')"
                ),
                {"id": _ITEM_A, "p": position, "slug": slug},
            )


@pytest.mark.asyncio
async def test_0023_adds_a_nullable_column_and_keeps_every_volume(clean_database):
    assert _alembic("upgrade", "0022").returncode == 0
    await _seed_volumes_at_0022(clean_database)
    result = _alembic("upgrade", "0023")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        rows = (
            await connection.execute(
                text("SELECT slug, intake_entry_id FROM comic_volumes ORDER BY slug")
            )
        ).all()
        diff = await connection.run_sync(_diff_against_models, True)
    # Every existing volume survives, with no intake entry; three NULLs do
    # not collide in the partial unique index.
    assert [tuple(row) for row in rows] == [
        ("ed-1-6", None),
        ("vol-1", None),
        ("vol-2", None),
    ]
    assert diff == []


@pytest.mark.asyncio
async def test_0023_one_volume_per_intake_entry(clean_database):
    from sqlalchemy.exc import IntegrityError

    assert _alembic("upgrade", "0023").returncode == 0
    insert = (
        "INSERT INTO comic_volumes (id, item_id, position, slug, label, kind, "
        "intake_entry_id) VALUES (gen_random_uuid(), :id, :p, :slug, 'L', 'ogn', "
        ":entry)"
    )
    async with clean_database.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO items (id, type, title, status) "
                "VALUES (:id, 'comic', 'T', 'backlog'), "
                "('00000000-0000-0000-0000-0000000000b2', 'comic', 'U', 'backlog')"
            ),
            {"id": _ITEM_A},
        )
        await connection.execute(
            text(insert), {"id": _ITEM_A, "p": 0, "slug": "vol-1", "entry": _ENTRY}
        )
        # NULL is not a key: any number of volumes without an entry.
        for n in (2, 3):
            await connection.execute(
                text(insert), {"id": _ITEM_A, "p": n, "slug": f"vol-{n}", "entry": None}
            )
    # The same entry on another slug, even on another title, is refused.
    for item, slug in ((_ITEM_A, "vol-9"), (_ITEM_B, "vol-1")):
        with pytest.raises(IntegrityError):
            async with clean_database.begin() as connection:
                await connection.execute(
                    text(insert), {"id": item, "p": 9, "slug": slug, "entry": _ENTRY}
                )


@pytest.mark.asyncio
async def test_0023_cycle_downgrades_and_matches_models(clean_database):
    assert _alembic("upgrade", "0022").returncode == 0
    await _seed_volumes_at_0022(clean_database)
    assert _alembic("upgrade", "0023").returncode == 0
    assert _alembic("downgrade", "0022").returncode == 0
    async with clean_database.connect() as connection:
        columns = {
            row[0]
            for row in await connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'comic_volumes'"
                )
            )
        }
        count = await connection.scalar(text("SELECT count(*) FROM comic_volumes"))
        indexes = {
            row[0]
            for row in await connection.execute(
                text(
                    "SELECT indexname FROM pg_indexes WHERE tablename = 'comic_volumes'"
                )
            )
        }
    assert "intake_entry_id" not in columns
    assert count == 3  # the downgrade loses no volume
    assert "ux_comic_volumes_intake_entry" not in indexes
    assert _alembic("upgrade", "head").returncode == 0
    async with clean_database.connect() as connection:
        assert await connection.scalar(text("SELECT count(*) FROM comic_volumes")) == 3
        diff = await connection.run_sync(_diff_against_models)
    assert diff == []


# --- Revision 0024: the places intake area. ----------------------------------


async def _insert_sitting(connection, area: str) -> None:
    await connection.execute(
        text(
            "INSERT INTO intake_sittings (id, area) "
            "VALUES (gen_random_uuid(), CAST(:area AS intake_area))"
        ),
        {"area": area},
    )


@pytest.mark.asyncio
async def test_0024_a_sitting_can_be_stored_with_the_places_area(clean_database):
    assert _alembic("upgrade", "0023").returncode == 0
    with pytest.raises(Exception, match="places"):
        async with clean_database.begin() as connection:
            await _insert_sitting(connection, "places")
    result = _alembic("upgrade", "0024")
    assert result.returncode == 0, result.stderr
    async with clean_database.begin() as connection:
        await _insert_sitting(connection, "places")
    async with clean_database.connect() as connection:
        assert (
            await connection.scalar(text("SELECT area::text FROM intake_sittings"))
            == "places"
        )
        diff = await connection.run_sync(_diff_against_models, True)
    assert diff == []


@pytest.mark.asyncio
async def test_0024_downgrade_deletes_places_sittings_and_their_entries(
    clean_database,
):
    assert _alembic("upgrade", "0024").returncode == 0
    async with clean_database.begin() as connection:
        await _insert_sitting(connection, "places")
        await _insert_sitting(connection, "closet")
        await _insert_sitting(connection, "shelf")
        places = await connection.scalar(
            text("SELECT id FROM intake_sittings WHERE area::text = 'places'")
        )
        await connection.execute(
            text(
                "INSERT INTO intake_entries (id, sitting_id, kind) "
                "VALUES (gen_random_uuid(), :s, 'place')"
            ),
            {"s": places},
        )
    result = _alembic("downgrade", "0023")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        areas = sorted(
            row[0]
            for row in await connection.execute(
                text("SELECT area::text FROM intake_sittings")
            )
        )
        entries = await connection.scalar(text("SELECT count(*) FROM intake_entries"))
    # The places sitting and its entry are gone; shelf and closet are left.
    assert areas == ["closet", "shelf"]
    assert entries == 0
    up = _alembic("upgrade", "0024")  # the label stayed, IF NOT EXISTS copes
    assert up.returncode == 0, up.stderr


# --- Revision 0025: outings columns on visits (story #344). ------------------

_SPOT = "00000000-0000-0000-0000-0000000000c1"


async def _seed_visit_at_0024(engine) -> None:
    """A spot with one visit shaped as before the outings columns."""
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO spots (id, name, slug, lat, lng) "
                "VALUES (:id, 'Old spot', 'old-spot', 39.7, -105.0)"
            ),
            {"id": _SPOT},
        )
        await connection.execute(
            text(
                "INSERT INTO visits (id, spot_id, visited_on, note) "
                "VALUES (gen_random_uuid(), :id, '2026-05-01', 'kept')"
            ),
            {"id": _SPOT},
        )


@pytest.mark.asyncio
async def test_0025_keeps_an_old_visit_as_a_day_with_nothing_else_set(clean_database):
    assert _alembic("upgrade", "0024").returncode == 0
    await _seed_visit_at_0024(clean_database)
    result = _alembic("upgrade", "0025")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        row = (
            await connection.execute(
                text(
                    "SELECT visited_on::text, note, precision::text, title, "
                    "verdict, kid_along FROM visits"
                )
            )
        ).one()
        diff = await connection.run_sync(_diff_against_models)
    assert tuple(row) == ("2026-05-01", "kept", "day", None, None, None)
    assert diff == []


@pytest.mark.asyncio
async def test_0025_the_new_columns_take_values_and_the_types_refuse_others(
    clean_database,
):
    assert _alembic("upgrade", "0025").returncode == 0
    await _seed_visit_at_0024(clean_database)
    insert = (
        "INSERT INTO visits (id, spot_id, visited_on, title, verdict, kid_along, "
        "precision) VALUES (gen_random_uuid(), :id, '2026-03-01', 'T', "
        "CAST(:verdict AS outing_verdict), true, CAST(:precision AS outing_precision))"
    )
    async with clean_database.begin() as connection:
        await connection.execute(
            text(insert), {"id": _SPOT, "verdict": "not_again", "precision": "month"}
        )
    async with clean_database.connect() as connection:
        stored = (
            await connection.execute(
                text(
                    "SELECT title, verdict::text, kid_along, precision::text "
                    "FROM visits WHERE title = 'T'"
                )
            )
        ).one()
    assert tuple(stored) == ("T", "not_again", True, "month")
    for verdict, precision in (("meh", "day"), ("loved", "week")):
        with pytest.raises(Exception, match="invalid input value for enum"):
            async with clean_database.begin() as connection:
                await connection.execute(
                    text(insert),
                    {"id": _SPOT, "verdict": verdict, "precision": precision},
                )


@pytest.mark.asyncio
async def test_0025_cycle_downgrades_and_matches_models(clean_database):
    assert _alembic("upgrade", "0024").returncode == 0
    await _seed_visit_at_0024(clean_database)
    assert _alembic("upgrade", "0025").returncode == 0
    assert _alembic("downgrade", "0024").returncode == 0
    async with clean_database.connect() as connection:
        columns = {
            row[0]
            for row in await connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'visits'"
                )
            )
        }
        types = {
            row[0]
            for row in await connection.execute(text("SELECT typname FROM pg_type"))
        }
        count = await connection.scalar(text("SELECT count(*) FROM visits"))
    assert not {"title", "verdict", "kid_along", "precision"} & columns
    assert not {"outing_verdict", "outing_precision"} & types
    assert count == 1  # the downgrade loses no visit
    assert _alembic("upgrade", "head").returncode == 0
    async with clean_database.connect() as connection:
        assert await connection.scalar(text("SELECT count(*) FROM visits")) == 1
        diff = await connection.run_sync(_diff_against_models)
    assert diff == []


@pytest.mark.asyncio
async def test_a_head_level_diff_still_reports_a_missing_visits_column(clean_database):
    """The 0025 carve-out is for schemas below 0025 only: at head, a visits
    column the models carry but the database lacks must show as drift."""
    assert _alembic("upgrade", "head").returncode == 0
    async with clean_database.begin() as connection:
        await connection.execute(text("ALTER TABLE visits DROP COLUMN kid_along"))
    async with clean_database.connect() as connection:
        at_head = await connection.run_sync(_diff_against_models)
        below = await connection.run_sync(_diff_against_models, True)
    assert [(e[0], e[3].name) for e in at_head] == [("add_column", "kid_along")]
    assert below == []  # the carve-out would hide it, which is why it is opt-in


# --- Revision 0026: drop items.editions. -------------------------------------


def _editions_column_exists(connection) -> object:
    return connection.scalar(
        text(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = 'items' AND column_name = 'editions'"
        )
    )


@pytest.mark.asyncio
async def test_0026_drops_the_editions_column_and_matches_the_models(clean_database):
    assert _alembic("upgrade", "0025").returncode == 0
    async with clean_database.connect() as connection:
        assert await _editions_column_exists(connection) == "jsonb"
    result = _alembic("upgrade", "0026")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        assert await _editions_column_exists(connection) is None
        diff = await connection.run_sync(_diff_against_models)
    assert diff == []


@pytest.mark.asyncio
async def test_0026_downgrade_readds_the_column_rebuilt_from_owned_volumes(
    clean_database,
):
    assert _alembic("upgrade", "0025").returncode == 0
    async with clean_database.begin() as connection:
        for title in ("Saga", "Plain"):
            await connection.execute(
                text(
                    "INSERT INTO items (id, type, title, status) VALUES "
                    "(gen_random_uuid(), 'comic', :t, 'backlog')"
                ),
                {"t": title},
            )
        saga = await connection.scalar(text("SELECT id FROM items WHERE title='Saga'"))
        volumes = (
            ("ed-1-6", 0, "Book One", "TPB", "trade", True, 1, 6),
            ("ed-7-12", 1, "Book Two", None, "hardcover", True, 7, 12),
            ("ed-13-18", 2, "Not owned", "Trade", "trade", False, 13, 18),
            ("vol-1", 3, "Typed later", None, "trade", True, 1, 2),
        )
        for slug, pos, label, raw, kind, owned, low, high in volumes:
            volume = await connection.scalar(
                text(
                    "INSERT INTO comic_volumes (id, item_id, position, slug, label, "
                    "kind, kind_raw, owned) VALUES (gen_random_uuid(), :i, :p, :s, "
                    ":l, :k, :r, :o) RETURNING id"
                ),
                {
                    "i": saga,
                    "p": pos,
                    "s": slug,
                    "l": label,
                    "k": kind,
                    "r": raw,
                    "o": owned,
                },
            )
            await connection.execute(
                text(
                    "INSERT INTO comic_volume_collects (id, volume_id, position, "
                    "series_name, issue_text, source, item_id, from_number, "
                    "to_number) VALUES (gen_random_uuid(), :v, 0, 'Saga', 'x', "
                    "'migrated', :i, :f, :t)"
                ),
                {"v": volume, "i": saga, "f": low, "t": high},
            )
    assert _alembic("upgrade", "0026").returncode == 0
    result = _alembic("downgrade", "0025")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        assert await _editions_column_exists(connection) == "jsonb"
        rebuilt = await connection.scalar(
            text("SELECT editions FROM items WHERE title = 'Saga'")
        )
        plain = await connection.scalar(
            text("SELECT editions FROM items WHERE title = 'Plain'")
        )
    assert rebuilt == [
        {"kind": "TPB", "label": "Book One", "from": 1, "to": 6},
        {"kind": "Hardcover", "label": "Book Two", "from": 7, "to": 12},
    ]
    assert plain is None
    assert _alembic("upgrade", "0026").returncode == 0


# --- Revision 0027: 'metron' as a contents source. ---------------------------


async def _seed_collects_at_0026(connection, sources: tuple[str, ...]) -> None:
    await connection.execute(
        text(
            "INSERT INTO items (id, type, title, status) VALUES "
            "(gen_random_uuid(), 'comic', 'Saga', 'backlog')"
        )
    )
    volume = await connection.scalar(
        text(
            "INSERT INTO comic_volumes (id, item_id, position, slug, label, kind) "
            "SELECT gen_random_uuid(), id, 0, 'vol-1', 'Book One', 'trade' "
            "FROM items RETURNING id"
        )
    )
    for position, source in enumerate(sources):
        await connection.execute(
            text(
                "INSERT INTO comic_volume_collects (id, volume_id, position, "
                "series_name, issue_text, source) VALUES "
                "(gen_random_uuid(), :v, :p, 'Saga', '#1', :s)"
            ),
            {"v": volume, "p": position, "s": source},
        )


@pytest.mark.asyncio
async def test_0027_widens_the_source_check_and_the_cycle_maps_metron_to_parsed(
    clean_database,
):
    assert _alembic("upgrade", "0026").returncode == 0
    async with clean_database.begin() as connection:
        await _seed_collects_at_0026(connection, ("typed", "photo"))
    # Before 0027 'metron' is refused.
    with pytest.raises(IntegrityError):
        async with clean_database.begin() as connection:
            await _seed_collects_at_0026(connection, ("metron",))
    assert _alembic("upgrade", "0027").returncode == 0
    async with clean_database.begin() as connection:
        volume = await connection.scalar(text("SELECT id FROM comic_volumes"))
        await connection.execute(
            text(
                "INSERT INTO comic_volume_collects (id, volume_id, position, "
                "series_name, issue_text, source) VALUES "
                "(gen_random_uuid(), :v, 9, 'Saga', '#1-6', 'metron')"
            ),
            {"v": volume},
        )
    with pytest.raises(IntegrityError):
        async with clean_database.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO comic_volume_collects (id, volume_id, position, "
                    "series_name, issue_text, source) VALUES "
                    "(gen_random_uuid(), :v, 10, 'Saga', '#1', 'other')"
                ),
                {"v": volume},
            )
    result = _alembic("downgrade", "0026")
    assert result.returncode == 0, result.stderr
    async with clean_database.connect() as connection:
        rows = (
            await connection.execute(
                text(
                    "SELECT position, source FROM comic_volume_collects "
                    "ORDER BY position"
                )
            )
        ).all()
    # No row is lost; the metron one became parsed.
    assert [tuple(r) for r in rows] == [(0, "typed"), (1, "photo"), (9, "parsed")]
    assert _alembic("upgrade", "head").returncode == 0
    async with clean_database.connect() as connection:
        diff = await connection.run_sync(_diff_against_models)
    assert diff == []
