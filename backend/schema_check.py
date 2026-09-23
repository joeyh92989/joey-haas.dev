"""Refuses to start when the database schema is behind the code.

Migrations are run manually against the direct URL rather than automatically on
deploy: Render's pre-deploy command is a paid feature, and migrating at startup
means a bad migration takes the API down on every boot.

Manual is only safe if forgetting is loud. This turns a forgotten migration into
an immediate, legible startup failure rather than a confusing query error later
-- the same reasoning as config.py refusing to boot without configuration.

A database *ahead* of the code is allowed, with a warning. The deploy order is
migrate, then merge, so for a few minutes the live code is older than the
schema; refusing then would take the API down on its next cold start. That is
safe only because migrations here are additive (see migrations/README.md).
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from alembic.config import Config as AlembicConfig
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.ext.asyncio import create_async_engine

from config import Config
from db import connect_args_for, normalize_async_url

logger = logging.getLogger(__name__)


class SchemaMismatchError(RuntimeError):
    """Raised when the database is not at the revision the code expects."""


def compare_revisions(
    database_revision: str | None, code_head: str | None, known: set[str]
) -> str | None:
    """Checks the database revision against the code's migrations.

    Returns None when the database is at the code's head, and a warning when
    it is at a revision this code has never seen -- a newer migration applied
    ahead of its deploy. Raises when the database is empty or behind: at a
    revision the code knows that is not its head.

    "Unknown" is the only signal of "ahead" available, because older code has
    no record of a newer revision's id.
    """
    if database_revision is None:
        raise SchemaMismatchError(
            "The database has no migrations applied, but this code expects "
            f"revision {code_head}. Run: alembic upgrade head"
        )
    if database_revision == code_head:
        return None
    if database_revision not in known:
        return (
            f"The database is at revision {database_revision}, which this code "
            f"does not know; it expects {code_head}. Assuming a newer additive "
            "migration was applied ahead of its deploy."
        )
    raise SchemaMismatchError(
        f"The database is at revision {database_revision}, but this code "
        f"expects {code_head}. Run: alembic upgrade head"
    )


def _script_directory() -> ScriptDirectory:
    alembic_ini = Path(__file__).parent / "alembic.ini"
    return ScriptDirectory.from_config(AlembicConfig(str(alembic_ini)))


def known_revisions() -> set[str]:
    """Every revision id in migrations/versions."""
    return {script.revision for script in _script_directory().walk_revisions()}


def code_head_revision() -> str | None:
    """The head revision recorded in migrations/versions."""
    return _script_directory().get_current_head()


def _read_revision(connection) -> str | None:
    return MigrationContext.configure(connection).get_current_revision()


async def database_revision(config: Config) -> str | None:
    """The revision the database believes it is at, or None if unmigrated.

    Uses the direct URL and a short-lived engine. Alembic's migration context is
    synchronous, so it runs through run_sync rather than adding a second,
    synchronous driver to the dependency set for one query at startup.
    """
    url = normalize_async_url(config.database_url_direct)
    engine = create_async_engine(url, connect_args=connect_args_for(url), future=True)
    try:
        async with engine.connect() as connection:
            return await connection.run_sync(_read_revision)
    finally:
        await engine.dispose()


def verify_schema_is_current(config: Config) -> None:
    """Raises SchemaMismatchError when the database is empty or behind.

    Logs a warning, and boots, when the database is ahead of the code.

    Called at import time in main.py, before an event loop exists, so driving
    the async lookup with asyncio.run is safe here.
    """
    warning = compare_revisions(
        asyncio.run(database_revision(config)), code_head_revision(), known_revisions()
    )
    if warning:
        logger.warning(warning)
