"""The place kind: search hook, count mark, owned places and search-born
entries (story #340, task 4). No live network: `nominatim.search` is
replaced, or the recorded answers are parsed."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from intake import place_kind, search
from intake.place_kind import ATTRIBUTION, mark_for_count
from models import CandidateSource, IntakeEntryState, Spot
from spot_sources import nominatim
from spot_sources.nominatim import SearchFailure, SearchOk, parse_results
from tests.test_intake_kinds import client_for

FIXTURES = Path(__file__).parent / "fixtures"


def hits(name: str):
    raw = json.loads((FIXTURES / f"nominatim_{name}.json").read_text())["results"]
    return parse_results(raw)


class FakeSearch:
    """Stands in for `nominatim.search`, counting calls."""

    def __init__(self, outcome=None, delay: float = 0.0):
        self.outcome = outcome
        self.delay = delay
        self.calls: list[str] = []

    async def __call__(self, client, query):
        self.calls.append(query)
        if self.delay:
            await asyncio.sleep(self.delay)
        return self.outcome


def patch_search(monkeypatch, outcome=None, delay=0.0) -> FakeSearch:
    fake = FakeSearch(outcome, delay)
    monkeypatch.setattr(nominatim, "search", fake)
    return fake


async def new_sitting(client, kind="place", area="places"):
    return await client.post("/api/intake/sittings", json={"area": area, "kind": kind})


async def add_spot(factory, **fields):
    async with factory() as session:
        spot = Spot(slug=fields["name"].lower().replace(" ", "-"), **fields)
        session.add(spot)
        await session.commit()
        return str(spot.id)


def row_for(hit):
    return place_kind.row_for(hit)


def test_mark_for_count_uses_the_recorded_answers():
    assert mark_for_count(len(hits("none"))) is IntakeEntryState.CHECK
    assert mark_for_count(len(hits("one"))) is IntakeEntryState.READY
    assert mark_for_count(len(hits("several"))) is IntakeEntryState.CHECK
    assert mark_for_count(2) is IntakeEntryState.CHECK
    assert mark_for_count(5) is IntakeEntryState.CHECK


@pytest.mark.asyncio
async def test_kinds_lists_place_and_leaves_the_rest(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        served = {k["key"]: k for k in (await client.get("/api/intake/kinds")).json()}
    assert served["place"]["area"] == "places"
    assert set(served["place"]["ways_in"]) == {"search", "type"}
    assert len(served["place"]["ways_in"]) == 2
    assert served["place"]["source_state"] == "ready"
    assert served["garment"]["ways_in"] == ["photo", "type", "file", "link"]
    assert served["garment"]["source_state"] is None
    assert served["game"]["ways_in"] == ["photo", "search", "type"]


@pytest.mark.asyncio
async def test_typing_sends_no_request(monkeypatch, sessionmaker_for_test):
    fake = patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        await client.get("/api/intake/kinds")
        sitting = (await new_sitting(client)).json()
        await client.get(f"/api/intake/sittings/{sitting['id']}")
        assert fake.calls == []
        response = await client.get(
            "/api/intake/search", params={"area": "places", "query": "red rocks"}
        )
    assert fake.calls == ["red rocks"]
    body = response.json()
    assert body["sources"] == [{"kind": "place", "state": "ok", "reason": None}]
    [row] = body["results"]
    assert row["lat"] == pytest.approx(39.6653917)
    assert row["source_id"] == "way/229359697"
    assert row["map_url"] == "https://www.openstreetmap.org/way/229359697"
    assert row["category"] == "amenity"
    assert row["owned_spot_id"] is None
    assert row["attribution"] == ATTRIBUTION == "Search by OpenStreetMap contributors"


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["timeout", "http_error"])
async def test_a_search_failure_is_a_failed_state(
    reason, monkeypatch, sessionmaker_for_test
):
    failure = SearchFailure(reason, "The place search could not be reached.")
    patch_search(monkeypatch, failure)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(
            "/api/intake/search", params={"area": "places", "query": "x"}
        )
    assert response.status_code == 200
    assert response.json() == {
        "results": [],
        "sources": [
            {
                "kind": "place",
                "state": "failed",
                "reason": "The place search could not be reached.",
            }
        ],
    }


@pytest.mark.asyncio
async def test_the_search_runs_inside_the_timeout(monkeypatch, sessionmaker_for_test):
    patch_search(monkeypatch, SearchOk(hits("one")), delay=1.0)
    monkeypatch.setattr(search, "SEARCH_TIMEOUT", 0.05)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(
            "/api/intake/search", params={"area": "places", "query": "x"}
        )
    body = response.json()
    assert body["results"] == []
    assert body["sources"][0]["state"] == "busy"


@pytest.mark.asyncio
async def test_owned_by_source_id(monkeypatch, sessionmaker_for_test):
    spot_id = await add_spot(
        sessionmaker_for_test,
        name="Somewhere else",
        lat=39.0,
        lng=-105.0,
        source=CandidateSource.OSM,
        source_id="way/229359697",
    )
    patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        body = (
            await client.get(
                "/api/intake/search", params={"area": "places", "query": "x"}
            )
        ).json()
        assert body["results"][0]["owned_spot_id"] == spot_id
        sitting = (await new_sitting(client)).json()
        added = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"chosen": body["results"][0], "result_count": 1},
        )
    assert added.status_code == 409


@pytest.mark.asyncio
async def test_owned_by_name_and_distance(monkeypatch, sessionmaker_for_test):
    spot_id = await add_spot(
        sessionmaker_for_test,
        name="Red Rocks Amphitheatre",
        lat=39.66545,
        lng=-105.20565,
    )
    far = await add_spot(
        sessionmaker_for_test, name="Red Rocks Park", lat=39.9, lng=-105.0
    )
    patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        body = (
            await client.get(
                "/api/intake/search", params={"area": "places", "query": "x"}
            )
        ).json()
        row = body["results"][0]
        assert row["owned_spot_id"] == spot_id != far
        sitting = (await new_sitting(client)).json()
        added = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"chosen": row, "result_count": 1},
        )
    assert added.status_code == 409


@pytest.mark.asyncio
async def test_a_search_born_entry_has_its_state_and_payload(
    monkeypatch, sessionmaker_for_test
):
    patch_search(monkeypatch, SearchOk(hits("several")))
    async with client_for(sessionmaker_for_test) as client:
        rows = (
            await client.get(
                "/api/intake/search", params={"area": "places", "query": "starbucks"}
            )
        ).json()["results"]
        sitting = (await new_sitting(client)).json()
        url = f"/api/intake/sittings/{sitting['id']}/places"
        several = await client.post(
            url,
            json={"chosen": rows[0], "result_count": 5, "tags": ["Coffee"]},
        )
        one = await client.post(url, json={"chosen": rows[1], "result_count": 1})
        again = await client.post(url, json={"chosen": rows[1], "result_count": 1})
        shown = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
    assert several.status_code == 201
    entry = several.json()
    assert entry["kind"] == "place"
    assert entry["state"] == "check"
    assert entry["payload"]["name"] == "Starbucks"
    assert entry["payload"]["city"] == "denver"
    assert entry["payload"]["tags"] == ["coffee"]
    assert entry["payload"]["lat"] == pytest.approx(39.7477731)
    assert entry["chosen"]["source_id"] == rows[0]["source_id"]
    assert entry["chosen"]["attribution"] == ATTRIBUTION
    assert one.json()["state"] == "ready"
    assert again.status_code == 409
    assert len(shown["entries"]) == 2


@pytest.mark.asyncio
async def test_typed_place_is_ready_when_the_coordinates_parse(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        url = f"/api/intake/sittings/{sitting['id']}/places"
        good = await client.post(
            url, json={"name": "My tree", "coords": "39.75, -104.99"}
        )
        bad = await client.post(url, json={"name": "My rock", "coords": "nope"})
        nameless = await client.post(url, json={"coords": "39.75, -104.99"})
        wrong_tag = await client.post(
            url, json={"name": "A", "coords": "39.7, -104.9", "tags": ["nope"]}
        )
    assert good.status_code == 201
    assert good.json()["state"] == "ready"
    assert good.json()["payload"]["lat"] == pytest.approx(39.75)
    assert good.json()["chosen"] is None
    assert bad.json()["state"] == "check"
    assert nameless.status_code == 422
    assert wrong_tag.status_code == 422


@pytest.mark.asyncio
async def test_sitting_rules(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        kindless = await client.post("/api/intake/sittings", json={"area": "places"})
        in_shelf = await new_sitting(client, area="shelf")
        shelf = (await new_sitting(client, kind="game", area="shelf")).json()
        refused = await client.post(
            f"/api/intake/sittings/{shelf['id']}/places",
            json={"name": "A", "coords": "39.7, -104.9"},
        )
    assert kindless.status_code == 422
    assert in_shelf.status_code == 422
    assert refused.status_code == 409
