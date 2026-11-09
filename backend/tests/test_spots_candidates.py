"""The spot finder's routes (spots_candidates_routes.py): refresh, queue, answers."""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

import httpx2
import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

import candidates
from llm import LLMError
from models import Candidate, CandidateSource, Dismissal, Spot, SpotSetting, Visit
from spots_candidates_routes import STATUS_KEY, create_candidates_router

pytestmark = pytest.mark.asyncio

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "overpass_candidates.json").read_text()
)


class FakeProvider:
    """The model: a fixed answer or an error, recording each prompt."""

    def __init__(self, payload=None, raises=None):
        self._payload = payload
        self._raises = raises
        self.prompts: list[str] = []

    async def complete_json(self, prompt, schema, images=None):
        self.prompts.append(prompt)
        if self._raises:
            raise self._raises
        return self._payload


def overpass(status=200, body=None, calls=None):
    """A client factory whose Overpass answers `body` (the recording by default)."""

    def handler(request):
        if calls is not None:
            calls.append(request)
        if status != 200:
            return httpx2.Response(status, text="no")
        return httpx2.Response(200, json=FIXTURE if body is None else body)

    return lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(handler))


@asynccontextmanager
async def client_for(factory, *, http=None, provider=None, lock=None, signed_in=True):
    app = FastAPI()
    app.include_router(
        create_candidates_router(
            factory,
            http_client=http or overpass(),
            provider_factory=(lambda: provider) if provider else None,
            lock=lock,
        )
    )
    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def _anchor(factory, **extra):
    async with factory() as session:
        spot = Spot(
            name="Union Station",
            slug="union-station",
            lat=39.7527,
            lng=-105.0002,
            anchor=True,
            **extra,
        )
        session.add(spot)
        await session.commit()
        return spot


async def _queue(factory):
    async with factory() as session:
        return (await session.scalars(select(Candidate))).all()


async def _status(factory):
    async with factory() as session:
        row = await session.get(SpotSetting, STATUS_KEY)
        return row.value if row else None


def _first_place():
    return next(
        element
        for element in FIXTURE["elements"]
        if element.get("tags", {}).get("name") == "Cactus Club"
    )


# --- refresh ---------------------------------------------------------------------


async def test_no_anchor_records_it_and_asks_nothing(sessionmaker_for_test):
    calls = []
    async with client_for(sessionmaker_for_test, http=overpass(calls=calls)) as client:
        response = await client.post("/api/spots/candidates/refresh")
    assert response.status_code == 200
    assert response.json()["state"] == "no_anchors"
    assert calls == []
    assert (await _status(sessionmaker_for_test))["state"] == "no_anchors"


async def test_a_refresh_queues_the_shortlist_with_the_model_scores(
    sessionmaker_for_test,
):
    await _anchor(sessionmaker_for_test)
    provider = FakeProvider(
        {"scores": [{"index": 0, "fit": 91, "reason": "Close.", "tags": ["food"]}]}
    )
    async with client_for(sessionmaker_for_test, provider=provider) as client:
        summary = (await client.post("/api/spots/candidates/refresh")).json()
        listed = (await client.get("/api/spots/candidates")).json()

    assert summary["state"] == "ok"
    assert summary["ranked_by"] == "model"
    assert summary["note"] is None
    assert summary["queued"] == candidates.MAX_QUEUE == summary["new"]
    assert summary["found"] >= summary["after_dedupe"] > candidates.MAX_QUEUE
    assert len(provider.prompts) == 1
    assert await _status(sessionmaker_for_test) == summary

    assert len(listed) == candidates.MAX_QUEUE
    top = listed[0]
    assert (top["fit"], top["reason"], top["suggested_tags"]) == (
        91,
        "Close.",
        ["food"],
    )
    assert top["source"] == "osm"
    assert top["distance"].endswith("from Union Station · on foot")
    assert all(row["fit"] is None for row in listed[1:])
    assert {row["reason"] for row in listed[1:]} == {candidates.NOT_SCORED}
    # Unscored rows come nearest first.
    distances = [row["distance_m"] for row in listed[1:]]
    assert distances == sorted(distances)


async def test_a_second_refresh_replaces_the_queue_and_counts_nothing_new(
    sessionmaker_for_test,
):
    await _anchor(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/spots/candidates/refresh")
        first = {row.source_id: row.id for row in await _queue(sessionmaker_for_test)}
        again = (await client.post("/api/spots/candidates/refresh")).json()
    assert again["new"] == 0
    rows = await _queue(sessionmaker_for_test)
    assert len(rows) == candidates.MAX_QUEUE
    # A page read before the refresh still answers the same rows.
    assert {row.source_id: row.id for row in rows} == first


@pytest.mark.parametrize(
    ("provider", "note"),
    [
        (None, "No model is configured"),
        (FakeProvider(raises=LLMError("Gemini timed out")), None),
        (FakeProvider({"scores": "no"}), "The model’s answer had no usable scores"),
        (FakeProvider(raises=KeyError("x")), "The model’s answer couldn’t be read"),
    ],
)
async def test_without_a_usable_model_answer_the_queue_falls_back(
    sessionmaker_for_test, provider, note
):
    await _anchor(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, provider=provider) as client:
        summary = (await client.post("/api/spots/candidates/refresh")).json()
    assert summary["state"] == "ok"
    assert summary["ranked_by"] == "fallback"
    assert summary["note"]
    if note:
        assert summary["note"].startswith(note)
    rows = await _queue(sessionmaker_for_test)
    assert len(rows) == candidates.MAX_QUEUE
    assert {row.fit for row in rows} == {None}


async def test_an_overpass_failure_is_502_and_keeps_the_old_queue(
    sessionmaker_for_test,
):
    await _anchor(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/spots/candidates/refresh")
    async with client_for(sessionmaker_for_test, http=overpass(status=500)) as client:
        failed = await client.post("/api/spots/candidates/refresh")
    assert failed.status_code == 502
    assert failed.json()["detail"] == "Overpass answered 500"
    assert len(await _queue(sessionmaker_for_test)) == candidates.MAX_QUEUE
    status = await _status(sessionmaker_for_test)
    assert (status["state"], status["note"]) == ("failed", "Overpass answered 500")


async def test_a_refresh_while_one_runs_is_409(sessionmaker_for_test):
    lock = asyncio.Lock()
    await lock.acquire()
    try:
        async with client_for(sessionmaker_for_test, lock=lock) as client:
            response = await client.post("/api/spots/candidates/refresh")
    finally:
        lock.release()
    assert response.status_code == 409


async def test_dismissed_and_kept_places_are_never_queued(sessionmaker_for_test):
    await _anchor(sessionmaker_for_test)
    place = _first_place()
    source_id = f"node/{place['id']}"
    async with sessionmaker_for_test() as session:
        session.add(Dismissal(source=CandidateSource.OSM, source_id=source_id))
        # Kept, and far from where the place is, so only its id can match it.
        session.add(
            Spot(
                name="Something else",
                slug="something-else",
                lat=39.70,
                lng=-104.95,
                source=CandidateSource.OSM,
                source_id="node/415817076",
            )
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/spots/candidates/refresh")
    queued = {row.source_id for row in await _queue(sessionmaker_for_test)}
    assert source_id not in queued
    assert "node/415817076" not in queued


async def test_a_kept_spot_on_the_same_place_is_deduped(sessionmaker_for_test):
    await _anchor(sessionmaker_for_test)
    place = _first_place()
    async with sessionmaker_for_test() as session:
        session.add(
            Spot(
                name="Cactus Club",
                slug="cactus-club",
                lat=place["lat"],
                lng=place["lon"],
            )
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/spots/candidates/refresh")
    names = {row.name for row in await _queue(sessionmaker_for_test)}
    assert "Cactus Club" not in names


# --- answers -----------------------------------------------------------------------


async def _queued_one(factory, **extra):
    anchor = await _anchor(factory)
    async with factory() as session:
        row = Candidate(
            **{
                "source": CandidateSource.OSM,
                "source_id": "node/1",
                "name": "Kaffe Landscap",
                "category": "cafe",
                "lat": 39.75,
                "lng": -105.0,
                "distance_m": 900,
                "nearest_anchor_id": anchor.id,
                "fit": 80,
                "reason": "Coffee near the station.",
                "suggested_tags": ["coffee", "rainy-day"],
                **extra,
            }
        )
        session.add(row)
        await session.commit()
        return anchor, row


async def test_accept_makes_a_private_spot_with_the_pressed_tags(sessionmaker_for_test):
    _, row = await _queued_one(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        accepted = await client.post(
            f"/api/spots/candidates/{row.id}/accept", json={"tags": ["coffee"]}
        )
        again = await client.post(f"/api/spots/candidates/{row.id}/dismiss", json={})
    assert accepted.status_code == 200
    body = accepted.json()
    assert body["candidate"]["name"] == "Kaffe Landscap"
    assert body["candidate"]["distance"] == "0.6 mi from Union Station · on foot"
    async with sessionmaker_for_test() as session:
        spot = await session.get(Spot, body["spot_id"])
    assert (spot.slug, spot.tags, spot.is_public) == (
        "kaffe-landscap",
        ["coffee"],
        False,
    )
    assert (spot.source, spot.source_id) == (CandidateSource.OSM, "node/1")
    assert await _queue(sessionmaker_for_test) == []
    assert again.status_code == 409


async def test_accept_refuses_a_name_with_no_ascii_letter(sessionmaker_for_test):
    _, row = await _queued_one(sessionmaker_for_test, name="珈琲")
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            f"/api/spots/candidates/{row.id}/accept", json={"tags": []}
        )
    assert response.status_code == 422
    assert len(await _queue(sessionmaker_for_test)) == 1


async def test_a_second_dismiss_is_409(sessionmaker_for_test):
    _, row = await _queued_one(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        first = await client.post(f"/api/spots/candidates/{row.id}/dismiss")
        again = await client.post(f"/api/spots/candidates/{row.id}/dismiss")
    assert (first.status_code, again.status_code) == (200, 409)


async def test_accept_refuses_a_tag_outside_the_vocabulary(sessionmaker_for_test):
    _, row = await _queued_one(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            f"/api/spots/candidates/{row.id}/accept", json={"tags": ["brunch"]}
        )
    assert response.status_code == 422
    assert len(await _queue(sessionmaker_for_test)) == 1


async def test_dismiss_is_remembered_and_restore_forgets_it(sessionmaker_for_test):
    _, row = await _queued_one(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        dismissed = (
            await client.post(f"/api/spots/candidates/{row.id}/dismiss")
        ).json()
        async with sessionmaker_for_test() as session:
            assert await session.get(Dismissal, (CandidateSource.OSM, "node/1"))
        restored = await client.post("/api/spots/candidates/restore", json=dismissed)
    assert restored.status_code == 200
    assert restored.json()["id"] == str(row.id)
    assert restored.json()["fit"] == 80
    async with sessionmaker_for_test() as session:
        assert await session.get(Dismissal, (CandidateSource.OSM, "node/1")) is None
    assert len(await _queue(sessionmaker_for_test)) == 1


async def test_restore_after_accept_removes_the_spot(sessionmaker_for_test):
    _, row = await _queued_one(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        accepted = (
            await client.post(f"/api/spots/candidates/{row.id}/accept", json={})
        ).json()
        restored = await client.post("/api/spots/candidates/restore", json=accepted)
    assert restored.status_code == 200
    async with sessionmaker_for_test() as session:
        assert await session.get(Spot, accepted["spot_id"]) is None
    assert len(await _queue(sessionmaker_for_test)) == 1


async def test_restore_refuses_a_spot_with_a_visit(sessionmaker_for_test):
    _, row = await _queued_one(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        accepted = (
            await client.post(f"/api/spots/candidates/{row.id}/accept", json={})
        ).json()
        async with sessionmaker_for_test() as session:
            session.add(
                Visit(spot_id=accepted["spot_id"], visited_on=date(2026, 11, 8))
            )
            await session.commit()
        restored = await client.post("/api/spots/candidates/restore", json=accepted)
    assert restored.status_code == 409
    assert await _queue(sessionmaker_for_test) == []


@pytest.mark.parametrize(
    "edit", [{"name": "Kaffe L"}, {"is_public": True}, {"anchor": True}]
)
async def test_restore_refuses_a_spot_edited_since_accept(sessionmaker_for_test, edit):
    _, row = await _queued_one(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        accepted = (
            await client.post(f"/api/spots/candidates/{row.id}/accept", json={})
        ).json()
        async with sessionmaker_for_test() as session:
            spot = await session.get(Spot, accepted["spot_id"])
            for field, value in edit.items():
                setattr(spot, field, value)
            await session.commit()
        restored = await client.post("/api/spots/candidates/restore", json=accepted)
    assert restored.status_code == 409
    assert "edited" in restored.json()["detail"]
    async with sessionmaker_for_test() as session:
        assert await session.get(Spot, accepted["spot_id"]) is not None
    assert await _queue(sessionmaker_for_test) == []


async def test_restore_refuses_a_spot_from_another_place(sessionmaker_for_test):
    anchor, row = await _queued_one(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        dismissed = (
            await client.post(f"/api/spots/candidates/{row.id}/dismiss")
        ).json()
        restored = await client.post(
            "/api/spots/candidates/restore",
            json={**dismissed, "spot_id": str(anchor.id)},
        )
    assert restored.status_code == 409
    async with sessionmaker_for_test() as session:
        assert await session.get(Spot, anchor.id) is not None


async def test_restore_unlinks_an_anchor_deleted_meanwhile(sessionmaker_for_test):
    anchor, row = await _queued_one(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        dismissed = (
            await client.post(f"/api/spots/candidates/{row.id}/dismiss")
        ).json()
        async with sessionmaker_for_test() as session:
            await session.delete(await session.get(Spot, anchor.id))
            await session.commit()
        restored = (
            await client.post("/api/spots/candidates/restore", json=dismissed)
        ).json()
    assert (restored["nearest_anchor_id"], restored["distance"]) == (None, None)


async def test_the_queue_orders_fit_then_distance(sessionmaker_for_test):
    anchor = await _anchor(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        for n, (fit, metres) in enumerate(
            [(None, 100), (40, 900), (90, 2000), (40, 300)]
        ):
            session.add(
                Candidate(
                    source=CandidateSource.OSM,
                    source_id=f"node/{n}",
                    name=f"Place {n}",
                    lat=39.75,
                    lng=-105.0,
                    distance_m=metres,
                    nearest_anchor_id=anchor.id,
                    fit=fit,
                )
            )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        listed = (await client.get("/api/spots/candidates")).json()
    assert [row["name"] for row in listed] == [
        "Place 2",
        "Place 3",
        "Place 1",
        "Place 0",
    ]


async def test_anonymous_calls_are_401(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        responses = [
            await client.get("/api/spots/candidates"),
            await client.post("/api/spots/candidates/refresh"),
            await client.post("/api/spots/candidates/restore", json={}),
        ]
    assert [r.status_code for r in responses] == [401, 401, 401]
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count(SpotSetting.key))) == 0
