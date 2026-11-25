"""Per-piece feedback (#551): the endpoints, the exclusion and the re-plan."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

from models import Garment, GarmentFeedback, GarmentStatus
from tests.test_closet_today import (
    DAY,
    FakeProvider,
    client_for,
    count,
    names,
    seed,
)

pytestmark = pytest.mark.asyncio

KINDS = ["not_today", "too_cold", "too_warm"]


def body(ids, name, kind, **extra):
    return {"garment_id": ids[name], "kind": kind, **extra}


@pytest.mark.parametrize("kind", KINDS)
async def test_a_day_kind_is_added_once_listed_and_removed(sessionmaker_for_test, kind):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        first = await client.post(
            "/api/closet/feedback", json=body(ids, "navy oxford", kind)
        )
        again = await client.post(
            "/api/closet/feedback", json=body(ids, "navy oxford", kind)
        )
        listed = (await client.get("/api/closet/feedback")).json()
        gone = await client.delete(f"/api/closet/feedback/{first.json()['id']}")
        after = (await client.get("/api/closet/feedback")).json()
    assert first.status_code == 201 and again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    assert first.json()["day"] == DAY.isoformat()
    assert first.json()["occasion"] is None and first.json()["kind"] == kind
    assert await count(sessionmaker_for_test, GarmentFeedback) == 0
    assert [r["id"] for r in listed["feedback"]] == [first.json()["id"]]
    assert gone.status_code == 204 and after["feedback"] == []


async def test_never_for_occasion_holds_every_day_until_removed(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    later = (DAY + timedelta(days=30)).isoformat()
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        first = await client.post(
            "/api/closet/feedback",
            json=body(ids, "navy oxford", "never_for_occasion", occasion="office"),
        )
        again = await client.post(
            "/api/closet/feedback",
            json=body(ids, "navy oxford", "never_for_occasion", occasion="office"),
        )
        other = await client.post(
            "/api/closet/feedback",
            json=body(ids, "navy oxford", "never_for_occasion", occasion="weekend"),
        )
        far = (await client.get(f"/api/closet/feedback?day={later}")).json()
        removed = await client.delete(f"/api/closet/feedback/{first.json()['id']}")
        missing = await client.delete(f"/api/closet/feedback/{uuid.uuid4()}")
    assert (first.status_code, again.status_code, other.status_code) == (201, 200, 201)
    assert first.json()["day"] is None and first.json()["occasion"] == "office"
    assert len(far["feedback"]) == 2  # no day: in force on every day
    assert removed.status_code == 204 and missing.status_code == 404


async def test_the_list_holds_that_days_rows_and_every_standing_one(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test)
    tomorrow = (DAY + timedelta(days=1)).isoformat()
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        await client.post("/api/closet/feedback", json=body(ids, "chinos", "not_today"))
        await client.post(
            "/api/closet/feedback",
            json=body(ids, "sneakers", "too_warm", day=tomorrow),
        )
        await client.post(
            "/api/closet/feedback",
            json=body(ids, "white shirt", "never_for_occasion", occasion="office"),
        )
        today = (await client.get("/api/closet/feedback")).json()
        next_day = (await client.get(f"/api/closet/feedback?day={tomorrow}")).json()
    assert {(r["garment_id"], r["kind"]) for r in today["feedback"]} == {
        (ids["chinos"], "not_today"),
        (ids["white shirt"], "never_for_occasion"),
    }
    assert {(r["garment_id"], r["kind"]) for r in next_day["feedback"]} == {
        (ids["sneakers"], "too_warm"),
        (ids["white shirt"], "never_for_occasion"),
    }


async def test_unknown_and_inactive_garments_are_404(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        row = await session.get(Garment, uuid.UUID(ids["chinos"]))
        row.status = GarmentStatus.PACKED
        await session.commit()
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        unknown = await client.post(
            "/api/closet/feedback",
            json={"garment_id": str(uuid.uuid4()), "kind": "not_today"},
        )
        packed = await client.post(
            "/api/closet/feedback", json=body(ids, "chinos", "not_today")
        )
    assert unknown.status_code == 404 and packed.status_code == 404
    assert await count(sessionmaker_for_test, GarmentFeedback) == 0


@pytest.mark.parametrize(
    "extra",
    [
        {"kind": "ugly"},
        {"kind": "never_for_occasion"},
        {"kind": "never_for_occasion", "occasion": "gala"},
        {"kind": "never_for_occasion", "occasion": "office", "day": "2026-11-10"},
        {"kind": "not_today", "occasion": "office"},
    ],
)
async def test_bad_kinds_and_scopes_are_422(sessionmaker_for_test, extra):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        response = await client.post(
            "/api/closet/feedback", json={"garment_id": ids["chinos"], **extra}
        )
    assert response.status_code == 422


async def test_feedback_routes_are_401_signed_out(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        assert (await client.get("/api/closet/feedback")).status_code == 401
        assert (await client.post("/api/closet/feedback", json={})).status_code == 401
        gone = await client.delete(f"/api/closet/feedback/{uuid.uuid4()}")
        assert gone.status_code == 401


# --- the exclusion in /candidates and the re-plan -----------------------------


async def candidate_names(client, slot, query=""):
    found = (await client.get(f"/api/closet/candidates?slot={slot}{query}")).json()
    return {c["name"] for c in found["candidates"]}


@pytest.mark.parametrize("kind", KINDS)
async def test_candidates_drop_a_piece_turned_down_for_the_day(
    sessionmaker_for_test, kind
):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        before = await candidate_names(client, "top")
        await client.post("/api/closet/feedback", json=body(ids, "navy oxford", kind))
        after = await candidate_names(client, "top")
    assert "navy oxford" in before
    assert after == before - {"navy oxford"}


async def test_the_swap_fallback_drops_it_too(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        # No layers are needed on a warm day, so "outer" takes the fallback.
        before = await candidate_names(client, "outer")
        await client.post(
            "/api/closet/feedback", json=body(ids, "wool coat", "too_warm")
        )
        after = await candidate_names(client, "outer")
    assert "wool coat" in before and after == before - {"wool coat"}


async def test_never_for_occasion_applies_to_that_occasion_only(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        await client.post(
            "/api/closet/feedback",
            json=body(ids, "navy oxford", "never_for_occasion", occasion="office"),
        )
        office = await candidate_names(client, "top", "&occasion=office")
        weekend = await candidate_names(client, "top", "&occasion=weekend")
    assert "navy oxford" not in office
    assert "navy oxford" in weekend


async def test_not_today_does_not_reach_another_day(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    yesterday = (DAY - timedelta(days=1)).isoformat()
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        await client.post(
            "/api/closet/feedback",
            json=body(ids, "navy oxford", "not_today", day=yesterday),
        )
        assert "navy oxford" in await candidate_names(client, "top")


@pytest.mark.parametrize("kind", KINDS + ["never_for_occasion"])
async def test_a_replan_after_feedback_never_returns_the_piece(
    sessionmaker_for_test, kind
):
    await seed(sessionmaker_for_test)
    provider = FakeProvider(None, None)
    extra = {"occasion": "office"} if kind == "never_for_occasion" else {}
    async with client_for(sessionmaker_for_test, provider) as client:
        lead = (await client.get("/api/closet/today")).json()["plan"]["lead"]
        victim = next(g for g in lead["garments"] if g["slot"] == "top")
        await client.post(
            "/api/closet/feedback",
            json={"garment_id": victim["id"], "kind": kind, **extra},
        )
        plan = (await client.post("/api/closet/plan", json={})).json()["plan"]
    for outfit in [plan["lead"], *plan["alternatives"]]:
        assert victim["name"] not in names(outfit)
    # The re-plan's prompt says why the piece is missing.
    assert victim["name"] in provider.calls[1][0].split("Garments:\n")[0]


async def test_the_prompt_names_the_piece_and_the_reason(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    provider = FakeProvider(None)
    async with client_for(sessionmaker_for_test, provider) as client:
        await client.post(
            "/api/closet/feedback", json=body(ids, "navy oxford", "too_warm")
        )
        await client.post("/api/closet/plan", json={})
    assert "Turned down for this day: navy oxford (too warm)." in provider.calls[0][0]


async def test_the_nightly_job_plans_tomorrow_without_a_piece_turned_down_for_it(
    sessionmaker_for_test,
):
    from models import OutfitPlan

    ids = await seed(sessionmaker_for_test)
    tomorrow = DAY + timedelta(days=1)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        for name in ("navy oxford", "white shirt"):
            await client.post(
                "/api/closet/feedback",
                json=body(ids, name, "not_today", day=tomorrow.isoformat()),
            )
        await client.post("/api/closet/jobs/plan")
    async with sessionmaker_for_test() as session:
        rows = (
            await session.scalars(select(OutfitPlan).where(OutfitPlan.day == tomorrow))
        ).all()
    assert {r.occasion for r in rows} == {"office", "weekend"}
    for row in rows:
        for outfit in [row.body["lead"], *row.body["alternatives"]]:
            assert not {"navy oxford", "white shirt"} & set(names(outfit))
    # Today's own plan is untouched by tomorrow's feedback.
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        assert {"navy oxford", "white shirt"} <= await candidate_names(client, "top")


async def test_a_lock_on_a_turned_down_piece_keeps_it(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    provider = FakeProvider(None)
    async with client_for(sessionmaker_for_test, provider) as client:
        await client.post(
            "/api/closet/feedback", json=body(ids, "blue shirt", "not_today")
        )
        plan = (
            await client.post("/api/closet/plan", json={"lock": ids["blue shirt"]})
        ).json()["plan"]
    assert "blue shirt" in names(plan["lead"])
    assert "blue shirt (not today)" not in provider.calls[0][0]


def top_of(plan):
    return next(g for g in plan["lead"]["garments"] if g["slot"] == "top")


def in_plan(plan, name):
    return any(name in names(o) for o in [plan["lead"], *plan["alternatives"]])


async def test_a_stored_plan_naming_a_turned_down_piece_is_planned_again(
    sessionmaker_for_test,
):
    from models import OutfitPlan

    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        first = (await client.get("/api/closet/today")).json()["plan"]
        victim = top_of(first)
        await client.post(
            "/api/closet/feedback",
            json={"garment_id": victim["id"], "kind": "not_today"},
        )
        again = (await client.get("/api/closet/today")).json()
    assert again["planned_just_now"] is True
    assert not in_plan(again["plan"], victim["name"])
    async with sessionmaker_for_test() as session:
        assert len((await session.scalars(select(OutfitPlan))).all()) == 1


async def test_stored_only_never_shows_a_plan_naming_a_turned_down_piece(
    sessionmaker_for_test,
):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        victim = top_of((await client.get("/api/closet/today")).json()["plan"])
        await client.post(
            "/api/closet/feedback",
            json={"garment_id": victim["id"], "kind": "too_cold"},
        )
        quiet = (await client.get("/api/closet/today?stored_only=true")).json()
    assert quiet["plan"] is None  # as for an inactive piece: never stale


async def test_a_nightly_stored_weekend_plan_is_refreshed_after_not_today(
    sessionmaker_for_test,
):
    await seed(sessionmaker_for_test)
    tomorrow = DAY + timedelta(days=1)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        await client.post("/api/closet/jobs/plan")
    async with client_for(sessionmaker_for_test, no_model=True, day=tomorrow) as client:
        weekend = (await client.get("/api/closet/today?occasion=weekend")).json()
        assert weekend["planned_just_now"] is False  # the nightly's row
        victim = top_of(weekend["plan"])
        await client.post(
            "/api/closet/feedback",
            json={"garment_id": victim["id"], "kind": "not_today"},
        )
        fresh = (await client.get("/api/closet/today?occasion=weekend")).json()
    assert fresh["planned_just_now"] is True
    assert not in_plan(fresh["plan"], victim["name"])


async def test_never_for_office_leaves_the_weekend_plan_alone(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        weekend = (await client.get("/api/closet/today?occasion=weekend")).json()
        victim = top_of(weekend["plan"])
        await client.post(
            "/api/closet/feedback",
            json={
                "garment_id": victim["id"],
                "kind": "never_for_occasion",
                "occasion": "office",
            },
        )
        again = (await client.get("/api/closet/today?occasion=weekend")).json()
    assert again["planned_just_now"] is False
    assert again["plan"]["lead"] == weekend["plan"]["lead"]


async def test_the_bike_variant_is_refreshed_too(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        plain = (await client.get("/api/closet/today?bike=false")).json()["plan"]
        await client.get("/api/closet/today?bike=true")
        victim = top_of(plain)
        await client.post(
            "/api/closet/feedback",
            json={"garment_id": victim["id"], "kind": "not_today"},
        )
        for flag in ("false", "true"):
            fresh = (await client.get(f"/api/closet/today?bike={flag}")).json()
            assert not in_plan(fresh["plan"], victim["name"])


@pytest.mark.parametrize("offset, status", [(-1, 422), (0, 201), (7, 201), (8, 422)])
async def test_the_feedback_day_must_be_today_up_to_a_week_ahead(
    sessionmaker_for_test, offset, status
):
    ids = await seed(sessionmaker_for_test)
    day = (DAY + timedelta(days=offset)).isoformat()
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        response = await client.post(
            "/api/closet/feedback", json=body(ids, "chinos", "not_today", day=day)
        )
    assert response.status_code == status
