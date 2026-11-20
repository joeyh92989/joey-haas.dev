"""#376: every recommendations, picker and spots route declares a response
model (or is a bodyless 204), and the models keep today's exact keys."""

from __future__ import annotations

import asyncio
from datetime import date

import pytest
from fastapi import FastAPI

from picker_routes import create_picker_router
from recommendations_routes import create_recommendations_router
from spots_candidates_routes import create_candidates_router
from spots_routes import create_spots_router
from spots_weekend_routes import create_weekend_router
from tests.test_recommendations_routes import _seed, radar_client
from tests.test_spots_candidates import client_for as candidates_client
from tests.test_spots_weekend import client_for as weekend_client

pytestmark = pytest.mark.asyncio

# `response_model=None` routes: a 204 answers no body at all.
BODYLESS = {
    ("post", "/api/picker/events"),
    ("delete", "/api/picker/events/{item_id}/never"),
    ("delete", "/api/picker/events/{item_id}/skipped"),
    ("delete", "/api/spots/{spot_id}"),
}
PREFIXES = ("/api/recommendations", "/api/picker", "/api/spots")


def _spec() -> dict:
    app = FastAPI()
    app.include_router(create_recommendations_router(None, {}, asyncio.Lock()))
    app.include_router(create_picker_router(None))
    app.include_router(create_spots_router(None))
    app.include_router(create_weekend_router(None))
    app.include_router(create_candidates_router(None))
    return app.openapi()


async def test_every_route_is_pinned_in_openapi_or_a_listed_204():
    unpinned, seen, bodyless = [], 0, set()
    for path, methods in _spec()["paths"].items():
        if not path.startswith(PREFIXES):
            continue
        for method, op in methods.items():
            seen += 1
            if "204" in op["responses"]:
                bodyless.add((method, path))
                continue
            ok = op["responses"].get("200") or op["responses"].get("201")
            schema = ok.get("content", {}).get("application/json", {}).get("schema")
            if schema in (None, {}) or schema == {"type": "object"}:
                unpinned.append(f"{method.upper()} {path}")
    assert seen == 32
    assert unpinned == []
    assert bodyless == BODYLESS


async def test_radar_bodies_keep_their_exact_keys(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with radar_client(sessionmaker_for_test) as client:
        generated = (
            await client.post("/api/recommendations/generate", json={"kind": "radar"})
        ).json()
        assert set(generated) == {"batch_id", "counts", "digital_error"}
        listed = (await client.get("/api/recommendations?kind=radar")).json()
        assert set(listed) == {"generated_at", "personalised", "catalogue", "sections"}
        row = next(r for rows in listed["sections"].values() for r in rows)
        assert set(row) == {
            "id", "title", "cover_url", "release_date", "release_precision",
            "platform", "physical_format", "format_note", "reasons", "score",
            "status", "store_lines", "hypes", "lane", "igdb_url",
        }  # fmt: skip
        store = (await client.get("/api/recommendations/store-list")).json()
        assert set(store) == {"generated_at", "catalogue", "sections"}
        entry = next(r for rows in store["sections"].values() for r in rows)
        assert set(entry) == set(row) | {"top_pick", "new", "kind"}
        assert (await client.get("/api/recommendations/watching")).json() == []
        answered = await client.post(f"/api/recommendations/{row['id']}/skip")
        assert answered.json() == {"status": "skipped"}


async def test_the_plan_and_its_answers_keep_their_exact_keys(sessionmaker_for_test):
    async with weekend_client(
        sessionmaker_for_test, today=date(2026, 11, 11)
    ) as client:
        plan = (await client.get("/api/spots/plan")).json()
        assert set(plan) == {
            "today", "week", "days", "suggestions", "constraints", "skips",
            "weather", "recent_visits", "seed",
        }  # fmt: skip
        assert set(plan["constraints"]) == {
            "kid_along", "bike_if_dry", "max_miles", "home_by",
        }  # fmt: skip
        put = await client.put("/api/spots/constraints", json={})
        assert set(put.json()) == set(plan["constraints"])
        unsaved = (
            await client.post("/api/spots/plan/unsave", json={"slot_key": "best"})
        ).json()
        assert unsaved == {"saved": {}, "days": {}, "skips": []}


async def test_a_finder_run_with_no_anchor_leaves_the_rest_out(
    sessionmaker_for_test,
):
    async with candidates_client(sessionmaker_for_test) as client:
        body = (await client.post("/api/spots/candidates/refresh")).json()
    assert set(body) == {"at", "state"}
    assert body["state"] == "no_anchors"
