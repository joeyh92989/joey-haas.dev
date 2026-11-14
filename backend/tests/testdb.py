"""Which Postgres database the backend tests use, and making sure it exists.

Every test run drops and recreates the schema in its database. With one shared
database, two worktrees (or a review agent) running pytest at once failed each
other with "relation items does not exist" and deadlocks, so a local run now
gets a database named after the checkout it runs from. CI and an explicit
TEST_DATABASE_URL are untouched: CI's runner is already isolated, and an
explicit URL is a decision someone made.

Not a test module (no `test_` prefix), so pytest does not collect it.
"""

import asyncio
import os
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

BASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres"

# Postgres truncates identifiers at 63 bytes; leave room for the prefix.
_PREFIX = "joeyhaas_test_"
_MAX_SLUG = 63 - len(_PREFIX)


def database_name_for(checkout: Path) -> str:
    """A database name for one checkout, from its folder name.

    Worktree folders are unique per branch (`<repo>-worktrees/<branch>`), so
    the folder name is a stable, readable key.
    """
    slug = re.sub(r"[^a-z0-9]+", "_", checkout.name.lower()).strip("_") or "checkout"
    return f"{_PREFIX}{slug[:_MAX_SLUG]}"


def resolve_url(environ: dict[str, str], checkout: Path) -> str:
    """The test database URL for this run.

    An explicit TEST_DATABASE_URL wins. CI keeps the service container's
    default database. Anything else is a local run and gets a per-checkout
    database on the same server.
    """
    explicit = environ.get("TEST_DATABASE_URL", "").strip()
    if explicit:
        return explicit
    if environ.get("CI", "").lower() in {"1", "true"}:
        return BASE_URL
    parts = urlsplit(BASE_URL)
    return urlunsplit(parts._replace(path="/" + database_name_for(checkout)))


def test_database_url() -> str:
    """The URL for the checkout this file lives in (backend/tests/ -> repo)."""
    return resolve_url(dict(os.environ), Path(__file__).resolve().parents[2])


async def _create_if_missing(url: str) -> None:
    import asyncpg

    parts = urlsplit(url)
    name = parts.path.lstrip("/")
    # The name is built from [a-z0-9_] by database_name_for, but an explicit URL
    # is not: only ever create a database whose name is that safe.
    if not re.fullmatch(r"[a-z0-9_]+", name):
        return
    maintenance = urlunsplit(parts._replace(path="/postgres"))
    connection = await asyncpg.connect(maintenance)
    try:
        exists = await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", name
        )
        if not exists:
            try:
                await connection.execute(f'CREATE DATABASE "{name}"')
            except asyncpg.DuplicateDatabaseError:
                pass  # created by a run that started a moment earlier
    finally:
        await connection.close()


def ensure_database(url: str) -> None:
    """Create the test database if the server is reachable and it is missing.

    An unreachable server is not an error here: the engine fixture reports it
    (a skip locally, a hard error in CI) with the message people already know.
    """
    try:
        asyncio.run(_create_if_missing(url))
    except Exception:  # noqa: BLE001 - reported later by the engine fixture
        return
