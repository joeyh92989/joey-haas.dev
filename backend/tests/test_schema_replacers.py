"""Only the known test files may replace the schema.

conftest builds the schema once and truncates between tests, so a test that
drops or migrates it without calling `mark_schema_dirty()` would leave the next
test on the wrong shape, failing somewhere unrelated. A convention in the
README is easy to forget; this makes the list of such files explicit, so a new
one has to be added here, where the rule is written down.
"""

import re
from pathlib import Path

TESTS = Path(__file__).resolve().parent

# conftest builds it; test_migrations replaces it and marks it dirty.
ALLOWED = {"conftest.py", "test_migrations.py", "test_schema_replacers.py"}

# Code that changes the schema: SQLAlchemy's drop_all, DROP statements, and
# running Alembic (the `_alembic(` helper or a `python -m alembic` subprocess).
# A mere mention of "alembic upgrade head" in a message is not one.
REPLACERS = re.compile(
    r"drop_all|DROP SCHEMA|DROP TABLE|DROP TYPE|_alembic\(|\"-m\", \"alembic\"",
    re.IGNORECASE,
)


def test_only_known_files_replace_the_schema():
    offenders = sorted(
        path.name
        for path in TESTS.glob("*.py")
        if path.name not in ALLOWED and REPLACERS.search(path.read_text())
    )
    assert not offenders, (
        f"{offenders} replace the test schema: call conftest.mark_schema_dirty() "
        "after them and add the file to ALLOWED in test_schema_replacers.py"
    )
