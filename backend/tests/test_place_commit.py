"""Committing place entries to private spots (story #340, task 5).

No live network: search rows come from the recorded fixtures. Bad stored
entries are built straight in the database, since the routes refuse them.
"""

from __future__ import annotations

import json
import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from intake import commit as commit_module
from intake.commit import commit_one
from models import (
    CandidateSource,
    IntakeArea,
    IntakeEntry,
    IntakeEntryState,
    IntakeSitting,
    Spot,
)
from spot_sources.nominatim import parse_results
from tests.test_intake_kinds import client_for
from tests.test_place_kind import add_spot, new_sitting, row_for

FIXTURES = Path(__file__).parent / "fixtures"
TODAY = date(2026, 11, 17)


def one_row() -> dict:
    raw = json.loads((FIXTURES / "nominatim_one.json").read_text())["results"]
    return row_for(parse_results(raw)[0])


async def spots_in(factory) -> list[Spot]:
    async with factory() as session:
        return list((await session.scalars(select(Spot).order_by(Spot.name))).all())


async def typed(client, sitting_id, name="My tree", coords="39.75, -104.99", **extra):
    response = await client.post(
        f"/api/intake/sittings/{sitting_id}/places",
        json={"name": name, "coords": coords, **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def stored_entry(factory, sitting_id, payload, chosen=None, state="ready"):
    async with factory() as session:
        entry = IntakeEntry(
            sitting_id=sitting_id,
            kind="place",
            state=IntakeEntryState(state),
            payload=payload,
            chosen=chosen,
        )
        session.add(entry)
        await session.commit()
        return entry.id


async def stored_sitting(factory) -> uuid.UUID:
    async with factory() as session:
        sitting = IntakeSitting(area=IntakeArea.PLACES, kind="place")
        session.add(sitting)
        await session.commit()
        return sitting.id


@pytest.mark.asyncio
async def test_a_ready_search_place_becomes_a_private_spot(sessionmaker_for_test):
    row = one_row()
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        added = await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={
                "chosen": row,
                "result_count": 1,
                "tags": ["coffee"],
                "blurb": "Big stage.",
                "neighbourhood": "Morrison",
            },
        )
        assert added.json()["state"] == "ready"
        done = await client.post(f"/api/intake/sittings/{sitting['id']}/commit")
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["added"] == 1
    assert [s["name"] for s in body["spots_new"]] == [row["title"]]
    assert body["spots_owned"] == []
    [spot] = await spots_in(sessionmaker_for_test)
    assert body["spots_new"][0]["id"] == str(spot.id)
    assert spot.is_public is False
    assert spot.city == "denver"
    assert spot.tags == ["coffee"]
    assert spot.blurb == "Big stage."
    assert spot.neighbourhood == "Morrison"
    assert spot.source is CandidateSource.OSM
    assert spot.source_id == row["source_id"]
    assert spot.lat == pytest.approx(row["lat"])
    assert spot.lng == pytest.approx(row["lng"])
    assert spot.anchor is False


@pytest.mark.asyncio
async def test_a_check_place_is_not_written(sessionmaker_for_test):
    row = one_row()
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        sid = sitting["id"]
        await client.post(
            f"/api/intake/sittings/{sid}/places",
            json={"chosen": row, "result_count": 3},
        )
        await typed(client, sid, "My tree")
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
    assert done.status_code == 200
    assert done.json()["skipped_kept"] == 1
    assert [s.name for s in await spots_in(sessionmaker_for_test)] == ["My tree"]
    assert (await spots_in(sessionmaker_for_test))[0].source is None


@pytest.mark.asyncio
async def test_a_place_with_bad_stored_coordinates_is_refused_and_nothing_is_written(
    sessionmaker_for_test,
):
    sid = await stored_sitting(sessionmaker_for_test)
    await stored_entry(
        sessionmaker_for_test, sid, {"name": "Fine", "lat": 39.7, "lng": -104.9}
    )
    bad = await stored_entry(
        sessionmaker_for_test, sid, {"name": "Broken", "lat": 123.0, "lng": -104.9}
    )
    async with client_for(sessionmaker_for_test) as client:
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
    assert done.status_code == 422
    body = done.json()
    assert body["refused"][0]["entry_id"] == str(bad)
    assert body["detail"]
    assert "spots_new" not in body
    assert await spots_in(sessionmaker_for_test) == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload, chosen",
    [
        ({"name": "  ", "lat": 39.7, "lng": -104.9}, None),
        ({"name": "A", "lat": "39.7", "lng": -104.9}, None),
        ({"name": "A", "lat": True, "lng": -104.9}, None),
        ({"name": "A", "lat": 39.7, "lng": -104.9, "tags": ["nope"]}, None),
        ({"name": "A", "lat": 39.7, "lng": -104.9, "is_public": "yes"}, None),
        (
            {"name": "A", "lat": 39.7, "lng": -104.9},
            {"source": "osm", "source_id": "not-an-id"},
        ),
    ],
)
async def test_the_commit_validates_a_stored_entry_again(
    sessionmaker_for_test, payload, chosen
):
    sid = await stored_sitting(sessionmaker_for_test)
    await stored_entry(sessionmaker_for_test, sid, payload, chosen)
    async with client_for(sessionmaker_for_test) as client:
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
    assert done.status_code == 422, done.text
    assert done.json()["refused"]
    assert await spots_in(sessionmaker_for_test) == []


@pytest.mark.asyncio
async def test_public_is_written_only_for_a_denver_place_with_the_flag(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        sid = sitting["id"]
        await typed(client, sid, "Private one", "39.70, -104.90")
        await typed(client, sid, "Public one", "39.80, -104.80", is_public=True)
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
    assert done.status_code == 200
    by_name = {s.name: s for s in await spots_in(sessionmaker_for_test)}
    assert by_name["Private one"].is_public is False
    assert by_name["Public one"].is_public is True
    assert by_name["Public one"].city == "denver"


@pytest.mark.asyncio
async def test_a_public_place_outside_denver_is_refused(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        sid = sitting["id"]
        await typed(client, sid, "Fine", "39.70, -104.90")
        await typed(
            client,
            sid,
            "Boulder cafe",
            "40.01, -105.27",
            city="Boulder",
            is_public=True,
        )
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
        assert done.status_code == 422
        assert done.json()["refused"][0]["field"] == "is_public"
        assert await spots_in(sessionmaker_for_test) == []
        # The same place kept private is fine.
        sitting = (await new_sitting(client)).json()
        await typed(
            client, sitting["id"], "Boulder cafe", "40.01, -105.27", city="Boulder"
        )
        done = await client.post(f"/api/intake/sittings/{sitting['id']}/commit")
    assert done.status_code == 200
    [spot] = await spots_in(sessionmaker_for_test)
    assert (spot.city, spot.is_public) == ("boulder", False)


@pytest.mark.asyncio
async def test_a_denver_check_is_case_insensitive(sessionmaker_for_test):
    sid = await stored_sitting(sessionmaker_for_test)
    await stored_entry(
        sessionmaker_for_test,
        sid,
        {"name": "A", "lat": 39.7, "lng": -104.9, "city": "DENVER", "is_public": True},
    )
    async with client_for(sessionmaker_for_test) as client:
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
    assert done.status_code == 200, done.text
    [spot] = await spots_in(sessionmaker_for_test)
    assert (spot.city, spot.is_public) == ("denver", True)


@pytest.mark.asyncio
async def test_a_place_already_owned_by_source_id_is_not_created_again(
    sessionmaker_for_test,
):
    row = one_row()
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"chosen": row, "result_count": 1},
        )
        # Owned after it was added to the sitting, as a concurrent write would.
        await add_spot(
            sessionmaker_for_test,
            name="Somewhere else entirely",
            lat=10.0,
            lng=10.0,
            source=CandidateSource.OSM,
            source_id=row["source_id"],
        )
        done = await client.post(f"/api/intake/sittings/{sitting['id']}/commit")
    assert done.status_code == 200, done.text
    body = done.json()
    assert (body["added"], body["already_owned"]) == (0, 1)
    assert body["spots_new"] == []
    assert [s["name"] for s in body["spots_owned"]] == ["Somewhere else entirely"]
    assert len(await spots_in(sessionmaker_for_test)) == 1


@pytest.mark.asyncio
async def test_owned_by_name_inside_75_metres_not_at_a_kilometre(
    sessionmaker_for_test,
):
    await add_spot(sessionmaker_for_test, name="Cafe Uno", lat=39.7500, lng=-104.9900)
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        sid = sitting["id"]
        # About 45 m away: owned. About 1.1 km away: its own place.
        await stored_entry(
            sessionmaker_for_test,
            uuid.UUID(sid),
            {"name": "Cafe Uno", "lat": 39.7504, "lng": -104.9900},
        )
        await stored_entry(
            sessionmaker_for_test,
            uuid.UUID(sid),
            {"name": "Cafe Uno", "lat": 39.7600, "lng": -104.9900},
        )
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
    body = done.json()
    assert (body["added"], body["already_owned"]) == (1, 1)
    assert len(body["spots_new"]) == 1
    assert len(body["spots_owned"]) == 1
    assert len(await spots_in(sessionmaker_for_test)) == 2


@pytest.mark.asyncio
async def test_two_identical_typed_places_in_a_sitting_make_one_spot(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        sid = sitting["id"]
        await typed(client, sid, "Twin Pines", "39.75, -104.99")
        await typed(client, sid, "Twin Pines", "39.75, -104.99")
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
    body = done.json()
    assert (body["added"], body["already_owned"]) == (1, 1)
    assert len(await spots_in(sessionmaker_for_test)) == 1


@pytest.mark.asyncio
async def test_committing_a_sitting_twice_writes_one_spot(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        sid = sitting["id"]
        await typed(client, sid)
        first = await client.post(f"/api/intake/sittings/{sid}/commit")
        second = await client.post(f"/api/intake/sittings/{sid}/commit")
    assert first.status_code == 200
    assert second.status_code == 409
    assert len(await spots_in(sessionmaker_for_test)) == 1


@pytest.mark.asyncio
async def test_the_add_bar_path_writes_once_and_reports_the_retry_as_owned(
    sessionmaker_for_test,
):
    payload = {"name": "Bar spot", "lat": 39.7, "lng": -104.9, "tags": ["coffee"]}
    async with sessionmaker_for_test() as session:
        first = await commit_one(
            session, "place", chosen=None, payload=payload, today=TODAY
        )
        await session.commit()
        second = await commit_one(
            session, "place", chosen=None, payload=payload, today=TODAY
        )
        await session.commit()
        bad = await commit_one(
            session,
            "place",
            chosen=None,
            payload={**payload, "name": "Elsewhere", "lat": 999},
            today=TODAY,
        )
    assert (first.added, first.already_owned) == (1, 0)
    assert (second.added, second.already_owned) == (0, 1)
    assert len(first.spots_new) == 1 and len(second.spots_owned) == 1
    assert bad.refused and bad.added == 0
    assert len(await spots_in(sessionmaker_for_test)) == 1


@pytest.mark.asyncio
async def test_the_commit_takes_the_place_lock_before_checking_owned(
    sessionmaker_for_test, monkeypatch
):
    seen: list[str] = []
    real = commit_module.lock_place_commits

    async def spy(session):
        seen.append("lock")
        await real(session)

    monkeypatch.setattr(commit_module, "lock_place_commits", spy)
    sid = await stored_sitting(sessionmaker_for_test)
    await stored_entry(
        sessionmaker_for_test, sid, {"name": "A", "lat": 39.7, "lng": -104.9}
    )
    async with client_for(sessionmaker_for_test) as client:
        await client.post(f"/api/intake/sittings/{sid}/commit")
    assert seen == ["lock"]


@pytest.mark.asyncio
async def test_public_spots_are_unchanged_by_a_committed_private_place(
    sessionmaker_for_test,
):
    from tests.test_public_outputs import client_for as public_client

    await add_spot(
        sessionmaker_for_test,
        name="Huckleberry",
        lat=39.7527,
        lng=-105.0002,
        is_public=True,
        tags=["coffee"],
    )
    async with public_client(sessionmaker_for_test) as pub:
        before = (await pub.get("/api/public/spots")).json()
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        await typed(client, sitting["id"], "Private find", "39.70, -104.90")
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/places",
            json={"chosen": one_row(), "result_count": 1},
        )
        assert (
            await client.post(f"/api/intake/sittings/{sitting['id']}/commit")
        ).status_code == 200
    async with public_client(sessionmaker_for_test) as pub:
        after = (await pub.get("/api/public/spots")).json()
    assert after == before
    assert len(await spots_in(sessionmaker_for_test)) == 3


@pytest.mark.asyncio
async def test_a_bad_chosen_position_cannot_override_the_validated_one(
    sessionmaker_for_test,
):
    sid = await stored_sitting(sessionmaker_for_test)
    await stored_entry(
        sessionmaker_for_test,
        sid,
        {"name": "A", "lat": 39.7, "lng": -104.9},
        {"source": "osm", "source_id": "way/5", "lat": 999, "lng": 999, "title": "Z"},
    )
    async with client_for(sessionmaker_for_test) as client:
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
    assert done.status_code == 200, done.text
    [spot] = await spots_in(sessionmaker_for_test)
    assert (spot.name, spot.lat, spot.lng) == ("A", 39.7, -104.9)


@pytest.mark.asyncio
async def test_a_bad_stored_latitude_is_refused_under_coords_not_source_id(
    sessionmaker_for_test,
):
    sid = await stored_sitting(sessionmaker_for_test)
    await stored_entry(
        sessionmaker_for_test,
        sid,
        {"name": "A", "lat": 999, "lng": -104.9},
        {"source": "osm", "source_id": "way/5", "lat": 39.7, "lng": -104.9},
    )
    async with client_for(sessionmaker_for_test) as client:
        done = await client.post(f"/api/intake/sittings/{sid}/commit")
    assert done.status_code == 422
    assert [r["field"] for r in done.json()["refused"]] == ["coords"]


@pytest.mark.asyncio
async def test_the_commit_stores_the_normalised_city_and_keeps_the_old_refusal(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await new_sitting(client)).json()
        await typed(
            client,
            sitting["id"],
            "Pearl cafe",
            "40.01, -105.27",
            city="  Boulder ",
            is_public=True,
        )
        done = await client.post(f"/api/intake/sittings/{sitting['id']}/commit")
        assert done.status_code == 422
        assert (
            done.json()["refused"][0]["message"] == "Only a Denver place can be public"
        )
        sitting = (await new_sitting(client)).json()
        await typed(
            client, sitting["id"], "Pearl cafe", "40.01, -105.27", city="  Boulder "
        )
        done = await client.post(f"/api/intake/sittings/{sitting['id']}/commit")
    assert done.status_code == 200
    [spot] = await spots_in(sessionmaker_for_test)
    assert spot.city == "boulder"
