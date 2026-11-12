"""Today's routes: closet_today_routes.py over the database, with a fake model."""

import asyncio
import io
import json
import uuid
from contextlib import asynccontextmanager
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from PIL import Image as PILImage
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

import closet_rank
import closet_today_routes
import weather
from closet_today_routes import create_closet_today_router
from llm import LLMError, _quota_message
from models import (
    ClosetProfile,
    ClosetSetting,
    Garment,
    GarmentCategory,
    GarmentImage,
    GarmentStatus,
    Outfit,
    OutfitGarment,
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
        None,  # the day's stored plan, from the template
        choose((["rain shell", "navy cardigan", "grey trousers", "sneakers"], "Ok.")),
    )
    async with client_for(sessionmaker_for_test, provider) as client:
        before = (await client.get("/api/closet/today")).json()["plan"]
        response = await client.post(
            "/api/closet/plan", json={"lock": ids["blue shirt"]}
        )
        unknown = await client.post(
            "/api/closet/plan", json={"lock": "00000000-0000-0000-0000-000000000000"}
        )
        # Unlocking reads the stored plan, which the lock left alone.
        after = (await client.get("/api/closet/today")).json()
    assert after["plan"] == before and after["planned_just_now"] is False
    plan = response.json()["plan"]
    assert plan["lock"] == ids["blue shirt"]
    assert "navy oxford" not in numbers(provider.calls[1][0])  # top is fixed
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


CORE = ("top", "bottom", "shoes")


def core(outfit) -> set[str]:
    return {g["id"] for g in outfit["garments"] if g["slot"] in CORE}


async def declined_rows(factory) -> list[tuple[str, set[str]]]:
    async with factory() as session:
        rows = (await session.scalars(select(Outfit))).all()
        out = []
        for row in rows:
            ids = await session.scalars(
                select(OutfitGarment.garment_id).where(
                    OutfitGarment.outfit_id == row.id
                )
            )
            out.append((row.not_this, {str(i) for i in ids}))
    return out


async def test_not_this_declines_the_outfit_on_screen_and_keeps_the_lock(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test)
    on_screen = [
        ("top", "white shirt"),
        ("bottom", "grey trousers"),
        ("shoes", "sneakers"),
    ]
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        await client.get("/api/closet/today")
        response = await client.post(
            "/api/closet/plan",
            json={
                "not_this": "too_warm",
                "lock": ids["white shirt"],
                "declined": [{"slot": s, "id": ids[n]} for s, n in on_screen],
            },
        )
    assert response.status_code == 200, response.text
    plan = response.json()["plan"]
    assert plan["lock"] == ids["white shirt"]
    declined = {ids[n] for _, n in on_screen}
    assert await declined_rows(sessionmaker_for_test) == [("too_warm", declined)]
    for outfit in [plan["lead"], *plan["alternatives"]]:
        assert "white shirt" in names(outfit)
        assert core(outfit) != declined


async def test_not_this_refuses_a_declined_garment_not_active(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        row = await session.get(Garment, uuid.UUID(ids["chinos"]))
        row.status = GarmentStatus.PACKED
        await session.commit()
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        retired = await client.post(
            "/api/closet/plan",
            json={
                "not_this": "too_warm",
                "declined": [{"slot": "bottom", "id": ids["chinos"]}],
            },
        )
        unknown = await client.post(
            "/api/closet/plan",
            json={
                "not_this": "too_warm",
                "declined": [
                    {"slot": "top", "id": "00000000-0000-0000-0000-000000000000"}
                ],
            },
        )
    assert retired.status_code == 422 and unknown.status_code == 422
    assert await count(sessionmaker_for_test, Outfit) == 0


async def test_a_second_not_this_never_brings_back_the_first(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        first = (await client.get("/api/closet/today")).json()["plan"]["lead"]
        second = (
            await client.post("/api/closet/plan", json={"not_this": "too_warm"})
        ).json()["plan"]
        third = (
            await client.post("/api/closet/plan", json={"not_this": "too_formal"})
        ).json()["plan"]
    assert core(second["lead"]) != core(first)
    for outfit in [third["lead"], *third["alternatives"]]:
        assert core(outfit) not in (core(first), core(second["lead"]))


async def test_the_plan_job_stops_calling_a_failing_model(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        session.add(
            ClosetProfile(
                id=1,
                weekly_occasions=[
                    "office",
                    "wfh",
                    "date",
                    "weekend",
                    "travel",
                    "event",
                    "office",
                ],
            )
        )
        await session.commit()
    provider = FakeProvider(*[daily_quota() for _ in range(6)])
    async with client_for(sessionmaker_for_test, provider) as client:
        summary = (await client.post("/api/closet/jobs/plan")).json()
    assert len(provider.calls) == 1
    planned = [p for p in summary["plans"] if p["ranked_by"] is not None]
    assert len(planned) == len(summary["plans"]) == 6
    assert {p["ranked_by"] for p in planned} == {"template"}
    assert summary["note"] == "Gemini's daily quota is used up"
    assert all(
        p["note"] == closet_today_routes.JOB_SKIP_FAILED for p in summary["plans"][1:]
    )
    assert summary["ok"] is True and summary["state"] == "template"
    assert await count(sessionmaker_for_test, OutfitPlan) == 6


async def test_the_plan_job_out_of_time_makes_no_call(
    sessionmaker_for_test, monkeypatch
):
    await seed(sessionmaker_for_test)
    monkeypatch.setattr(closet_today_routes, "JOB_MODEL_BUDGET_S", -1)
    provider = FakeProvider()
    async with client_for(sessionmaker_for_test, provider) as client:
        summary = (await client.post("/api/closet/jobs/plan")).json()
    assert provider.calls == []
    assert summary["note"] == closet_today_routes.JOB_SKIP_TIME
    assert summary["ok"] is True


async def test_a_plan_job_that_raises_records_the_failure(
    sessionmaker_for_test, monkeypatch
):
    await seed(sessionmaker_for_test)

    async def broken(session, day):
        raise RuntimeError("weather table gone")

    monkeypatch.setattr(weather, "hours_for_day", broken)
    async with client_for(sessionmaker_for_test, FakeProvider()) as client:
        with pytest.raises(RuntimeError):
            await client.post("/api/closet/jobs/plan")
    async with sessionmaker_for_test() as session:
        status = await session.get(ClosetSetting, "plan.last_run")
    assert status.value["state"] == "failed" and status.value["ok"] is False
    assert "weather table gone" in status.value["note"]


async def test_wore_this_needs_active_garments(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        row = await session.get(Garment, uuid.UUID(ids["chinos"]))
        row.status = GarmentStatus.PACKED
        await session.commit()
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        response = await client.post(
            "/api/closet/wore",
            json=_wore(ids, ("top", "navy oxford"), ("bottom", "chinos")),
        )
    assert response.status_code == 422
    assert await count(sessionmaker_for_test, Outfit) == 0


async def test_two_wore_this_at_once_leave_one_outfit(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        first, second = await asyncio.gather(
            client.post(
                "/api/closet/wore",
                json=_wore(ids, ("top", "navy oxford"), ("bottom", "chinos")),
            ),
            client.post(
                "/api/closet/wore",
                json=_wore(ids, ("top", "white shirt"), ("bottom", "chinos")),
            ),
        )
    assert first.status_code == second.status_code == 201
    assert await count(sessionmaker_for_test, Outfit) == 1
    assert await count(sessionmaker_for_test, Wear) == 2


def _plan_ids(plan) -> set[str]:
    return {
        g["id"]
        for outfit in [plan["lead"], *plan["alternatives"]]
        for g in outfit["garments"]
    }


@pytest.mark.parametrize("change", ["delete", "packed", "listed", "gone"])
async def test_today_replans_when_its_plan_names_a_garment_no_longer_active(
    sessionmaker_for_test, change
):
    ids = await seed(sessionmaker_for_test)
    provider = FakeProvider(
        choose(
            (["wool coat", "grey sweater", "navy oxford", "chinos", "brown boots"], "x")
        )
    )
    async with client_for(sessionmaker_for_test, provider) as client:
        first = (await client.get("/api/closet/today")).json()["plan"]
        gone = ids["wool coat"]
        assert gone in _plan_ids(first)
        async with sessionmaker_for_test() as session:
            garment = await session.get(Garment, uuid.UUID(gone))
            if change == "delete":
                await session.delete(garment)
            else:
                garment.status = GarmentStatus(change)
            await session.commit()
        again = (await client.get("/api/closet/today")).json()
    assert again["planned_just_now"] is True
    assert gone not in _plan_ids(again["plan"])
    # The fresh plan is stored: the next read is that plan, unchanged.
    async with client_for(sessionmaker_for_test, provider) as client:
        third = (await client.get("/api/closet/today")).json()
    assert third["planned_just_now"] is False and third["plan"] == again["plan"]


async def test_today_replans_the_same_occasion_and_bike_it_read(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        url = "/api/closet/today?occasion=wfh&bike=true"
        first = (await client.get(url)).json()["plan"]
        gone = first["lead"]["garments"][0]["id"]
        assert gone in ids.values()
        async with sessionmaker_for_test() as session:
            await session.delete(await session.get(Garment, uuid.UUID(gone)))
            await session.commit()
        again = (await client.get(url)).json()["plan"]
    assert again["occasion"] == "wfh" and again["bike"] is True
    assert gone not in _plan_ids(again)


async def _stale(factory, garment_id, status=None):
    async with factory() as session:
        row = await session.get(Garment, uuid.UUID(garment_id))
        if status is None:
            await session.delete(row)
        else:
            row.status = status
        await session.commit()


async def _plan_rows(factory) -> list[OutfitPlan]:
    async with factory() as session:
        return list((await session.scalars(select(OutfitPlan))).all())


async def test_stored_only_on_a_stale_plan_answers_none_and_calls_no_model(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test)
    provider = FakeProvider(None)
    async with client_for(sessionmaker_for_test, provider) as client:
        plan = (await client.get("/api/closet/today")).json()["plan"]
        calls = len(provider.calls)
        await _stale(
            sessionmaker_for_test,
            plan["lead"]["garments"][0]["id"],
            GarmentStatus.PACKED,
        )
        body = (await client.get("/api/closet/today?stored_only=true")).json()
    assert body["plan"] is None and body["planned_just_now"] is False
    assert len(provider.calls) == calls and ids


async def test_only_an_alternative_naming_an_inactive_garment_is_stale(
    sessionmaker_for_test,
):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        plan = (await client.get("/api/closet/today")).json()["plan"]
        lead_ids = {g["id"] for g in plan["lead"]["garments"]}
        only_alt = next(
            g["id"]
            for alt in plan["alternatives"]
            for g in alt["garments"]
            if g["id"] not in lead_ids
        )
        await _stale(sessionmaker_for_test, only_alt)
        again = (await client.get("/api/closet/today")).json()
    assert again["planned_just_now"] is True
    assert only_alt not in _plan_ids(again["plan"])


@pytest.mark.parametrize(
    "damage",
    [
        {"alternatives": None},
        {"alternatives": "x"},
        {"lead": None},
        {"lead": {"garments": [{"slot": "top", "id": "not-a-uuid"}]}},
        {"lead": {}},
    ],
)
async def test_a_malformed_stored_plan_is_planned_again_not_a_500(
    sessionmaker_for_test, damage
):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        first = (await client.get("/api/closet/today")).json()["plan"]
        async with sessionmaker_for_test() as session:
            row = (await session.scalars(select(OutfitPlan))).one()
            row.body = {**first, **damage}
            await session.commit()
        response = await client.get("/api/closet/today")
    assert response.status_code == 200
    body = response.json()
    if "alternatives" not in damage or damage["alternatives"] == "x":
        # Unreadable ids are stale: planned again. A plain null or missing
        # lead or alternatives is merely tolerated.
        if damage != {"lead": None} and damage != {"lead": {}}:
            assert body["planned_just_now"] is True
            assert body["plan"]["lead"] is not None


async def test_a_stale_plan_with_no_new_lead_deletes_its_row(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        await client.get("/api/closet/today")
        assert len(await _plan_rows(sessionmaker_for_test)) == 1
        for gid in ids.values():
            await _stale(sessionmaker_for_test, gid)
        again = (await client.get("/api/closet/today")).json()
        later = (await client.get("/api/closet/today?stored_only=true")).json()
    assert again["plan"]["lead"] is None
    assert await _plan_rows(sessionmaker_for_test) == []
    assert later["plan"] is None


async def _with_lock(factory, lock):
    async with factory() as session:
        row = (await session.scalars(select(OutfitPlan))).one()
        row.body = {**row.body, "lock": lock}
        await session.commit()


async def test_a_stale_plan_keeps_its_active_build_around_lock(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        plan = (await client.get("/api/closet/today")).json()["plan"]
        await _with_lock(sessionmaker_for_test, ids["blue shirt"])
        victim = next(
            g["id"] for g in plan["lead"]["garments"] if g["id"] != ids["blue shirt"]
        )
        await _stale(sessionmaker_for_test, victim)
        again = (await client.get("/api/closet/today")).json()["plan"]
    assert again["lock"] == ids["blue shirt"]
    for outfit in [again["lead"], *again["alternatives"]]:
        assert "blue shirt" in names(outfit)


async def test_a_stale_plan_drops_a_lock_on_the_inactive_garment(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        await client.get("/api/closet/today")
        await _with_lock(sessionmaker_for_test, ids["blue shirt"])
        await _stale(sessionmaker_for_test, ids["blue shirt"], GarmentStatus.PACKED)
        # Make the stored plan name the packed garment so it is stale.
        async with sessionmaker_for_test() as session:
            row = (await session.scalars(select(OutfitPlan))).one()
            body = dict(row.body)
            body["lead"] = {
                **body["lead"],
                "garments": [
                    *body["lead"]["garments"],
                    {"slot": "top", "id": ids["blue shirt"], "transient": False},
                ],
            }
            row.body = body
            await session.commit()
        response = await client.get("/api/closet/today")
    assert response.status_code == 200
    assert response.json()["plan"]["lock"] is None


async def test_not_this_on_a_stale_plan_skips_the_deleted_garment(
    sessionmaker_for_test,
):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        plan = (await client.get("/api/closet/today")).json()["plan"]
        gone = plan["lead"]["garments"][0]["id"]
        await _stale(sessionmaker_for_test, gone)
        response = await client.post(
            "/api/closet/plan", json={"not_this": sorted(closet_rank.NOT_THIS)[0]}
        )
    assert response.status_code == 200
    rows = await declined_rows(sessionmaker_for_test)
    assert all(gone not in ids for _, ids in rows)
