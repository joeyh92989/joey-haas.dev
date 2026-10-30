import pytest
from asyncpg.exceptions import CannotConnectNowError

from schema_check import (
    SchemaMismatchError,
    code_head_revision,
    compare_revisions,
    known_revisions,
)

KNOWN = {"0001", "0002", "0003"}


def test_matching_revisions_pass():
    assert compare_revisions("0003", "0003", KNOWN) is None


def test_a_database_behind_the_code_raises_naming_both_revisions():
    with pytest.raises(SchemaMismatchError) as excinfo:
        compare_revisions("0001", "0003", KNOWN)
    message = str(excinfo.value)
    assert "0001" in message
    assert "0003" in message
    assert "alembic upgrade head" in message


def test_empty_database_raises():
    # A database with no alembic_version table at all: the likeliest real case,
    # when someone deploys before running the first migration.
    with pytest.raises(SchemaMismatchError) as excinfo:
        compare_revisions(None, "0001", KNOWN)
    assert "no migrations" in str(excinfo.value).lower()


def test_a_database_ahead_of_the_code_boots_with_a_warning():
    # A migration applied before its code deploys carries a revision this code
    # has never seen. Migrations are additive, so the older code still works
    # against the newer schema; refusing here would take the live API down on
    # its next cold start.
    warning = compare_revisions("0099", "0003", KNOWN)
    assert warning is not None
    assert "0099" in warning
    assert "0003" in warning
    assert "additive" in warning


def test_every_revision_in_the_directory_is_known():
    known = known_revisions()
    assert code_head_revision() in known
    assert {"0001", "0002", "0003"} <= known


def test_code_head_is_read_from_the_migrations_directory():
    # Reads the real migrations/versions tree rather than a fixture, so a
    # migration added without a matching head would surface here.
    assert code_head_revision() == "0009"


class _FlakyEngine:
    """Fails to connect `failures` times across all engines, then answers."""

    state = {"failures": 0, "connects": 0}

    def connect(self):
        engine = self

        class _Connection:
            async def __aenter__(self):
                engine.state["connects"] += 1
                if engine.state["connects"] <= engine.state["failures"]:
                    # What a waking Neon answers before it accepts queries.
                    raise CannotConnectNowError("the database system is starting up")
                return self

            async def __aexit__(self, *_):
                return False

            async def run_sync(self, _fn):
                return "0006"

        return _Connection()

    async def dispose(self):
        return None


def _flaky(monkeypatch, failures):
    import schema_check

    _FlakyEngine.state = {"failures": failures, "connects": 0}
    monkeypatch.setattr(
        schema_check, "create_async_engine", lambda *_a, **_k: _FlakyEngine()
    )
    monkeypatch.setattr(schema_check, "CONNECT_RETRY_SECONDS", (0, 0))
    return schema_check


@pytest.mark.asyncio
async def test_a_cold_database_is_retried_at_boot(monkeypatch):
    schema_check = _flaky(monkeypatch, failures=2)
    config = type("C", (), {"database_url_direct": "postgresql://u:p@h/db"})()
    assert await schema_check.database_revision(config) == "0006"
    assert _FlakyEngine.state["connects"] == 3


@pytest.mark.asyncio
async def test_a_database_that_never_answers_still_fails_boot(monkeypatch):
    schema_check = _flaky(monkeypatch, failures=5)
    config = type("C", (), {"database_url_direct": "postgresql://u:p@h/db"})()
    with pytest.raises(CannotConnectNowError):
        await schema_check.database_revision(config)
    assert _FlakyEngine.state["connects"] == schema_check.CONNECT_ATTEMPTS
