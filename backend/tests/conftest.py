"""Test fixtures backed by a real Postgres.

SQLite would be faster and would not exercise enums, timestamptz, or the CHECK
constraint the way Postgres does. A suite that passes against a different
database than production is the kind of check this project has learned to
distrust.

Point TEST_DATABASE_URL at any Postgres 18; the default matches both the CI
service container and a local Homebrew install (see README -> Database). When no
database is reachable these tests skip, so a machine without one can still run
the rest of the suite -- but in CI they must never skip: an unreachable database
is a hard error there, or "green" would come to mean "did not run".
"""

import os

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db import connect_args_for, normalize_async_url
from models import Base

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/postgres",
)

RUNNING_IN_CI = os.environ.get("CI", "").lower() in {"1", "true"}


def _make_engine():
    url = normalize_async_url(TEST_DATABASE_URL)
    return create_async_engine(url, connect_args=connect_args_for(url), future=True)


@pytest_asyncio.fixture
async def engine():
    engine = _make_engine()
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.run_sync(Base.metadata.create_all)
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
