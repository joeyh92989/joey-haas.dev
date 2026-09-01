"""Database engine and session management."""

from __future__ import annotations

from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

ASYNC_SCHEME = "postgresql+asyncpg"

# libpq query parameters that asyncpg's connect() does not accept. Neon hands
# out URLs carrying sslmode and channel_binding; passed through unmodified they
# raise TypeError deep inside the driver, a long way from the cause.
LIBPQ_ONLY_PARAMS = frozenset(
    {"sslmode", "channel_binding", "options", "target_session_attrs"}
)

# Neon requires TLS. asyncpg spells that `ssl`, not `sslmode`.
CONNECT_ARGS = {"ssl": "require"}


def normalize_async_url(url: str) -> str:
    """Rewrites a libpq-style Postgres URL into one asyncpg accepts.

    Neon's console gives out `postgresql://...?sslmode=require&channel_binding=require`.
    Two things are wrong with that for our purposes: the bare `postgresql`
    scheme selects a synchronous driver, which create_async_engine refuses, and
    the query parameters are libpq's rather than asyncpg's.

    Normalizing here rather than asking a human to hand-edit the URL means
    pasting the string straight from the Neon console is always correct.
    """
    parts = urlsplit(url)
    kept = [(k, v) for k, v in parse_qsl(parts.query) if k not in LIBPQ_ONLY_PARAMS]
    return urlunsplit(
        (ASYNC_SCHEME, parts.netloc, parts.path, urlencode(kept), parts.fragment)
    )


def create_engine_and_sessionmaker(
    url: str,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Builds an async engine and session factory for `url`.

    Prepared statements are deliberately left enabled. The well-known
    DuplicatePreparedStatementError with asyncpg behind PgBouncer does not apply
    to Neon, which configures max_prepared_statements=1000, and disabling the
    statement cache measurably degrades performance.

    pool_pre_ping is on because Neon's compute scales to zero after five minutes
    idle; without it the first request after a sleep fails on a connection the
    pool still believes is alive.
    """
    engine = create_async_engine(
        normalize_async_url(url),
        pool_pre_ping=True,
        connect_args=CONNECT_ARGS,
        future=True,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    return engine, factory


async def session_dependency(
    factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    """Yields a session, rolling back if the caller raises."""
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
