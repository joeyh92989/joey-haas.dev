"""Exports the collection as an anonymised fixture for the picker's tests.

The recommendation engine's regression tests (AC 5, AC 6 of the
recommendation engine spec) run on the real collection's shape: which tags
the games carry, how they were rated and finished, how much they were
played. The repo is public, so nothing that names a game or dates the
owner's life goes in:

- titles, ids, covers, notes, platforms and the public flag are dropped;
- each item is keyed `game-001`, `comic-001`, ... in uuid order, which says
  nothing about the item;
- every date becomes a whole number of days before the export day;
- `similar_games` keeps only links to other exported items, by key;
- tags from fixed vocabularies (IGDB genres, themes, game modes and
  perspectives, TMDB genres) and free-text tags FACET_MAP maps (robots,
  noir, time travel) are kept as the sources wrote them, since they are
  what the engine reads;
- every other free-text tag (keywords, characters, concepts, teams,
  locations) is replaced by a keyed hash, "tag-3fa2c91b0d", under a key
  drawn at random for each export and never stored. Franchise and character
  names live there ("mario", "pikachu"), and a plain hash of one could be
  looked up from a word list. Within one export the same tag gets the same
  pseudonym, so two items sharing it still share a facet and the engine
  scores the export exactly as it scores the strings. Ignored tags
  (storefront noise) are dropped, since facets ignore them anyway.

Curation needs the readable strings, so `--coverage` prints the unmapped
tags of the live rows to the terminal and writes nothing.

Reads DATABASE_URL_DIRECT from the main checkout's backend/.env (worktrees
have none), the way migrate_neon.py does, and never prints it.

    ./.venv/bin/python scripts/export_picker_fixture.py --dry-run
    ./.venv/bin/python scripts/export_picker_fixture.py
    ./.venv/bin/python scripts/export_picker_fixture.py --coverage 3
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import hmac
import importlib.util
import json
import secrets
import sys
from datetime import UTC, date, datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

OUTPUT = BACKEND / "tests" / "fixtures" / "picker_collection.json"
FORMAT_VERSION = 1

# Snapshot keys holding tag lists, as each source writes them.
TAG_KEYS = (
    "genres",
    "themes",
    "keywords",
    "game_modes",
    "player_perspectives",
    "characters",
    "concepts",
    "teams",
    "locations",
)


# Free-text tag keys: anything a source can write there, names included.
# The rest of TAG_KEYS are fixed vocabularies and are kept as written.
FREE_TEXT_KEYS = frozenset({"keywords", "characters", "concepts", "teams", "locations"})
PSEUDONYM_PREFIX = "tag-"


def pseudonymise(key: bytes | None, source: str | None, kind: str, value: str):
    """The tag as the fixture carries it, or None to leave it out.

    `key` None keeps every tag readable (the coverage report, never the
    file). Otherwise a fixed-vocabulary or mapped tag stays as written, an
    ignored one is dropped, and any other free-text tag becomes its keyed
    hash.
    """
    from facets import FACET_MAP, is_ignored

    if key is None or kind not in FREE_TEXT_KEYS:
        return value
    if is_ignored(value):
        return None
    if (source or "", kind, value) in FACET_MAP:
        return value
    digest = hmac.new(key, f"{source}\x1f{kind}\x1f{value}".encode(), hashlib.sha256)
    return PSEUDONYM_PREFIX + digest.hexdigest()[:10]


def _tags(snapshot: dict, source: str | None, key: bytes | None) -> dict:
    tags = {}
    for kind in TAG_KEYS:
        values = []
        for value in _strings(snapshot.get(kind)):
            kept = pseudonymise(key, source, kind, value)
            if kept is not None and kept not in values:
                values.append(kept)
        if values:
            tags[kind] = values
    return tags


def _days_before(day: date | None, today: date) -> int | None:
    return None if day is None else (today - day).days


def _strings(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(entry) for entry in value if isinstance(entry, str | int) and entry]


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _without_nulls(entry: dict) -> dict:
    return {key: value for key, value in entry.items() if value is not None}


def anonymise(
    rows: list[dict],
    runs: dict[str, list[dict]],
    today: date,
    key: bytes | None = b"",
) -> dict:
    """The fixture body for plain rows; pure, so it is tested without a database.

    `key` is the pseudonym key: the default draws a fresh random one, a
    given one makes the output reproducible (tests), and None keeps every
    tag readable, for the coverage report only.

    `rows` carry: id, type, status, owned, rating, favorite, external_source,
    external_id, source_metadata, acquired_at, release_date, owned_issues,
    read_issues. `runs` maps an id to its runs: outcome, started_on,
    finished_on, paused_on, journal_days, journal_minutes.
    """
    if key == b"":
        key = secrets.token_bytes(32)
    ordered = sorted(rows, key=lambda row: (row["type"], str(row["id"])))
    counters: dict[str, int] = {}
    keys: dict[str, str] = {}
    for row in ordered:
        counters[row["type"]] = counters.get(row["type"], 0) + 1
        keys[str(row["id"])] = f"{row['type']}-{counters[row['type']]:03d}"
    by_external = {
        (row["external_source"], str(row["external_id"])): keys[str(row["id"])]
        for row in ordered
        if row.get("external_id")
    }

    items = []
    for row in ordered:
        snapshot = row.get("source_metadata") or {}
        source = row.get("external_source")
        similar = [
            by_external[(source, entry)]
            for entry in _strings(snapshot.get("similar_games"))
            if (source, entry) in by_external
        ]
        time_to_beat = snapshot.get("time_to_beat")
        entry = {
            "key": keys[str(row["id"])],
            "type": row["type"],
            "source": source,
            "status": row["status"],
            "owned": bool(row["owned"]),
            "rating": row.get("rating"),
            "favorite": bool(row.get("favorite")),
            "acquired_days_ago": _days_before(row.get("acquired_at"), today),
            "released_days_ago": _days_before(row.get("release_date"), today),
            "tags": _tags(snapshot, source, key),
            "similar": similar,
            "community_score": _number(snapshot.get("community_score")),
            "time_to_beat_hours": _number(time_to_beat.get("normally"))
            if isinstance(time_to_beat, dict)
            else None,
            "runtime_minutes": _number(snapshot.get("runtime_minutes")),
            "issues_owned": row.get("owned_issues"),
            "issues_read": row.get("read_issues"),
            "runs": [
                _without_nulls(
                    {
                        "outcome": run.get("outcome"),
                        "started_days_ago": _days_before(run.get("started_on"), today),
                        "finished_days_ago": _days_before(
                            run.get("finished_on"), today
                        ),
                        "paused_days_ago": _days_before(run.get("paused_on"), today),
                        "journal_days": run.get("journal_days", 0),
                        "journal_minutes": run.get("journal_minutes", 0),
                    }
                )
                for run in runs.get(str(row["id"]), [])
            ],
        }
        items.append(_without_nulls(entry))
    return {"version": FORMAT_VERSION, "items": items}


async def load(session, public_only: bool = False) -> tuple[list[dict], dict]:
    """Every item (or every public one) as the plain rows `anonymise` reads."""
    from sqlalchemy import select

    from comics import owned_set, read_state
    from models import Item, OwnedFormat
    from playthroughs import runs_with_journal

    query = select(Item)
    if public_only:
        query = query.where(Item.is_public.is_(True))
    items = list((await session.execute(query)).scalars())
    rows = []
    for item in items:
        owned_issues = read_issues = None
        if item.type.value == "comic":
            issues = owned_set(item.issues_owned, item.editions)
            owned_issues = len(issues)
            read_issues = read_state(item.read_to, issues).read
        rows.append(
            {
                "id": item.id,
                "type": item.type.value,
                "status": item.status.value,
                "owned": item.owned_format != OwnedFormat.NONE,
                "rating": item.rating,
                "favorite": item.favorite,
                "external_source": item.external_source,
                "external_id": item.external_id,
                "source_metadata": item.source_metadata,
                "acquired_at": item.acquired_at,
                "release_date": item.release_date,
                "owned_issues": owned_issues,
                "read_issues": read_issues,
            }
        )
    runs: dict[str, list[dict]] = {}
    for item_id, item_runs in (
        await runs_with_journal(session, [item.id for item in items])
    ).items():
        runs[str(item_id)] = [
            {
                "outcome": run.outcome,
                "started_on": run.started_on,
                "finished_on": run.finished_on,
                "paused_on": run.paused_on,
                "journal_days": days,
                "journal_minutes": minutes,
            }
            for run, days, minutes, _last in item_runs
        ]
    return rows, runs


def summary(body: dict) -> str:
    counts: dict[str, int] = {}
    for item in body["items"]:
        counts[item["type"]] = counts.get(item["type"], 0) + 1
    tagged = sum(1 for item in body["items"] if item.get("tags"))
    runs = sum(len(item.get("runs", [])) for item in body["items"])
    parts = ", ".join(f"{count} {kind}" for kind, count in sorted(counts.items()))
    return f"exported {parts or 'nothing'}; {tagged} tagged, {runs} runs"


def _database_url() -> str:
    spec = importlib.util.spec_from_file_location(
        "migrate_neon", BACKEND / "scripts" / "migrate_neon.py"
    )
    migrate_neon = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migrate_neon)
    env = migrate_neon.main_checkout_env()
    url = migrate_neon.read_variable(env.read_text()) if env.exists() else None
    if not url:
        raise SystemExit(f"{migrate_neon.VARIABLE} is not set in {env}")
    return url


async def run(dry_run: bool, public_only: bool, coverage: int | None = None) -> str:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from db import connect_args_for, normalize_async_url

    url = normalize_async_url(_database_url())
    engine = create_async_engine(url, connect_args=connect_args_for(url))
    try:
        async with async_sessionmaker(engine)() as session:
            rows, runs = await load(session, public_only)
    finally:
        await engine.dispose()
    if coverage is not None:
        spec = importlib.util.spec_from_file_location(
            "facet_coverage", BACKEND / "scripts" / "facet_coverage.py"
        )
        facet_coverage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(facet_coverage)
        clear = anonymise(rows, runs, datetime.now(UTC).date(), key=None)
        lines = facet_coverage.report(clear, coverage, None)
        return "\n".join(lines) if lines else "every tag is mapped"
    body = anonymise(rows, runs, datetime.now(UTC).date())
    if not dry_run:
        OUTPUT.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")
    return summary(body) + ("" if not dry_run else " (dry run, nothing written)")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="print counts only")
    parser.add_argument("--public-only", action="store_true", help="public rows only")
    parser.add_argument(
        "--coverage",
        type=int,
        metavar="MIN",
        help="print unmapped tags carried by at least MIN items; write nothing",
    )
    args = parser.parse_args(argv)
    print(asyncio.run(run(args.dry_run, args.public_only, args.coverage)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
