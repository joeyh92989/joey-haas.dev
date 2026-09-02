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
    """
    env = {**os.environ, "DATABASE_URL_DIRECT": TEST_DATABASE_URL}
    return subprocess.run(
        [str(BACKEND / ".venv" / "bin" / "alembic"), *args],
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
