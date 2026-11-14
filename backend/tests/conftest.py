"""Test fixtures backed by a real Postgres.

SQLite would be faster and would not exercise enums, timestamptz, or the CHECK
constraint the way Postgres does. A suite that passes against a different
database than production is the kind of check this project has learned to
distrust.

Point TEST_DATABASE_URL at any Postgres 18; the default matches both the CI
service container and a local Homebrew install (see README -> Database), except
that a local run gets a database per checkout so worktrees can run pytest at
the same time (testdb.py). When no database is reachable these tests skip, so a
machine without one can still run the rest of the suite -- but in CI they must
never skip: an unreachable database is a hard error there, or "green" would
come to mean "did not run".
"""

import os

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from testdb import ensure_database, test_database_url

from db import connect_args_for, normalize_async_url
from models import Base

# A local run gets its own database per checkout (testdb.py), so worktrees can
# run pytest at the same time; CI and an explicit TEST_DATABASE_URL are as-is.
TEST_DATABASE_URL = test_database_url()

RUNNING_IN_CI = os.environ.get("CI", "").lower() in {"1", "true"}


@pytest.fixture(scope="session", autouse=True)
def _test_database_exists():
    """Create this checkout's test database on first use."""
    ensure_database(TEST_DATABASE_URL)


def _make_engine():
    url = normalize_async_url(TEST_DATABASE_URL)
    return create_async_engine(url, connect_args=connect_args_for(url), future=True)


# Whether Base.metadata is in place in the test database. Building the schema
# is the slow part of a test (0.3-0.6 s of a few milliseconds' work, times
# three thousand tests), so it is built once and each later test starts by
# emptying the tables instead. Every test still begins on the same empty
# schema. A test that replaces the schema (test_migrations) calls
# mark_schema_dirty() so the next test rebuilds it.
_schema_ready = False


def mark_schema_dirty() -> None:
    """Make the next engine fixture rebuild the schema from the models."""
    global _schema_ready
    _schema_ready = False


def _truncate_statement(connection) -> str:
    format_table = connection.dialect.identifier_preparer.format_table
    tables = ", ".join(format_table(table) for table in Base.metadata.sorted_tables)
    return f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"


def _is_missing_table(error: DBAPIError) -> bool:
    """Whether Postgres said a table does not exist (SQLSTATE 42P01)."""
    original = getattr(error, "orig", None)
    cause = getattr(original, "__cause__", None)
    sqlstate = getattr(original, "sqlstate", None) or getattr(cause, "sqlstate", None)
    return sqlstate == "42P01" or "does not exist" in str(error)


async def _prepare_schema(engine) -> None:
    """Leave the test database with the models' tables, all of them empty."""
    global _schema_ready
    if _schema_ready:
        try:
            async with engine.begin() as connection:
                await connection.execute(text(_truncate_statement(connection)))
            return
        except DBAPIError as error:
            # A table went missing under us: rebuild rather than fail a test
            # for the suite's own bookkeeping. Anything else (a deadlock from a
            # second run on this database, a dropped connection) is the real
            # problem and must not be papered over by a rebuild.
            if not _is_missing_table(error):
                raise
            _schema_ready = False
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    _schema_ready = True


@pytest_asyncio.fixture
async def engine():
    engine = _make_engine()
    try:
        await _prepare_schema(engine)
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


@pytest_asyncio.fixture
async def sessionmaker_for_test(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture(autouse=True)
def _forget_exhausted_models():
    """llm keeps exhausted models in process; no test may see another's."""
    import llm

    llm.reset_exhaustion()
    yield
    llm.reset_exhaustion()
