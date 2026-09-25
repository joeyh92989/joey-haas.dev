"""The switch2-tracker cross-check, on the recorded 30-game excerpt."""

import json
from datetime import date
from pathlib import Path

import httpx2
import pytest

from physical_sources.base import PhysicalSourceError
from physical_sources.tracker import fetch_games, parse_games

EXCERPT = Path(__file__).parent / "fixtures" / "physical" / "tracker" / "games.json"


@pytest.fixture(scope="module")
def payload():
    return json.loads(EXCERPT.read_text())


@pytest.fixture(scope="module")
def rows(payload):
    return parse_games(payload)


def _rows_for(rows, title):
    return {row.region: row for row in rows if row.title == title}


def test_per_region_formats_become_one_row_each(rows):
    # WWE 2K25: {usa: b, eur: k, aus: k} -- the fixture's mixed case.
    wwe = _rows_for(rows, "WWE 2K25")
    assert {region: row.physical_format for region, row in wwe.items()} == {
        "USA": "code_in_box",
        "EUR": "game_key_card",
        "AUS": "game_key_card",
    }
    assert "ALL" not in wwe


def test_game_level_fmt_without_formats_is_one_all_row(payload, rows):
    game = next(g for g in payload["games"] if g["fmt"] == "c" and not g["formats"])
    found = _rows_for(rows, game["title"])
    assert list(found) == ["ALL"]
    assert (found["ALL"].physical_format, found["ALL"].is_physical) == (
        "game_card",
        True,
    )


def test_digital_is_not_physical(payload, rows):
    game = next(g for g in payload["games"] if g["fmt"] == "d")
    for row in _rows_for(rows, game["title"]).values():
        assert (row.is_physical, row.physical_format, row.format_source) == (
            False,
            None,
            None,
        )


def test_unknown_format_makes_no_row(payload, rows):
    unknown = [g for g in payload["games"] if g["fmt"] == "?" and not g["formats"]]
    assert unknown
    for game in unknown:
        assert _rows_for(rows, game["title"]) == {}


def test_a_per_region_question_mark_skips_that_region_only():
    payload = {
        "games": [{"title": "X", "fmt": "k", "formats": {"usa": "k", "eur": "?"}}]
    }
    assert [row.region for row in parse_games(payload)] == ["USA"]


@pytest.mark.parametrize(
    ("when", "expected"),
    [
        ("Aug 27, 2026", (date(2026, 8, 27), "day")),
        ("2027", (date(2027, 1, 1), "year")),
        ("Q1 2027", (date(2027, 1, 1), "quarter")),
        ("TBA", (None, None)),
    ],
)
def test_dates(when, expected):
    payload = {"games": [{"title": "X", "fmt": "c", "formats": {}, "date": when}]}
    row = parse_games(payload)[0]
    assert (row.release_date, row.release_precision) == expected


def test_a_region_date_beats_the_game_date():
    payload = {
        "games": [
            {
                "title": "X",
                "fmt": "k",
                "formats": {"aus": "k", "usa": "k"},
                "releases": {"aus": "Aug 27, 2026"},
                "date": "Sep 1, 2026",
            }
        ]
    }
    by_region = {row.region: row.release_date for row in parse_games(payload)}
    assert by_region == {"AUS": date(2026, 8, 27), "USA": date(2026, 9, 1)}


def test_source_ref_is_title_keyed_and_ignores_id(payload):
    moved = {"games": [{**game, "id": 99999} for game in payload["games"]]}
    assert [r.source_ref for r in parse_games(moved)] == [
        r.source_ref for r in parse_games(payload)
    ]
    assert all(r.source_ref.endswith(f"|{r.region}") for r in parse_games(payload))


def test_rows_are_switch_2_tracker_rows(rows):
    assert {(row.source, row.platform_id) for row in rows} == {("switch2tracker", 508)}
    assert len({row.source_ref for row in rows}) == len(rows)


def _client(handler):
    return httpx2.AsyncClient(transport=httpx2.MockTransport(handler))


@pytest.mark.asyncio
async def test_fetch_games_returns_the_payload(payload):
    async with _client(lambda request: httpx2.Response(200, json=payload)) as client:
        assert (await fetch_games(client))["count"] == payload["count"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        httpx2.Response(500),
        httpx2.Response(200, text="<html>"),
        httpx2.Response(200, json={}),
    ],
)
async def test_fetch_games_failures_are_source_errors(response):
    async with _client(lambda request: response) as client:
        with pytest.raises(PhysicalSourceError):
            await fetch_games(client)


def test_malformed_games_are_skipped():
    payload = {
        "games": [
            "junk",
            None,
            {"title": "X", "fmt": "c", "formats": "oops", "releases": 3},
        ]
    }
    (row,) = parse_games(payload)
    assert (row.region, row.physical_format) == ("ALL", "game_card")
