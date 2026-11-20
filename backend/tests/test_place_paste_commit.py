"""A pasted sitting through the real routes, to its commit (story #342, task 3).

Paste, resolve and pick run through the routes, with `nominatim.search` faked
by a table of answers; the commit is the sitting's own commit route. Nothing
touches the network.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import event, select

from intake import place_kind
from models import CandidateSource, IntakeEntry, IntakeSitting, Spot, Visit
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


# --- past outings by paste (story #350) --------------------------------------

NOW = date(2026, 11, 19)


@pytest.fixture
def frozen_day(monkeypatch):
    """The owner's day, frozen: the outing paste and commit read no other clock."""
    monkeypatch.setattr(place_kind, "owner_today", lambda: NOW)
    return NOW


async def paste_outings(client, sitting, text, **extra):
    return await client.post(
        sitting_url(sitting, "/paste"), json={"text": text, "outings": True, **extra}
    )


async def counts(factory):
    async with factory() as session:
        return (
            len((await session.scalars(select(Spot))).all()),
            len((await session.scalars(select(Visit))).all()),
        )


async def visits_of(factory):
    async with factory() as session:
        rows = (await session.scalars(select(Visit).order_by(Visit.visited_on))).all()
        return [(v.visited_on, v.precision.value, v.title, v.verdict) for v in rows]


@pytest.mark.asyncio
async def test_an_outings_paste_makes_one_entry_per_line_with_no_search(
    frozen_day, sessionmaker_for_test
):
    text = "\n".join(
        [
            "Coors Field, June 14, 2024",
            "Smith, Jones Park, 2023",
            "Union Station",
            "Red Rocks, last summer",
            "Coors Field, 2019",  # the same place on another date
            "Coors Field, June 14, 2024",  # a repeated line
        ]
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        response = await paste_outings(client, sitting, text, city="Boulder")
    body = response.json()
    assert response.status_code == 200, body
    assert (body["added"], body["duplicates"]) == (5, 1)
    by_line = {e["payload"]["source_line"]: e for e in body["entries"]}
    coors = by_line["Coors Field, June 14, 2024"]
    assert coors["state"] == "reading"
    assert coors["payload"]["name"] == "Coors Field"
    assert coors["payload"]["city"] == "boulder"
    assert coors["payload"]["is_public"] is False
    assert coors["payload"]["outing"] == {
        "date_text": "June 14, 2024",
        "visited_on": "2024-06-14",
        "precision": "day",
        "skip": False,
    }
    assert coors["outing"]["label"] == "June 14, 2024"
    assert by_line["Coors Field, 2019"]["payload"]["name"] == "Coors Field"
    assert by_line["Coors Field, 2019"]["outing"]["label"] == "2019"
    assert by_line["Smith, Jones Park, 2023"]["payload"]["name"] == "Smith, Jones Park"
    undated = by_line["Union Station"]["payload"]["outing"]
    assert (undated["date_text"], undated["visited_on"], undated["precision"]) == (
        None,
        None,
        None,
    )
    unread = by_line["Red Rocks, last summer"]
    assert unread["payload"]["outing"]["date_text"] == "last summer"
    assert unread["payload"]["outing"]["visited_on"] is None
    assert unread["outing"]["label"] is None


@pytest.mark.asyncio
async def test_a_plain_paste_is_unchanged_and_outings_repeats_are_by_whole_line(
    frozen_day, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        plain = (await paste(client, sitting, "Union Station, 2023")).json()
        # The city and the flag are the outings paste's alone.
        other = await sitting_of(client)
        ignored = (
            await client.post(
                sitting_url(other, "/paste"),
                json={"text": "Union Station", "city": "Boulder"},
            )
        ).json()
        outings = await sitting_of(client)
        first = await paste_outings(client, outings, "Union Station, 2023")
        repeat = await paste_outings(client, outings, "Union Station, 2023")
        other_date = await paste_outings(client, outings, "Union Station, 2021")
    [entry] = plain["entries"]
    assert "outing" not in entry["payload"] and "outing" not in entry
    assert entry["payload"]["name"] == "Union Station, 2023"
    assert ignored["entries"][0]["payload"]["city"] == "denver"
    assert first.json()["added"] == 1
    assert (repeat.json()["added"], repeat.json()["duplicates"]) == (0, 1)
    assert other_date.json()["added"] == 1  # same place, another date


@pytest.mark.asyncio
async def test_a_bad_city_is_refused_on_paste(frozen_day, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        long = await paste_outings(client, sitting, "Coors Field, 2024", city="x" * 60)
    assert long.status_code == 422


@pytest.mark.asyncio
async def test_a_logged_outing_is_flagged_in_one_query_and_skipped(
    frozen_day, engine, sessionmaker_for_test
):
    spot_id = await add_spot(
        sessionmaker_for_test,
        name="Red Rocks Amphitheatre",
        lat=39.665,
        lng=-105.2058,
    )
    async with sessionmaker_for_test() as session:
        session.add_all(
            [
                Visit(spot_id=spot_id, visited_on=date(2024, 6, 14), precision="day"),
                Visit(spot_id=spot_id, visited_on=date(2023, 7, 1), precision="month"),
            ]
        )
        await session.commit()
    text = "\n".join(
        [
            f"{LONG_PLACE}, June 14, 2024",  # logged: same day
            f"{LONG_PLACE}, June 2024",  # a day is logged inside it: not a repeat
            f"{LONG_PLACE}, July 2023",  # logged: same month
            f"{LONG_PLACE}, 2023-07-09",  # a day inside a logged month: not a repeat
        ]
    )
    seen: list[str] = []

    def record(conn, cursor, statement, *args):
        if "FROM visits" in statement:
            seen.append(statement)

    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        event.listen(engine.sync_engine, "before_cursor_execute", record)
        try:
            response = await paste_outings(client, sitting, text)
        finally:
            event.remove(engine.sync_engine, "before_cursor_execute", record)
    entries = response.json()["entries"]
    assert [e["state"] for e in entries] == ["owned"] * 4
    flags = [(e["outing"]["skip"], bool(e["outing"]["duplicate_of"])) for e in entries]
    assert flags == [(True, True), (False, False), (True, True), (False, False)]
    assert len(seen) == 1
    async with sessionmaker_for_test() as session:
        day = (
            await session.scalars(
                select(Visit).where(Visit.visited_on == date(2024, 6, 14))
            )
        ).one()
    assert entries[0]["outing"]["duplicate_of"] == str(day.id)


@pytest.mark.asyncio
async def test_the_date_edit_is_read_on_the_server_and_a_client_cannot_set_the_period(
    frozen_day, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        [entry] = (await paste_outings(client, sitting, "Coors Field, soon")).json()[
            "entries"
        ]
        url = f"/api/intake/entries/{entry['id']}"
        assert entry["outing"]["label"] is None
        fixed = await client.patch(url, json={"outing_date_text": "June 2024"})
        # Keys that are not the owner's are ignored, in the body and the payload.
        forged = await client.patch(
            url,
            json={
                "visited_on": "1999-01-01",
                "precision": "day",
                "payload": {
                    "outing": {"visited_on": "1999-01-01", "skip": True},
                    "name": "Coors Field",
                },
            },
        )
        skipped = await client.patch(url, json={"outing_skip": True})
        back = await client.patch(url, json={"outing_skip": False})
        unread = await client.patch(url, json={"outing_date_text": "6/7/24"})
        future = await client.patch(url, json={"outing_date_text": "2031"})
        too_long = await client.patch(url, json={"outing_date_text": "x" * 101})
        nulled = await client.patch(url, json={"outing_skip": None})
    assert fixed.status_code == 200
    assert fixed.json()["payload"]["outing"] == {
        "date_text": "June 2024",
        "visited_on": "2024-06-01",
        "precision": "month",
        "skip": False,
    }
    assert fixed.json()["outing"]["label"] == "June 2024"
    assert forged.json()["payload"]["outing"]["visited_on"] == "2024-06-01"
    assert forged.json()["payload"]["outing"]["skip"] is False
    assert skipped.json()["outing"]["skip"] is True
    assert back.json()["outing"]["skip"] is False
    assert unread.json()["outing"]["visited_on"] is None
    assert unread.json()["outing"]["date_text"] == "6/7/24"
    assert future.json()["outing"]["visited_on"] is None
    assert too_long.status_code == 422
    assert nulled.status_code == 422


@pytest.mark.asyncio
async def test_a_re_save_keeps_add_anyway_and_a_changed_date_resets_it(
    frozen_day, sessionmaker_for_test
):
    spot_id = await add_spot(
        sessionmaker_for_test,
        name="Red Rocks Amphitheatre",
        lat=39.665,
        lng=-105.2058,
    )
    async with sessionmaker_for_test() as session:
        session.add(
            Visit(spot_id=spot_id, visited_on=date(2024, 6, 14), precision="day")
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        [entry] = (
            await paste_outings(client, sitting, f"{LONG_PLACE}, June 14, 2024")
        ).json()["entries"]
        url = f"/api/intake/entries/{entry['id']}"
        assert entry["outing"]["skip"] is True
        anyway = await client.patch(url, json={"outing_skip": False})
        resaved = await client.patch(url, json={"outing_date_text": "June 14, 2024"})
        moved = await client.patch(url, json={"outing_date_text": "2024-06-15"})
        moved_back = await client.patch(url, json={"outing_date_text": "2024-06-14"})
    assert anyway.json()["outing"]["skip"] is False
    assert anyway.json()["outing"]["duplicate_of"]  # still known as a repeat
    assert resaved.json()["outing"]["skip"] is False  # the answer survives a re-save
    assert moved.json()["outing"]["duplicate_of"] is None
    assert moved.json()["outing"]["skip"] is False
    assert moved_back.json()["outing"]["skip"] is True  # a new repeat is skipped


@pytest.mark.asyncio
async def test_the_outing_edit_is_for_an_outing_entry_only(
    frozen_day, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        [plain] = (await paste(client, sitting, "Union Station")).json()["entries"]
        refused = await client.patch(
            f"/api/intake/entries/{plain['id']}", json={"outing_skip": True}
        )
    assert refused.status_code == 422


async def resolved_outings(client, text, **extra):
    """An outings sitting with every line looked up (answers in `fake_search`)."""
    sitting = await sitting_of(client)
    entries = (await paste_outings(client, sitting, text, **extra)).json()["entries"]
    for entry in entries:
        assert (await client.post(resolve_url(entry))).status_code == 200
    return sitting, entries


@pytest.mark.asyncio
async def test_resolve_keeps_the_outing_and_two_dates_of_one_place_are_both_ready(
    frozen_day, fake_search, sessionmaker_for_test
):
    fake_search.answers["Union Station"] = SearchOk([hit(1, "Union Station")])
    async with client_for(sessionmaker_for_test) as client:
        sitting, _ = await resolved_outings(
            client, "Union Station, 2023\nUnion Station, June 2024"
        )
        shown = (await client.get(sitting_url(sitting))).json()["entries"]
    assert [e["state"] for e in shown] == ["ready", "ready"]  # none IGNORED
    assert [e["outing"]["label"] for e in shown] == ["2023", "June 2024"]


@pytest.mark.asyncio
async def test_a_backfill_commit_writes_the_places_and_one_outing_each(
    frozen_day, fake_search, sessionmaker_for_test
):
    await add_spot(
        sessionmaker_for_test,
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
            "Left Out": SearchOk([hit(3, "Left Out")]),
        }
    )
    text = "\n".join(
        [
            "Union Station, 2023",
            "Union Station, June 14, 2024",
            "Saved Place, 2022-05",
            "Left Out, 2020",
            "Not found yet, 2021",  # never looked up: kept
        ]
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        entries = (await paste_outings(client, sitting, text, city="Boulder")).json()[
            "entries"
        ]
        for entry in entries[:4]:
            await client.post(resolve_url(entry))
        await client.patch(
            f"/api/intake/entries/{entries[3]['id']}", json={"outing_skip": True}
        )
        response = await client.post(sitting_url(sitting, "/commit"))
        kept = (await client.get(sitting_url(sitting))).json()["entries"]
    body = response.json()
    assert response.status_code == 200, body
    assert body["outings_new"] == 3
    assert [s["name"] for s in body["spots_new"]] == ["Union Station"]
    assert sorted(s["name"] for s in body["spots_owned"]) == [
        "Saved Place",
        "Union Station",
    ]
    assert body["skipped_kept"] == 1
    assert [e["payload"]["source_line"] for e in kept] == ["Not found yet, 2021"]
    assert await visits_of(sessionmaker_for_test) == [
        (date(2022, 5, 1), "month", None, None),
        (date(2023, 1, 1), "year", None, None),
        (date(2024, 6, 14), "day", None, None),
    ]
    async with sessionmaker_for_test() as session:
        spots = {s.name: s for s in (await session.scalars(select(Spot))).all()}
    assert set(spots) == {"Saved Place", "Union Station"}  # "Left Out" wrote nothing
    assert spots["Union Station"].city == "boulder"
    assert spots["Union Station"].is_public is False


@pytest.mark.asyncio
async def test_the_commit_reads_the_date_words_not_a_stored_period(
    frozen_day, fake_search, sessionmaker_for_test
):
    fake_search.answers["Union Station"] = SearchOk([hit(1, "Union Station")])
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await resolved_outings(client, "Union Station, 2023")
        async with sessionmaker_for_test() as session:
            row = await session.get(IntakeEntry, entry["id"])
            payload = dict(row.payload)
            payload["outing"] = {
                **payload["outing"],
                "visited_on": "1999-01-01",
                "precision": "day",
            }
            row.payload = payload
            await session.commit()
        response = await client.post(sitting_url(sitting, "/commit"))
    assert response.status_code == 200
    assert await visits_of(sessionmaker_for_test) == [
        (date(2023, 1, 1), "year", None, None)
    ]


@pytest.mark.asyncio
async def test_an_unread_date_refuses_the_whole_commit_and_writes_nothing(
    frozen_day, fake_search, sessionmaker_for_test
):
    fake_search.answers.update(
        {
            "Union Station": SearchOk([hit(1, "Union Station")]),
            "Cafe": SearchOk([hit(2, "Cafe")]),
        }
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting, entries = await resolved_outings(
            client, "Union Station, 2023\nCafe, last summer"
        )
        response = await client.post(sitting_url(sitting, "/commit"))
        counts_after = await counts(sessionmaker_for_test)
        still = await client.get(sitting_url(sitting))
        # Left out, the unread one no longer holds the commit.
        await client.patch(
            f"/api/intake/entries/{entries[1]['id']}", json={"outing_skip": True}
        )
        ok = await client.post(sitting_url(sitting, "/commit"))
    body = response.json()
    assert response.status_code == 422
    assert [r["entry_id"] for r in body["refused"]] == [entries[1]["id"]]
    assert body["refused"][0]["field"] == "date"
    assert "1 to fix" in body["detail"]
    assert body.get("outings_new", 0) == 0 and body.get("spots_new", []) == []
    assert counts_after == (0, 0)
    assert still.status_code == 200  # the sitting is still there
    assert ok.status_code == 200 and ok.json()["outings_new"] == 1


@pytest.mark.asyncio
async def test_a_refusal_after_the_places_are_written_rolls_everything_back(
    frozen_day, fake_search, monkeypatch, sessionmaker_for_test
):
    """The date is read by the owner's day, then built through `build_visit`,
    which reads the real clock. With the owner's day moved to 2100, "2099"
    reads, the spot is written, and `build_visit` refuses it: the spot written
    before the refusal has to go."""
    fake_search.answers["Union Station"] = SearchOk([hit(1, "Union Station")])
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await resolved_outings(client, "Union Station, 2023")
        monkeypatch.setattr(place_kind, "owner_today", lambda: date(2100, 1, 1))
        await client.patch(
            f"/api/intake/entries/{entry['id']}", json={"outing_date_text": "2099"}
        )
        before = await counts(sessionmaker_for_test)
        response = await client.post(sitting_url(sitting, "/commit"))
        after = await counts(sessionmaker_for_test)
        still = await client.get(sitting_url(sitting))
    assert response.status_code == 422
    assert response.json()["refused"][0]["field"] == "date"
    assert before == after == (0, 0)
    assert response.json().get("spots_new", []) == []
    assert still.status_code == 200


@pytest.mark.asyncio
async def test_a_bad_stored_city_refuses_the_commit_and_writes_nothing(
    frozen_day, fake_search, sessionmaker_for_test
):
    fake_search.answers["Union Station"] = SearchOk([hit(1, "Union Station")])
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await resolved_outings(client, "Union Station, 2023")
        async with sessionmaker_for_test() as session:
            row = await session.get(IntakeEntry, entry["id"])
            row.payload = {**row.payload, "city": "x" * 60}
            await session.commit()
        response = await client.post(sitting_url(sitting, "/commit"))
    assert response.status_code == 422
    assert await counts(sessionmaker_for_test) == (0, 0)


@pytest.mark.asyncio
async def test_an_already_logged_outing_writes_nothing(
    frozen_day, fake_search, sessionmaker_for_test
):
    spot_id = await add_spot(
        sessionmaker_for_test,
        name="Saved Place",
        lat=hit(7).lat,
        lng=hit(7).lng,
        source=CandidateSource.OSM,
        source_id="node/1007",
    )
    async with sessionmaker_for_test() as session:
        session.add(
            Visit(spot_id=spot_id, visited_on=date(2022, 5, 1), precision="month")
        )
        await session.commit()
    fake_search.answers["Saved Place"] = SearchOk([hit(7, "Saved Place")])
    async with client_for(sessionmaker_for_test) as client:
        sitting, _ = await resolved_outings(client, "Saved Place, May 2022")
        shown = (await client.get(sitting_url(sitting))).json()["entries"][0]
        first = await client.post(sitting_url(sitting, "/commit"))
    assert shown["state"] == "owned"
    assert shown["outing"]["skip"] is True and shown["outing"]["duplicate_of"]
    assert first.status_code == 200 and first.json().get("outings_new", 0) == 0
    assert await counts(sessionmaker_for_test) == (1, 1)
