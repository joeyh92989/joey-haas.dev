"""scripts/migrate_neon.py: reads one variable, offers no downgrade, prints no URL."""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "migrate_neon.py"
spec = importlib.util.spec_from_file_location("migrate_neon", SCRIPT)
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)


def test_reads_only_the_direct_url():
    text = (
        "DATABASE_URL=postgresql://pooled\n"
        "# DATABASE_URL_DIRECT=postgresql://commented\n"
        'DATABASE_URL_DIRECT="postgresql://direct"\n'
    )
    assert script.read_variable(text) == "postgresql://direct"


def test_accepts_export_and_reports_a_missing_or_blank_variable():
    assert script.read_variable("export DATABASE_URL_DIRECT=x") == "x"
    assert script.read_variable("DATABASE_URL=y") is None
    assert script.read_variable("DATABASE_URL_DIRECT=") is None


def test_redact_drops_every_line_with_a_url():
    out = "Running upgrade 0006 -> 0007\npostgresql+asyncpg://u:p@h/db\n0007 (head)"
    assert script.redact(out) == "Running upgrade 0006 -> 0007\n0007 (head)"


def test_offers_no_downgrade():
    flat = [arg for command in script.COMMANDS.values() for arg in command]
    assert "downgrade" not in flat
    assert script.COMMANDS["upgrade"] == ["upgrade", "head"]


def test_refuses_anything_else(capsys):
    assert script.main(["downgrade"]) == 2
    assert script.main([]) == 2
    assert "usage" in capsys.readouterr().err


def test_finds_the_main_checkout_env():
    env = script.main_checkout_env()
    assert env.name == ".env"
    assert env.parent.name == "backend"
    assert (env.parent.parent / ".git").exists()
