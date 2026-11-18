"""Denver spots' admin routes (spots_routes.py)."""

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from models import (
    Candidate,
    CandidateSource,
    OutingVerdict,
    Spot,
    SpotSetting,
    Visit,
)
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


# --- city (story #343) ---------------------------------------------------------


async def _stored_city(factory, spot_id):
    async with factory() as session:
        return (await session.get(Spot, spot_id)).city


async def test_a_spot_with_no_city_is_denver_and_spellings_are_one_city(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        plain = await client.post("/api/spots", json=SLOANS)
        one = await client.post("/api/spots", json={**SLOANS, "city": "Denver"})
        two = await client.post("/api/spots", json={**SLOANS, "city": " DENVER "})
    assert [r.json()["city"] for r in (plain, one, two)] == ["denver"] * 3


async def test_a_private_boulder_spot_is_stored_lower_case(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = await client.post("/api/spots", json={**SLOANS, "city": "Boulder"})
    assert made.status_code == 201
    assert made.json()["city"] == "boulder"
    assert await _stored_city(sessionmaker_for_test, made.json()["id"]) == "boulder"


@pytest.mark.parametrize("city", ["", "   "])
async def test_a_blank_city_is_a_422_not_denver(sessionmaker_for_test, city):
    async with client_for(sessionmaker_for_test) as client:
        made = await client.post("/api/spots", json={**SLOANS, "city": city})
    assert made.status_code == 422
    assert made.json()["detail"] == "A city is required."


async def test_a_public_spot_outside_denver_is_a_422_on_create(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = await client.post(
            "/api/spots", json={**SLOANS, "city": "Boulder", "is_public": True}
        )
        listed = await client.get("/api/spots")
    assert made.status_code == 422
    assert made.json()["detail"] == "A public place has to be in Denver."
    assert listed.json() == []


async def test_publishing_a_boulder_spot_is_a_422(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = (
            await client.post("/api/spots", json={**SLOANS, "city": "Boulder"})
        ).json()
        url = f"/api/spots/{made['id']}"
        refused = await client.patch(url, json={"is_public": True})
        async with sessionmaker_for_test() as session:
            row = await session.get(Spot, uuid.UUID(made["id"]))
        assert (row.city, row.is_public) == ("boulder", False)
        both_ok = await client.patch(url, json={"city": "Denver", "is_public": True})
    assert refused.status_code == 422
    assert refused.json()["detail"] == "A public place has to be in Denver."
    assert await _stored_city(sessionmaker_for_test, made["id"]) == "denver"
    assert both_ok.status_code == 200 and both_ok.json()["is_public"] is True


async def test_moving_a_public_spot_away_from_denver_needs_it_private(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        made = (
            await client.post("/api/spots", json={**SLOANS, "is_public": True})
        ).json()
        url = f"/api/spots/{made['id']}"
        refused = await client.patch(url, json={"city": "Boulder"})
        assert refused.status_code == 422
        assert await _stored_city(sessionmaker_for_test, made["id"]) == "denver"
        moved = await client.patch(url, json={"city": "Boulder", "is_public": False})
    assert moved.status_code == 200
    assert (moved.json()["city"], moved.json()["is_public"]) == ("boulder", False)


async def test_a_city_patch_normalises_and_a_blank_one_is_refused(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        made = (
            await client.post("/api/spots", json={**SLOANS, "city": "Boulder"})
        ).json()
        url = f"/api/spots/{made['id']}"
        blank = await client.patch(url, json={"city": " "})
        null = await client.patch(url, json={"city": None})
        back = await client.patch(url, json={"city": "denver "})
    assert blank.status_code == 422 and null.status_code == 422
    assert back.status_code == 200 and back.json()["city"] == "denver"


async def test_a_legacy_public_boulder_row_is_editable_but_not_re_published(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        legacy = Spot(
            name="Old cafe",
            slug="old-cafe",
            lat=40.0,
            lng=-105.27,
            tags=[],
            is_public=True,
            city="boulder",
        )
        session.add(legacy)
        await session.commit()
        legacy_id = legacy.id
    async with client_for(sessionmaker_for_test) as client:
        url = f"/api/spots/{legacy_id}"
        renamed = await client.patch(url, json={"name": "Older cafe"})
        resent = await client.patch(url, json={"is_public": True})
    assert renamed.status_code == 200
    body = renamed.json()
    assert (body["name"], body["is_public"], body["city"]) == (
        "Older cafe",
        True,
        "boulder",
    )
    assert resent.status_code == 422
    assert resent.json()["detail"] == "A public place has to be in Denver."


async def test_resending_public_on_a_public_denver_spot_changes_nothing(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        made = (
            await client.post("/api/spots", json={**SLOANS, "is_public": True})
        ).json()
        again = await client.patch(f"/api/spots/{made['id']}", json={"is_public": True})
    assert again.status_code == 200
    assert again.json() == made


async def test_an_explicit_null_city_is_a_422_on_create_and_patch(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        made = (await client.post("/api/spots", json=SLOANS)).json()
        post = await client.post("/api/spots", json={**SLOANS, "city": None})
        patch = await client.patch(f"/api/spots/{made['id']}", json={"city": None})
    assert (post.status_code, patch.status_code) == (422, 422)
    assert post.json()["detail"] == patch.json()["detail"] == "A city is required."


# --- Outings: the columns story #344 added to visits. ------------------------


FROZEN_DAY = datetime(2026, 6, 15, 12, 0, tzinfo=OWNER_TZ)


@pytest.fixture
def mid_june(monkeypatch):
    """Freezes the route's clock mid-month: on the last day of a month, next
    month's first day is inside the one-day grace and the month tests would
    flip with the calendar."""
    import spots_routes

    class _Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return FROZEN_DAY.astimezone(tz) if tz else FROZEN_DAY

    monkeypatch.setattr(spots_routes, "datetime", _Frozen)
    return FROZEN_DAY.date()


def _denver_today():
    return datetime.now(OWNER_TZ).date()


def _next_month_start(day):
    return (
        day.replace(day=1, month=day.month + 1)
        if day.month < 12
        else day.replace(day=1, month=1, year=day.year + 1)
    )


async def _spot_url(client) -> str:
    made = (await client.post("/api/spots", json=SLOANS)).json()
    return f"/api/spots/{made['id']}/visits"


async def test_a_visit_with_only_a_date_has_no_outing_fields(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        made = await client.post(url, json={"visited_on": "2026-10-01"})
    assert made.status_code == 201
    body = made.json()
    assert body["visited_on"] == "2026-10-01"
    assert body["precision"] == "day"
    assert (body["title"], body["verdict"], body["kid_along"]) == (None, None, None)


async def test_every_outing_field_round_trips_in_the_post_response(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        made = await client.post(
            url,
            json={
                "visited_on": "2026-10-04",
                "precision": "day",
                "title": "Rockies game",
                "verdict": "loved",
                "kid_along": True,
                "note": "Sat in the shade",
            },
        )
    assert made.status_code == 201
    body = made.json()
    assert body["title"] == "Rockies game"
    assert body["verdict"] == "loved"
    assert body["kid_along"] is True
    assert body["precision"] == "day"
    assert body["note"] == "Sat in the shade"
    async with sessionmaker_for_test() as session:
        row = (await session.scalars(select(Visit))).one()
    assert (row.title, row.verdict, row.kid_along) == (
        "Rockies game",
        OutingVerdict.LOVED,
        True,
    )


async def test_a_month_outing_is_stored_as_the_first_of_the_month(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        month = await client.post(
            url, json={"visited_on": "2026-03-17", "precision": "month"}
        )
        year = await client.post(
            url, json={"visited_on": "2025-08-30", "precision": "year"}
        )
        listed = (await client.get("/api/spots")).json()
    assert month.json()["visited_on"] == "2026-03-01"
    assert month.json()["precision"] == "month"
    assert year.json()["visited_on"] == "2025-01-01"
    assert listed[0]["last_visit"] == "2026-03-01"


async def test_the_current_month_and_year_are_accepted(sessionmaker_for_test, mid_june):
    today = mid_june
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        month = await client.post(
            url, json={"visited_on": today.isoformat(), "precision": "month"}
        )
        year = await client.post(
            url, json={"visited_on": today.isoformat(), "precision": "year"}
        )
        # A later day of the same month or year is in the future as a day but
        # not as a period: only the period's start is checked.
        month_end = await client.post(
            url,
            json={
                "visited_on": _next_month_start(today).isoformat(),
                "precision": "day",
            },
        )
        late_month = await client.post(
            url,
            json={
                "visited_on": (
                    _next_month_start(today) - timedelta(days=1)
                ).isoformat(),
                "precision": "month",
            },
        )
        late_year = await client.post(
            url,
            json={"visited_on": f"{today.year}-12-31", "precision": "year"},
        )
        # No date at all: today, normalised to the period's start.
        default_month = await client.post(url, json={"precision": "month"})
    assert month.status_code == 201
    assert month.json()["visited_on"] == today.replace(day=1).isoformat()
    assert year.status_code == 201
    assert year.json()["visited_on"] == today.replace(month=1, day=1).isoformat()
    assert late_month.status_code == 201
    assert late_year.status_code == 201
    assert late_year.json()["visited_on"] == f"{today.year}-01-01"
    assert month_end.status_code == 422  # the first of next month, as a day
    assert default_month.json()["visited_on"] == today.replace(day=1).isoformat()


async def test_next_month_and_next_year_are_refused(sessionmaker_for_test, mid_june):
    today = mid_june
    next_month = _next_month_start(today)
    next_year = today.replace(year=today.year + 1, month=1, day=1)
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        month = await client.post(
            url, json={"visited_on": next_month.isoformat(), "precision": "month"}
        )
        year = await client.post(
            url, json={"visited_on": next_year.isoformat(), "precision": "year"}
        )
    for refused in (month, year):
        assert refused.status_code == 422
        assert refused.json()["detail"] == "A visit cannot be in the future"


async def test_a_day_ahead_is_kept_and_two_days_ahead_is_refused(
    sessionmaker_for_test, mid_june
):
    today = mid_june
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        one = await client.post(
            url, json={"visited_on": (today + timedelta(days=1)).isoformat()}
        )
        two = await client.post(
            url, json={"visited_on": (today + timedelta(days=2)).isoformat()}
        )
    assert one.status_code == 201
    assert two.status_code == 422
    assert two.json()["detail"] == "A visit cannot be in the future"


async def test_the_title_is_trimmed_blank_means_none_and_80_is_the_limit(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        trimmed = await client.post(url, json={"title": "  Coors Field  "})
        blank = await client.post(url, json={"title": "   "})
        exact = await client.post(url, json={"title": "x" * 80})
        over = await client.post(url, json={"title": "x" * 81})
    assert trimmed.json()["title"] == "Coors Field"
    assert blank.status_code == 201
    assert blank.json()["title"] is None
    assert exact.status_code == 201
    assert len(exact.json()["title"]) == 80
    assert over.status_code == 422


async def test_an_unknown_verdict_or_precision_is_a_422(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        verdict = await client.post(url, json={"verdict": "meh"})
        precision = await client.post(url, json={"precision": "week"})
        omitted = await client.post(url, json={"title": "No verdict"})
    assert verdict.status_code == 422
    assert precision.status_code == 422
    assert omitted.status_code == 201
    assert omitted.json()["verdict"] is None


async def test_kid_along_false_is_stored_false_not_null(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        made = await client.post(url, json={"kid_along": False})
    assert made.json()["kid_along"] is False
    async with sessionmaker_for_test() as session:
        assert (await session.scalars(select(Visit))).one().kid_along is False


async def test_last_verdict_is_the_verdict_of_the_latest_outing(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        older_newer = await _spot_url(client)
        none_yet = (
            await client.post("/api/spots", json={**SLOANS, "name": "B"})
        ).json()
        no_verdict = (
            await client.post("/api/spots", json={**SLOANS, "name": "C"})
        ).json()
        tie = (await client.post("/api/spots", json={**SLOANS, "name": "D"})).json()
        # The latest outing wins, even though it was logged first.
        await client.post(
            older_newer, json={"visited_on": "2026-09-01", "verdict": "not_again"}
        )
        await client.post(
            older_newer, json={"visited_on": "2026-01-01", "verdict": "loved"}
        )
        # The newest outing carries no verdict: the answer is null.
        url_c = f"/api/spots/{no_verdict['id']}/visits"
        await client.post(url_c, json={"visited_on": "2026-01-01", "verdict": "loved"})
        await client.post(url_c, json={"visited_on": "2026-05-01"})
        # Same day: the one logged last wins.
        url_d = f"/api/spots/{tie['id']}/visits"
        await client.post(url_d, json={"visited_on": "2026-05-01", "verdict": "loved"})
        await client.post(url_d, json={"visited_on": "2026-05-01", "verdict": "fine"})
        listed = {row["name"]: row for row in (await client.get("/api/spots")).json()}
    assert listed["Sloan's Lake"]["last_verdict"] == "not_again"
    assert listed["B"]["last_verdict"] is None
    assert listed["B"]["visit_count"] == 0
    assert listed["C"]["last_verdict"] is None
    assert listed["D"]["last_verdict"] == "fine"
    # The existing summary is untouched.
    assert listed["Sloan's Lake"]["last_visit"] == "2026-09-01"
    assert listed["Sloan's Lake"]["visit_count"] == 2
    assert none_yet["id"] == listed["B"]["id"]


async def test_a_title_is_cleaned_before_the_length_check(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        spaced = await client.post(url, json={"title": "Zoo\n\tvisit  today"})
        nul_inside = await client.post(url, json={"title": "Zoo\u0000 trip\u200b"})
        nul_only = await client.post(url, json={"title": "\u0000\u0000"})
        # 80 real characters hide inside padding and control characters.
        padded = await client.post(
            url, json={"title": "\u0000" + "x" * 40 + "\n\n" + "y" * 39}
        )
        over = await client.post(url, json={"title": "x" * 40 + "\n" + "y" * 40})
    assert spaced.json()["title"] == "Zoo visit today"
    assert nul_inside.status_code == 201
    assert nul_inside.json()["title"] == "Zoo trip"
    assert nul_only.status_code == 201
    assert nul_only.json()["title"] is None
    assert padded.status_code == 201
    assert len(padded.json()["title"]) == 80
    assert over.status_code == 422  # 81 once the newline is a space


async def test_a_null_precision_means_day(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        url = await _spot_url(client)
        made = await client.post(
            url, json={"visited_on": "2026-03-17", "precision": None}
        )
    assert made.status_code == 201
    assert made.json()["precision"] == "day"
    assert made.json()["visited_on"] == "2026-03-17"


async def test_last_verdict_breaks_a_full_tie_by_id(sessionmaker_for_test):
    stamp = datetime(2026, 5, 1, 12, 0, tzinfo=OWNER_TZ)
    low = uuid.UUID("00000000-0000-0000-0000-000000000001")
    high = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
    async with client_for(sessionmaker_for_test) as client:
        made = (await client.post("/api/spots", json=SLOANS)).json()
        spot_id = uuid.UUID(made["id"])
        async with sessionmaker_for_test() as session:
            for visit_id, verdict in (
                (low, OutingVerdict.LOVED),
                (high, OutingVerdict.FINE),
            ):
                session.add(
                    Visit(
                        id=visit_id,
                        spot_id=spot_id,
                        visited_on=stamp.date(),
                        created_at=stamp,
                        verdict=verdict,
                    )
                )
            await session.commit()
        picks = {
            (await client.get("/api/spots")).json()[0]["last_verdict"] for _ in range(3)
        }
    assert picks == {"fine"}  # the greatest id wins, every time
