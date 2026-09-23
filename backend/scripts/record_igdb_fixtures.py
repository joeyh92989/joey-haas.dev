"""Records live IGDB responses as test fixtures for the E7b snapshot.

Run once, from backend/, by the owner:

    ./.venv/bin/python scripts/record_igdb_fixtures.py

With no arguments it records one well-known game per platform the snapshot
must handle (Switch 2, Switch, N64), found by searching IGDB: the fixtures pin
the shape of IGDB's answers, which does not depend on whose games they are.
IGDB game ids may be given instead. Credentials are
read through load_config() from backend/.env exactly as the API reads them and
never leave this process. Only response bodies are written; nothing sent in a
header is recorded or printed.

Why this exists: the IGDB docs, third-party code and our own assumptions
disagree on several fields the snapshot now depends on (game_status, time to
beat, platform ids), so the parser is written against what the live API
actually returns.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from config import load_config  # noqa: E402
from sources.igdb import IgdbSource  # noqa: E402

FIXTURES = BACKEND / "tests" / "fixtures"

# The E7b field list, held here because the recorder runs before the parser
# is written. Keep it in step with FIELDS in sources/igdb.py.
GAME_FIELDS = (
    "fields name,first_release_date,cover.image_id,genres.name,genres.id,"
    "summary,rating,aggregated_rating,total_rating,total_rating_count,"
    "platforms.name,platforms.id,involved_companies.company.name,"
    "involved_companies.developer,similar_games,themes.name,themes.id,"
    "keywords.name,game_modes.name,player_perspectives.name,hypes,"
    "game_status.status;"
)
TTB_FIELDS = "fields game_id,hastily,normally,completely,count;"
PLATFORM_SLUGS = ("n64", "switch-2", "switch")
OBSCURE_CANDIDATES = 10

# One well-known game per platform, searched by title on that platform.
DEFAULT_GAMES = (
    ("Mario Kart World", 508),
    ("The Legend of Zelda: Breath of the Wild", 130),
    ("Super Mario 64", 4),
)


def _write(name: str, payload: object) -> Path:
    path = FIXTURES / name
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    return path


def _id_list(ids: list[int]) -> str:
    return ",".join(str(game_id) for game_id in ids)


async def _default_ids(source: IgdbSource) -> list[int]:
    """Finds the DEFAULT_GAMES on IGDB, skipping any search that finds nothing."""
    ids: list[int] = []
    for title, platform in DEFAULT_GAMES:
        rows = await source._query(
            f'search "{title}"; where platforms = ({platform}); fields id,name; '
            "limit 1;"
        )
        if rows:
            ids.append(rows[0]["id"])
            print(f"using {rows[0].get('name')!r} (igdb {rows[0]['id']})")
        else:
            print(f"no IGDB match for {title!r} on platform {platform}; skipped")
    return ids


async def record(game_ids: list[int]) -> None:
    source = IgdbSource(load_config())
    if not game_ids:
        game_ids = await _default_ids(source)
    if not game_ids:
        raise SystemExit("No games to record.")

    games = await source._query(
        f"where id = ({_id_list(game_ids)}); {GAME_FIELDS} limit {len(game_ids)};"
    )

    # Unrated games with a release date are the likeliest to have no time to
    # beat submissions. Which of them actually do not is recorded, not assumed.
    obscure = await source._query(
        "where total_rating_count = null & first_release_date != null; "
        f"fields id; limit {OBSCURE_CANDIDATES};"
    )
    obscure_ids = [row["id"] for row in obscure]
    requested = game_ids + obscure_ids
    times = await source._query(
        f"where game_id = ({_id_list(requested)}); {TTB_FIELDS} "
        f"limit {len(requested)};",
        endpoint="game_time_to_beats",
    )
    answered = {row.get("game_id") for row in times}

    slugs = ",".join(f'"{slug}"' for slug in PLATFORM_SLUGS)
    platforms = await source._query(
        f"where slug = ({slugs}); fields id,name,slug; limit 10;",
        endpoint="platforms",
    )

    paths = [
        _write("igdb_games_e7b.json", games),
        # The requested ids travel with the response so a test can tell an
        # absent game from one that was never asked about.
        _write(
            "igdb_time_to_beats.json",
            {
                "requested_owned": game_ids,
                "requested_obscure": obscure_ids,
                "response": times,
            },
        ),
        _write("igdb_platforms.json", platforms),
    ]

    print(f"games: {len(games)} of {len(game_ids)} requested")
    print(
        f"time to beat: {len(times)} rows; "
        f"{len([i for i in obscure_ids if i not in answered])} of "
        f"{len(obscure_ids)} obscure games absent"
    )
    print(f"platforms: {[(row.get('slug'), row.get('id')) for row in platforms]}")
    for path in paths:
        print(f"wrote {path.relative_to(BACKEND)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "game_ids",
        nargs="*",
        type=int,
        help="IGDB game ids (default: one well-known game per platform)",
    )
    args = parser.parse_args()
    asyncio.run(record(args.game_ids))


if __name__ == "__main__":
    main()
