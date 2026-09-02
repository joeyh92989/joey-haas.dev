import pytest

from schema_check import SchemaMismatchError, code_head_revision, compare_revisions


def test_matching_revisions_pass():
    compare_revisions(database_revision="0001", code_head="0001")


def test_mismatch_raises_naming_both_revisions():
    with pytest.raises(SchemaMismatchError) as excinfo:
        compare_revisions(database_revision="0001", code_head="0002")
    message = str(excinfo.value)
    assert "0001" in message
    assert "0002" in message
    assert "alembic upgrade head" in message


def test_empty_database_raises():
    # A database with no alembic_version table at all: the likeliest real case,
    # when someone deploys before running the first migration.
    with pytest.raises(SchemaMismatchError) as excinfo:
        compare_revisions(database_revision=None, code_head="0001")
    assert "no migrations" in str(excinfo.value).lower()


def test_code_head_is_read_from_the_migrations_directory():
    # Reads the real migrations/versions tree rather than a fixture, so a
    # migration added without a matching head would surface here.
    assert code_head_revision() == "0002"
