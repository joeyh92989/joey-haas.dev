"""#375: every closet route declares a response model, and the models add and
drop nothing (the keys today's bodies carry)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI

from closet_review_routes import create_closet_review_router
from closet_routes import create_closet_router
from closet_today_routes import create_closet_today_router
from tests import test_closet_review as review
from tests import test_closet_routes as garments
from tests import test_closet_today as today

pytestmark = pytest.mark.asyncio

# Routes that answer no JSON, so a model would be wrong: the delete is a 204
# and the photo is WebP bytes (or a 304).
NO_MODEL = {
    ("delete", "/api/closet/garments/{garment_id}"),
    ("get", "/api/closet/garments/{garment_id}/image"),
}

GARMENT_KEYS = {
    "id", "name", "category", "subtype", "brand", "primary_color", "primary_hex",
    "secondary_color", "secondary_hex", "color_name", "color_source", "size",
    "pattern", "material", "warmth",
    "formality", "seasons", "notes", "acquired_on", "status", "back_on",
    "tag_source", "tag_attempts", "created_at", "updated_at", "image",
    "wears_12mo", "last_worn",
}  # fmt: skip
PLAN_KEYS = {
    "day", "occasion", "bike", "planned_at", "ranked_by", "model_note",
    "weather", "lead", "alternatives", "footnote", "lock",
}  # fmt: skip


async def test_every_json_route_declares_a_response_model(sessionmaker_for_test):
    factory = sessionmaker_for_test
    app = FastAPI()
    for router in (
        create_closet_router(factory),
        create_closet_today_router(factory),
        create_closet_review_router(factory),
    ):
        app.include_router(router)
    unpinned, seen = [], 0
    for path, methods in app.openapi()["paths"].items():
        if not path.startswith("/api/closet"):
            continue
        for method, op in methods.items():
            seen += 1
            if (method, path) in NO_MODEL:
                continue
            ok = op["responses"].get("200") or op["responses"].get("201")
            schema = ok.get("content", {}).get("application/json", {}).get("schema")
            if schema in (None, {}) or schema == {"type": "object"}:
                unpinned.append(f"{method.upper()} {path}")
    assert seen == 27
    assert unpinned == []


async def test_garment_bodies_keep_their_exact_keys(sessionmaker_for_test):
    async with garments.client_for(sessionmaker_for_test) as client:
        made = (await client.post("/api/closet/garments", json={})).json()
        listed = (await client.get("/api/closet/garments")).json()
        profile = (await client.get("/api/closet/profile")).json()
        status = (await client.get("/api/closet/status")).json()
        tagged = (await client.post("/api/closet/tag")).json()
    assert set(made) == GARMENT_KEYS
    assert set(listed) == {"garments", "counts"}
    assert set(listed["garments"][0]) == GARMENT_KEYS
    assert set(listed["counts"]) == {
        "total", "untagged", "active", "packed", "listed", "gone",
    }  # fmt: skip
    assert set(profile) == {
        "sizes", "coloring", "build_fit", "style_words", "dislikes",
        "weekly_occasions", "weekly_bike", "spring_turn", "autumn_turn",
        "repeat_top_days", "repeat_outfit_weeks", "tag_budget", "occasions",
    }  # fmt: skip
    assert status == {
        "tag.last_run": None,
        "plan.last_run": None,
        "opinion.last_run": None,
    }
    assert set(tagged) == {"tagged", "calls", "note", "remaining"}


async def test_tag_job_summary_keeps_its_exact_keys(sessionmaker_for_test):
    async with garments.client_for(sessionmaker_for_test) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert set(body) == {"at", "state", "ok", "tagged", "calls", "remaining", "note"}


async def test_today_bodies_keep_their_exact_keys(sessionmaker_for_test):
    ids = await today.seed(sessionmaker_for_test)
    async with today.client_for(sessionmaker_for_test, no_model=True) as client:
        body = (await client.get("/api/closet/today")).json()
        assert set(body) == {
            "plan", "planned_just_now", "worn", "defaults", "occasions",
        }  # fmt: skip
        assert set(body["plan"]) == PLAN_KEYS
        assert set(body["plan"]["footnote"]) == {"active", "fit", "skipped_recent"}
        assert set(body["plan"]["weather"]) == {
            "low", "high", "swing", "wet", "snow", "forecast", "sentence", "hours",
        }  # fmt: skip
        assert set(body["plan"]["lead"]) == {"garments", "reason", "ranked_by"}
        assert set(body["plan"]["lead"]["garments"][0]) == {
            "slot", "id", "name", "primary_color", "color_name", "primary_hex",
            "secondary_hex", "image", "qualifier", "transient",
        }  # fmt: skip
        assert set(body["defaults"]) == {"occasion", "bike"}
        candidates = (await client.get("/api/closet/candidates?slot=top")).json()
        assert set(candidates) == {"slot", "candidates"}
        wore = (
            await client.post(
                "/api/closet/wore",
                json=today._wore(ids, ("top", "navy oxford")),
            )
        ).json()
        assert set(wore) == {"worn"}
        assert set(wore["worn"]) == {"id", "occasion", "bike", "source", "garments"}
        job = (await client.post("/api/closet/jobs/plan")).json()
    assert set(job) == {
        "at", "state", "ok", "day", "occasion", "bike", "ranked_by", "note", "plans",
    }  # fmt: skip
    assert set(job["plans"][0]) == {"occasion", "ranked_by", "note"}


async def test_review_bodies_keep_their_exact_keys(sessionmaker_for_test):
    ids = await review.seed(sessionmaker_for_test)
    async with review.client_for(sessionmaker_for_test, no_model=True) as client:
        body = (await client.get("/api/closet/review")).json()
        assert set(body) == {
            "day", "turn", "next_turn", "banner", "tiles", "deck", "due_back",
            "listed", "opinion_batch_on",
        }  # fmt: skip
        assert set(body["turn"]) == {"name", "on", "open"}
        assert set(body["banner"]) == {"turn", "turn_on", "season", "count", "until"}
        assert set(body["deck"][0]) == {
            "garment", "flags", "opinion", "suggested", "back_on", "size",
        }  # fmt: skip
        assert set(body["deck"][0]["garment"]) == GARMENT_KEYS
        decided = (
            await client.post(
                f"/api/closet/garments/{ids['never worn']}/decision",
                json={"outcome": "sell"},
            )
        ).json()
        assert set(decided) == {"undo", "id", "status"}
        undone = (
            await client.post("/api/closet/undo", json={"token": decided["undo"]})
        ).json()
        assert set(undone) == {"ids", "skipped"}
        packed = (await client.post("/api/closet/pack-all")).json()
        assert set(packed) == {"ids", "undo"}
        dismissed = (await client.post("/api/closet/review/dismiss")).json()
        job = (await client.post("/api/closet/jobs/opinion")).json()
    assert set(dismissed) == {"turn_on"}
    # a run that stored nothing new carries a note key, a clean one does not
    assert {"at", "ok", "flagged", "state", "opinions"} <= set(job)
