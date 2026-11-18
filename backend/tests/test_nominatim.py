"""The Nominatim client: the parser over recorded answers, `search` over a
mock transport, and the 1 s pacing on a fake clock (nothing really sleeps)."""

import asyncio
import json
from pathlib import Path

import httpx2
import pytest

from sources.base import Throttle
from spot_sources import nominatim
from spot_sources.limits import NOMINATIM_USER_AGENT
from spot_sources.nominatim import (
    PlaceHit,
    SearchFailure,
    SearchOk,
    parse_results,
    search,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> dict:
    return json.loads((FIXTURES / f"nominatim_{name}.json").read_text())


class FakeClock:
    """A clock that only moves when something sleeps."""

    def __init__(self) -> None:
        self.now = 1000.0

    def time(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    fake = FakeClock()
    monkeypatch.setattr(
        nominatim, "_throttle", Throttle(1.1, clock=fake.time, sleep=fake.sleep)
    )
    return fake


def client_for(handler) -> httpx2.AsyncClient:
    return httpx2.AsyncClient(transport=httpx2.MockTransport(handler))


def answering(body, status=200):
    seen: list[httpx2.Request] = []

    def handler(request):
        seen.append(request)
        if isinstance(body, bytes):
            return httpx2.Response(status, content=body)
        return httpx2.Response(status, json=body)

    return handler, seen


# --- parse_results -----------------------------------------------------------


def test_parse_one():
    hits = parse_results(load("one")["results"])
    assert len(hits) == 1
    hit = hits[0]
    assert isinstance(hit, PlaceHit)
    assert hit.name == "Red Rocks Amphitheatre"
    assert hit.lat == pytest.approx(39.6653917)
    assert hit.lng == pytest.approx(-105.2057171)
    assert isinstance(hit.lat, float) and isinstance(hit.lng, float)
    assert hit.source_id == "way/229359697"
    assert (hit.osm_type, hit.osm_id) == ("way", 229359697)
    assert (hit.category, hit.type) == ("amenity", "theatre")
    assert hit.display_name.startswith("Red Rocks Amphitheatre, 18300")
    assert hit.address["state"] == "Colorado"


def test_parse_several():
    raw = load("several")["results"]
    hits = parse_results(raw)
    assert len(hits) == 5
    for hit, row in zip(hits, raw):
        assert hit.source_id == f"node/{row['osm_id']}"
        assert hit.source_id.startswith("node/")
        assert isinstance(hit.lat, float) and isinstance(hit.lng, float)
        assert hit.name


def test_parse_none():
    assert parse_results(load("none")["results"]) == []


def test_name_falls_back_to_first_part_of_display_name():
    row = dict(load("one")["results"][0])
    row["name"] = ""
    assert parse_results([row])[0].name == "Red Rocks Amphitheatre"
    del row["name"]
    assert parse_results([row])[0].name == "Red Rocks Amphitheatre"


@pytest.mark.parametrize("key", ["osm_id", "osm_type", "lat", "lon"])
def test_row_missing_a_key_is_skipped(key):
    good = load("several")["results"]
    broken = dict(good[0])
    del broken[key]
    hits = parse_results([broken, good[1]])
    assert [h.source_id for h in hits] == [f"node/{good[1]['osm_id']}"]


# --- search ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_ok_and_request_shape():
    handler, seen = answering(load("one")["results"])
    async with client_for(handler) as client:
        result = await search(client, "Red Rocks")
    assert isinstance(result, SearchOk)
    assert result.ok is True
    assert [h.source_id for h in result.hits] == ["way/229359697"]
    (request,) = seen
    assert request.url.host == "nominatim.openstreetmap.org"
    assert request.url.path == "/search"
    params = dict(request.url.params)
    assert params["format"] == "jsonv2"
    assert params["limit"] == "5"
    assert params["countrycodes"] == "us"
    assert params["addressdetails"] == "1"
    assert params["q"] == "Red Rocks"
    assert params["viewbox"] == "-105.35,39.95,-104.60,39.55"
    assert "bounded" not in params


@pytest.mark.asyncio
async def test_user_agent_on_every_request_and_no_email():
    assert "@" not in NOMINATIM_USER_AGENT
    handler, seen = answering([])
    async with client_for(handler) as client:
        await search(client, "one")
        await search(client, "two")
    assert len(seen) == 2
    for request in seen:
        assert request.headers["user-agent"] == NOMINATIM_USER_AGENT
        assert "@" not in request.headers["user-agent"]


@pytest.mark.asyncio
async def test_two_searches_started_together_are_a_second_apart(clock):
    times: list[float] = []

    def handler(request):
        times.append(clock.time())
        return httpx2.Response(200, json=[])

    async with client_for(handler) as client:
        await asyncio.gather(search(client, "a"), search(client, "b"))
    assert len(times) == 2
    assert times[1] - times[0] >= 1.0


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["", "   ", "\t\n"])
async def test_empty_query_makes_no_request(query):
    handler, seen = answering([])
    async with client_for(handler) as client:
        result = await search(client, query)
    assert isinstance(result, SearchFailure)
    assert result.ok is False
    assert result.reason == "empty_query"
    assert result.message
    assert seen == []


@pytest.mark.asyncio
async def test_timeout_is_a_failure_not_an_exception():
    def handler(request):
        raise httpx2.ReadTimeout("slow", request=request)

    async with client_for(handler) as client:
        result = await search(client, "x")
    assert isinstance(result, SearchFailure)
    assert result.reason == "timeout"
    assert result.message


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [429, 500])
async def test_http_error_status(status):
    handler, _ = answering({"error": "no"}, status)
    async with client_for(handler) as client:
        result = await search(client, "x")
    assert isinstance(result, SearchFailure)
    assert result.reason == "http_error"
    assert str(status) in result.message


@pytest.mark.asyncio
async def test_connection_error_is_http_error():
    def handler(request):
        raise httpx2.ConnectError("down", request=request)

    async with client_for(handler) as client:
        result = await search(client, "x")
    assert isinstance(result, SearchFailure)
    assert result.reason == "http_error"


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [b"<html>oops</html>", b'{"not": "a list"}'])
async def test_bad_body_is_bad_response(body):
    handler, _ = answering(body)
    async with client_for(handler) as client:
        result = await search(client, "x")
    assert isinstance(result, SearchFailure)
    assert result.reason == "bad_response"
