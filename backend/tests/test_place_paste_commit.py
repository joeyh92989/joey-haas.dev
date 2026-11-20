"""A pasted sitting through the real routes, to its commit (story #342, task 3).

Paste, resolve and pick run through the routes, with `nominatim.search` faked
by a table of answers; the commit is the sitting's own commit route. Nothing
touches the network.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from intake import place_kind
from models import CandidateSource, IntakeEntry, IntakeSitting, Spot
from spot_sources import nominatim
from spot_sources.nominatim import SearchOk
from tests.test_intake_kinds import client_for
from tests.test_place_kind import add_spot
from tests.test_place_paste import (
    LONG_PLACE,
    _NoClient,
    hit,
    paste,
    pick_url,
    resolve_url,
    sitting_of,
)


@pytest.fixture(autouse=True)
def fake_search(monkeypatch):
    """Answers by query text; an unknown query is a failure of the test."""
    answers: dict[str, SearchOk] = {}
    calls: list[str] = []

    async def search(client, query):
        calls.append(query)
        return answers[query]

    monkeypatch.setattr(place_kind, "http_client", lambda: _NoClient())
    monkeypatch.setattr(nominatim, "search", search)
    search.answers, search.calls = answers, calls
    return search


def sitting_url(sitting, tail=""):
    return f"/api/intake/sittings/{sitting['id']}{tail}"


async def build(client, fake_search, factory):
    """The sitting every test below starts from: nine lines of five kinds."""
    await add_spot(
        factory,
        name="Saved Place",
        lat=hit(7).lat,
        lng=hit(7).lng,
        source=CandidateSource.OSM,
        source_id="node/1007",
    )
    fake_search.answers.update(
        {
            "Union Station": SearchOk([hit(1, "Union Station")]),
            "Saved Place": SearchOk([hit(7, "Saved Place")]),
            "Union Station again": SearchOk([hit(1, "Union Station")]),
            "cafe": SearchOk([hit(2), hit(3), hit(4)]),
        }
    )
    lines = [
        LONG_PLACE,  # coordinates link with a name -> ready, no source_id
        "Union Station",  # one hit -> ready
        "cafe",  # several hits -> check, then picked
        "Saved Place",  # one hit already saved -> owned
        "Union Station again",  # same place as the second line -> ignored
        "39.7392, -104.9903",  # bare pair -> check
        "Still waiting",  # never looked up -> reading
        "",
        "union   station",  # duplicate
    ]
    sitting = await sitting_of(client)
    body = (await paste(client, sitting, "\n".join(lines))).json()
    assert (body["added"], body["blank"], body["duplicates"]) == (7, 1, 1)
    by_line = {e["payload"]["source_line"]: e for e in body["entries"]}
    for line in ("Union Station", "cafe", "Saved Place", "Union Station again"):
        resolved = await client.post(resolve_url(by_line[line]))
        assert resolved.status_code == 200
    await client.post(pick_url(by_line["cafe"]), json={"index": 0})
    return sitting


async def states_of(client, sitting):
    shown = (await client.get(sitting_url(sitting))).json()
    return {e["payload"]["source_line"]: e["state"] for e in shown["entries"]}, shown


@pytest.mark.asyncio
async def test_a_pasted_sitting_commits_ready_places_and_keeps_the_rest(
    fake_search, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await build(client, fake_search, sessionmaker_for_test)
        states, _ = await states_of(client, sitting)
        assert states == {
            LONG_PLACE[:300]: "ready",
            "Union Station": "ready",
            "cafe": "ready",
            "Saved Place": "owned",
            "Union Station again": "ignored",
            "39.7392, -104.9903": "check",
            "Still waiting": "reading",
        }
        response = await client.post(sitting_url(sitting, "/commit"))
        after = await client.get(sitting_url(sitting))
        again = await client.post(sitting_url(sitting, "/commit"))
    body = response.json()
    assert response.status_code == 200, body
    assert sorted(s["name"] for s in body["spots_new"]) == [
        "Cafe 2",
        "Red Rocks Amphitheatre",
        "Union Station",
    ]
    assert body["spots_owned"] == []  # the owned line was settled at resolve
    assert body["skipped_kept"] == 2
    assert body["refused"] == []
    # Only the two kept entries survive, in paste order.
    kept = after.json()["entries"]
    assert [e["state"] for e in kept] == ["check", "reading"]
    assert [e["payload"]["source_line"] for e in kept] == [
        "39.7392, -104.9903",
        "Still waiting",
    ]
    async with sessionmaker_for_test() as session:
        spots = {s.name: s for s in (await session.scalars(select(Spot))).all()}
    assert set(spots) == {
        "Saved Place",
        "Cafe 2",
        "Red Rocks Amphitheatre",
        "Union Station",
    }
    rocks = spots["Red Rocks Amphitheatre"]
    assert rocks.source_id is None and rocks.is_public is False
    for name, source_id in (("Union Station", "node/1001"), ("Cafe 2", "node/1002")):
        assert spots[name].source is CandidateSource.OSM
        assert spots[name].source_id == source_id
        assert spots[name].is_public is False
    # What is left cannot be committed: nothing to add.
    assert again.status_code == 409
    assert again.json()["detail"]  # NothingToAdd: only to-check entries are left


@pytest.mark.asyncio
async def test_committing_again_writes_nothing_new(fake_search, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await build(client, fake_search, sessionmaker_for_test)
        first = await client.post(sitting_url(sitting, "/commit"))
        async with sessionmaker_for_test() as session:
            before = len((await session.scalars(select(Spot))).all())
        second = await client.post(sitting_url(sitting, "/commit"))
        async with sessionmaker_for_test() as session:
            after = len((await session.scalars(select(Spot))).all())
    assert first.status_code == 200
    assert second.status_code == 409
    assert before == after == 4


@pytest.mark.asyncio
async def test_a_sitting_of_only_check_entries_cannot_commit(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        await paste(client, sitting, "39.7392, -104.9903\nhttps://maps.app.goo.gl/x")
        response = await client.post(sitting_url(sitting, "/commit"))
        async with sessionmaker_for_test() as session:
            spots = (await session.scalars(select(Spot))).all()
            entries = (await session.scalars(select(IntakeEntry))).all()
    assert response.status_code == 409
    assert spots == []
    assert len(entries) == 2


@pytest.mark.asyncio
async def test_a_non_denver_public_pasted_place_is_refused_and_writes_nothing(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        [entry] = (await paste(client, sitting, LONG_PLACE)).json()["entries"]
        patched = await client.patch(
            f"/api/intake/entries/{entry['id']}",
            json={"payload": {"is_public": True, "city": "boulder"}},
        )
        response = await client.post(sitting_url(sitting, "/commit"))
        async with sessionmaker_for_test() as session:
            spots = (await session.scalars(select(Spot))).all()
            kept = await session.get(IntakeSitting, sitting["id"])
    assert patched.status_code == 200
    assert response.status_code == 422
    body = response.json()
    assert "to fix" in body["detail"]
    assert [r["entry_id"] for r in body["refused"]] == [entry["id"]]
    assert spots == []
    assert kept is not None  # still there to fix


@pytest.mark.asyncio
async def test_the_sitting_read_carries_what_the_page_needs(
    fake_search, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await build(client, fake_search, sessionmaker_for_test)
        shown = (await client.get(sitting_url(sitting))).json()
    assert set(shown) == {"id", "area", "kind", "label", "step", "photos", "entries"}
    assert (shown["area"], shown["kind"]) == ("places", "place")
    entries = shown["entries"]
    # Paste order, stable: the lines as pasted, blank and duplicate dropped.
    assert [e["payload"]["source_line"] for e in entries] == [
        LONG_PLACE[:300],
        "Union Station",
        "cafe",
        "Saved Place",
        "Union Station again",
        "39.7392, -104.9903",
        "Still waiting",
    ]
    for entry in entries:
        assert {"id", "kind", "state", "payload", "chosen", "candidates"} <= set(entry)
        assert {"name", "source_line"} <= set(entry["payload"])
        if entry["state"] in ("ready", "owned", "ignored"):
            assert {"lat", "lng"} <= set(entry["payload"])
    by_line = {e["payload"]["source_line"]: e for e in entries}
    assert by_line["Union Station"]["chosen"]["source_id"] == "node/1001"
    assert by_line["cafe"]["payload"]["searched_as"] == "cafe"
    assert by_line["Saved Place"]["payload"]["owned_spot_id"]
    assert by_line["Saved Place"]["payload"]["note"] == "Already on your list"
    assert (
        by_line["Union Station again"]["payload"]["note"]
        == "same place as another line"
    )
    assert by_line["Still waiting"]["payload"]["attempts"] == 0
    counts: dict[str, int] = {}
    for entry in entries:
        counts[entry["state"]] = counts.get(entry["state"], 0) + 1
    assert counts == {"ready": 3, "owned": 1, "ignored": 1, "check": 1, "reading": 1}


@pytest.mark.asyncio
async def test_an_open_places_sitting_is_found_again_with_its_counts(
    fake_search, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await build(client, fake_search, sessionmaker_for_test)
        shelf = (
            await client.post("/api/intake/sittings", json={"area": "shelf"})
        ).json()
        listed = (
            await client.get("/api/intake/sittings", params={"area": "places"})
        ).json()
        shelf_list = (
            await client.get("/api/intake/sittings", params={"area": "shelf"})
        ).json()
        counts_before = (await client.get("/api/intake/counts")).json()
        await client.post(sitting_url(sitting, "/commit"))
        still = (
            await client.get("/api/intake/sittings", params={"area": "places"})
        ).json()
        # A sitting with nothing left is deleted by its commit and drops out.
        clean = await sitting_of(client)
        await paste(client, clean, LONG_PLACE)
        await client.post(sitting_url(clean, "/commit"))
        final = (
            await client.get("/api/intake/sittings", params={"area": "places"})
        ).json()
    [row] = listed
    assert row["id"] == sitting["id"]
    assert (row["area"], row["kind"]) == ("places", "place")
    assert row["entries"]["ready"] == 3
    assert row["entries"]["owned"] == 1
    assert row["entries"]["ignored"] == 1
    assert row["entries"]["check"] == 1
    assert row["entries"]["reading"] == 1
    assert "created_at" in row and "updated_at" in row
    assert [r["id"] for r in shelf_list] == [shelf["id"]]
    assert counts_before["places"] == 1  # the one CHECK entry; meaning unchanged
    [after] = still
    assert (after["entries"]["check"], after["entries"]["reading"]) == (1, 1)
    assert after["entries"]["ready"] == 0
    assert [r["id"] for r in final] == [sitting["id"]]
