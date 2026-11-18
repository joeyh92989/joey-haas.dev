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
        slug = fields.pop("slug", None) or fields["name"].lower().replace(" ", "-")
        spot = Spot(slug=slug, **fields)
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
    assert row["category"] == "Theatre"
    assert row["address"] == "18300 West Alameda Parkway, Morrison"
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
    assert bad.status_code == 422
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


# --- fix round 1 -------------------------------------------------------------


async def one_row(monkeypatch, client):
    patch_search(monkeypatch, SearchOk(hits("one")))
    body = (
        await client.get("/api/intake/search", params={"area": "places", "query": "x"})
    ).json()
    return body["results"][0]


@pytest.mark.asyncio
async def test_patch_edits_only_the_owner_fields(monkeypatch, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        sitting = (await new_sitting(client)).json()
        entry = (
            await client.post(
                f"/api/intake/sittings/{sitting['id']}/places",
                json={"chosen": row, "result_count": 1},
            )
        ).json()
        url = f"/api/intake/entries/{entry['id']}"
        patched = await client.patch(
            url,
            json={
                "state": "ready",
                "chosen": {"source_id": "node/1", "map_url": "https://evil.test/"},
                "payload": {
                    "name": "Red Rocks",
                    "tags": ["park"],
                    "blurb": "Loud.",
                    "city": "Denver",
                    "is_public": True,
                    "lat": 1.0,
                    "lng": 2.0,
                    "source_id": "node/1",
                    "map_url": "https://evil.test/",
                    "attribution": "x",
                    "owned_spot_id": "x",
                },
            },
        )
        bad_tag = await client.patch(url, json={"payload": {"tags": ["nope"]}})
        blank = await client.patch(url, json={"payload": {"name": "  "}})
    assert patched.status_code == 200
    shown = patched.json()
    assert shown["state"] == "ready"
    assert shown["chosen"] == entry["chosen"]
    assert shown["payload"]["name"] == "Red Rocks"
    assert shown["payload"]["tags"] == ["park"]
    assert shown["payload"]["blurb"] == "Loud."
    assert shown["payload"]["city"] == "denver"
    assert shown["payload"]["is_public"] is True
    assert shown["payload"]["lat"] == pytest.approx(39.6653917)
    assert shown["payload"]["lng"] == pytest.approx(-105.2057171)
    for key in ("source_id", "map_url", "attribution", "owned_spot_id"):
        assert key not in shown["payload"]
    assert bad_tag.status_code == 422
    assert blank.status_code == 422


@pytest.mark.asyncio
async def test_the_generic_entry_route_refuses_places(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/entries",
            json={"kind": "place", "payload": {"lat": 1}, "chosen": {"x": 1}},
        )
        shown = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
    assert response.status_code == 422
    assert "/places" in response.json()["detail"]
    assert shown["entries"] == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change",
    [
        {"lat": 91},
        {"lat": -91.5},
        {"lng": 181},
        {"lat": True},
        {"lng": "105"},
        {"lat": None},
        {"title": "   "},
        {"title": "x" * 201},
        {"category": "x" * 201},
        {"source_id": "way/abc"},
        {"source_id": "house/1"},
        {"source_id": "way/" + "1" * 60},
        {"source_id": 5},
    ],
)
async def test_a_bad_chosen_result_is_a_422(change, monkeypatch, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"chosen": {**row, **change}, "result_count": 1},
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_missing_lat_is_a_422(monkeypatch, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        row.pop("lat")
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"chosen": row, "result_count": 1},
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_the_map_url_is_rebuilt_by_the_server(monkeypatch, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={
                "chosen": {**row, "map_url": "https://evil.test/", "attribution": "x"},
                "result_count": 1,
            },
        )
    chosen = response.json()["chosen"]
    assert chosen["map_url"] == "https://www.openstreetmap.org/way/229359697"
    assert chosen["attribution"] == ATTRIBUTION


@pytest.mark.asyncio
async def test_the_same_hit_added_twice_is_one_entry(
    monkeypatch, sessionmaker_for_test
):
    # Sequential, not truly concurrent: the sitting row is locked
    # (SELECT ... FOR UPDATE) so a second request waits and then sees the first.
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        sitting = (await new_sitting(client)).json()
        url = f"/api/intake/sittings/{sitting['id']}/places"
        first = await client.post(url, json={"chosen": row, "result_count": 1})
        second = await client.post(url, json={"chosen": row, "result_count": 1})
        shown = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
    assert (first.status_code, second.status_code) == (201, 409)
    assert len(shown["entries"]) == 1


@pytest.mark.asyncio
async def test_the_server_rederives_owned_from_the_database(
    monkeypatch, sessionmaker_for_test
):
    await add_spot(
        sessionmaker_for_test,
        name="Red Rocks Amphitheatre",
        lat=39.66545,
        lng=-105.20565,
    )
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={
                "chosen": {**row, "owned_spot_id": None, "owned": False},
                "result_count": 1,
            },
        )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_a_client_sent_owned_flag_does_not_block(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={
                "chosen": {**row, "owned_spot_id": "made-up", "owned": True},
                "result_count": 1,
            },
        )
    assert response.status_code == 201
    assert "owned_spot_id" not in response.json()["chosen"]


@pytest.mark.asyncio
async def test_the_75_metre_limit_itself(monkeypatch, sessionmaker_for_test):
    # Same name 1 km north is not the place; ~50 m away is.
    far = await add_spot(
        sessionmaker_for_test,
        name="Red Rocks Amphitheatre",
        slug="red-rocks-far",
        lat=39.6653917 + 0.009,
        lng=-105.2057171,
    )
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        assert row["owned_spot_id"] is None
        sitting = (await new_sitting(client)).json()
        url = f"/api/intake/sittings/{sitting['id']}/places"
        added = await client.post(url, json={"chosen": row, "result_count": 1})
        near = await add_spot(
            sessionmaker_for_test,
            name="Red Rocks Amphitheatre",
            lat=39.6653917 + 0.00045,
            lng=-105.2057171,
        )
        row_after = await one_row(monkeypatch, client)
        refused = await client.post(
            url, json={"chosen": {**row, "source_id": None}, "result_count": 1}
        )
    assert added.status_code == 201
    assert row_after["owned_spot_id"] == near != far
    assert refused.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [-1, 101])
async def test_result_count_is_bounded(count, monkeypatch, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"chosen": row, "result_count": count},
        )
    assert response.status_code == 422


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -float("inf")])
def test_non_finite_coordinates_are_refused(bad):
    # httpx cannot even send these, so the check is covered directly.
    row = place_kind.row_for(hits("one")[0])
    for key in ("lat", "lng"):
        with pytest.raises(ValueError):
            place_kind.clean_chosen({**row, key: bad})


# --- fix round 2 -------------------------------------------------------------


@pytest.mark.asyncio
async def test_typed_bad_coordinates_create_no_entry(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"name": "My rock", "coords": "nope"},
        )
        shown = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
    assert response.status_code == 422
    assert "latitude" in response.json()["detail"]
    assert shown["entries"] == []


async def check_entry(monkeypatch, client):
    patch_search(monkeypatch, SearchOk(hits("several")))
    rows = (
        await client.get("/api/intake/search", params={"area": "places", "query": "s"})
    ).json()["results"]
    sitting = (await new_sitting(client)).json()
    entry = (
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"chosen": rows[0], "result_count": 5},
        )
    ).json()
    assert entry["state"] == "check"
    return sitting, entry


@pytest.mark.asyncio
async def test_a_check_entry_can_be_made_ready_and_back(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await check_entry(monkeypatch, client)
        url = f"/api/intake/entries/{entry['id']}"
        ready = await client.patch(url, json={"state": "ready"})
        shown = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
        back = await client.patch(url, json={"state": "check"})
    assert ready.status_code == 200 and ready.json()["state"] == "ready"
    assert shown["entries"][0]["state"] == "ready"
    assert back.json()["state"] == "check"


@pytest.mark.asyncio
async def test_ready_needs_a_stored_position(sessionmaker_for_test):
    from models import IntakeEntry, IntakeSitting

    async with sessionmaker_for_test() as session:
        sitting = IntakeSitting(area="places", kind="place")
        session.add(sitting)
        await session.flush()
        entry = IntakeEntry(
            sitting_id=sitting.id,
            kind="place",
            state=IntakeEntryState.CHECK,
            payload={"name": "No position", "coords": "nope"},
        )
        session.add(entry)
        await session.commit()
        entry_id = str(entry.id)
    async with client_for(sessionmaker_for_test) as client:
        url = f"/api/intake/entries/{entry_id}"
        # A request's own lat/lng never counts: only the stored payload does.
        refused = await client.patch(
            url, json={"state": "ready", "payload": {"lat": 39.7, "lng": -105.0}}
        )
        shown = await client.patch(url, json={"payload": {"name": "Still none"}})
    assert refused.status_code == 422
    assert "coordinates" in refused.json()["detail"]
    assert shown.json()["state"] == "check"


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["owned", "ignored", "typed", "exact", "nonsense"])
async def test_an_other_state_is_a_422(state, monkeypatch, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        _, entry = await check_entry(monkeypatch, client)
        response = await client.patch(
            f"/api/intake/entries/{entry['id']}", json={"state": state}
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_state_with_server_keys_still_changes_only_owner_fields(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        _, entry = await check_entry(monkeypatch, client)
        response = await client.patch(
            f"/api/intake/entries/{entry['id']}",
            json={
                "state": "ready",
                "chosen": {"source_id": "node/9"},
                "payload": {
                    "lat": 1.0,
                    "lng": 2.0,
                    "source_id": "node/9",
                    "map_url": "https://evil.test/",
                    "name": "Renamed",
                },
            },
        )
    shown = response.json()
    assert shown["state"] == "ready"
    assert shown["payload"]["name"] == "Renamed"
    assert shown["payload"]["lat"] == entry["payload"]["lat"]
    assert shown["payload"]["lng"] == entry["payload"]["lng"]
    assert "source_id" not in shown["payload"] and "map_url" not in shown["payload"]
    assert shown["chosen"] == entry["chosen"]


def hit_with(**changes):
    base = hits("one")[0]
    from dataclasses import replace

    return replace(base, **changes)


@pytest.mark.parametrize(
    ("kind", "category", "shown"),
    [
        ("tram_stop", "railway", "Tram stop"),
        ("bus_station", "amenity", "Bus station"),
        ("amphitheatre", "amenity", "Amphitheatre"),
        ("yes", "railway", "Railway"),
        ("", "tourism", "Tourism"),
        ("", "", ""),
    ],
)
def test_the_row_kind_is_the_humanized_type(kind, category, shown):
    assert place_kind.row_for(hit_with(type=kind, category=category))["category"] == (
        shown
    )


def test_the_recorded_rows_show_a_specific_kind_and_a_short_address():
    rows = [place_kind.row_for(hit) for hit in hits("several")]
    assert {row["category"] for row in rows} == {"Cafe"}
    assert rows[1]["address"] == "200 North Quebec Street, Denver"
    assert rows[0]["address"] == "East Montview Boulevard, Denver"
    assert "United States" not in "".join(row["address"] for row in rows)


@pytest.mark.parametrize(
    ("address", "shown"),
    [
        (
            {"house_number": "1", "road": "Main St", "town": "Golden"},
            "1 Main St, Golden",
        ),
        ({"road": "Main St", "village": "Morrison"}, "Main St, Morrison"),
        ({"hamlet": "Idaho"}, "Idaho"),
        ({"suburb": "Capitol Hill"}, "Capitol Hill"),
        ({"city": "Denver", "town": "X"}, "Denver"),
    ],
)
def test_short_address_orders_the_parts(address, shown):
    assert place_kind.short_address(hit_with(address=address)) == shown


def test_a_sparse_address_falls_back_to_the_display_name():
    hit = hit_with(
        address={},
        display_name=(
            "Big Park, Somewhere Road, Jefferson County, Colorado, United States"
        ),
    )
    assert place_kind.short_address(hit) == (
        "Somewhere Road, Jefferson County, Colorado"
    )


@pytest.mark.asyncio
async def test_a_long_address_is_cut_not_refused(monkeypatch, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        row = await one_row(monkeypatch, client)
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"chosen": {**row, "address": "x" * 500}, "result_count": 1},
        )
    assert response.status_code == 201, response.text
    assert response.json()["chosen"]["address"] == "x" * 200


def test_clean_chosen_still_refuses_a_non_text_address():
    with pytest.raises(ValueError):
        place_kind.clean_chosen({"title": "A", "lat": 1.0, "lng": 2.0, "address": 5})


def test_to_row_uses_the_commit_validators():
    row = place_kind.to_row(
        {
            "payload": {
                "name": "  Spot  ",
                "lat": 39.7,
                "lng": -104.9,
                "city": " Boulder ",
                "tags": ["coffee", "coffee"],
                "is_public": False,
            },
            "chosen": {"source_id": "way/1"},
        }
    )
    assert row["name"] == "Spot"
    assert row["city"] == "boulder"
    assert row["source_id"] == "way/1" and row["source"] == CandidateSource.OSM
    assert row["is_public"] is False


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "A", "lat": 999, "lng": 1},
        {"name": "", "lat": 1, "lng": 1},
        {"name": "A", "lat": 1, "lng": 1, "is_public": "yes"},
        {"name": "A", "lat": 1, "lng": 1, "city": "x" * 41},
    ],
)
def test_to_row_refuses_what_the_commit_refuses(payload):
    with pytest.raises(ValueError):
        place_kind.to_row({"payload": payload})


@pytest.mark.asyncio
async def test_a_null_payload_is_a_422_for_a_place(monkeypatch, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        _, entry = await check_entry(monkeypatch, client)
        response = await client.patch(
            f"/api/intake/entries/{entry['id']}", json={"payload": None}
        )
        after = await client.patch(
            f"/api/intake/entries/{entry['id']}", json={"state": "ready"}
        )
    assert response.status_code == 422
    assert after.status_code == 200
    assert after.json()["payload"] == entry["payload"]


# --- owner-facing text is cleaned like a pasted line (story #342, task 3) -----

HOSTILE = "a\u0000b​c‮d  e"  # NUL, zero-width space, bidi override
CLEANED = "abcd e"


@pytest.mark.asyncio
async def test_a_patch_with_hidden_characters_stores_the_cleaned_text(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        added = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"name": "My tree", "coords": "39.75, -104.99"},
        )
        response = await client.patch(
            f"/api/intake/entries/{added.json()['id']}",
            json={
                "payload": {
                    "name": HOSTILE,
                    "blurb": HOSTILE,
                    "city": HOSTILE,
                    "neighbourhood": HOSTILE,
                    "tags": ["Coffee\u0000", "​park"],
                }
            },
        )
    assert response.status_code == 200
    payload = response.json()["payload"]
    assert payload["name"] == CLEANED
    assert payload["blurb"] == CLEANED
    assert payload["city"] == CLEANED
    assert payload["neighbourhood"] == CLEANED
    assert payload["tags"] == ["coffee", "park"]


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["\u0000", "​‮", " \u0000 ​ "])
async def test_a_name_of_only_hidden_characters_is_a_422(name, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        added = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"name": "My tree", "coords": "39.75, -104.99"},
        )
        response = await client.patch(
            f"/api/intake/entries/{added.json()['id']}",
            json={"payload": {"name": name}},
        )
        typed = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"name": name, "coords": "39.75, -104.99"},
        )
    assert response.status_code == 422
    assert typed.status_code == 422


@pytest.mark.asyncio
async def test_the_typed_way_cleans_name_blurb_and_city(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={
                "name": HOSTILE,
                "coords": "39.75, -104.99",
                "blurb": HOSTILE,
                "city": HOSTILE,
            },
        )
    assert response.status_code == 201
    payload = response.json()["payload"]
    assert (payload["name"], payload["blurb"], payload["city"]) == (
        CLEANED,
        CLEANED,
        CLEANED,
    )


@pytest.mark.asyncio
async def test_a_hostile_search_result_is_cleaned_on_add(
    monkeypatch, sessionmaker_for_test
):
    patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        row = (
            await client.get(
                "/api/intake/search", params={"area": "places", "query": "x"}
            )
        ).json()["results"][0]
        sitting = (await new_sitting(client)).json()
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={
                "chosen": {
                    **row,
                    "title": HOSTILE,
                    "address": HOSTILE,
                    "category": HOSTILE,
                },
                "result_count": 1,
            },
        )
    assert response.status_code == 201
    body = response.json()
    assert body["payload"]["name"] == CLEANED
    assert body["chosen"]["title"] == CLEANED
    assert body["chosen"]["address"] == CLEANED
    assert body["chosen"]["category"] == CLEANED
