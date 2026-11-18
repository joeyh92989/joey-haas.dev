"""The paste way for places (story #342, task 2): paste, resolve and pick.

No live network: `nominatim.search` is replaced by a counting fake, or the
real `search` runs over a mock transport with the fake clock of
`test_nominatim.py`. The paste itself must make no request of any kind.
"""

from __future__ import annotations

import asyncio
import json

import httpx2
import pytest
from sqlalchemy import select

from intake import place_kind, place_paste
from models import IntakeEntry, IntakeEntryState, Spot
from sources.base import Throttle
from spot_sources import nominatim
from spot_sources.nominatim import PlaceHit, SearchFailure, SearchOk
from tests.test_intake_kinds import client_for
from tests.test_place_kind import add_spot, hits, new_sitting
from tests.test_place_kind import patch_search as count_search

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
    """Anything that builds a Nominatim client, makes a real HTTP request or
    runs a search nobody asked for fails the test. A test that looks a place
    up goes through `patch_search`, which allows the (stub) client."""

    def forbidden():
        raise AssertionError("an HTTP client was built")

    async def refused(self, request):
        raise AssertionError(f"an HTTP request was made: {request.url}")

    async def no_search(client, query):
        raise AssertionError(f"an unexpected search: {query}")

    monkeypatch.setattr(place_kind, "http_client", forbidden)
    monkeypatch.setattr(httpx2.AsyncHTTPTransport, "handle_async_request", refused)
    monkeypatch.setattr(nominatim, "search", no_search)


class _NoClient:
    async def __aenter__(self):
        return None

    async def __aexit__(self, *exc):
        return False


def allow_client(monkeypatch):
    """For a test that resolves: the client is a stub, `search` is the fake."""
    monkeypatch.setattr(place_kind, "http_client", lambda: _NoClient())


def patch_search(monkeypatch, outcome=None, delay=0.0):
    allow_client(monkeypatch)
    return count_search(monkeypatch, outcome, delay)


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
async def test_the_same_long_url_in_two_pastes_makes_one_entry(sessionmaker_for_test):
    url = "https://www.google.com/maps/place/Long/@39.7,-104.9,17z/data=" + "a" * 450
    assert len(url) > place_paste.MAX_SOURCE_LINE
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        first = (await paste(client, sitting, url)).json()
        again = (await paste(client, sitting, url)).json()
        other = (await paste(client, sitting, url[:-1] + "b")).json()
    assert first["added"] == 1
    assert (again["added"], again["duplicates"]) == (0, 1)
    assert other["added"] == 1
    assert len(await entries_of(sessionmaker_for_test, sitting)) == 2


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

    allow_client(monkeypatch)
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


class BlockedSearch:
    """A search that waits for the test to let it finish."""

    def __init__(self, outcome):
        self.outcome = outcome
        self.calls: list[str] = []
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def __call__(self, client, query):
        self.calls.append(query)
        self.started.set()
        await self.release.wait()
        return self.outcome


def block_search(monkeypatch, outcome) -> BlockedSearch:
    allow_client(monkeypatch)
    blocked = BlockedSearch(outcome)
    monkeypatch.setattr(nominatim, "search", blocked)
    return blocked


@pytest.mark.asyncio
async def test_a_second_concurrent_resolve_is_a_409(monkeypatch, sessionmaker_for_test):
    blocked = block_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        first = asyncio.create_task(client.post(resolve_url(entry)))
        await asyncio.wait_for(blocked.started.wait(), 10)
        try:
            second = await asyncio.wait_for(client.post(resolve_url(entry)), 5)
        finally:
            blocked.release.set()
        done = await first
    assert second.status_code == 409
    assert "being looked up" in second.json()["detail"]
    assert done.status_code == 200
    assert len(blocked.calls) == 1


@pytest.mark.asyncio
async def test_a_patch_during_a_resolve_is_a_409_and_keeps_the_answer(
    monkeypatch, sessionmaker_for_test
):
    blocked = block_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        first = asyncio.create_task(client.post(resolve_url(entry)))
        await asyncio.wait_for(blocked.started.wait(), 10)
        try:
            patched = await asyncio.wait_for(
                client.patch(
                    f"/api/intake/entries/{entry['id']}",
                    json={"payload": {"blurb": "late"}},
                ),
                5,
            )
        finally:
            blocked.release.set()
        done = (await first).json()
        stored = await entries_of(sessionmaker_for_test, sitting)
    assert patched.status_code == 409
    assert patched.json()["detail"] == "This place is busy. Try again in a moment."
    assert done["state"] == "ready"
    [(state, payload, chosen)] = stored
    assert state == "ready"
    assert payload["lat"] == pytest.approx(39.6653917)
    assert "blurb" not in payload or payload["blurb"] is None
    assert chosen["source_id"] == "way/229359697"


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


# --- untrusted text ------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_nul_in_a_line_is_cleaned_not_a_500(sessionmaker_for_test):
    text = "\n".join(
        [
            "abc\x00def",
            "\x00",
            "https://www.google.com/maps/place/Red\x00+Rocks/@39.7,-104.9,17z",
            "x" * 299 + "\x00" + "y" * 5,
            "plain line",
        ]
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        response = await paste(client, sitting, text)
    body = response.json()
    assert response.status_code == 200
    assert body["blank"] == 1
    states = [(e["state"], e["payload"]["name"]) for e in body["entries"]]
    assert states[0] == ("reading", "abcdef")
    assert states[1] == ("ready", "Red Rocks")
    assert states[2][0] == "check"  # too long once the NUL is gone
    assert states[3] == ("reading", "plain line")
    assert all("\x00" not in json.dumps(e) for e in body["entries"])
    assert body["entries"][0]["payload"]["source_line"] == "abcdef"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "hidden",
    [
        "\u200b",
        "\u200c",
        "\u200d",
        "\u2060",
        "\ufeff",
        "\u202e",
        "\u202a",
        "\u2066",
        "\u2069",
    ],
)
async def test_invisible_format_characters_are_removed(hidden, sessionmaker_for_test):
    text = f"Red{hidden} Rocks\n{hidden}\n{hidden}{hidden}"
    link = f"https://www.google.com/maps/place/Union{hidden}+Station/@39.7,-104.9,17z"
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        body = (await paste(client, sitting, text + "\n" + link)).json()
    assert body["blank"] == 2
    [name_entry, link_entry] = body["entries"]
    assert name_entry["payload"]["name"] == "Red Rocks"
    assert name_entry["payload"]["source_line"] == "Red Rocks"
    assert link_entry["state"] == "ready"
    assert link_entry["payload"]["name"] == "Union Station"


@pytest.mark.asyncio
async def test_a_hidden_variant_is_a_duplicate_of_the_plain_line(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        body = (await paste(client, sitting, "Red Rocks\nRed\u200b Rocks")).json()
    assert (body["added"], body["duplicates"]) == (1, 1)


@pytest.mark.asyncio
async def test_two_pastes_racing_make_no_duplicate_entries(
    monkeypatch, sessionmaker_for_test
):
    # Hold each paste between reading the sitting's entries and writing its
    # own; only the sitting lock keeps the second from reading too early.
    real = place_paste.flag_owned

    async def slow(session, rows):
        await asyncio.sleep(0.3)
        await real(session, rows)

    monkeypatch.setattr(place_paste, "flag_owned", slow)
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        a, b = await asyncio.gather(
            paste(client, sitting, "one\ntwo\n39.7, -104.9"),
            paste(client, sitting, "two\nthree\n39.7, -104.9"),
        )
        assert a.status_code == b.status_code == 200
        stored = await entries_of(sessionmaker_for_test, sitting)
    names = sorted(payload["name"] for _, payload, _ in stored)
    assert names == sorted(set(names))
    assert len(stored) == 4
    assert a.json()["added"] + b.json()["added"] == 4


@pytest.mark.asyncio
async def test_a_hit_that_fails_the_checks_is_a_check_entry(
    monkeypatch, sessionmaker_for_test
):
    bad = PlaceHit(
        name="Nowhere",
        display_name="Nowhere",
        lat=999.0,
        lng=-104.9,
        osm_type="node",
        osm_id=5,
        source_id="node/5",
        category="x",
        type="y",
        address={},
    )
    patch_search(monkeypatch, SearchOk([bad]))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        response = await client.post(resolve_url(entry))
    body = response.json()
    assert response.status_code == 200
    assert body["state"] == "check"
    assert "latitude" in body["payload"]["note"]
    assert body["chosen"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change", [{"lat": 999.0}, {"source_id": "not-an-id"}, {"title": ""}]
)
async def test_a_tampered_stored_candidate_is_a_422_and_changes_nothing(
    change, monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await checked(client, monkeypatch)
        async with sessionmaker_for_test() as session:
            row = await session.get(IntakeEntry, entry["id"])
            candidates = [dict(c) for c in row.payload["candidates"]]
            candidates[0].update(change)
            row.payload = {**row.payload, "candidates": candidates}
            await session.commit()
        before = await entries_of(sessionmaker_for_test, sitting)
        response = await client.post(pick_url(entry), json={"index": 0})
        after = await entries_of(sessionmaker_for_test, sitting)
    assert response.status_code == 422
    assert after == before
    assert after[0][0] == "check"
    assert after[0][2] is None


@pytest.mark.asyncio
async def test_a_named_pair_near_a_saved_place_with_the_same_name_is_owned(
    sessionmaker_for_test,
):
    spot_id = await add_spot(
        sessionmaker_for_test,
        name="Red Rocks Amphitheatre",
        lat=39.66508,  # about 9 m from the pasted pin (39.665, -105.2058)
        lng=-105.20575,
    )
    far = await add_spot(
        sessionmaker_for_test, name="Union Station", lat=39.7, lng=-105.0
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        body = (await paste(client, sitting, LONG_PLACE)).json()
    [entry] = body["entries"]
    assert entry["state"] == "owned"
    assert entry["payload"]["owned_spot_id"] == spot_id != far


@pytest.mark.asyncio
async def test_a_named_pair_over_75_metres_from_a_namesake_is_ready(
    sessionmaker_for_test,
):
    await add_spot(
        sessionmaker_for_test,
        name="Red Rocks Amphitheatre",
        lat=39.6660,  # about 110 m north
        lng=-105.2058,
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        body = (await paste(client, sitting, LONG_PLACE)).json()
    assert body["entries"][0]["state"] == "ready"


@pytest.mark.asyncio
async def test_ten_parallel_resolves_all_finish_and_none_times_out(
    monkeypatch, sessionmaker_for_test
):
    class Clock:
        now = 1000.0

        def time(self):
            return self.now

        async def sleep(self, seconds):
            self.now += seconds
            await asyncio.sleep(0)

    clock = Clock()
    monkeypatch.setattr(
        nominatim, "_throttle", Throttle(1.1, clock=clock.time, sleep=clock.sleep)
    )
    running = 0
    most = 0
    count = 0

    def handler(request):
        nonlocal count
        count += 1
        row = {
            "lat": str(39.7 + count / 10000),
            "lon": "-104.9",
            "osm_type": "node",
            "osm_id": 7000 + count,
            "display_name": f"Spot {count}, Denver",
            "name": f"Spot {count}",
            "category": "amenity",
            "type": "cafe",
            "address": {},
        }
        return httpx2.Response(200, json=[row])

    class Counting(httpx2.AsyncClient):
        async def get(self, *args, **kwargs):
            nonlocal running, most
            running += 1
            most = max(most, running)
            try:
                await asyncio.sleep(0.05)
                return await super().get(*args, **kwargs)
            finally:
                running -= 1

    monkeypatch.setattr(
        place_kind,
        "http_client",
        lambda: Counting(transport=httpx2.MockTransport(handler)),
    )
    monkeypatch.setattr(nominatim, "search", _REAL_SEARCH)
    async with client_for(sessionmaker_for_test) as client:
        sitting, entries = await pasted(client, "\n".join(f"s{i}" for i in range(10)))
        results = await asyncio.gather(*(client.post(resolve_url(e)) for e in entries))
    assert [r.status_code for r in results] == [200] * 10
    assert {r.json()["state"] for r in results} == {"ready"}
    assert all(r.json()["payload"]["attempts"] == 0 for r in results)
    assert count == 10
    assert most <= place_paste.MAX_LOOKUPS


@pytest.mark.asyncio
async def test_the_typed_words_are_kept_as_searched_as(
    monkeypatch, sessionmaker_for_test
):
    patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client, "red rocks")
        body = (await client.post(resolve_url(entry))).json()
    assert body["payload"]["name"] == "Red Rocks Amphitheatre"
    assert body["payload"]["searched_as"] == "red rocks"


@pytest.mark.asyncio
async def test_searched_as_is_cleaned_and_capped_after_a_pick(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await checked(client, monkeypatch, text="cafe")
        async with sessionmaker_for_test() as session:
            row = await session.get(IntakeEntry, entry["id"])
            row.payload = {**row.payload, "name": "Ca\u200bfe " + "z" * 300}
            await session.commit()
        body = (await client.post(pick_url(entry), json={"index": 0})).json()
    assert body["payload"]["name"] == "Cafe 0"
    assert body["payload"]["searched_as"].startswith("Cafe zzz")
    assert len(body["payload"]["searched_as"]) == 200


# --- lock order (story #342, task 3) -----------------------------------------


class Held:
    """A row lock held by the test through a second session, released on exit
    (no sleeps: the test decides when)."""

    def __init__(self, factory, statement):
        self.factory, self.statement = factory, statement

    async def __aenter__(self):
        self.session = self.factory()
        await self.session.scalar(self.statement)
        return self

    async def __aexit__(self, *exc):
        await self.session.rollback()
        await self.session.close()


def lock_sitting_of(sitting):
    from models import IntakeSitting

    return (
        select(IntakeSitting.id)
        .where(IntakeSitting.id == sitting["id"])
        .with_for_update()
    )


def lock_entries_of(sitting):
    return (
        select(IntakeEntry.id)
        .where(IntakeEntry.sitting_id == sitting["id"])
        .with_for_update()
    )


BEING_SAVED = "The list is being saved. Try again in a moment."


@pytest.mark.asyncio
async def test_a_resolve_while_the_sitting_is_held_is_a_409_and_changes_nothing(
    monkeypatch, sessionmaker_for_test
):
    fake = patch_search(monkeypatch, SearchOk(hits("one")))
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        async with Held(sessionmaker_for_test, lock_sitting_of(sitting)):
            held = await asyncio.wait_for(client.post(resolve_url(entry)), 10)
        stored = await entries_of(sessionmaker_for_test, sitting)
        after = await client.post(resolve_url(entry))
    assert held.status_code == 409
    assert held.json()["detail"] == BEING_SAVED
    assert [(state, payload.get("name")) for state, payload, _ in stored] == [
        ("reading", "red rocks")
    ]
    assert stored[0][2] is None
    assert after.status_code == 200  # nothing was left locked
    assert after.json()["state"] == "ready"
    assert len(fake.calls) == 2  # the held attempt searched, then gave up cleanly


@pytest.mark.asyncio
async def test_a_pick_while_the_sitting_is_held_is_a_409_and_changes_nothing(
    monkeypatch, sessionmaker_for_test
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, entry = await checked(client, monkeypatch)
        async with Held(sessionmaker_for_test, lock_sitting_of(sitting)):
            held = await asyncio.wait_for(
                client.post(pick_url(entry), json={"index": 0}), 10
            )
        stored = await entries_of(sessionmaker_for_test, sitting)
        after = await client.post(pick_url(entry), json={"index": 0})
    assert held.status_code == 409
    assert held.json()["detail"] == BEING_SAVED
    assert stored[0][0] == "check"
    assert after.status_code == 200
    assert after.json()["state"] == "ready"


@pytest.mark.asyncio
async def test_a_patch_meeting_a_commit_holding_the_rows_is_a_busy_409(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting, [entry] = await pasted(client)
        async with Held(sessionmaker_for_test, lock_entries_of(sitting)):
            busy = await asyncio.wait_for(
                client.patch(
                    f"/api/intake/entries/{entry['id']}",
                    json={"payload": {"blurb": "x"}},
                ),
                5,
            )
    assert busy.status_code == 409
    assert busy.json()["detail"] == "This place is busy. Try again in a moment."


@pytest.mark.asyncio
async def test_a_long_map_url_is_read_and_its_source_line_is_clipped(
    monkeypatch, sessionmaker_for_test
):
    patch_search(monkeypatch)
    url = (
        "https://www.google.com/maps/place/Confluence+Park/@39.7546,-105.0078,17z/"
        "data=" + "!4m6!3m5!1s0x876c7ed1a6f2a8cd" * 20 + "!3d39.7546!4d-105.0078"
    )
    assert 600 < len(url) < 2000
    async with client_for(sessionmaker_for_test) as client:
        sitting = await sitting_of(client)
        response = await paste(client, sitting, url)
    [entry] = response.json()["entries"]
    assert entry["state"] == "ready"
    assert entry["payload"]["name"] == "Confluence Park"
    assert len(entry["payload"]["source_line"]) == 300
    assert url.startswith(entry["payload"]["source_line"])
