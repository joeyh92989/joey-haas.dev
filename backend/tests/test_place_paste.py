"""The paste way for places (story #342, task 2): paste, resolve and pick.

No live network: `nominatim.search` is replaced by a counting fake, or the
real `search` runs over a mock transport with the fake clock of
`test_nominatim.py`. The paste itself must make no request of any kind.
"""

from __future__ import annotations

import asyncio

import httpx2
import pytest
from sqlalchemy import select

from intake import place_kind
from models import IntakeEntry, IntakeEntryState, Spot
from sources.base import Throttle
from spot_sources import nominatim
from spot_sources.nominatim import PlaceHit, SearchFailure, SearchOk
from tests.test_intake_kinds import client_for
from tests.test_place_kind import add_spot, hits, new_sitting, patch_search

_REAL_SEARCH = nominatim.search  # captured at import, before any fixture patches it

LONG_PLACE = (
    "https://www.google.com/maps/place/Red+Rocks+Amphitheatre/@39.6654,-105.2057,17z"
    "/data=!3m1!4b1!4m6!3m5!1s0x876b8c1a:0x1!8m2!3d39.665!4d-105.2058!16zL20vMDIz"
)


def hit(i: int, name: str | None = None) -> PlaceHit:
    return PlaceHit(
        name=name or f"Cafe {i}",
        display_name=f"{name or f'Cafe {i}'}, Denver, Colorado, United States",
        lat=39.7 + i / 1000,
        lng=-104.9 - i / 1000,
        osm_type="node",
        osm_id=1000 + i,
        source_id=f"node/{1000 + i}",
        category="amenity",
        type="cafe",
        address={"road": "Main St", "city": "Denver"},
    )


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Anything that tries a real HTTP request, or builds a Nominatim client
    without a test saying so, fails the test. `search` is replaced per test."""

    def forbidden():
        raise AssertionError("an HTTP client was built")

    async def refused(self, request):
        raise AssertionError(f"an HTTP request was made: {request.url}")

    monkeypatch.setattr(place_kind, "http_client", forbidden)
    monkeypatch.setattr(httpx2.AsyncHTTPTransport, "handle_async_request", refused)

    async def no_search(client, query):
        raise AssertionError(f"an unexpected search: {query}")

    monkeypatch.setattr(nominatim, "search", no_search)

    class Nothing:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(place_kind, "http_client", lambda: Nothing())


async def paste(client, sitting, text):
    return await client.post(
        f"/api/intake/sittings/{sitting['id']}/paste", json={"text": text}
    )


async def sitting_of(client, **kw):
    return (await new_sitting(client, **kw)).json()


async def entries_of(factory, sitting):
    async with factory() as session:
        rows = (
            await session.scalars(
                select(IntakeEntry)
                .where(IntakeEntry.sitting_id == sitting["id"])
                .order_by(IntakeEntry.created_at, IntakeEntry.id)
            )
        ).all()
        return [(e.state.value, e.payload, e.chosen) for e in rows]


# --- paste -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_hundred_lines_make_a_hundred_entries_and_no_search(
    monkeypatch, sessionmaker_for_test
):
    fake = patch_search(monkeypatch)  # counts; it is never called
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        response = await paste(
            client, sitting, "\n".join(f"place {i}" for i in range(100))
        )
    body = response.json()
    assert response.status_code == 200
    assert (body["added"], body["blank"], body["duplicates"], body["over_limit"]) == (
        100,
        0,
        0,
        0,
    )
    assert len(body["entries"]) == 100
    assert {e["state"] for e in body["entries"]} == {"reading"}
    assert [e["payload"]["name"] for e in body["entries"]] == [
        f"place {i}" for i in range(100)
    ]
    assert fake.calls == []


@pytest.mark.asyncio
async def test_lines_of_every_kind_make_the_documented_states(sessionmaker_for_test):
    text = "\n".join(
        [
            LONG_PLACE,  # coords + name -> ready
            "39.7392, -104.9903",  # bare pair -> check
            "https://www.google.com/maps/@39.7,-104.8,17z",  # coords only -> check
            "https://www.google.com/maps?q=Union+Station",  # name link -> reading
            "Union Station",  # name -> reading
            "https://maps.app.goo.gl/abc123",  # short link -> check
            "x" * 301,  # too long -> check
            "",
            "union   station",  # duplicate
        ]
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        body = (await paste(client, sitting, text)).json()
    states = [e["state"] for e in body["entries"]]
    assert states == ["ready", "check", "check", "reading", "reading", "check", "check"]
    assert (body["blank"], body["duplicates"]) == (1, 1)
    ready, pair, atpair, namelink, name, short, long = body["entries"]
    assert ready["payload"] == {
        "name": "Red Rocks Amphitheatre",
        "lat": 39.665,
        "lng": -105.2058,
        "city": "denver",
        "tags": [],
        "blurb": None,
        "is_public": False,
        "source_line": LONG_PLACE[:300],
    }
    assert ready["chosen"] is None
    assert pair["payload"]["name"] == "Place at 39.73920, -104.99030"
    assert "needs a name" in pair["payload"]["note"]
    assert atpair["payload"]["name"] == "Place at 39.70000, -104.80000"
    assert namelink["payload"]["name"] == "Union Station"
    assert namelink["payload"]["attempts"] == 0
    assert name["payload"]["source_line"] == "Union Station"
    assert short["payload"]["name"] == "Short link from maps.app.goo.gl"
    assert "could not be read" in short["payload"]["note"]
    assert long["state"] == "check"
    assert long["payload"]["note"]
    assert len(long["payload"]["source_line"]) == 300


@pytest.mark.asyncio
async def test_a_short_link_is_never_fetched(sessionmaker_for_test):
    # The autouse `no_network` fixture fails any request or client build.
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        body = (
            await paste(
                client,
                sitting,
                "https://maps.app.goo.gl/xyz\nhttps://goo.gl/maps/abc\nhttps://g.co/maps/q",
            )
        ).json()
    assert [e["state"] for e in body["entries"]] == ["check"] * 3
    assert all("could not be read" in e["payload"]["note"] for e in body["entries"])


@pytest.mark.asyncio
async def test_250_lines_keep_200(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        body = (
            await paste(client, sitting, "\n".join(f"p{i}" for i in range(250)))
        ).json()
    assert (body["added"], body["over_limit"]) == (200, 50)


@pytest.mark.asyncio
async def test_a_sitting_at_300_entries_refuses_more(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        await paste(client, sitting, "\n".join(f"a{i}" for i in range(200)))
        second = (
            await paste(client, sitting, "\n".join(f"b{i}" for i in range(150)))
        ).json()
        assert (second["added"], second["over_limit"]) == (100, 50)
        third = (await paste(client, sitting, "c1\nc2")).json()
    assert (third["added"], third["over_limit"], third["entries"]) == (0, 2, [])
    assert len(await entries_of(sessionmaker_for_test, sitting)) == 300


@pytest.mark.asyncio
async def test_pasting_the_same_lines_twice_makes_no_duplicates(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        first = (await paste(client, sitting, "Union Station\nRed Rocks")).json()
        again = (
            await paste(client, sitting, "union  station\nRED ROCKS\nCivic Center")
        ).json()
    assert first["added"] == 2
    assert (again["added"], again["duplicates"]) == (1, 2)
    assert len(await entries_of(sessionmaker_for_test, sitting)) == 3


@pytest.mark.asyncio
async def test_entries_keep_the_pasted_order(sessionmaker_for_test):
    names = [f"stop {i}" for i in range(30)]
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        await paste(client, sitting, "\n".join(names))
        loaded = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
    assert [e["payload"]["name"] for e in loaded["entries"]] == names


@pytest.mark.asyncio
@pytest.mark.parametrize("area,kind", [("shelf", "game"), ("closet", "garment")])
async def test_paste_into_another_area_is_refused(area, kind, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client, kind=kind, area=area)
        response = await paste(client, sitting, "Union Station")
    assert response.status_code == 409
    assert await entries_of(sessionmaker_for_test, sitting) == []


@pytest.mark.asyncio
async def test_unknown_sitting_and_oversize_text(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        missing = await client.post(
            "/api/intake/sittings/00000000-0000-0000-0000-000000000000/paste",
            json={"text": "a"},
        )
        big = await paste(client, sitting, "a" * 80_001)
        edge = await paste(client, sitting, "a" * 80_000)
    assert missing.status_code == 404
    assert big.status_code == 422
    assert edge.status_code == 200


@pytest.mark.asyncio
async def test_a_pasted_pair_at_a_saved_place_is_owned(sessionmaker_for_test):
    spot_id = await add_spot(
        sessionmaker_for_test,
        name="Place at 39.70000, -104.90000",
        lat=39.7,
        lng=-104.9,
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        body = (await paste(client, sitting, "39.7, -104.9\n39.8, -104.8")).json()
    owned, fresh = body["entries"]
    assert owned["state"] == "owned"
    assert owned["payload"]["owned_spot_id"] == spot_id
    assert fresh["state"] == "check"


@pytest.mark.asyncio
async def test_signed_out_is_refused_on_all_three_routes(sessionmaker_for_test):
    zero = "00000000-0000-0000-0000-000000000000"
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        a = await client.post(f"/api/intake/sittings/{zero}/paste", json={"text": "a"})
        b = await client.post(f"/api/intake/entries/{zero}/resolve")
        c = await client.post(f"/api/intake/entries/{zero}/pick", json={"index": 0})
    assert (a.status_code, b.status_code, c.status_code) == (401, 401, 401)


# --- resolve -----------------------------------------------------------------


async def pasted(client, text="red rocks", **kw):
    sitting = await sitting_of(client, **kw)
    body = (await paste(client, sitting, text)).json()
    return sitting, body["entries"]


def resolve_url(entry):
    return f"/api/intake/entries/{entry['id']}/resolve"


@pytest.mark.asyncio
async def test_one_hit_is_ready_with_the_checked_position(
    monkeypatch, sessionmaker_for_test
):
    fake = patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        response = await client.post(resolve_url(entry))
    body = response.json()
    assert response.status_code == 200
    assert fake.calls == ["red rocks"]
    assert body["state"] == "ready"
    assert body["remaining"] == 0
    assert body["payload"]["name"] == "Red Rocks Amphitheatre"
    assert body["payload"]["lat"] == pytest.approx(39.6653917)
    assert body["payload"]["source_line"] == "red rocks"
    assert "candidates" not in body["payload"]
    assert body["chosen"]["source_id"] == "way/229359697"
    assert body["chosen"]["map_url"] == "https://www.openstreetmap.org/way/229359697"


@pytest.mark.asyncio
async def test_several_hits_store_at_most_five_candidates(
    monkeypatch, sessionmaker_for_test
):
    fake = patch_search(monkeypatch, SearchOk([hit(i) for i in range(8)]))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        body = (await client.post(resolve_url(entry))).json()
    assert len(fake.calls) == 1
    assert body["state"] == "check"
    assert body["payload"]["note"] == "8 places found"
    assert len(body["payload"]["candidates"]) == 5
    assert body["payload"]["candidates"][0]["source_id"] == "node/1000"
    assert body["chosen"] is None


@pytest.mark.asyncio
async def test_no_hits_is_check_with_a_note(monkeypatch, sessionmaker_for_test):
    patch_search(monkeypatch, SearchOk([]))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        body = (await client.post(resolve_url(entry))).json()
    assert body["state"] == "check"
    assert body["payload"]["note"] == "No place found. Change the words and look again."


@pytest.mark.asyncio
async def test_a_failure_waits_then_gives_up_after_two(
    monkeypatch, sessionmaker_for_test
):
    patch_search(
        monkeypatch, SearchFailure("timeout", "The place search took too long.")
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting, entries = await pasted(client, "a\nb")
        entry = entries[0]
        first = await client.post(resolve_url(entry))
        assert first.status_code == 200
        one = first.json()
        assert one["state"] == "reading"
        assert one["payload"]["attempts"] == 1
        assert one["payload"]["note"] == "The place search took too long."
        assert one["remaining"] == 2
        two = (await client.post(resolve_url(entry))).json()
    assert two["state"] == "check"
    assert two["payload"]["attempts"] == 2
    assert two["payload"]["note"] == "The search did not answer."
    assert two["remaining"] == 1


@pytest.mark.asyncio
async def test_an_exception_from_search_is_a_failure_not_a_500(
    monkeypatch, sessionmaker_for_test
):
    async def boom(client, query):
        raise RuntimeError("down")

    monkeypatch.setattr(nominatim, "search", boom)
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        response = await client.post(resolve_url(entry))
    assert response.status_code == 200
    assert response.json()["state"] == "reading"


@pytest.mark.asyncio
async def test_a_saved_place_becomes_owned(monkeypatch, sessionmaker_for_test):
    spot_id = await add_spot(
        sessionmaker_for_test,
        name="Red Rocks Amphitheatre",
        lat=39.66545,
        lng=-105.20565,
    )
    patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        body = (await client.post(resolve_url(entry))).json()
    assert body["state"] == "owned"
    assert body["payload"]["owned_spot_id"] == spot_id


@pytest.mark.asyncio
async def test_the_same_source_id_as_another_line_is_ignored(
    monkeypatch, sessionmaker_for_test
):
    patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [first, second] = await pasted(
            client, "red rocks\nred rocks amphitheatre"
        )
        a = (await client.post(resolve_url(first))).json()
        b = (await client.post(resolve_url(second))).json()
    assert a["state"] == "ready"
    assert b["state"] == "ignored"
    assert b["payload"]["note"] == "same place as another line"


@pytest.mark.asyncio
async def test_a_renamed_check_entry_searches_the_new_name(
    monkeypatch, sessionmaker_for_test
):
    fake = patch_search(monkeypatch, SearchOk([hit(i) for i in range(3)]))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client, "cafe")
        body = (await client.post(resolve_url(entry))).json()
        assert len(body["payload"]["candidates"]) == 3
        renamed = await client.patch(
            f"/api/intake/entries/{entry['id']}",
            json={"payload": {"name": "Union Station"}},
        )
        assert renamed.status_code == 200
        fake.outcome = SearchOk(hits("one"))
        after = (await client.post(resolve_url(entry))).json()
    assert fake.calls == ["cafe", "Union Station"]
    assert after["state"] == "ready"
    assert "candidates" not in after["payload"]
    assert "note" not in after["payload"]


@pytest.mark.asyncio
async def test_a_short_link_check_entry_resolves_once_named(
    monkeypatch, sessionmaker_for_test
):
    fake = patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client, "https://maps.app.goo.gl/abc")
        await client.patch(
            f"/api/intake/entries/{entry['id']}",
            json={"payload": {"name": "Red Rocks"}},
        )
        body = (await client.post(resolve_url(entry))).json()
    assert fake.calls == ["Red Rocks"]
    assert body["state"] == "ready"


@pytest.mark.asyncio
async def test_a_second_concurrent_resolve_is_a_409(monkeypatch, sessionmaker_for_test):
    fake = patch_search(monkeypatch, SearchOk(hits("one")), delay=0.4)
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        results = await asyncio.gather(
            client.post(resolve_url(entry)), client.post(resolve_url(entry))
        )
    assert sorted(r.status_code for r in results) == [200, 409]
    assert (
        "being looked up"
        in next(r for r in results if r.status_code == 409).json()["detail"]
    )
    assert len(fake.calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["ready", "owned", "ignored"])
async def test_resolving_a_settled_entry_is_a_409(
    state, monkeypatch, sessionmaker_for_test
):
    fake = patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        async with sessionmaker_for_test() as session:
            row = await session.get(IntakeEntry, entry["id"])
            row.state = IntakeEntryState(state)
            await session.commit()
        response = await client.post(resolve_url(entry))
    assert response.status_code == 409
    assert fake.calls == []


@pytest.mark.asyncio
async def test_resolve_refuses_a_shelf_entry_and_an_unnamed_one(
    monkeypatch, sessionmaker_for_test
):
    fake = patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        shelf = await sitting_of(client, kind="game", area="shelf")
        added = (
            await client.post(
                f"/api/intake/sittings/{shelf['id']}/entries",
                json={"kind": "game", "payload": {"title": "x"}},
            )
        ).json()
        refused = await client.post(resolve_url(added))
        sitting, [entry] = await pasted(client)
        async with sessionmaker_for_test() as session:
            row = await session.get(IntakeEntry, entry["id"])
            row.payload = {**row.payload, "name": "  "}
            await session.commit()
        unnamed = await client.post(resolve_url(entry))
        missing = await client.post(
            "/api/intake/entries/00000000-0000-0000-0000-000000000000/resolve"
        )
    assert refused.status_code == 409
    assert unnamed.status_code == 409
    assert missing.status_code == 404
    assert fake.calls == []


@pytest.mark.asyncio
async def test_remaining_counts_the_reading_entries(monkeypatch, sessionmaker_for_test):
    patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, entries = await pasted(client, "a\nb\nc\nhttps://maps.app.goo.gl/x")
        seen = [
            (await client.post(resolve_url(entry))).json()["remaining"]
            for entry in entries[:3]
        ]
    assert seen == [2, 1, 0]


@pytest.mark.asyncio
async def test_a_hundred_resolves_are_a_second_apart_one_search_each(
    monkeypatch, sessionmaker_for_test
):
    """The real `search` and throttle on a fake clock over a mock transport."""

    class Clock:
        now = 1000.0

        def time(self):
            return self.now

        async def sleep(self, seconds):
            self.now += seconds

    clock = Clock()
    monkeypatch.setattr(
        nominatim, "_throttle", Throttle(1.1, clock=clock.time, sleep=clock.sleep)
    )
    stamps: list[float] = []

    def handler(request):
        stamps.append(clock.time())
        i = len(stamps)
        row = {
            "lat": str(39.7 + i / 10000),
            "lon": str(-104.9),
            "osm_type": "node",
            "osm_id": 5000 + i,
            "display_name": f"Spot {i}, Denver",
            "name": f"Spot {i}",
            "category": "amenity",
            "type": "cafe",
            "address": {},
        }
        return httpx2.Response(200, json=[row])

    monkeypatch.setattr(
        place_kind,
        "http_client",
        lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
    )
    monkeypatch.setattr(nominatim, "search", _REAL_SEARCH)
    async with client_for(sessionmaker_for_test) as client:
        sitting, entries = await pasted(
            client, "\n".join(f"spot {i}" for i in range(100))
        )
        results = [await client.post(resolve_url(entry)) for entry in entries]
    assert all(r.status_code == 200 for r in results)
    assert len(stamps) == 100
    assert all(b - a >= 1.0 for a, b in zip(stamps, stamps[1:], strict=False))
    assert {r.json()["state"] for r in results} == {"ready"}
    assert results[-1].json()["remaining"] == 0


# --- pick --------------------------------------------------------------------


async def checked(client, monkeypatch, count=3, text="cafe"):
    patch_search(monkeypatch, SearchOk([hit(i) for i in range(count)]))
    sitting, [entry, *_] = await pasted(client, text)
    body = (await client.post(resolve_url(entry))).json()
    assert body["state"] == "check"
    return sitting, body


def pick_url(entry):
    return f"/api/intake/entries/{entry['id']}/pick"


@pytest.mark.asyncio
async def test_pick_copies_from_the_stored_candidate_only(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await checked(client, monkeypatch)
        response = await client.post(
            pick_url(entry),
            json={
                "index": 1,
                "lat": 1.0,
                "lng": 2.0,
                "source_id": "way/9",
                "name": "x",
            },
        )
    body = response.json()
    assert response.status_code == 200
    assert body["state"] == "ready"
    assert body["chosen"]["source_id"] == "node/1001"
    assert body["payload"]["name"] == "Cafe 1"
    assert body["payload"]["lat"] == pytest.approx(39.701)
    assert body["payload"]["lng"] == pytest.approx(-104.901)
    assert "candidates" not in body["payload"]
    assert "note" not in body["payload"]


@pytest.mark.asyncio
@pytest.mark.parametrize("index", [-1, 3, 99])
async def test_a_bad_index_is_a_422(index, monkeypatch, sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await checked(client, monkeypatch)
        response = await client.post(pick_url(entry), json={"index": index})
        missing = await client.post(pick_url(entry), json={})
        stored = await entries_of(sessionmaker_for_test, sitting)
    assert response.status_code == 422
    assert missing.status_code == 422
    assert stored[0][0] == "check"


@pytest.mark.asyncio
async def test_pick_needs_a_check_entry_with_candidates(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, [reading] = await pasted(client)
        response = await client.post(pick_url(reading), json={"index": 0})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_saved_candidate_picks_as_owned(monkeypatch, sessionmaker_for_test):
    spot_id = await add_spot(
        sessionmaker_for_test,
        name="Cafe 2",
        lat=39.702,
        lng=-104.902,
        source="osm",
        source_id="node/1002",
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await checked(client, monkeypatch)
        assert entry["payload"]["candidates"][2]["owned_spot_id"] == spot_id
        body = (await client.post(pick_url(entry), json={"index": 2})).json()
    assert body["state"] == "owned"
    assert body["payload"]["owned_spot_id"] == spot_id


@pytest.mark.asyncio
async def test_a_candidate_already_another_lines_is_ignored(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await checked(client, monkeypatch, text="cafe\nespresso")
        # a second line takes node/1000 as its own place
        other = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()[
            "entries"
        ]
        second = next(e for e in other if e["id"] != entry["id"])
        patch_search(monkeypatch, SearchOk([hit(0)]))
        taken = (await client.post(resolve_url(second))).json()
        assert taken["state"] == "ready"
        body = (await client.post(pick_url(entry), json={"index": 0})).json()
    assert body["state"] == "ignored"
    assert body["payload"]["note"] == "same place as another line"


@pytest.mark.asyncio
async def test_a_picked_entry_commits_as_a_private_spot(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await checked(client, monkeypatch)
        await client.post(pick_url(entry), json={"index": 0})
        committed = await client.post(f"/api/intake/sittings/{sitting['id']}/commit")
    assert committed.status_code == 200
    assert [s["name"] for s in committed.json()["spots_new"]] == ["Cafe 0"]
    async with sessionmaker_for_test() as session:
        [spot] = (await session.scalars(select(Spot))).all()
    assert (spot.name, spot.source_id, spot.is_public) == ("Cafe 0", "node/1000", False)


# --- PATCH hardening ---------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_cannot_plant_candidates_attempts_or_a_position(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await checked(client, monkeypatch)
        response = await client.patch(
            f"/api/intake/entries/{entry['id']}",
            json={
                "payload": {
                    "candidates": [{"title": "Evil", "lat": 1, "lng": 1}],
                    "attempts": 0,
                    "source_line": "evil",
                    "owned_spot_id": "x",
                    "lat": 1.0,
                    "lng": 2.0,
                    "source_id": "node/1",
                    "note": "forged",
                    "blurb": "kept",
                },
                "chosen": {"source_id": "node/1"},
            },
        )
        again = await client.post(pick_url(entry), json={"index": 0})
    assert response.status_code == 200
    payload = response.json()["payload"]
    assert payload["candidates"] == entry["payload"]["candidates"]
    assert payload["attempts"] == entry["payload"]["attempts"]
    assert payload["source_line"] == "cafe"
    assert "owned_spot_id" not in payload
    assert "lat" not in payload and "source_id" not in payload
    assert payload["note"] == "3 places found"
    assert payload["blurb"] == "kept"
    assert response.json()["chosen"] is None
    assert again.json()["chosen"]["source_id"] == "node/1000"


@pytest.mark.asyncio
async def test_patch_to_ready_on_a_pasted_entry_without_a_position_is_a_422(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entries = await pasted(
            client, "https://maps.app.goo.gl/abc\nUnion Station"
        )
        short = entries[0]
        response = await client.patch(
            f"/api/intake/entries/{short['id']}", json={"state": "ready"}
        )
    assert response.status_code == 422
    assert "coordinates" in response.json()["detail"]


@pytest.mark.asyncio
async def test_a_named_pasted_pair_can_be_made_ready(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client, "39.7392, -104.9903")
        response = await client.patch(
            f"/api/intake/entries/{entry['id']}",
            json={"payload": {"name": "Civic Center"}, "state": "ready"},
        )
    assert response.status_code == 200
    assert response.json()["state"] == "ready"
