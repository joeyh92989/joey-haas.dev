"""Alembic environment.

Migrations connect through DATABASE_URL_DIRECT, never the pooled URL. Neon's
pooler runs PgBouncer in transaction mode, which does not support the SET
statements Alembic relies on; migrations run through it fail in ways that read
as unrelated bugs.
"""

import asyncio
import contextlib
import os
import sys
import time
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from db import connect_args_for, normalize_async_url
from migration_lock import MIGRATION_LOCK_KEY
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


# Commands that write the schema or the version table. Read-only ones (current,
# history, heads) must not queue behind a running upgrade.
_WRITING_COMMANDS = {"upgrade", "downgrade", "stamp"}


def _command_writes() -> bool:
    """Whether this alembic run changes the database.

    Unknown (alembic driven from code, no command line) counts as writing.
    """
    command = getattr(alembic_config.cmd_opts, "cmd", None)
    if not command:
        return True
    return command[0].__name__ in _WRITING_COMMANDS


async def _acquire_migration_lock(connection) -> None:
    """Wait for the migration lock, giving up after a deadline.

    A try-lock loop, not a blocking pg_advisory_lock: if a run died without its
    connection closing, the server keeps its session (and so the lock) until
    keepalive notices, and a blocking wait would hold a deploy until the CI job
    limit. The deadline turns that into an error naming the cause.
    """
    timeout = float(os.environ.get("MIGRATION_LOCK_TIMEOUT_SECONDS", "600"))
    deadline = time.monotonic() + timeout
    announced = False
    while True:
        got = await connection.scalar(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": MIGRATION_LOCK_KEY}
        )
        if got:
            return
        if not announced:
            print("Waiting for another migration run to finish...", file=sys.stderr)
            announced = True
        if time.monotonic() >= deadline:
            raise RuntimeError(
                f"Another migration run held the migration lock for {timeout:g}s. "
                "Wait for it to finish; if none is running, a dead session is "
                "holding it (select * from pg_locks where locktype = 'advisory')."
            )
        await asyncio.sleep(1)


async def run_migrations_online() -> None:
    """Connect with the direct URL and run migrations, one run at a time."""
    url = _database_url()
    engine = create_async_engine(url, connect_args=connect_args_for(url), future=True)
    try:
        if not _command_writes():
            async with engine.connect() as connection:
                await connection.run_sync(_run)
            return
        # A session-level lock on its own autocommit connection: not part of
        # the migration's transaction (which Alembic opens and commits itself),
        # not left idle in a transaction for the whole run, and released by the
        # server if the process dies.
        lock_engine = engine.execution_options(isolation_level="AUTOCOMMIT")
        async with lock_engine.connect() as lock_connection:
            await _acquire_migration_lock(lock_connection)
            try:
                async with engine.connect() as connection:
                    await connection.run_sync(_run)
            finally:
                # The session ending releases the lock anyway; a failed unlock
                # must not replace the migration's own error.
                with contextlib.suppress(Exception):
                    await lock_connection.execute(
                        text("SELECT pg_advisory_unlock(:key)"),
                        {"key": MIGRATION_LOCK_KEY},
                    )
    finally:
        await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
