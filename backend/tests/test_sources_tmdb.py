"""TMDB response mapping, tested against recorded fixtures.

The fixtures are real responses captured once from the live API. Parsing is
split out of the request methods precisely so this suite never needs a network
call or an HTTP mock -- the thing under test is the mapping, and a mock would
only assert that the mock was configured the way the test configured it.
"""

import json
from pathlib import Path

import pytest

from config import Config
from sources.base import SourceNotConfigured
from sources.tmdb import TmdbSource

FIXTURES = Path(__file__).parent / "fixtures"


def _config(token: str | None = "test-token") -> Config:
    return Config(
        google_client_id="x",
        google_client_secret="x",
        session_secret="x",
        admin_email="x@example.com",
        frontend_url="http://localhost:5173",
        database_url="postgresql://x",
        database_url_direct="postgresql://x",
        tmdb_api_token=token,
    )


def _search_payload() -> dict:
    return json.loads((FIXTURES / "tmdb_search.json").read_text())


def _detail_payload() -> dict:
    return json.loads((FIXTURES / "tmdb_movie.json").read_text())


def test_unconfigured_source_reports_itself_as_such():
    assert TmdbSource(_config(token=None)).configured() is False
    assert TmdbSource(_config()).configured() is True


@pytest.mark.asyncio
async def test_search_without_a_token_raises_naming_the_variable():
    # The message has to name the variable: this surfaces as a 503 in the
    # picker, and "not configured" alone would send the reader hunting.
    with pytest.raises(SourceNotConfigured) as excinfo:
        await TmdbSource(_config(token=None)).search("Dune")
    assert "TMDB_API_TOKEN" in str(excinfo.value)


def test_search_payload_maps_onto_source_results():
    results = TmdbSource(_config())._parse_search(_search_payload())

    assert results, "the recorded fixture should contain candidates"
    first = results[0]
    assert first.external_id.isdigit()
    assert first.title
    assert first.year is None or 1880 < first.year < 2100
    assert first.thumbnail_url is None or first.thumbnail_url.startswith(
        "https://image.tmdb.org/t/p/w185"
    )


def test_search_returns_both_dune_releases():
    # The fixture is deliberately a title with two releases; the year filter
    # in matching.py is only meaningful because searches really come back
    # like this.
    results = TmdbSource(_config())._parse_search(_search_payload())
    years = {r.year for r in results if r.title == "Dune"}
    assert {1984, 2021} <= years


def test_search_is_capped_at_the_picker_limit():
    results = TmdbSource(_config())._parse_search(_search_payload())
    assert len(results) <= 10


def test_detail_payload_maps_onto_a_source_detail():
    detail = TmdbSource(_config())._parse_detail(_detail_payload())

    assert detail.external_id == "438631"
    assert detail.title == "Dune"
    assert detail.year == 2021
    # creator is the directing credit, denormalized onto one column.
    assert detail.creator == "Denis Villeneuve"
    assert detail.cover_url.startswith("https://image.tmdb.org/t/p/w342")
    assert detail.source_metadata["genres"]
    assert detail.source_metadata["community_score"] is not None


def test_detail_survives_a_film_with_no_poster_and_no_director():
    # Obscure films really do come back like this. A missing poster is a
    # placeholder in the UI, not a failed import.
    detail = TmdbSource(_config())._parse_detail(
        {"id": 1, "title": "Untitled", "release_date": "", "genres": [], "credits": {}}
    )
    assert detail.cover_url is None
    assert detail.creator is None
    assert detail.year is None
    assert detail.source_metadata["genres"] == []


def test_multiple_directors_are_joined_rather_than_dropped():
    detail = TmdbSource(_config())._parse_detail(
        {
            "id": 2,
            "title": "Co-directed",
            "credits": {
                "crew": [
                    {"job": "Director", "name": "Joel Coen"},
                    {"job": "Director", "name": "Ethan Coen"},
                    {"job": "Editor", "name": "Someone Else"},
                ]
            },
        }
    )
    assert detail.creator == "Joel Coen, Ethan Coen"
