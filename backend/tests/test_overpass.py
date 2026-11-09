"""The Overpass adapter: the query it sends, and what it reads back.

`parse` runs over a real answer recorded around Union Station
(`scripts/record_spot_fixtures.py`); `fetch` over a mock transport, with
the backoff's sleep replaced so a 429 costs no time.
"""

import json
from pathlib import Path

import httpx2
import pytest

from spot_sources.limits import BACKOFF_SECONDS, REQUEST_TIMEOUT_SECONDS
from spot_sources.overpass import (
    Anchor,
    CandidateRow,
    OverpassError,
    build_query,
    fetch,
    parse,
)

FIXTURE = Path(__file__).parent / "fixtures" / "overpass_candidates.json"
WANTED = {"cafe", "restaurant", "library", "museum", "park", "playground"}
WANTED |= {"attraction"}


@pytest.fixture(scope="module")
def recorded():
    return json.loads(FIXTURE.read_text())


# --- build_query -------------------------------------------------------------


def test_one_query_covers_every_anchor_and_tag():
    query = build_query([Anchor(39.75, -105.0), Anchor(39.68, -104.96)], 3200)
    assert query.startswith("[out:json][timeout:60];")
    assert query.endswith("out center tags;")
    assert query.count("(around:3200,39.750000,-105.000000)") == 3
    assert query.count("(around:3200,39.680000,-104.960000)") == 3
    assert '["amenity"~"^(cafe|restaurant|library|museum)$"]["name"]' in query
    assert '["leisure"~"^(park|playground)$"]["name"]' in query
    assert '["tourism"~"^(attraction|museum)$"]["name"]' in query


def test_the_server_timeout_is_a_parameter():
    assert build_query([Anchor(1, 2)], 100, timeout=25).startswith(
        "[out:json][timeout:25];"
    )


def test_a_query_needs_an_anchor():
    with pytest.raises(ValueError):
        build_query([], 3200)


# --- parse ---------------------------------------------------------------------


def test_the_recorded_answer_parses_to_named_wanted_places(recorded):
    rows = parse(recorded)
    assert len(rows) == len(recorded["elements"])
    assert {row.category for row in rows} <= WANTED
    assert all(row.name for row in rows)
    assert len({row.source_id for row in rows}) == len(rows)


def test_ways_and_relations_take_their_center(recorded):
    rows = {row.source_id: row for row in parse(recorded)}
    station = rows["way/25650822"]
    assert station.name == "Union Station"
    assert 39.74 < station.lat < 39.76 and -105.01 < station.lng < -104.99
    assert any(source_id.startswith("relation/") for source_id in rows)


def test_cuisine_becomes_the_detail(recorded):
    rows = {row.source_id: row for row in parse(recorded)}
    assert rows["node/442621199"].detail == "mexican"


def _node(number, tags, **position):
    return {"type": "node", "id": number, "lat": 39.7, "lon": -105.0, **position}


def test_odd_elements_are_skipped_not_fatal():
    payload = {
        "elements": [
            {**_node(1, {}), "tags": {"amenity": "cafe"}},  # no name
            {**_node(2, {}), "tags": {"amenity": "bank", "name": "A bank"}},
            {
                **_node(3, {}),
                "tags": {"amenity": "cafe", "name": "Gone", "disused:amenity": "cafe"},
            },
            {"type": "way", "id": 4, "tags": {"leisure": "park", "name": "No centre"}},
            {"type": "area", "id": 5, "tags": {"leisure": "park", "name": "Odd"}},
            {**_node(6, {}), "tags": {"amenity": "cafe", "name": "  Kept  "}},
            {**_node(6, {}), "tags": {"amenity": "cafe", "name": "Repeat"}},
        ]
    }
    assert parse(payload) == [
        CandidateRow(
            source_id="node/6", name="Kept", category="cafe", lat=39.7, lng=-105.0
        )
    ]


def test_a_place_is_filed_under_the_first_wanted_key():
    payload = {
        "elements": [
            {
                **_node(7, {}),
                "tags": {
                    "name": "Both",
                    "tourism": "museum",
                    "amenity": "cafe",
                    "cuisine": "coffee_shop;cake",
                },
            }
        ]
    }
    (row,) = parse(payload)
    assert row.category == "cafe"
    assert row.detail == "coffee_shop, cake"


def test_an_empty_answer_is_no_places():
    assert parse({}) == []
    assert parse({"elements": []}) == []


# --- fetch ---------------------------------------------------------------------


def _client(responses, seen):
    answers = iter(responses)

    def handler(request):
        seen.append(request)
        return next(answers)

    return httpx2.AsyncClient(transport=httpx2.MockTransport(handler))


async def _no_sleep(seconds):
    _no_sleep.calls.append(seconds)


@pytest.fixture(autouse=True)
def _reset_sleep():
    _no_sleep.calls = []


@pytest.mark.asyncio
async def test_fetch_posts_the_query_as_form_data(recorded):
    seen = []
    async with _client([httpx2.Response(200, json=recorded)], seen) as client:
        payload = await fetch(client, "QUERY", url="https://o.test/i", sleep=_no_sleep)
    assert payload == recorded
    (request,) = seen
    assert request.method == "POST"
    assert str(request.url) == "https://o.test/i"
    assert request.content == b"data=QUERY"
    assert request.extensions["timeout"]["read"] == REQUEST_TIMEOUT_SECONDS
    assert _no_sleep.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [429, 406])
async def test_a_busy_answer_waits_once_and_retries(status):
    seen = []
    responses = [httpx2.Response(status), httpx2.Response(200, json={"elements": []})]
    async with _client(responses, seen) as client:
        assert await fetch(client, "Q", sleep=_no_sleep) == {"elements": []}
    assert len(seen) == 2
    assert _no_sleep.calls == [BACKOFF_SECONDS]


@pytest.mark.asyncio
async def test_a_second_busy_answer_fails():
    seen = []
    async with _client([httpx2.Response(429), httpx2.Response(429)], seen) as client:
        with pytest.raises(OverpassError, match="429"):
            await fetch(client, "Q", sleep=_no_sleep)
    assert len(seen) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx2.Response(504), "answered 504"),
        (httpx2.Response(200, text="<html>"), "not JSON"),
        (httpx2.Response(200, json=[1]), "not an object"),
        (
            httpx2.Response(
                200,
                json={"elements": [], "remark": "runtime error: Query timed out"},
            ),
            "ran out of time",
        ),
    ],
)
async def test_a_useless_answer_is_an_overpass_error(response, message):
    async with _client([response], []) as client:
        with pytest.raises(OverpassError, match=message):
            await fetch(client, "Q", sleep=_no_sleep)


@pytest.mark.asyncio
async def test_an_unreachable_server_is_an_overpass_error():
    def handler(request):
        raise httpx2.ConnectError("refused", request=request)

    transport = httpx2.MockTransport(handler)
    async with httpx2.AsyncClient(transport=transport) as client:
        with pytest.raises(OverpassError, match="could not be reached"):
            await fetch(client, "Q", sleep=_no_sleep)
