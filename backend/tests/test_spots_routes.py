"""Denver spots' admin routes (spots_routes.py)."""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from models import Candidate, CandidateSource, Spot, SpotSetting, Visit
from public import OWNER_TZ
from spots_routes import create_spots_router

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def client_for(factory, signed_in=True):
    app = FastAPI()
    app.include_router(create_spots_router(factory))
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


SLOANS = {"name": "Sloan's Lake", "coords": "39.7505, -105.0478", "tags": ["park"]}


async def test_a_spot_is_created_private_with_parsed_coords_and_canonical_tags(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        made = await client.post(
            "/api/spots",
            json={
                "name": "  Café Max ",
                "coords": "https://maps.example/@39.7406,-104.9787,17z",
                "tags": ["Food", "coffee", "food"],
                "blurb": "  Cortado and a window seat.  ",
                "neighbourhood": "",
            },
        )
    assert made.status_code == 201
    body = made.json()
    assert body["name"] == "Café Max"
    assert body["slug"] == "cafe-max"
    assert (body["lat"], body["lng"]) == (39.7406, -104.9787)
    assert body["tags"] == ["coffee", "food"]
    assert body["blurb"] == "Cortado and a window seat."
    assert body["neighbourhood"] is None
    assert body["is_public"] is False
    assert body["anchor"] is False
    assert body["city"] == "denver"
    assert (body["last_visit"], body["visit_count"]) == (None, 0)


async def test_bad_coordinates_and_tags_are_422_with_a_sentence(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        coords = await client.post(
            "/api/spots", json={**SLOANS, "coords": "-105.0478, 39.7505"}
        )
        tags = await client.post("/api/spots", json={**SLOANS, "tags": ["brunch"]})
        blank = await client.post("/api/spots", json={**SLOANS, "name": "   "})
    assert coords.status_code == 422
    assert "reversed" in coords.json()["detail"]
    assert tags.status_code == 422
    assert "'brunch'" in tags.json()["detail"]
    assert blank.status_code == 422
    assert isinstance(blank.json()["detail"], str)


async def test_anonymous_calls_are_401_before_the_body_is_read(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        listed = await client.get("/api/spots")
        bad_body = await client.post("/api/spots", json={"nonsense": True})
        status = await client.get("/api/spots/status")
    assert (listed.status_code, bad_body.status_code, status.status_code) == (
        401,
        401,
        401,
    )


async def test_same_name_gets_a_suffixed_slug(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        first = (await client.post("/api/spots", json=SLOANS)).json()
        second = (await client.post("/api/spots", json=SLOANS)).json()
    assert (first["slug"], second["slug"]) == ("sloan-s-lake", "sloan-s-lake-2")


async def test_patch_edits_only_what_it_names(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = (await client.post("/api/spots", json=SLOANS)).json()
        url = f"/api/spots/{made['id']}"
        published = await client.patch(url, json={"is_public": True})
        renamed = await client.patch(
            url, json={"name": "Sloan Lake Park", "coords": "39.75,-105.05"}
        )
        bad = await client.patch(url, json={"coords": "nowhere"})
        null_flag = await client.patch(url, json={"anchor": None})
    assert published.json()["is_public"] is True
    assert published.json()["tags"] == ["park"]
    body = renamed.json()
    assert (body["name"], body["slug"]) == ("Sloan Lake Park", "sloan-lake-park")
    assert (body["lat"], body["lng"], body["is_public"]) == (39.75, -105.05, True)
    assert bad.status_code == 422
    assert "latitude, longitude" in bad.json()["detail"]
    assert null_flag.status_code == 422


async def test_long_names_sharing_a_prefix_get_distinct_slugs(sessionmaker_for_test):
    # Each slugifies past the column, so a suffix cuts into the base: the
    # third must still find the second's slug and go on to -3.
    long = {**SLOANS, "name": "Lake " * 40}
    async with client_for(sessionmaker_for_test) as client:
        made = [await client.post("/api/spots", json=long) for _ in range(3)]
    assert [r.status_code for r in made] == [201, 201, 201]
    slugs = [r.json()["slug"] for r in made]
    assert len(set(slugs)) == 3
    assert slugs[1].endswith("-2") and slugs[2].endswith("-3")
    assert all(len(slug) <= 200 for slug in slugs)


async def test_renaming_to_its_own_name_keeps_the_slug(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = (await client.post("/api/spots", json=SLOANS)).json()
        same = await client.patch(
            f"/api/spots/{made['id']}", json={"name": "Sloan's Lake"}
        )
    assert same.json()["slug"] == "sloan-s-lake"


async def test_visits_are_logged_and_summarised_on_the_list(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = (await client.post("/api/spots", json=SLOANS)).json()
        url = f"/api/spots/{made['id']}/visits"
        early = await client.post(url, json={"visited_on": "2026-10-01", "note": " "})
        today = await client.post(url, json={})
        future = await client.post(
            url,
            json={
                "visited_on": (
                    datetime.now(OWNER_TZ).date() + timedelta(days=2)
                ).isoformat()
            },
        )
        listed = (await client.get("/api/spots")).json()
    assert early.status_code == 201
    assert early.json()["note"] is None
    assert today.json()["visited_on"] == datetime.now(OWNER_TZ).date().isoformat()
    assert future.status_code == 422
    assert listed[0]["visit_count"] == 2
    assert listed[0]["last_visit"] == datetime.now(OWNER_TZ).date().isoformat()


async def test_deleting_a_spot_takes_its_visits(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = (await client.post("/api/spots", json=SLOANS)).json()
        await client.post(f"/api/spots/{made['id']}/visits", json={})
        gone = await client.delete(f"/api/spots/{made['id']}")
        again = await client.delete(f"/api/spots/{made['id']}")
    async with sessionmaker_for_test() as session:
        assert (await session.scalars(select(Visit))).all() == []
        assert (await session.scalars(select(Spot))).all() == []
    assert (gone.status_code, again.status_code) == (204, 404)


async def test_deleting_an_anchor_unlinks_its_candidates(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        anchor = (
            await client.post(
                "/api/spots",
                json={"name": "Home", "coords": "39.74, -104.99", "anchor": True},
            )
        ).json()
        async with sessionmaker_for_test() as session:
            session.add(
                Candidate(
                    source=CandidateSource.OSM,
                    source_id="node/1",
                    name="A café",
                    lat=39.741,
                    lng=-104.991,
                    nearest_anchor_id=anchor["id"],
                )
            )
            await session.commit()
        await client.delete(f"/api/spots/{anchor['id']}")
    async with sessionmaker_for_test() as session:
        candidate = (await session.scalars(select(Candidate))).one()
    assert candidate.nearest_anchor_id is None


async def test_unknown_spot_is_404(sessionmaker_for_test):
    other = "00000000-0000-4000-8000-000000000000"
    async with client_for(sessionmaker_for_test) as client:
        patch = await client.patch(f"/api/spots/{other}", json={"blurb": "x"})
        visit = await client.post(f"/api/spots/{other}/visits", json={})
    assert (patch.status_code, visit.status_code) == (404, 404)


async def test_status_reports_each_job_or_null(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add(
            SpotSetting(key="candidates.last_run", value={"new": 9, "status": "ok"})
        )
        session.add(SpotSetting(key="planner.constraints", value={"x": 1}))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        status = (await client.get("/api/spots/status")).json()
    assert status == {
        "candidates.last_run": {"new": 9, "status": "ok"},
        "weather.last_run": None,
    }
