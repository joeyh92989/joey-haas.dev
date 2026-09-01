"""Refuses to start when the database schema is behind the code.

Migrations are run manually against the direct URL rather than automatically on
deploy: Render's pre-deploy command is a paid feature, and migrating at startup
means a bad migration takes the API down on every boot.

Manual is only safe if forgetting is loud. This turns a forgotten migration into
an immediate, legible startup failure rather than a confusing query error later
-- the same reasoning as config.py refusing to boot without configuration.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from alembic.config import Config as AlembicConfig
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.ext.asyncio import create_async_engine

from config import Config
from db import CONNECT_ARGS, normalize_async_url


class SchemaMismatchError(RuntimeError):
    """Raised when the database is not at the revision the code expects."""


def compare_revisions(database_revision: str | None, code_head: str | None) -> None:
    """Raises unless the database is at the code's head revision."""
    if database_revision is None:
        raise SchemaMismatchError(
            "The database has no migrations applied, but this code expects "
            f"revision {code_head}. Run: alembic upgrade head"
        )
    if database_revision != code_head:
        raise SchemaMismatchError(
            f"The database is at revision {database_revision}, but this code "
            f"expects {code_head}. Run: alembic upgrade head"
        )


def code_head_revision() -> str | None:
    """The head revision recorded in migrations/versions."""
    alembic_ini = Path(__file__).parent / "alembic.ini"
    script = ScriptDirectory.from_config(AlembicConfig(str(alembic_ini)))
    return script.get_current_head()


def _read_revision(connection) -> str | None:
    return MigrationContext.configure(connection).get_current_revision()


async def database_revision(config: Config) -> str | None:
    """The revision the database believes it is at, or None if unmigrated.

    Uses the direct URL and a short-lived engine. Alembic's migration context is
    synchronous, so it runs through run_sync rather than adding a second,
    synchronous driver to the dependency set for one query at startup.
    """
    engine = create_async_engine(
        normalize_async_url(config.database_url_direct),
        connect_args=CONNECT_ARGS,
        future=True,
    )
    try:
        async with engine.connect() as connection:
            return await connection.run_sync(_read_revision)
    finally:
        await engine.dispose()


def verify_schema_is_current(config: Config) -> None:
    """Raises SchemaMismatchError unless the database is at the code's head.

    Called at import time in main.py, before an event loop exists, so driving
    the async lookup with asyncio.run is safe here.
    """
    compare_revisions(asyncio.run(database_revision(config)), code_head_revision())
