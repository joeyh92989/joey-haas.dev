"""IGDB response mapping and token caching, against recorded fixtures."""

import json
from pathlib import Path

import pytest

from config import Config
from sources.base import SourceNotConfigured
from sources.igdb import IgdbSource, platform_id, year_from_unix

FIXTURES = Path(__file__).parent / "fixtures"


def _config(**overrides) -> Config:
    base = dict(
        google_client_id="x",
        google_client_secret="x",
        session_secret="x",
        admin_email="x@example.com",
        frontend_url="http://localhost:5173",
        database_url="postgresql://x",
        database_url_direct="postgresql://x",
        igdb_client_id="cid",
        igdb_client_secret="secret",
    )
    return Config(**{**base, **overrides})


def _search_payload() -> list[dict]:
    return json.loads((FIXTURES / "igdb_search.json").read_text())


def _detail_payload() -> dict:
    return json.loads((FIXTURES / "igdb_game.json").read_text())[0]


def test_release_dates_are_unix_timestamps_not_date_strings():
    # The one place IGDB differs from every other source. year_from_date would
    # read 1559001600 as the year 1559 -- a plausible-looking value that would
    # then filter the candidate list and hide the right answer.
    assert year_from_unix(1559001600) == 2019
    assert year_from_unix(None) is None
    assert year_from_unix("1559001600") is None


def test_unconfigured_when_either_credential_is_missing():
    assert IgdbSource(_config()).configured() is True
    assert IgdbSource(_config(igdb_client_id=None)).configured() is False
    assert IgdbSource(_config(igdb_client_secret=None)).configured() is False


@pytest.mark.asyncio
async def test_search_without_credentials_names_both_variables():
    with pytest.raises(SourceNotConfigured) as excinfo:
        await IgdbSource(_config(igdb_client_id=None)).search("Outer Wilds")
    message = str(excinfo.value)
    assert "IGDB_CLIENT_ID" in message
    assert "IGDB_CLIENT_SECRET" in message


def test_search_payload_maps_onto_source_results():
    results = IgdbSource(_config())._parse_search(_search_payload())

    assert results
    first = results[0]
    assert first.title
    assert first.external_id.isdigit()
    assert first.thumbnail_url is None or first.thumbnail_url.startswith(
        "https://images.igdb.com/igdb/image/upload/t_cover_small/"
    )


def test_detail_maps_onto_a_source_detail():
    detail = IgdbSource(_config())._parse_detail(_detail_payload())

    assert detail.title == "Outer Wilds"
    assert detail.year == 2019
    # creator is the developer, not the publisher: Annapurna published Outer
    # Wilds, Mobius Digital made it.
    assert detail.creator == "Mobius Digital"
    assert detail.cover_url.startswith(
        "https://images.igdb.com/igdb/image/upload/t_cover_big/"
    )
    assert detail.source_metadata["genres"]
    assert detail.source_metadata["community_score"]


def test_similar_games_are_kept_for_the_recommendation_engine():
    detail = IgdbSource(_config())._parse_detail(_detail_payload())
    assert isinstance(detail.source_metadata["similar_games"], list)
    assert detail.source_metadata["similar_games"]


def test_duplicate_developer_entries_are_collapsed():
    # involved_companies really does repeat a company across roles.
    detail = IgdbSource(_config())._parse_detail(
        {
            "id": 1,
            "name": "Repeated",
            "involved_companies": [
                {"company": {"name": "Studio"}, "developer": True},
                {"company": {"name": "Studio"}, "developer": True},
                {"company": {"name": "Publisher"}, "developer": False},
            ],
        }
    )
    assert detail.creator == "Studio"


def test_a_game_with_no_cover_or_developer_still_maps():
    detail = IgdbSource(_config())._parse_detail({"id": 2, "name": "Bare"})
    assert detail.cover_url is None
    assert detail.creator is None
    assert detail.year is None
    assert detail.source_metadata["genres"] == []


class _FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _RecordingClient:
    """Stands in for httpx2.AsyncClient, recording every POST it receives."""

    def __init__(self, calls: list[str], responses: dict[str, list[_FakeResponse]]):
        self._calls = calls
        self._responses = responses

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def post(self, url, **_kwargs):
        kind = "token" if "twitch" in url else "games"
        self._calls.append(kind)
        queue = self._responses[kind]
        return queue.pop(0) if len(queue) > 1 else queue[0]


def _patch_http(monkeypatch, games: list[_FakeResponse]) -> list[str]:
    calls: list[str] = []
    responses = {
        "token": [_FakeResponse(200, {"access_token": "token"})],
        "games": games,
    }
    monkeypatch.setattr(
        "sources.igdb.httpx2.AsyncClient",
        lambda **_: _RecordingClient(calls, responses),
    )
    return calls


@pytest.mark.asyncio
async def test_the_token_is_fetched_once_and_reused(monkeypatch):
    # A credential that lasts two months must not cost a round trip on every
    # lookup. This drives the real _query, so the caching being tested is the
    # caching that ships.
    calls = _patch_http(monkeypatch, [_FakeResponse(200, [])])
    source = IgdbSource(_config())

    await source.search("one")
    await source.search("two")

    assert calls.count("token") == 1
    assert calls.count("games") == 2


@pytest.mark.asyncio
async def test_a_401_refreshes_the_token_once_and_retries(monkeypatch):
    # The app token does eventually expire. The fix is a new token, not an
    # error surfaced to whoever happened to be importing at the time.
    calls = _patch_http(monkeypatch, [_FakeResponse(401, None), _FakeResponse(200, [])])
    source = IgdbSource(_config())

    await source.search("one")

    assert calls == ["token", "games", "token", "games"]


def test_platform_ids_come_from_igdb_not_from_guessing():
    # Resolved against IGDB's own /v4/platforms endpoint. A wrong id here
    # would filter every search down to the wrong console and look exactly
    # like the game simply not existing.
    assert platform_id("Nintendo Switch 2") == 508
    assert platform_id("Nintendo Switch") == 130
    assert platform_id("PlayStation 5") == 167
    assert platform_id("Xbox Series X|S") == 169


def test_platform_matching_is_forgiving_about_how_it_was_printed():
    assert platform_id("nintendo switch 2") == 508
    assert platform_id("NINTENDO SWITCH 2") == 508
    assert platform_id("Xbox Series X/S") == 169
    assert platform_id("PS5") == 167


def test_edition_wording_still_resolves_to_the_right_console():
    # Cases really do say "Nintendo Switch 2 Edition". The longer name has to
    # win over the shorter one it contains, or every Switch 2 game filters to
    # the original Switch and matches the wrong release.
    assert platform_id("Nintendo Switch 2 Edition") == 508
    assert platform_id("Nintendo Switch Edition") == 130


def test_an_unknown_platform_yields_none_rather_than_a_guess():
    # None means "search unfiltered", which is the same as not knowing. A
    # guess would filter to the wrong console and hide the right game.
    assert platform_id("Sega Saturn") is None
    assert platform_id("") is None
    assert platform_id(None) is None


@pytest.mark.asyncio
async def test_a_known_platform_filters_the_search(monkeypatch):
    # The Star Fox case: IGDB holds a 1993 release and a 2026 one under
    # exactly that title, so no string comparison separates them.
    bodies: list[str] = []

    async def fake_query(body):
        bodies.append(body)
        return [{"id": 1, "name": "Star Fox"}]

    source = IgdbSource(_config())
    monkeypatch.setattr(source, "_query", fake_query)

    await source.search("Star Fox", platform="Nintendo Switch 2")

    assert "where platforms = (508)" in bodies[0]
    assert len(bodies) == 1


@pytest.mark.asyncio
async def test_no_platform_means_no_filter(monkeypatch):
    bodies: list[str] = []

    async def fake_query(body):
        bodies.append(body)
        return []

    source = IgdbSource(_config())
    monkeypatch.setattr(source, "_query", fake_query)

    await source.search("Star Fox")

    assert "where platforms" not in bodies[0]


@pytest.mark.asyncio
async def test_an_empty_filtered_result_retries_unfiltered(monkeypatch):
    # A misread platform should cost precision, never the item.
    bodies: list[str] = []

    async def fake_query(body):
        bodies.append(body)
        return [] if "where platforms" in body else [{"id": 1, "name": "Star Fox"}]

    source = IgdbSource(_config())
    monkeypatch.setattr(source, "_query", fake_query)

    results = await source.search("Star Fox", platform="Nintendo Switch 2")

    assert len(bodies) == 2
    assert "where platforms" in bodies[0]
    assert "where platforms" not in bodies[1]
    assert results[0].title == "Star Fox"
