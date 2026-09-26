"""The switch2-tracker cross-check: codemaverick-hub's data/games.json.

Best-effort and second to the sheet: a failure here is an error on its own
run, never the registry's, and the collapse prefers an nscollectors row for
the same game and region. The repository has no licence, so the recorded
fixture is a 30-game excerpt.

A game's per-region `formats{}` becomes one edition per region; with none,
its game-level `fmt` becomes one edition in region ALL. `d` is digital
(is_physical false); `?` is skipped. Editions are keyed by title and region,
never by the file's `id`, which is a sort index and shifts.
"""

from __future__ import annotations

from matching import normalize_title
from physical_sources.base import EditionRow, HostThrottle, PhysicalSourceError
from physical_sources.limits import SWITCH_2
from physical_sources.parse import game_title, parse_loose_date

SOURCE = "switch2tracker"
URL = (
    "https://raw.githubusercontent.com/codemaverick-hub/switch2-tracker/main/"
    "data/games.json"
)
HOST = "raw.githubusercontent.com"

FMT = {"c": "game_card", "k": "game_key_card", "b": "code_in_box"}
DIGITAL = "d"


def _edition(game: dict, region: str, code: str, when: str | None) -> EditionRow | None:
    code = (code or "").strip().lower()
    if code != DIGITAL and code not in FMT:
        return None  # "?" or anything unknown says nothing
    title = str(game.get("title") or "").strip()
    released, precision = parse_loose_date(when)
    fmt = FMT.get(code)
    return EditionRow(
        source=SOURCE,
        source_ref=f"{normalize_title(title)}|{region}",
        title=title,
        title_normalized=normalize_title(game_title(title)),
        platform_id=SWITCH_2,
        region=region,
        is_physical=code != DIGITAL,
        physical_format=fmt,
        format_source="registry" if fmt else None,
        publisher=(game.get("publisher") or None),
        release_date=released,
        release_precision=precision,
    )


def parse_games(payload: dict) -> list[EditionRow]:
    """Per-region formats{} -> one row per region; else game-level fmt -> ALL.

    A region's date is its own `releases` entry when there is one, else the
    game's `date`. A repeated title and region keeps its first row.
    """
    rows: list[EditionRow] = []
    seen: set[str] = set()
    for game in payload.get("games", []):
        # A malformed entry is skipped, never allowed to fail the run.
        if not isinstance(game, dict) or not str(game.get("title") or "").strip():
            continue
        formats = game.get("formats") if isinstance(game.get("formats"), dict) else {}
        releases = (
            game.get("releases") if isinstance(game.get("releases"), dict) else {}
        )
        if formats:
            candidates = [
                _edition(
                    game,
                    region.upper(),
                    code,
                    releases.get(region) or game.get("date"),
                )
                for region, code in formats.items()
            ]
        else:
            candidates = [_edition(game, "ALL", game.get("fmt"), game.get("date"))]
        for edition in candidates:
            if edition is not None and edition.source_ref not in seen:
                seen.add(edition.source_ref)
                rows.append(edition)
    return rows


async def fetch_games(client, throttle: HostThrottle | None = None) -> dict:
    """The tracker's games.json; any failure is an http_error on this run."""
    if throttle is not None:
        await throttle.wait(HOST)
    try:
        response = await client.get(URL)
    except Exception as error:
        raise PhysicalSourceError(
            f"switch2-tracker unreachable: {type(error).__name__}", code="http_error"
        ) from None
    if response.status_code != 200:
        raise PhysicalSourceError(
            f"switch2-tracker: HTTP {response.status_code}", code="http_error"
        )
    try:
        payload = response.json()
    except ValueError:
        raise PhysicalSourceError(
            "switch2-tracker: body is not JSON", code="http_error"
        ) from None
    if not isinstance(payload, dict) or not isinstance(payload.get("games"), list):
        raise PhysicalSourceError(
            "switch2-tracker: no games list", code="schema_missing_columns"
        )
    return payload
