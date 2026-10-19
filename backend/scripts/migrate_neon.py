"""Runs Alembic against the production database from any checkout.

Worktrees have no backend/.env, and their migrations folder is the one the
branch carries, so this reads DATABASE_URL_DIRECT (only that variable) from
the main checkout's backend/.env and runs this checkout's Alembic with it.
The URL is never printed: any output line holding a URL is dropped.

Only reads and forward migrations are offered. Migrations here are additive
(migrations/README.md), and rolling one back is a deliberate step taken by
hand, not through this script.

    ./.venv/bin/python scripts/migrate_neon.py current
    ./.venv/bin/python scripts/migrate_neon.py history
    ./.venv/bin/python scripts/migrate_neon.py upgrade
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
VARIABLE = "DATABASE_URL_DIRECT"
COMMANDS = {
    "current": ["current"],
    "history": ["history", "--indicate-current"],
    "upgrade": ["upgrade", "head"],
}


def main_checkout_env() -> Path:
    """backend/.env in the main checkout, found through git's common dir, so
    the same file is read from the main checkout and from every worktree."""
    common = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    return Path(common).parent / "backend" / ".env"


def read_variable(text: str, name: str = VARIABLE) -> str | None:
    """The value of one variable in a .env file's text, quotes stripped."""
    for line in text.splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key.removeprefix("export ").strip() == name:
            return value.strip().strip("'\"") or None
    return None


def redact(output: str) -> str:
    """Drops every line that could carry a connection URL."""
    return "\n".join(line for line in output.splitlines() if "://" not in line)


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in COMMANDS:
        print(f"usage: migrate_neon.py {{{'|'.join(COMMANDS)}}}", file=sys.stderr)
        return 2
    env_file = main_checkout_env()
    url = read_variable(env_file.read_text()) if env_file.exists() else None
    if not url:
        print(f"{VARIABLE} is not set in {env_file}", file=sys.stderr)
        return 1
    proc = subprocess.run(
        [str(BACKEND / ".venv" / "bin" / "alembic"), *COMMANDS[argv[0]]],
        cwd=BACKEND,
        env={**os.environ, VARIABLE: url},
        capture_output=True,
        text=True,
    )
    print(redact(proc.stdout + proc.stderr))
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
