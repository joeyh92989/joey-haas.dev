"""The test database is chosen per checkout locally, and left alone elsewhere."""

from pathlib import Path

from testdb import BASE_URL, database_name_for, resolve_url

WORKTREE = Path("/x/joey-haas.dev-worktrees/feat-ephemeral-ci-migrations")


def test_two_worktrees_get_different_databases():
    other = Path("/x/joey-haas.dev-worktrees/chore-test-flakes")
    assert database_name_for(WORKTREE) != database_name_for(other)


def test_name_is_a_safe_identifier_under_the_length_limit():
    name = database_name_for(Path("/x/" + "Weird Name!.v2/" * 1 + "A" * 200))
    assert name.replace("_", "").isalnum()
    assert name == name.lower()
    assert len(name) <= 63


def test_local_run_uses_the_checkout_database():
    url = resolve_url({}, WORKTREE)
    assert url.endswith("/joeyhaas_test_feat_ephemeral_ci_migrations")
    assert url.startswith("postgresql://postgres:postgres@localhost:5432/")


def test_explicit_url_wins_over_everything():
    env = {"TEST_DATABASE_URL": "postgresql://u:p@h:1/mine", "CI": "true"}
    assert resolve_url(env, WORKTREE) == "postgresql://u:p@h:1/mine"


def test_ci_keeps_the_service_container_database():
    assert resolve_url({"CI": "true"}, WORKTREE) == BASE_URL
    assert resolve_url({"CI": "1"}, WORKTREE) == BASE_URL
