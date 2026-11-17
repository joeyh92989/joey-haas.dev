"""#374: every comics route declares a response model, and the models add and
drop nothing (the keys today's bodies carry)."""

from __future__ import annotations

import pytest

from tests.test_comics_routes import FakeComicVine, _seed, client_for

pytestmark = pytest.mark.asyncio

STATE_KEYS = {
    "item_id", "title", "owned_format", "status", "is_public", "following",
    "issues_owned", "issues_skipped", "comic_run",
}  # fmt: skip
RUN_KEYS = {
    "owned", "released", "missing", "state", "ongoing", "segments",
    "owned_text", "read", "unread", "read_next",
}  # fmt: skip


async def test_every_json_route_declares_a_response_model(sessionmaker_for_test):
    """Every comics route answers JSON, so none is left to an open object."""
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        spec = (await client.get("/openapi.json")).json()
    unpinned = []
    seen = 0
    for path, methods in spec["paths"].items():
        if not path.startswith("/api/comics"):
            continue
        for method, op in methods.items():
            seen += 1
            ok = op["responses"].get("200") or op["responses"].get("201")
            schema = ok.get("content", {}).get("application/json", {}).get("schema")
            if schema in (None, {}) or schema == {"type": "object"}:
                unpinned.append(f"{method.upper()} {path}")
    assert seen == 27  # 18 + eight volume-editor routes (#334) + contents parse (#327)
    assert unpinned == []


async def test_state_bodies_keep_their_exact_keys(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        followed = (
            await client.post("/api/comics/follow", json={"external_id": "49104"})
        ).json()
        assert set(followed) == STATE_KEYS
        assert set(followed["comic_run"]) == RUN_KEYS
        # a row Follow made, holding nothing else, is removed: two keys only
        gone = (
            await client.post("/api/comics/unfollow", json={"external_id": "49104"})
        ).json()
        assert gone == {"item_id": None, "following": False}


async def test_mark_body_is_the_state_plus_what_the_tap_did(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id = await _seed(factory, issues_owned="1-2")
    async with client_for(factory, FakeComicVine()) as client:
        body = (
            await client.post(
                f"/api/comics/{item_id}/issues/3/mark", json={"state": "owned"}
            )
        ).json()
    assert set(body) == STATE_KEYS | {"number", "state", "previous"}
    assert body["previous"] is None


async def test_status_keeps_its_dotted_keys_and_leaves_a_clean_note_out(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        empty = (await client.get("/api/comics/status")).json()
        assert empty == {
            "issues.last_run": None,
            "refresh.last_run": None,
            "tags.last_run": None,
        }
        await client.post("/api/comics/refresh")
        refreshed = (await client.get("/api/comics/status")).json()
    # a clean run has no note key, not a null one
    assert set(refreshed["refresh.last_run"]) == {"at", "state", "ok"}


async def test_job_bodies_keep_their_exact_keys(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        refresh = (await client.post("/api/comics/refresh")).json()
        assert set(refresh) == {"ok", "refreshed", "errors"}
        sync = (await client.post("/api/comics/issues/sync")).json()
        assert set(sync) == {"ok", "series", "requests"}
        backfill = (await client.post("/api/comics/marks/backfill")).json()
        assert set(backfill) == {
            "series", "rows_marked", "stubs_added", "rows_changed",
            "mismatches", "errors",
        }  # fmt: skip
        pull = (await client.get("/api/comics/pull-list")).json()
        assert set(pull) == {"following", "last_refresh", "weeks", "undated"}
