"""Records the live TMDB detail response for Dune as a test fixture.

Run from backend/ in any checkout or worktree:

    ./.venv/bin/python scripts/record_tmdb_fixtures.py

It makes the adapter's own detail call (`/movie/438631` with
`DETAIL_PARAMS`, so credits and keywords) and writes the body to
tests/fixtures/tmdb_movie.json. The token is TMDB_API_TOKEN from the main
checkout's backend/.env (worktrees have none), read here and never printed;
only the response body is written.

Re-record when DETAIL_PARAMS in sources/tmdb.py changes; never edit the
fixture by hand.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

from migrate_neon import main_checkout_env, read_variable  # noqa: E402

from sources.tmdb import DETAIL_PARAMS, TmdbSource  # noqa: E402

FIXTURE = BACKEND / "tests" / "fixtures" / "tmdb_movie.json"
VARIABLE = "TMDB_API_TOKEN"
# Dune (2021): the film the existing search and detail tests are written on.
MOVIE_ID = 438631


async def record(source: TmdbSource) -> str:
    payload = await source._get(f"/movie/{MOVIE_ID}", DETAIL_PARAMS)
    FIXTURE.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    keywords = (payload.get("keywords") or {}).get("keywords") or []
    crew = (payload.get("credits") or {}).get("crew") or []
    return (
        f"{payload.get('title')!r}: {len(keywords)} keywords, {len(crew)} crew; "
        f"wrote {FIXTURE.relative_to(BACKEND)}"
    )


def main() -> int:
    env_file = main_checkout_env()
    token = read_variable(env_file.read_text(), VARIABLE) if env_file.exists() else None
    if not token:
        print(f"{VARIABLE} is not set in {env_file}", file=sys.stderr)
        return 1
    source = TmdbSource(SimpleNamespace(tmdb_api_token=token))
    try:
        print(asyncio.run(record(source)))
    except Exception as error:  # noqa: BLE001 -- reported, redacted, not raised
        print(f"FAILED: {f'{type(error).__name__}: {error}'.replace(token, '***')}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
