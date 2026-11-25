"""The Closet's admin routes (closet_routes.py): garments, photos, profile."""

import io
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

from closet_routes import STATUS_KEYS, create_closet_router
from models import (
    ClosetProfile,
    ClosetSetting,
    Garment,
    GarmentFeedback,
    GarmentFeedbackKind,
    GarmentImage,
    GarmentStatus,
    GarmentTagSource,
    Wear,
)

pytestmark = pytest.mark.asyncio


class CountingProvider:
    """A model that must not be called by anything in this file."""

    def __init__(self):
        self.calls = 0

    async def complete_json(self, prompt, schema, images=None):
        self.calls += 1
        raise AssertionError("an upload called the model")


@asynccontextmanager
async def client_for(factory, *, provider=None, signed_in=True):
    app = FastAPI()
    app.include_router(
        create_closet_router(
            factory, provider_factory=(lambda: provider) if provider else None
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


def jpeg(width=800, height=600, colour=(30, 60, 90)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), colour).save(out, format="JPEG")
    return out.getvalue()


def photos(n: int, data: bytes | None = None):
    return [
        ("photos", (f"shirt-{i}.jpg", data or jpeg(), "image/jpeg")) for i in range(n)
    ]


async def _garment(factory, **fields) -> Garment:
    async with factory() as session:
        row = Garment(**{"seasons": [], "tag_attempts": 0, **fields})
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


async def test_every_route_is_401_signed_out(sessionmaker_for_test):
    some = "00000000-0000-0000-0000-000000000001"
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        answers = [
            await client.get("/api/closet/garments"),
            await client.get(f"/api/closet/garments/{some}"),
            await client.post("/api/closet/garments", json={}),
            await client.patch(f"/api/closet/garments/{some}", json={}),
            await client.delete(f"/api/closet/garments/{some}"),
            await client.post("/api/closet/garments/photos", files=photos(1)),
            await client.get(f"/api/closet/garments/{some}/image"),
            # Not a UUID: still 401, because the gate runs before validation
            # (smoke.sh asks for /garments/1/image).
            await client.get("/api/closet/garments/1/image"),
            await client.get("/api/closet/profile"),
            await client.patch("/api/closet/profile", json={}),
            await client.get("/api/closet/status"),
            await client.post("/api/closet/tag"),
            await client.post("/api/closet/jobs/tag"),
        ]
    assert [answer.status_code for answer in answers] == [401] * len(answers)


async def test_an_upload_of_twelve_makes_twelve_untagged_garments_without_the_model(
    sessionmaker_for_test,
):
    provider = CountingProvider()
    async with client_for(sessionmaker_for_test, provider=provider) as client:
        response = await client.post("/api/closet/garments/photos", files=photos(12))
    assert response.status_code == 201
    body = response.json()
    assert body["added"] == 12
    assert all(g["status"] == "untagged" for g in body["garments"])
    assert all(g["tag_source"] is None for g in body["garments"])
    assert all(g["image"].startswith("/api/closet/garments/") for g in body["garments"])
    assert provider.calls == 0
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count(Garment.id))) == 12
        images = (await session.scalars(select(GarmentImage))).all()
        assert len(images) == 12
        assert all(max(i.width, i.height) == 800 for i in images)
        assert all(i.webp[8:12] == b"WEBP" for i in images)
        # Upload order is queue order.
        rows = (
            await session.scalars(select(Garment).order_by(Garment.created_at))
        ).all()
        assert [str(r.id) for r in rows] == [g["id"] for g in body["garments"]]


async def test_an_unreadable_photo_refuses_the_upload_whole(sessionmaker_for_test):
    files = photos(2) + [("photos", ("broken.jpg", b"not a photo", "image/jpeg"))]
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/closet/garments/photos", files=files)
    assert response.status_code == 422
    assert response.json()["detail"].startswith("broken.jpg:")
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count(Garment.id))) == 0


async def test_a_wrong_type_is_415_and_no_photos_is_422(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        wrong = await client.post(
            "/api/closet/garments/photos",
            files=[("photos", ("notes.txt", b"hello", "text/plain"))],
        )
        none = await client.post("/api/closet/garments/photos", data={})
    assert wrong.status_code == 415
    assert none.status_code == 422


async def test_the_image_route_caches_privately_and_answers_304(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = (
            await client.post("/api/closet/garments/photos", files=photos(1))
        ).json()
        url = made["garments"][0]["image"]
        first = await client.get(url)
        assert first.status_code == 200
        assert first.headers["content-type"] == "image/webp"
        assert first.headers["cache-control"] == "private, max-age=86400"
        etag = first.headers["etag"]
        again = await client.get(url, headers={"If-None-Match": etag})
        assert again.status_code == 304
        assert again.content == b""
        stale = await client.get(url, headers={"If-None-Match": '"other"'})
        assert stale.status_code == 200

        # A save changes updated_at, so the ETag (and the URL's version) move.
        garment_id = made["garments"][0]["id"]
        saved = await client.patch(
            f"/api/closet/garments/{garment_id}", json={"name": "Navy oxford"}
        )
        after = await client.get(
            f"/api/closet/garments/{garment_id}/image",
            headers={"If-None-Match": etag},
        )
    assert saved.json()["image"] != url
    assert after.status_code == 200
    assert after.headers["etag"] != etag


async def test_size_thumb_serves_a_400px_rendition_with_its_own_etag(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        made = (
            await client.post("/api/closet/garments/photos", files=photos(1))
        ).json()
        url = made["garments"][0]["image"]
        full = await client.get(url)
        thumb = await client.get(url, params={"size": "thumb"})
        assert thumb.status_code == 200
        assert thumb.headers["content-type"] == "image/webp"
        assert thumb.headers["cache-control"] == "private, max-age=86400"
        assert thumb.headers["etag"] != full.headers["etag"]
        assert max(Image.open(io.BytesIO(thumb.content)).size) <= 400
        again = await client.get(
            url,
            params={"size": "thumb"},
            headers={"If-None-Match": thumb.headers["etag"]},
        )
        assert again.status_code == 304
        # The full photo's ETag does not answer a thumb request.
        crossed = await client.get(
            url,
            params={"size": "thumb"},
            headers={"If-None-Match": full.headers["etag"]},
        )
        assert crossed.status_code == 200
        bad = await client.get(url, params={"size": "huge"})
    assert bad.status_code == 422


async def test_a_garment_without_a_photo_is_404_on_the_image_route(
    sessionmaker_for_test,
):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(f"/api/closet/garments/{row.id}/image")
        missing = await client.get(
            "/api/closet/garments/00000000-0000-0000-0000-000000000009/image"
        )
    assert response.status_code == 404
    assert missing.status_code == 404


async def test_patch_sets_graphic_true_false_null_and_omitting_leaves_it(
    sessionmaker_for_test,
):
    row = await _garment(sessionmaker_for_test)
    path = f"/api/closet/garments/{row.id}"
    async with client_for(sessionmaker_for_test) as client:
        assert (await client.get(path)).json()["graphic"] is None
        for value in (True, False, None):
            response = await client.patch(path, json={"graphic": value})
            assert response.status_code == 200
            assert response.json()["graphic"] is value
        await client.patch(path, json={"graphic": True})
        omitted = await client.patch(path, json={"name": "Navy oxford"})
        assert omitted.json()["graphic"] is True
        bad = await client.patch(path, json={"graphic": "maybe"})
    assert bad.status_code == 422


async def test_a_hand_save_marks_the_garment_manual_and_active(sessionmaker_for_test):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            f"/api/closet/garments/{row.id}",
            json={
                "name": "  Navy oxford  ",
                "category": "top",
                "primary_hex": "#1F2A44",
                "warmth": 2,
                "formality": 4,
                "seasons": [5, 3, 4, 4],
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["tag_source"] == "manual"
    assert body["status"] == "active"
    assert body["name"] == "Navy oxford"
    assert body["primary_hex"] == "#1f2a44"
    assert body["seasons"] == [3, 4, 5]
    async with sessionmaker_for_test() as session:
        stored = await session.get(Garment, row.id)
        assert stored.tag_source == GarmentTagSource.MANUAL
        assert stored.status == GarmentStatus.ACTIVE


async def test_a_save_may_pack_a_garment_until_a_month(sessionmaker_for_test):
    row = await _garment(sessionmaker_for_test, status=GarmentStatus.ACTIVE)
    async with client_for(sessionmaker_for_test) as client:
        packed = await client.patch(
            f"/api/closet/garments/{row.id}",
            json={"status": "packed", "back_on": "2027-05-17"},
        )
        unpacked = await client.patch(
            f"/api/closet/garments/{row.id}", json={"status": "active"}
        )
        untagged = await client.patch(
            f"/api/closet/garments/{row.id}", json={"status": "untagged"}
        )
    assert packed.json()["back_on"] == "2027-05-01"
    assert packed.json()["status"] == "packed"
    assert unpacked.json()["back_on"] is None
    assert untagged.status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"warmth": 6},
        {"formality": 0},
        {"primary_hex": "navy"},
        {"seasons": [13]},
        {"category": "hat"},
        {"name": "x" * 121},
    ],
)
async def test_a_bad_garment_field_is_422(sessionmaker_for_test, body):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(f"/api/closet/garments/{row.id}", json=body)
    assert response.status_code == 422


async def test_the_list_counts_statuses_and_wears(sessionmaker_for_test):
    worn = await _garment(sessionmaker_for_test, status=GarmentStatus.ACTIVE)
    await _garment(sessionmaker_for_test, status=GarmentStatus.PACKED)
    await _garment(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        today = date.today()
        session.add(Wear(garment_id=worn.id, worn_on=today))
        session.add(Wear(garment_id=worn.id, worn_on=date(today.year - 3, 1, 2)))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/closet/garments")).json()
        one = (await client.get(f"/api/closet/garments/{worn.id}")).json()
    assert body["counts"]["total"] == 3
    assert body["counts"]["active"] == 1
    assert body["counts"]["packed"] == 1
    assert body["counts"]["untagged"] == 1
    row = next(g for g in body["garments"] if g["id"] == str(worn.id))
    assert row["wears_12mo"] == 1
    assert row["last_worn"] == today.isoformat()
    assert one["wears_12mo"] == 1


async def test_create_by_hand_and_delete(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = await client.post(
            "/api/closet/garments", json={"name": "Watch cap", "category": "accessory"}
        )
        assert made.status_code == 201
        assert made.json()["tag_source"] == "manual"
        assert made.json()["status"] == "active"
        gone = await client.delete(f"/api/closet/garments/{made.json()['id']}")
        again = await client.delete(f"/api/closet/garments/{made.json()['id']}")
    assert gone.status_code == 204
    assert again.status_code == 404


async def test_the_profile_reads_defaults_and_round_trips(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        before = (await client.get("/api/closet/profile")).json()
        saved = await client.patch(
            "/api/closet/profile",
            json={
                "sizes": {"top": "M", "bottom": "32x32", "shoes": "10.5"},
                "coloring": {"hair": "dark brown", "undertone": "warm"},
                "build_fit": "Slim through the shoulders",
                "style_words": ["vintage", "understated", "Vintage", " "],
                "dislikes": ["logos"],
                "weekly_occasions": ["office", "wfh", "office", "wfh", "office"]
                + ["weekend", "weekend"],
                "weekly_bike": [True, False, True, False, False, False, False],
                "spring_turn": "04-20",
                "autumn_turn": "10-30",
                "repeat_top_days": 4,
                "repeat_outfit_weeks": 2,
                "tag_budget": 8,
            },
        )
        after = (await client.get("/api/closet/profile")).json()
    assert before["weekly_occasions"] == ["office"] * 5 + ["weekend"] * 2
    assert before["tag_budget"] == 5
    assert before["spring_turn"] == "04-25"
    assert saved.status_code == 200
    assert after == saved.json()
    assert after["style_words"] == ["vintage", "understated"]
    assert after["tag_budget"] == 8
    assert after["weekly_bike"][0] is True
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count(ClosetProfile.id))) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"weekly_occasions": ["office"] * 6},
        {"weekly_occasions": ["office"] * 6 + ["gym"]},
        {"weekly_bike": [True] * 3},
        {"spring_turn": "4-25"},
        {"autumn_turn": "02-30"},
        {"spring_turn": "02-29"},
        {"repeat_top_days": 0},
        {"repeat_outfit_weeks": 13},
        {"tag_budget": -1},
        {"tag_budget": 51},
        {"tag_budget": None},
        {"sizes": {"hat": "L"}},
        {"coloring": {"eyes": "green"}},
        {"style_words": ["x" * 41]},
        {"dislikes": [f"word {i}" for i in range(13)]},
    ],
)
async def test_a_bad_profile_field_is_422(sessionmaker_for_test, body):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch("/api/closet/profile", json=body)
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], (str, list))


async def test_the_status_route_reads_the_four_keys(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add(ClosetSetting(key="tag.last_run", value={"state": "ok"}))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/closet/status")).json()
    assert set(body) == set(STATUS_KEYS)
    assert body["tag.last_run"] == {"state": "ok"}
    assert body["plan.last_run"] is None


# --- add or replace a photo (#399) -------------------------------------------


async def _photo(client, garment_id, data=None, name="new.jpg", kind="image/jpeg"):
    return await client.post(
        f"/api/closet/garments/{garment_id}/photo",
        files={"photo": (name, data or jpeg(1600, 1200), kind)},
    )


async def test_a_photo_is_added_to_a_garment_without_one(sessionmaker_for_test):
    row = await _garment(
        sessionmaker_for_test,
        name="Chalet Pant",
        brand="Marine Layer",
        color_name="Grey Twill",
        color_source="vendor",
        size="M",
        status=GarmentStatus.ACTIVE,
        tag_source=GarmentTagSource.MANUAL,
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await _photo(client, row.id)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["image"].startswith(f"/api/closet/garments/{row.id}/image?v=")
        served = await client.get(body["image"])
    assert served.status_code == 200
    with Image.open(io.BytesIO(served.content)) as stored:
        assert max(stored.size) == 800
    # Nothing but the photo moved.
    assert (body["name"], body["brand"], body["color_name"], body["size"]) == (
        "Chalet Pant",
        "Marine Layer",
        "Grey Twill",
        "M",
    )
    assert (body["color_source"], body["tag_source"], body["status"]) == (
        "vendor",
        "manual",
        "active",
    )


async def test_a_photo_replaces_the_old_one_and_changes_the_url(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        made = await client.post("/api/closet/garments/photos", files=photos(1))
        garment = made.json()["garments"][0]
        first = garment["image"]
        response = await _photo(client, garment["id"], jpeg(300, 200, (200, 10, 10)))
        second = response.json()["image"]
        stale = await client.get(first, headers={"If-None-Match": '"old"'})
    assert second != first
    async with sessionmaker_for_test() as session:
        count = await session.scalar(select(func.count(GarmentImage.garment_id)))
        stored = await session.get(GarmentImage, uuid.UUID(garment["id"]))
    assert count == 1
    assert (stored.width, stored.height) == (300, 200)
    assert stale.status_code == 200
    assert response.json()["tag_source"] == garment["tag_source"]
    assert response.json()["status"] == garment["status"]


async def test_a_bad_photo_is_refused_and_keeps_the_old_one(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = await client.post("/api/closet/garments/photos", files=photos(1))
        gid = made.json()["garments"][0]["id"]
        broken = await _photo(client, gid, b"not a photo")
        wrong = await _photo(client, gid, b"hello", "notes.txt", "text/plain")
        huge = await _photo(client, gid, b"x" * (15 * 1024 * 1024))
        missing = await _photo(client, uuid.uuid4())
        empty = await client.post(f"/api/closet/garments/{gid}/photo")
    assert (broken.status_code, wrong.status_code, huge.status_code) == (422, 415, 413)
    assert missing.status_code == 404
    assert empty.status_code == 422
    async with sessionmaker_for_test() as session:
        stored = await session.get(GarmentImage, uuid.UUID(gid))
    assert stored is not None


async def test_the_photo_route_is_admin_only(sessionmaker_for_test):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await _photo(client, row.id)
    assert response.status_code == 401
    async with sessionmaker_for_test() as session:
        assert await session.get(GarmentImage, row.id) is None


# --- store colour, brand and size by hand (#399) ------------------------------


async def test_a_typed_colour_is_manual_and_an_unchanged_one_keeps_its_source(
    sessionmaker_for_test,
):
    row = await _garment(
        sessionmaker_for_test, color_name="Grey Twill", color_source="vendor"
    )
    async with client_for(sessionmaker_for_test) as client:
        # The edit form sends every field on save, the colour unchanged.
        same = await client.patch(
            f"/api/closet/garments/{row.id}",
            json={"color_name": "Grey Twill", "size": "M", "brand": "Marine Layer"},
        )
        typed = await client.patch(
            f"/api/closet/garments/{row.id}", json={"color_name": "Slate"}
        )
        cleared = await client.patch(
            f"/api/closet/garments/{row.id}", json={"color_name": " "}
        )
    assert (same.json()["color_name"], same.json()["color_source"]) == (
        "Grey Twill",
        "vendor",
    )
    assert (same.json()["size"], same.json()["brand"]) == ("M", "Marine Layer")
    assert (typed.json()["color_name"], typed.json()["color_source"]) == (
        "Slate",
        "manual",
    )
    assert (cleared.json()["color_name"], cleared.json()["color_source"]) == (
        None,
        None,
    )


async def test_a_stored_colour_with_stray_space_is_not_flipped_by_an_untouched_save(
    sessionmaker_for_test,
):
    row = await _garment(
        sessionmaker_for_test, color_name="Grey Twill ", color_source="vendor"
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            f"/api/closet/garments/{row.id}", json={"color_name": "Grey Twill"}
        )
    assert response.json()["color_source"] == "vendor"


async def test_the_list_counts_temperature_feedback_over_sixty_days(
    sessionmaker_for_test,
):
    from public import OWNER_TZ

    today = datetime.now(OWNER_TZ).date()
    chilly = await _garment(sessionmaker_for_test, status=GarmentStatus.ACTIVE)
    mixed = await _garment(sessionmaker_for_test, status=GarmentStatus.ACTIVE)
    old = await _garment(sessionmaker_for_test, status=GarmentStatus.ACTIVE)
    plain = await _garment(sessionmaker_for_test, status=GarmentStatus.ACTIVE)
    packed = await _garment(sessionmaker_for_test, status=GarmentStatus.PACKED)
    ahead = await _garment(sessionmaker_for_test, status=GarmentStatus.ACTIVE)
    kinds = GarmentFeedbackKind
    rows = [
        (chilly, kinds.TOO_COLD, today - timedelta(days=3)),
        (chilly, kinds.TOO_COLD, today - timedelta(days=10)),
        (mixed, kinds.TOO_WARM, today - timedelta(days=1)),
        (mixed, kinds.TOO_COLD, today - timedelta(days=59)),
        (old, kinds.TOO_WARM, today - timedelta(days=60)),  # out of the window
        (plain, kinds.NOT_TODAY, today),  # not a temperature kind
        (packed, kinds.TOO_COLD, today),  # not active
        (ahead, kinds.TOO_WARM, today + timedelta(days=1)),  # not yet in force
    ]
    async with sessionmaker_for_test() as session:
        for garment, kind, day in rows:
            session.add(GarmentFeedback(garment_id=garment.id, kind=kind, day=day))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/closet/garments")).json()
    flags = {f["garment_id"]: f for f in body["temperature_flags"]}
    assert set(flags) == {str(chilly.id), str(mixed.id)}
    assert flags[str(chilly.id)] == {
        "garment_id": str(chilly.id),
        "too_cold": 2,
        "too_warm": 0,
        "last_day": (today - timedelta(days=3)).isoformat(),
    }
    assert (flags[str(mixed.id)]["too_cold"], flags[str(mixed.id)]["too_warm"]) == (
        1,
        1,
    )


async def test_no_feedback_means_no_temperature_flags(sessionmaker_for_test):
    await _garment(sessionmaker_for_test, status=GarmentStatus.ACTIVE)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/closet/garments")).json()
    assert body["temperature_flags"] == []
