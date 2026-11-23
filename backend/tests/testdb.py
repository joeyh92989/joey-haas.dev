"""Which Postgres database the backend tests use, and making sure it exists.

Every test run drops and recreates the schema in its database. With one shared
database, two worktrees (or a review agent) running pytest at once failed each
other with "relation items does not exist" and deadlocks, so a local run now
gets a database named after the checkout it runs from. CI and an explicit
TEST_DATABASE_URL are untouched: CI's runner is already isolated, and an
explicit URL is a decision someone made.

Under pytest-xdist (PYTEST_XDIST_WORKER set, e.g. `gw0`) every worker gets its
own database, the URL's database name plus `_<worker>`, because each run drops
and rebuilds a schema and two workers on one database fail each other. That
holds for the derived, CI and explicit URLs alike, and the worker database is
created in every case. Without xdist nothing changes.

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


def worker_id(environ: dict[str, str]) -> str:
    """The pytest-xdist worker this process is (`gw0`...), or "" when serial."""
    return re.sub(r"[^a-z0-9]+", "_", environ.get("PYTEST_XDIST_WORKER", "").lower())


def worker_database_name(name: str, worker: str) -> str:
    """`name` plus `_<worker>`, kept within Postgres' 63-byte identifier limit.

    When the suffix does not fit, the name is cut and a hash of the whole name
    is put back in front of the suffix, so two long names that share a prefix
    still get different worker databases.
    """
    suffix = f"_{worker}"
    if len(name) + len(suffix) <= 63:
        return name + suffix
    digest = hashlib.sha256(name.encode()).hexdigest()[:_HASH_LENGTH]
    keep = 63 - len(suffix) - _HASH_LENGTH - 1
    return f"{name[:keep]}_{digest}{suffix}"


def _for_worker(url: str, environ: dict[str, str]) -> str:
    worker = worker_id(environ)
    if not worker:
        return url
    parts = urlsplit(url)
    name = worker_database_name(parts.path.lstrip("/"), worker)
    return urlunsplit(parts._replace(path="/" + name))


def resolve_url(environ: dict[str, str], checkout: Path) -> str:
    """The test database URL for this run.

    An explicit TEST_DATABASE_URL wins. CI keeps the service container's
    default database. Anything else is a local run and gets a per-checkout
    database on the same server. An xdist worker gets its own copy of
    whichever of those it is (see the module docstring).
    """
    explicit = environ.get("TEST_DATABASE_URL", "").strip()
    if explicit:
        return _for_worker(explicit, environ)
    if environ.get("CI", "").lower() in {"1", "true"}:
        return _for_worker(BASE_URL, environ)
    parts = urlsplit(BASE_URL)
    url = urlunsplit(parts._replace(path="/" + database_name_for(checkout)))
    return _for_worker(url, environ)


def test_database_url() -> str:
    """The URL for the checkout this file lives in (backend/tests/ -> repo)."""
    return resolve_url(dict(os.environ), Path(__file__).resolve().parents[2])


def is_derived(environ: dict[str, str]) -> bool:
    """Whether the URL is the per-checkout one this module made up.

    Only a derived database, or an xdist worker's, is ever created here: an
    explicit URL is used as given, and CI's service container already has its
    database.
    """
    explicit = environ.get("TEST_DATABASE_URL", "").strip()
    in_ci = environ.get("CI", "").lower() in {"1", "true"}
    return not explicit and not in_ci


def should_create(environ: dict[str, str]) -> bool:
    """Whether this run may create its database: derived, or a worker's own."""
    return is_derived(environ) or bool(worker_id(environ))


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
    """Create the test database if the server is up and it is missing.

    That is the per-checkout database locally and an xdist worker's database
    anywhere (the worker database is new, whoever made the parent one).

    A server that cannot be reached is left to the engine fixture, which skips
    locally and fails in CI with a message people already know. Any other
    failure (no CREATEDB privilege, wrong password) is warned about here,
    because the error the tests would give later does not mention creation.
    """
    if not should_create(dict(os.environ)):
        return
    try:
        asyncio.run(_create_if_missing(url))
    except (OSError, TimeoutError):
        return
    except Exception as error:  # noqa: BLE001
        warnings.warn(
            f"could not create the test database {url!r}: {error!r}", stacklevel=2
        )
