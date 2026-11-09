"""The Closet's admin routes (closet_routes.py): garments, photos, profile."""

import io
from contextlib import asynccontextmanager
from datetime import date

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
        assert all(max(i.width, i.height) == 400 for i in images)
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


async def test_the_status_route_reads_the_three_keys(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add(ClosetSetting(key="tag.last_run", value={"state": "ok"}))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/closet/status")).json()
    assert set(body) == set(STATUS_KEYS)
    assert body["tag.last_run"] == {"state": "ok"}
    assert body["plan.last_run"] is None
