"""#376: every recommendations and picker route declares a response
model (or is a bodyless 204), and the models keep today's exact keys."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI

from picker_routes import create_picker_router
from recommendations_routes import create_recommendations_router
from tests.test_recommendations_routes import _seed, radar_client

pytestmark = pytest.mark.asyncio

# `response_model=None` routes: a 204 answers no body at all.
BODYLESS = {
    ("post", "/api/picker/events"),
    ("delete", "/api/picker/events/{item_id}/never"),
    ("delete", "/api/picker/events/{item_id}/skipped"),
}
PREFIXES = ("/api/recommendations", "/api/picker")


def _spec() -> dict:
    app = FastAPI()
    app.include_router(create_recommendations_router(None, {}, asyncio.Lock()))
    app.include_router(create_picker_router(None))
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
    assert seen == 14
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
