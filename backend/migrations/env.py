"""Alembic environment.

Migrations connect through DATABASE_URL_DIRECT, never the pooled URL. Neon's
pooler runs PgBouncer in transaction mode, which does not support the SET
statements Alembic relies on; migrations run through it fail in ways that read
as unrelated bugs.
"""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine

from db import CONNECT_ARGS, normalize_async_url
from models import Base

load_dotenv()

alembic_config = context.config

if alembic_config.config_file_name is not None:
    fileConfig(alembic_config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    """The direct URL, read straight from the environment.

    Deliberately not via config.load_config(): that validates all seven required
    variables, and a migration has no business demanding OAuth secrets it never
    touches.
    """
    url = os.environ.get("DATABASE_URL_DIRECT", "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL_DIRECT is not set. Migrations use Neon's direct "
            "hostname, not the pooled one."
        )
    return normalize_async_url(url)


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _run(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Connect with the direct URL and run migrations."""
    engine = create_async_engine(
        _database_url(), connect_args=CONNECT_ARGS, future=True
    )
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
