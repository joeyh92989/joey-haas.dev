"""ComicVine mapping, the required User-Agent, and in-body errors."""

import json
from pathlib import Path

import pytest

from config import Config
from sources.base import SourceError, SourceNotConfigured, SourceRateLimited
from sources.comicvine import SEARCH_LIMIT, USER_AGENT, ComicVineSource

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
        comicvine_api_key="key",
    )
    return Config(**{**base, **overrides})


def _search_payload() -> dict:
    return json.loads((FIXTURES / "comicvine_search.json").read_text())


def _detail_payload() -> dict:
    return json.loads((FIXTURES / "comicvine_volume.json").read_text())


@pytest.mark.asyncio
async def test_search_without_a_key_names_the_variable():
    with pytest.raises(SourceNotConfigured) as excinfo:
        await ComicVineSource(_config(comicvine_api_key=None)).search("Saga")
    assert "COMICVINE_API_KEY" in str(excinfo.value)


def test_search_payload_maps_onto_source_results():
    results = ComicVineSource(_config())._parse_search(_search_payload())

    assert results
    first = results[0]
    assert first.title
    assert first.external_id.isdigit()
    assert first.year is None or 1900 < first.year < 2100


def test_search_respects_the_documented_ceiling_of_ten():
    # ComicVine's own documentation says /search cannot exceed 10.
    assert SEARCH_LIMIT == 10
    results = ComicVineSource(_config())._parse_search(_search_payload())
    assert len(results) <= 10


def test_detail_maps_onto_a_source_detail():
    detail = ComicVineSource(_config())._parse_detail(_detail_payload())

    assert detail.title == "Saga"
    assert detail.year == 2012
    # At volume level the publisher is the closest thing to a creator; writers
    # and artists belong to issues, which are out of scope.
    assert detail.creator == "Image"
    assert detail.cover_url
    assert detail.source_metadata["issue_count"]
    assert detail.source_metadata["publisher"] == "Image"


def test_no_community_score_key_is_invented():
    # ComicVine exposes no community rating. A null key would imply the field
    # exists and is simply unknown for this row.
    detail = ComicVineSource(_config())._parse_detail(_detail_payload())
    assert "community_score" not in detail.source_metadata


def test_a_volume_with_no_image_or_publisher_still_maps():
    detail = ComicVineSource(_config())._parse_detail(
        {"results": {"id": 1, "name": "Bare", "start_year": None}}
    )
    assert detail.cover_url is None
    assert detail.creator is None
    assert detail.year is None


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {"error": "OK", "results": []}

    def json(self) -> dict:
        return self._payload


class _RecordingClient:
    def __init__(self, seen: list[dict], response: _FakeResponse):
        self._seen = seen
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def get(self, url, params=None, headers=None):
        self._seen.append({"url": url, "params": params, "headers": headers})
        return self._response


def _patch_http(monkeypatch, response: _FakeResponse) -> list[dict]:
    seen: list[dict] = []
    monkeypatch.setattr(
        "sources.comicvine.httpx2.AsyncClient",
        lambda **_: _RecordingClient(seen, response),
    )
    return seen


@pytest.mark.asyncio
async def test_a_custom_user_agent_is_always_sent(monkeypatch):
    # Verified against the live API: with a default client user agent
    # ComicVine answers 403 "Anonymous Bot or Scraper Blocked". This header is
    # required, not courteous, and their docs do not mention it.
    seen = _patch_http(monkeypatch, _FakeResponse(200))

    await ComicVineSource(_config()).search("Saga")

    assert seen[0]["headers"]["User-Agent"] == USER_AGENT
    assert "joey-haas.dev" in USER_AGENT


@pytest.mark.asyncio
async def test_search_never_asks_for_more_than_ten(monkeypatch):
    seen = _patch_http(monkeypatch, _FakeResponse(200))

    await ComicVineSource(_config()).search("Saga")

    assert seen[0]["params"]["limit"] <= 10
    assert seen[0]["params"]["resources"] == "volume"


@pytest.mark.asyncio
async def test_an_error_reported_inside_a_200_body_is_raised(monkeypatch):
    # ComicVine reports its own failures in the body with HTTP 200, so a
    # status check alone would treat an error as an empty result set.
    _patch_http(
        monkeypatch, _FakeResponse(200, {"error": "Invalid API Key", "results": []})
    )

    with pytest.raises(SourceError) as excinfo:
        await ComicVineSource(_config()).search("Saga")

    assert "Invalid API Key" in str(excinfo.value)


@pytest.mark.asyncio
async def test_a_420_is_reported_as_rate_limiting(monkeypatch):
    _patch_http(monkeypatch, _FakeResponse(420))

    with pytest.raises(SourceRateLimited):
        await ComicVineSource(_config()).search("Saga")


@pytest.mark.asyncio
async def test_a_403_explains_the_two_things_that_cause_it(monkeypatch):
    _patch_http(monkeypatch, _FakeResponse(403))

    with pytest.raises(SourceError) as excinfo:
        await ComicVineSource(_config()).search("Saga")

    message = str(excinfo.value)
    assert "key" in message and "User-Agent" in message
