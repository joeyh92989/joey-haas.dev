"""Records live ComicVine /issues responses as test fixtures for the pull list.

Run once, from backend/ in any checkout or worktree, by the owner:

    ./.venv/bin/python scripts/record_comicvine_fixtures.py

It finds two well-known series by searching ComicVine -- one ongoing (Saga)
and one ended (Y: The Last Man) -- and records each one's latest issues with
the exact call the adapter makes. The key is COMICVINE_API_KEY from the main
checkout's backend/.env (worktrees have none), read here and never printed;
only response bodies are written.

Why this exists: ComicVine's documentation lists `volume` among the /issues
fields but does not clearly mark it filterable. The pull list depends on
`filter=volume:{id}` narrowing the answer to one series, so this checks that
against the live API before any parser is written, and says so in its
printout.
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

from migrate_neon import main_checkout_env, read_variable  # noqa: E402

from sources.comicvine import (  # noqa: E402
    ISSUE_FETCH_LIMIT,
    ISSUE_FIELD_LIST,
    ComicVineSource,
)

FIXTURES = BACKEND / "tests" / "fixtures"
VARIABLE = "COMICVINE_API_KEY"

# (fixture name, title, publisher, start year): matched exactly in the search
# results, so a different series of the same name is never recorded.
SERIES = (
    ("comicvine_issues_ongoing.json", "Saga", "Image", "2012"),
    ("comicvine_issues_ended.json", "Y: The Last Man", "DC Comics", "2002"),
)
SEARCH_FIELDS = "id,name,start_year,publisher,count_of_issues"


def pick_volume(results: list[dict], title: str, publisher: str, year: str):
    """The search row for exactly this series, or None."""
    for row in results:
        name = (row.get("publisher") or {}).get("name") or ""
        if (
            row.get("name") == title
            and str(row.get("start_year")) == year
            and name.startswith(publisher)
        ):
            return row
    return None


def filter_held(payload: dict, volume_id: int) -> bool:
    """True when every issue returned belongs to the requested volume."""
    rows = payload.get("results") or []
    return bool(rows) and all(
        (row.get("volume") or {}).get("id") == volume_id for row in rows
    )


def issues_params(volume_id: int) -> dict:
    """The adapter's call, held here so the recorder records exactly it."""
    return {
        "filter": f"volume:{volume_id}",
        "sort": "store_date:desc",
        "limit": ISSUE_FETCH_LIMIT,
        "field_list": ISSUE_FIELD_LIST,
    }


def _redact(text: str, key: str) -> str:
    return text.replace(key, "***")


async def record(source: ComicVineSource, today: date) -> int:
    failures = 0
    for fixture, title, publisher, year in SERIES:
        search = await source._get(
            "/search/",
            {"query": title, "resources": "volume", "field_list": SEARCH_FIELDS},
        )
        volume = pick_volume(search.get("results") or [], title, publisher, year)
        if volume is None:
            print(f"{title!r}: no {publisher} {year} volume in the search; skipped")
            failures += 1
            continue
        payload = await source._get("/issues/", issues_params(volume["id"]))
        held = filter_held(payload, volume["id"])
        rows = payload.get("results") or []
        after = today.isoformat()
        future = sum(1 for row in rows if (row.get("store_date") or "") > after)
        body = {"recorded_on": today.isoformat(), "volume": volume, "issues": payload}
        path = FIXTURES / fixture
        path.write_text(json.dumps(body, indent=2, sort_keys=True) + "\n")
        print(
            f"{title!r} (volume {volume['id']}, "
            f"{volume.get('count_of_issues')} issues): "
            f"{len(rows)} rows, {future} dated after today, "
            f"volume filter {'HELD' if held else 'NOT HELD'}"
        )
        print(f"wrote {path.relative_to(BACKEND)}")
        if not held:
            failures += 1
    return failures


def main() -> int:
    env_file = main_checkout_env()
    key = read_variable(env_file.read_text(), VARIABLE) if env_file.exists() else None
    if not key:
        print(f"{VARIABLE} is not set in {env_file}", file=sys.stderr)
        return 1
    # The adapter reads only the key from its config.
    source = ComicVineSource(SimpleNamespace(comicvine_api_key=key))
    try:
        failures = asyncio.run(record(source, date.today()))
    except Exception as error:  # noqa: BLE001 -- reported, redacted, not raised
        print(f"FAILED: {_redact(f'{type(error).__name__}: {error}', key)}")
        return 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
