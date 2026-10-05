"""Bulk matching of Switch 1 registry titles to IGDB's Switch list (pure)."""

import json
from datetime import UTC, date, datetime
from pathlib import Path

from matching import normalize_title
from physical_sources.base import EditionRow
from physical_sources.switch1_titles import (
    PAGE,
    build_index,
    match,
    page_query,
    parse_titles,
    sheet_years,
)

IGDB = Path(__file__).parent / "fixtures" / "physical" / "igdb"


def row(igdb_id, name, year=2021, alternatives=()):
    return {
        "id": igdb_id,
        "name": name,
        "first_release_date": int(datetime(year, 7, 20, tzinfo=UTC).timestamp()),
        "alternative_names": [
            {"id": index, "name": alternative}
            for index, alternative in enumerate(alternatives)
        ],
    }


def index_of(*rows):
    return build_index(parse_titles(rows))


def edition(title, released):
    return EditionRow(
        source="nscollectors_ns1",
        source_ref=title,
        title=title,
        title_normalized=normalize_title(title),
        platform_id=130,
        region="USA",
        is_physical=True,
        physical_format=None,
        format_source=None,
        release_date=released,
    )


def test_one_exact_name_is_a_match():
    index = index_of(row(7, "Death's Door"), row(8, "Hades"))
    assert match("death s door", None, index) == 7


def test_two_exact_names_are_told_apart_by_the_sheets_year():
    index = index_of(row(1, "Doom", 1993), row(2, "Doom", 2016))
    # Within matching.YEAR_TOLERANCE of 2017: only the 2016 game.
    assert match("doom", 2017, index) == 2


def test_two_exact_names_with_no_sheet_year_stay_unmatched():
    index = index_of(row(1, "Doom", 1993), row(2, "Doom", 2016))
    assert match("doom", None, index) is None


def test_two_names_from_the_same_year_stay_unmatched():
    index = index_of(row(1, "Ys", 2020), row(2, "Ys", 2020))
    assert match("ys", 2020, index) is None


def test_no_name_is_no_match():
    assert match("obscure port", 2021, index_of(row(7, "Death's Door"))) is None


def test_an_alternative_name_matches():
    index = index_of(row(5, "Shin Megami Tensei V", alternatives=("SMT V",)))
    assert match("smt v", None, index) == 5


def test_an_exact_name_beats_a_stripped_one():
    index = index_of(row(1, "Hades"), row(2, "Hades Deluxe Edition"))
    assert match("hades", None, index) == 1


def test_a_stripped_name_answers_when_no_exact_one_does():
    assert match("hades", None, index_of(row(2, "Hades Deluxe Edition"))) == 2


def test_malformed_rows_are_skipped():
    titles = parse_titles(
        [
            "junk",
            {"id": "7", "name": "String id"},
            {"id": 8},
            {"id": 9, "name": "   "},
            {"id": 10, "name": "Ok", "alternative_names": ["bad", {"name": 3}]},
        ]
    )
    assert [(t.igdb_id, t.names, t.year) for t in titles] == [
        (10, frozenset({"ok"}), None)
    ]


def test_sheet_years_are_the_earliest_per_key():
    rows = [
        edition("Hades", date(2021, 3, 1)),
        edition("Hades", date(2020, 9, 18)),
        edition("Ys", None),
    ]
    assert sheet_years(rows) == {"hades": 2020, "ys": None}


def test_page_query_pages_by_name_only():
    query = page_query(1000)
    assert query.startswith("where platforms = (130); ")
    assert "fields id,name,first_release_date,alternative_names.name;" in query
    assert f"limit {PAGE}; offset 1000;" in query


def test_the_recorded_page_parses_whole():
    rows = json.loads((IGDB / "switch_titles_p1.json").read_text())
    titles = parse_titles(rows)
    assert len(rows) == PAGE
    assert len(titles) == len([r for r in rows if (r.get("name") or "").strip()])


def test_deaths_door_matches_on_the_recorded_search():
    rows = json.loads((IGDB / "switch_titles_deaths_door.json").read_text())
    expected = next(r["id"] for r in rows if r["name"] == "Death's Door")
    assert match("death s door", None, build_index(parse_titles(rows))) == expected
