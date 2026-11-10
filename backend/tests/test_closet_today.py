"""Today's routes: closet_today_routes.py over the database, with a fake model."""

import io
import json
from contextlib import asynccontextmanager
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from PIL import Image as PILImage
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

import closet_rank
from closet_today_routes import create_closet_today_router
from llm import LLMError, _quota_message
from models import (
    ClosetSetting,
    Garment,
    GarmentCategory,
    GarmentImage,
    GarmentStatus,
    Outfit,
    OutfitPlan,
    Wear,
)

pytestmark = pytest.mark.asyncio

DAY = date(2026, 11, 10)  # a Tuesday: office by the default week
# A November day with no forecast reads as the normals (25° to 52°): a coat
# and a mid layer over the core three.
SLOTS = ["outer", "mid", "top", "bottom", "shoes"]


class FakeProvider:
    """Answers each call in turn (a dict, a callable of the prompt, or an
    exception to raise), recording the prompts and image counts."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls: list[tuple[str, int]] = []

    async def complete_json(self, prompt, schema, images=None):
        self.calls.append((prompt, len(images or [])))
        item = self.answers.pop(0) if self.answers else None
        if isinstance(item, Exception):
            raise item
        if callable(item):
            return item(prompt)
        return item


@asynccontextmanager
async def client_for(factory, provider=None, signed_in=True, no_model=False):
    app = FastAPI()
    app.include_router(
        create_closet_today_router(
            factory,
            provider_factory=None if no_model else (lambda: provider),
            today=lambda: DAY,
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


def daily_quota() -> LLMError:
    """Gemini's per-day 429, as llm.py words it."""
    body = {
        "error": {
            "details": [
                {
                    "violations": [
                        {"quotaId": "GenerateRequestsPerDayPerProjectPerModel"}
                    ]
                }
            ]
        }
    }
    return LLMError(_quota_message(body, 3))


def _webp() -> bytes:
    out = io.BytesIO()
    PILImage.new("RGB", (40, 30), (1, 2, 3)).save(out, format="WEBP")
    return out.getvalue()


CLOSET = [
    ("wool coat", "outer", 4),
    ("rain shell", "outer", 3),
    ("grey sweater", "mid", 3),
    ("navy cardigan", "mid", 3),
    ("navy oxford", "top", 2),
    ("white shirt", "top", 2),
    ("blue shirt", "top", 2),
    ("grey trousers", "bottom", 2),
    ("chinos", "bottom", 2),
    ("brown boots", "shoes", 3),
    ("sneakers", "shoes", 2),
]


async def seed(factory) -> dict[str, str]:
    """The closet above, all active and office-formal; returns name -> id."""
    ids = {}
    async with factory() as session:
        for name, category, warmth in CLOSET:
            row = Garment(
                name=name,
                category=GarmentCategory(category),
                warmth=warmth,
                formality=3,
                seasons=[],
                status=GarmentStatus.ACTIVE,
                tag_attempts=0,
            )
            session.add(row)
            await session.flush()
            session.add(
                GarmentImage(garment_id=row.id, webp=_webp(), width=40, height=30)
            )
            ids[name] = str(row.id)
        await session.commit()
    return ids


def numbers(prompt: str) -> dict[str, int]:
    """The prompt's garment list as name -> index."""
    found = {}
    for line in prompt.split("Garments:\n", 1)[1].splitlines():
        index, rest = line.split(". ", 1)
        name = rest.split(": ", 1)[1].split(" (", 1)[0]
        found[name] = int(index)
    return found


def choose(*outfits):
    """A model answer naming garments, turned into the prompt's indices."""

    def answer(prompt):
        index = numbers(prompt)
        return {
            "outfits": [
                {"indices": [index[n] for n in names], "reason": reason}
                for names, reason in outfits
            ]
        }

    return answer


def names(outfit) -> list[str]:
    return [g["name"] for g in outfit["garments"]]


async def count(factory, model) -> int:
    async with factory() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def test_routes_are_401_signed_out(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        assert (await client.get("/api/closet/today")).status_code == 401
        assert (await client.post("/api/closet/jobs/plan")).status_code == 401
        assert (await client.post("/api/closet/wore", json={})).status_code == 401


async def test_today_plans_with_the_model_and_stores_the_plan(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    provider = FakeProvider(
        choose(
            (
                ["wool coat", "grey sweater", "navy oxford", "chinos", "brown boots"],
                "Warm enough for the cold morning.",
            )
        )
    )
    async with client_for(sessionmaker_for_test, provider) as client:
        first = (await client.get("/api/closet/today")).json()
        again = (await client.get("/api/closet/today")).json()
    assert first["planned_just_now"] is True and again["planned_just_now"] is False
    assert len(provider.calls) == 1  # the second read is the stored plan
    plan = first["plan"]
    assert first["defaults"] == {"occasion": "office", "bike": False}
    assert plan["occasion"] == "office" and plan["day"] == DAY.isoformat()
    assert plan["ranked_by"] == "model"
    assert names(plan["lead"]) == [
        "wool coat",
        "grey sweater",
        "navy oxford",
        "chinos",
        "brown boots",
    ]
    assert [g["slot"] for g in plan["lead"]["garments"]] == SLOTS
    assert plan["lead"]["reason"] == "Warm enough for the cold morning."
    assert [o["ranked_by"] for o in plan["alternatives"]] == ["template", "template"]
    assert plan["model_note"] == "it chose 1; the template filled the rest"
    assert plan["weather"]["forecast"] is False
    assert plan["weather"]["sentence"].startswith("No forecast yet")
    assert plan["footnote"]["active"] == len(CLOSET)
    coat, _, top, *_ = plan["lead"]["garments"]
    assert coat["image"].startswith("/api/closet/garments/")
    assert coat["qualifier"] == "warmth 4"
    assert top["qualifier"] == "not worn yet"
    assert again["plan"] == plan
    assert await count(sessionmaker_for_test, OutfitPlan) == 1


async def test_a_model_failure_is_the_template_plan_with_the_note(
    sessionmaker_for_test,
):
    await seed(sessionmaker_for_test)
    provider = FakeProvider(daily_quota())
    async with client_for(sessionmaker_for_test, provider) as client:
        plan = (await client.get("/api/closet/today")).json()["plan"]
    assert plan["ranked_by"] == "template"
    assert plan["model_note"] and "used up" in plan["model_note"]
    assert len(names(plan["lead"])) == 5 and len(plan["alternatives"]) == 2


async def test_no_model_configured_is_the_template_plan(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        plan = (await client.get("/api/closet/today")).json()["plan"]
    assert plan["ranked_by"] == "template"
    assert plan["model_note"] == "No model is configured"


async def test_an_empty_closet_has_no_lead_and_calls_no_model(sessionmaker_for_test):
    provider = FakeProvider()
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.get("/api/closet/today")).json()
    assert body["plan"]["lead"] is None and provider.calls == []
    assert await count(sessionmaker_for_test, OutfitPlan) == 0


async def test_stored_only_never_plans(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    provider = FakeProvider()
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.get("/api/closet/today?stored_only=true")).json()
    assert body["plan"] is None and provider.calls == []


async def test_an_occasion_chip_replans_and_a_bad_one_is_422(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        response = await client.post("/api/closet/plan", json={"occasion": "weekend"})
        bad = await client.post("/api/closet/plan", json={"occasion": "gala"})
    assert response.status_code == 200
    assert response.json()["plan"]["occasion"] == "weekend"
    assert bad.status_code == 422


async def test_build_around_locks_the_garment(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    provider = FakeProvider(
        choose((["rain shell", "navy cardigan", "grey trousers", "sneakers"], "Ok."))
    )
    async with client_for(sessionmaker_for_test, provider) as client:
        response = await client.post(
            "/api/closet/plan", json={"lock": ids["blue shirt"]}
        )
        unknown = await client.post(
            "/api/closet/plan", json={"lock": "00000000-0000-0000-0000-000000000000"}
        )
    plan = response.json()["plan"]
    assert plan["lock"] == ids["blue shirt"]
    assert "navy oxford" not in numbers(provider.calls[0][0])  # top is fixed
    for outfit in [plan["lead"], *plan["alternatives"]]:
        assert "blue shirt" in names(outfit)
    assert plan["lead"]["reason"] == "You locked the blue shirt. Ok."
    assert unknown.status_code == 422


async def test_not_this_records_the_reason_and_drops_the_lead(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    provider = FakeProvider(None, None)
    async with client_for(sessionmaker_for_test, provider) as client:
        before = (await client.get("/api/closet/today")).json()["plan"]["lead"]
        response = await client.post("/api/closet/plan", json={"not_this": "too_warm"})
        bad = await client.post("/api/closet/plan", json={"not_this": "ugly"})
    after = response.json()["plan"]
    assert "Turned down lately: too warm." in provider.calls[1][0]
    key = {
        g["id"] for g in before["garments"] if g["slot"] in ("top", "bottom", "shoes")
    }
    for outfit in [after["lead"], *after["alternatives"]]:
        assert {
            g["id"]
            for g in outfit["garments"]
            if g["slot"] in ("top", "bottom", "shoes")
        } != key
    async with sessionmaker_for_test() as session:
        declined = (await session.scalars(select(Outfit))).all()
    assert [o.not_this for o in declined] == ["too_warm"]
    assert await count(sessionmaker_for_test, Wear) == 0  # not worn
    assert response.json()["worn"] is None
    assert bad.status_code == 422


async def test_candidates_list_the_slot_ranked(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        tops = (await client.get("/api/closet/candidates?slot=top")).json()
        bad = await client.get("/api/closet/candidates?slot=hat")
    assert {t["name"] for t in tops["candidates"]} == {
        "navy oxford",
        "white shirt",
        "blue shirt",
    }
    assert all(t["slot"] == "top" and t["qualifier"] for t in tops["candidates"])
    assert bad.status_code == 422


def _wore(ids, *picked, source="planned"):
    return {
        "occasion": "office",
        "bike": False,
        "source": source,
        "garments": [{"slot": slot, "id": ids[name]} for slot, name in picked],
    }


async def test_wore_this_writes_wears_and_excludes_the_top_tomorrow(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        response = await client.post(
            "/api/closet/wore",
            json=_wore(
                ids,
                ("top", "navy oxford"),
                ("bottom", "chinos"),
                ("shoes", "sneakers"),
            ),
        )
        job = (await client.post("/api/closet/jobs/plan")).json()
        today = (await client.get("/api/closet/today?stored_only=true")).json()
    assert response.status_code == 201
    assert len(response.json()["worn"]["garments"]) == 3
    assert today["worn"]["source"] == "planned"
    assert await count(sessionmaker_for_test, Wear) == 3
    assert job["day"] == (DAY + timedelta(days=1)).isoformat()
    async with sessionmaker_for_test() as session:
        stored = await session.get(
            OutfitPlan, (DAY + timedelta(days=1), "office", False)
        )
    for outfit in [stored.body["lead"], *stored.body["alternatives"]]:
        assert "navy oxford" not in names(outfit)
    assert stored.body["footnote"]["skipped_recent"] == 1


async def test_wore_this_again_today_replaces_the_first(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        await client.post(
            "/api/closet/wore",
            json=_wore(ids, ("top", "navy oxford"), ("bottom", "chinos")),
        )
        second = await client.post(
            "/api/closet/wore",
            json=_wore(
                ids, ("top", "white shirt"), ("bottom", "chinos"), source="swapped"
            ),
        )
        unknown = await client.post(
            "/api/closet/wore",
            json={
                "occasion": "office",
                "garments": [
                    {"slot": "top", "id": "00000000-0000-0000-0000-000000000000"}
                ],
            },
        )
    assert second.json()["worn"]["source"] == "swapped"
    assert await count(sessionmaker_for_test, Outfit) == 1
    async with sessionmaker_for_test() as session:
        worn = set(await session.scalars(select(Wear.garment_id)))
    assert {str(i) for i in worn} == {ids["white shirt"], ids["chinos"]}
    assert unknown.status_code == 422


async def test_match_plans_around_the_photo_and_writes_nothing(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    tagged = {
        "items": [
            {
                "index": 0,
                "attributes": {
                    "name": "green overshirt",
                    "category": "top",
                    "primary_hex": "#336633",
                    "warmth": 2,
                    "formality": 3,
                },
            }
        ]
    }
    provider = FakeProvider(
        tagged, choose((["wool coat", "grey sweater", "chinos", "brown boots"], "Hm."))
    )
    before = {
        model: await count(sessionmaker_for_test, model)
        for model in (Garment, GarmentImage, Outfit, Wear, OutfitPlan)
    }
    async with client_for(sessionmaker_for_test, provider) as client:
        response = await client.post(
            "/api/closet/match",
            files={"photo": ("shirt.webp", _webp(), "image/webp")},
        )
    assert response.status_code == 200, response.text
    plan = response.json()["plan"]
    assert plan["match"]["name"] == "green overshirt"
    assert [c[1] for c in provider.calls] == [1, 0]
    for outfit in [plan["lead"], *plan["alternatives"]]:
        top = next(g for g in outfit["garments"] if g["slot"] == "top")
        assert top["transient"] is True and top["qualifier"] == "not owned"
    assert plan["lead"]["reason"].startswith(
        "Built around the green overshirt from your photo."
    )
    after = {
        model: await count(sessionmaker_for_test, model)
        for model in (Garment, GarmentImage, Outfit, Wear, OutfitPlan)
    }
    assert after == before


async def test_match_failures(sessionmaker_for_test):
    photo = {"photo": ("shirt.webp", _webp(), "image/webp")}
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        assert (await client.post("/api/closet/match", files=photo)).status_code == 503
    provider = FakeProvider(daily_quota(), {"items": []})
    async with client_for(sessionmaker_for_test, provider) as client:
        quota = await client.post("/api/closet/match", files=photo)
        unreadable = await client.post("/api/closet/match", files=photo)
        text = await client.post(
            "/api/closet/match", files={"photo": ("a.txt", b"hi", "text/plain")}
        )
    assert quota.status_code == 502 and "used up" in quota.json()["detail"]
    assert unreadable.status_code == 502
    assert text.status_code == 415


async def test_save_as_owned_creates_an_active_garment(sessionmaker_for_test):
    attributes = {"name": "green overshirt", "category": "top", "warmth": 2}
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        response = await client.post(
            "/api/closet/garments/from-match",
            files={"photo": ("shirt.webp", _webp(), "image/webp")},
            data={"attributes": json.dumps(attributes)},
        )
        bad = await client.post(
            "/api/closet/garments/from-match",
            files={"photo": ("shirt.webp", _webp(), "image/webp")},
            data={"attributes": json.dumps({"category": "dress"})},
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "active" and body["tag_source"] == "model"
    assert body["name"] == "green overshirt" and body["image"]
    assert bad.status_code == 422


async def test_the_plan_job_plans_each_chip_of_the_week(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    full = choose(
        (["wool coat", "grey sweater", "navy oxford", "chinos", "brown boots"], "A."),
        (
            ["rain shell", "navy cardigan", "white shirt", "grey trousers", "sneakers"],
            "B.",
        ),
        (
            [
                "wool coat",
                "navy cardigan",
                "blue shirt",
                "grey trousers",
                "brown boots",
            ],
            "C.",
        ),
    )
    provider = FakeProvider(full, daily_quota())
    async with client_for(sessionmaker_for_test, provider) as client:
        summary = (await client.post("/api/closet/jobs/plan")).json()
    # The default week is office x5, weekend x2: two chips, tomorrow's first.
    assert [p["occasion"] for p in summary["plans"]] == ["office", "weekend"]
    assert [p["ranked_by"] for p in summary["plans"]] == ["model", "template"]
    assert summary["state"] == "template" and summary["ranked_by"] == "model"
    assert summary["note"] == "Gemini's daily quota is used up"
    assert len(provider.calls) == 2
    async with sessionmaker_for_test() as session:
        status = await session.get(ClosetSetting, "plan.last_run")
        stored = (await session.scalars(select(OutfitPlan.occasion))).all()
    assert status.value["state"] == "template"
    assert sorted(stored) == ["office", "weekend"]


async def test_the_plan_job_on_an_empty_closet(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, FakeProvider()) as client:
        summary = (await client.post("/api/closet/jobs/plan")).json()
    assert summary["state"] == "empty" and summary["ok"] is True


async def test_not_this_labels_fit_the_column():
    assert (
        max(len(k) for k in closet_rank.NOT_THIS)
        <= Outfit.__table__.c.not_this.type.length
    )
