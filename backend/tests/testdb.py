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
import hashlib
import os
import re
import warnings
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

BASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres"

# Postgres truncates identifiers at 63 bytes; leave room for the prefix and the
# 8-character path hash that keeps two similar folder names apart.
_PREFIX = "joeyhaas_test_"
_HASH_LENGTH = 8
_MAX_SLUG = 63 - len(_PREFIX) - _HASH_LENGTH - 1


def database_name_for(checkout: Path) -> str:
    """A database name for one checkout: its folder name plus a hash of its path.

    The folder name keeps the database recognisable (`psql -l`); the hash of the
    full path keeps two checkouts whose names slug or truncate to the same text
    (`feat-x` and `feat_x`, two long branch names with one prefix) apart.
    """
    slug = re.sub(r"[^a-z0-9]+", "_", checkout.name.lower()).strip("_") or "checkout"
    digest = hashlib.sha256(str(checkout).encode()).hexdigest()[:_HASH_LENGTH]
    return f"{_PREFIX}{slug[:_MAX_SLUG]}_{digest}"


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


def is_derived(environ: dict[str, str]) -> bool:
    """Whether the URL is the per-checkout one this module made up.

    Only a derived database is ever created here: an explicit URL is used as
    given, and CI's service container already has its database.
    """
    explicit = environ.get("TEST_DATABASE_URL", "").strip()
    in_ci = environ.get("CI", "").lower() in {"1", "true"}
    return not explicit and not in_ci


async def _create_if_missing(url: str) -> None:
    import asyncpg

    parts = urlsplit(url)
    name = parts.path.lstrip("/")
    if not re.fullmatch(r"[a-z0-9_]+", name):
        return
    maintenance = urlunsplit(parts._replace(path="/postgres"))
    connection = await asyncpg.connect(maintenance, timeout=5)
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
    """Create the per-checkout test database if the server is up and it is missing.

    A server that cannot be reached is left to the engine fixture, which skips
    locally and fails in CI with a message people already know. Any other
    failure (no CREATEDB privilege, wrong password) is warned about here,
    because the error the tests would give later does not mention creation.
    """
    if not is_derived(dict(os.environ)):
        return
    try:
        asyncio.run(_create_if_missing(url))
    except (OSError, TimeoutError):
        return
    except Exception as error:  # noqa: BLE001
        warnings.warn(
            f"could not create the test database {url!r}: {error!r}", stacklevel=2
        )
