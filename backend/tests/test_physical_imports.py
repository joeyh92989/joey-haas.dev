"""The physical catalogue's parsers load without FastAPI or SQLAlchemy.

Each module is imported in a fresh interpreter, because this suite's own
process has both loaded long before any test runs. New modules are covered
as they appear; only the database layer is exempt.
"""

import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
PACKAGE = BACKEND / "physical_sources"
# The database layer, and the N64 ingest, which drives the IGDB adapter.
IMPURE = {"catalogue", "resolve", "sync", "platform_policy"}
FORBIDDEN = ("fastapi", "sqlalchemy", "models", "db")

PURE_MODULES = sorted(
    path.stem
    for path in PACKAGE.glob("*.py")
    if path.stem != "__init__" and path.stem not in IMPURE
) + ["matching"]


def test_the_base_modules_exist():
    assert {"base", "limits"} <= set(PURE_MODULES)


@pytest.mark.parametrize("module", PURE_MODULES)
def test_module_imports_nothing_from_the_web_or_database_layers(module):
    name = module if module == "matching" else f"physical_sources.{module}"
    check = (
        f"import sys, {name}; "
        f"loaded = [m for m in {FORBIDDEN!r} "
        "if m in sys.modules or any(k.startswith(m + '.') for k in sys.modules)]; "
        "print(','.join(loaded))"
    )
    result = subprocess.run(
        [sys.executable, "-c", check],
        cwd=BACKEND,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "", f"{name} loads {result.stdout.strip()}"
