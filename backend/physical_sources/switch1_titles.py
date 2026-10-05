"""Bulk matching of Switch 1 registry titles to IGDB's Switch list (switch1
spec B).

Pure. switch1_ingest pages IGDB with page_query -- ids, names and first
release dates only, tens of requests for every Switch game -- and this module
matches each registry key locally, so about 4,200 titles resolve without one
search each at IGDB's four requests a second.

A key is looked up in two tables. The exact table holds each game's name and
alternative names through normalize_title, the way registry keys are made;
the stripped table holds them through game_title first, so "Hades Deluxe
Edition" also answers "hades". The exact table is asked first and the
stripped one only when the exact one knows nothing: a base game and its
deluxe edition strip to one key, and the base game's own name should win.

One game is the match. Two or more are told apart by the sheet's earliest
release year: exactly one game within matching.YEAR_TOLERANCE of it, or no
match. No match is the caller's to handle (IGNORED, or left to Resolve when
a store lists the game).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime

from matching import YEAR_TOLERANCE, normalize_title
from physical_sources.base import EditionRow
from physical_sources.parse import game_title

# IGDB's largest page.
PAGE = 500
# Keep in step with IGDB_SWITCH_QUERY in scripts/record_physical_fixtures.py,
# and re-record the fixtures when this changes.
FIELDS = "fields id,name,first_release_date,alternative_names.name;"


def page_query(offset: int) -> str:
    """One page of every Switch game, by id."""
    return (
        f"where platforms = (130); {FIELDS} sort id asc; limit {PAGE}; offset {offset};"
    )


@dataclass(frozen=True)
class SwitchTitle:
    """One IGDB Switch game as the matcher reads it."""

    igdb_id: int
    year: int | None
    names: frozenset[str]
    stripped: frozenset[str]


@dataclass(frozen=True)
class TitleIndex:
    """Normalized name -> the games carrying it, per table."""

    exact: dict[str, tuple[SwitchTitle, ...]]
    stripped: dict[str, tuple[SwitchTitle, ...]]


def _year(value: object) -> int | None:
    """The year of IGDB's epoch seconds (as sources.igdb.year_from_unix,
    which this pure module cannot import: sources loads the models)."""
    if not isinstance(value, int) or isinstance(value, bool):
        return None
    try:
        return datetime.fromtimestamp(value, tz=UTC).year
    except (OverflowError, OSError, ValueError):
        return None


def _names(row: dict) -> list[str]:
    names = [row.get("name")]
    for alternative in row.get("alternative_names") or []:
        if isinstance(alternative, dict):
            names.append(alternative.get("name"))
    return [name for name in names if isinstance(name, str) and name.strip()]


def parse_titles(rows: Iterable[object]) -> list[SwitchTitle]:
    """IGDB rows -> SwitchTitles. A row without an integer id and a name is
    skipped, as is any alternative name that is not text."""
    titles: list[SwitchTitle] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        igdb_id, name = row.get("id"), row.get("name")
        if not isinstance(igdb_id, int) or not isinstance(name, str):
            continue
        if not name.strip():
            continue
        names = _names(row)
        titles.append(
            SwitchTitle(
                igdb_id=igdb_id,
                year=_year(row.get("first_release_date")),
                names=frozenset({normalize_title(n) for n in names} - {""}),
                stripped=frozenset(
                    {normalize_title(game_title(n)) for n in names} - {""}
                ),
            )
        )
    return titles


def _table(titles: list[SwitchTitle], field: str) -> dict[str, tuple[SwitchTitle, ...]]:
    table: dict[str, dict[int, SwitchTitle]] = {}
    for title in titles:
        for key in getattr(title, field):
            table.setdefault(key, {})[title.igdb_id] = title
    return {key: tuple(found.values()) for key, found in table.items()}


def build_index(titles: Iterable[SwitchTitle]) -> TitleIndex:
    """The exact and stripped lookup tables for a set of Switch games."""
    titles = list(titles)
    return TitleIndex(
        exact=_table(titles, "names"), stripped=_table(titles, "stripped")
    )


def _pick(found: tuple[SwitchTitle, ...], year: int | None) -> int | None:
    if len(found) == 1:
        return found[0].igdb_id
    if year is None:
        return None
    near = [
        title
        for title in found
        if title.year is not None and abs(title.year - year) <= YEAR_TOLERANCE
    ]
    return near[0].igdb_id if len(near) == 1 else None


def match(key: str, year: int | None, index: TitleIndex) -> int | None:
    """The IGDB id for a registry key, or None."""
    for table in (index.exact, index.stripped):
        found = table.get(key)
        if found:
            return _pick(found, year)
    return None


def sheet_years(rows: Iterable[EditionRow]) -> dict[str, int | None]:
    """title_normalized -> the earliest release year among its rows, or None
    when none is dated; every key appears."""
    years: dict[str, int | None] = {}
    for row in rows:
        years.setdefault(row.title_normalized, None)
        if row.release_date is not None:
            current = years[row.title_normalized]
            year = row.release_date.year
            years[row.title_normalized] = (
                year if current is None else min(current, year)
            )
    return years
