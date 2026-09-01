import pytest
from conftest import TEST_DATABASE_URL
from sqlalchemy.ext.asyncio import create_async_engine

from db import connect_args_for, engine_lifespan, normalize_async_url


def test_scheme_is_rewritten_for_asyncpg():
    # A bare postgresql:// scheme selects a synchronous driver, which
    # create_async_engine refuses outright.
    url = normalize_async_url("postgresql://u:p@host.neon.tech/neondb")
    assert url.startswith("postgresql+asyncpg://")


def test_libpq_only_parameters_are_stripped():
    # asyncpg's connect() has no sslmode or channel_binding keyword; leaving
    # them raises TypeError deep inside the driver.
    url = normalize_async_url(
        "postgresql://u:p@host.neon.tech/neondb?sslmode=require&channel_binding=require"
    )
    assert "sslmode" not in url
    assert "channel_binding" not in url


def test_host_credentials_and_database_survive():
    url = normalize_async_url(
        "postgresql://u:p@ep-x-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require"
    )
    assert "u:p@ep-x-pooler.us-west-2.aws.neon.tech" in url
    assert url.endswith("/neondb")


def test_unrecognised_parameters_are_preserved():
    # Only libpq-specific keys are dropped; anything asyncpg might understand
    # is left alone rather than silently discarded.
    url = normalize_async_url(
        "postgresql://u:p@host/db?sslmode=require&application_name=tracker"
    )
    assert "application_name=tracker" in url


def test_already_normalized_url_is_unchanged():
    url = "postgresql+asyncpg://u:p@host/db"
    assert normalize_async_url(url) == url


def test_local_urls_get_no_tls_settings():
    # The CI service container has no TLS configured and refuses a connection
    # that demands it.
    assert connect_args_for("postgresql+asyncpg://u:p@localhost:5432/postgres") == {}
    assert connect_args_for("postgresql+asyncpg://u:p@127.0.0.1:5432/postgres") == {}


def test_hosted_urls_require_tls():
    args = connect_args_for("postgresql+asyncpg://u:p@ep-x.neon.tech/neondb")
    assert args == {"ssl": "require"}


@pytest.mark.asyncio
async def test_engine_lifespan_disposes_the_engine():
    # dispose() replaces the pool object outright, so comparing identity proves
    # the engine was actually torn down rather than merely left alone.
    url = normalize_async_url(TEST_DATABASE_URL)
    engine = create_async_engine(url, connect_args=connect_args_for(url))
    before = engine.pool
    async with engine_lifespan(engine)(None):
        assert engine.pool is before
    assert engine.pool is not before
