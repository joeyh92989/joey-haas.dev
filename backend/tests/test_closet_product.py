"""Attaching a product to an existing garment (#399, closet_product.py).

The store answers are the recorded Marine Layer and Duer fixtures plus the
SYNTHETIC two-colour product, read by the real parsers; only the network
(`closet_product.resolve` and the photo fetch) is replaced."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

import closet_product
import closet_resolver as cr
from intake.seed_image import ImageFetchError
from models import (
    Garment,
    GarmentColorSource,
    GarmentImage,
    GarmentProduct,
    GarmentProductSource,
    GarmentStatus,
    GarmentTagSource,
)
from tests.test_closet_resolver import one_per_colour, shopify
from tests.test_closet_routes import _garment, client_for, jpeg, photos

pytestmark = pytest.mark.asyncio

FIXTURES = Path(__file__).parent / "fixtures" / "closet"
ML = "https://www.marinelayer.com/products/chalet-lounge-pant"
DUER = "https://www.duer.com/products/no-sweat-athletic-taper-chestnut"
MULTI = "https://small-brand.test/products/test-crew"
PIPE = "https://one-per-colour.test/products/shirt-cocoa"
REFUSED = "https://refuses.test/products/x"
BLUE = "https://cdn.test/blue.jpg"


def recorded(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}_product.json").read_text())


@pytest.fixture(autouse=True)
def network(monkeypatch):
    answers = {
        ML: cr.parse_shopify_json(recorded("marinelayer"), ML),
        DUER: cr.parse_shopify_json(recorded("duer"), DUER),
        MULTI: cr.parse_shopify_json(shopify(), MULTI),
        PIPE: cr.parse_shopify_json(
            one_per_colour("The Classic Short-Sleeve Shirt in Linen | Cocoa"), PIPE
        ),
    }
    fetched: list[str] = []

    async def fake(url, *, fetcher=None):
        url = cr.normalise(url)
        if url in answers:
            return cr.Resolution(url, product=answers[url])
        return cr.Resolution(
            url,
            code="robots",
            message="refuses.test asks programs not to read that page "
            "(robots.txt); the link is kept as typed",
        )

    async def photo(url, **_):
        fetched.append(url)
        if url == BLUE:
            raise ImageFetchError("the store answered 404")
        return jpeg(1600, 1200)

    monkeypatch.setattr(closet_product, "resolve", fake)
    monkeypatch.setattr(closet_product, "fetch_image", photo)
    return fetched


def url_of(garment_id) -> str:
    return f"/api/closet/garments/{garment_id}/product"


async def count(factory, model) -> int:
    async with factory() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def test_a_preview_lists_the_colours_and_writes_nothing(sessionmaker_for_test):
    row = await _garment(sessionmaker_for_test, brand="Old")
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(url_of(row.id), json={"url": MULTI})
    body = response.json()
    assert response.status_code == 200, response.text
    assert (body["state"], body["brand"], body["title"]) == (
        "read",
        "Acme",
        "Test Crew",
    )
    assert [c["color_name"] for c in body["candidates"]] == ["Red", "Blue"]
    assert [s["size"] for s in body["candidates"][0]["sizes"]] == ["S", "M"]
    assert (body["has_photo"], body["attached"]) == (False, None)
    assert await count(sessionmaker_for_test, GarmentProduct) == 0
    async with sessionmaker_for_test() as session:
        stored = await session.get(Garment, row.id)
    assert (stored.brand, stored.color_name, stored.updated_at) == (
        "Old",
        None,
        row.updated_at,
    )


async def test_a_refused_link_says_why_and_is_not_an_error(sessionmaker_for_test):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(url_of(row.id), json={"url": REFUSED})
        bad = await client.post(url_of(row.id), json={"url": "x" * 3000})
        missing = await client.post(
            url_of("00000000-0000-0000-0000-000000000000"), json={"url": ML}
        )
    body = response.json()
    assert response.status_code == 200
    assert body["state"] == "refused"
    assert "robots.txt" in body["message"]
    assert "kept as typed" not in body["message"]
    assert body["candidates"] == []
    assert (bad.status_code, missing.status_code) == (422, 404)


async def test_attach_fills_colour_brand_size_price_and_the_photo(
    sessionmaker_for_test, network
):
    row = await _garment(
        sessionmaker_for_test, status=GarmentStatus.ACTIVE, name="Pant"
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            url_of(row.id),
            json={"url": MULTI, "external_id": "11", "size": "M"},
        )
    body = response.json()
    assert response.status_code == 200, response.text
    garment = body["garment"]
    assert (garment["color_name"], garment["color_source"]) == ("Red", "vendor")
    assert (garment["brand"], garment["size"], garment["primary_color"]) == (
        "Acme",
        "M",
        "red",
    )
    assert garment["name"] == "Pant"
    assert garment["image"] is not None
    assert (body["photo"], body["photo_error"]) == ("added", None)
    assert network == ["https://cdn.test/red.jpg"]
    async with sessionmaker_for_test() as session:
        product = await session.scalar(select(GarmentProduct))
        stored = await session.get(GarmentImage, row.id)
    assert product.source is GarmentProductSource.LINK
    assert product.url == MULTI
    assert product.title == "Test Crew"
    assert product.price == Decimal("42.50")
    assert product.snapshot["chosen"] == "11"
    assert product.snapshot["size"] == "M"
    assert product.fetched_at is not None
    assert max(stored.width, stored.height) == 800


async def test_a_store_host_gets_its_own_source_and_a_single_size_is_taken(
    sessionmaker_for_test,
):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        preview = (await client.post(url_of(row.id), json={"url": ML})).json()
        [only] = preview["candidates"]
        response = await client.patch(
            url_of(row.id), json={"url": ML, "external_id": only["external_id"]}
        )
    assert response.status_code == 200, response.text
    async with sessionmaker_for_test() as session:
        product = await session.scalar(select(GarmentProduct))
    assert product.source is GarmentProductSource.MARINELAYER
    assert response.json()["garment"]["color_name"] == "Grey Twill"
    # Five sizes and none chosen: the size is left for the owner.
    assert response.json()["garment"]["size"] is None


async def test_the_client_cannot_name_a_colour_or_a_size_the_store_did_not(
    sessionmaker_for_test,
):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        colour = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "999"}
        )
        size = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11", "size": "XXL"}
        )
        refused = await client.patch(
            url_of(row.id), json={"url": REFUSED, "external_id": "1"}
        )
        extra = await client.patch(
            url_of(row.id),
            json={"url": MULTI, "external_id": "11", "color_name": "Gold", "price": 1},
        )
    assert (colour.status_code, size.status_code, refused.status_code) == (422,) * 3
    assert "not one this link offers" in colour.json()["detail"]
    assert "robots.txt" in refused.json()["detail"]
    # Unknown keys are ignored, so a client-supplied colour or price is not read.
    assert extra.json()["garment"]["color_name"] == "Red"
    async with sessionmaker_for_test() as session:
        product = await session.scalar(select(GarmentProduct))
    assert product.price == Decimal("42.50")
    assert await count(sessionmaker_for_test, GarmentProduct) == 1


async def test_a_garment_with_a_photo_keeps_it(sessionmaker_for_test, network):
    async with client_for(sessionmaker_for_test) as client:
        made = await client.post("/api/closet/garments/photos", files=photos(1))
        garment = made.json()["garments"][0]
        before = (await client.get(garment["image"])).content
        response = await client.patch(
            url_of(garment["id"]),
            json={"url": MULTI, "external_id": "13", "size": "S"},
        )
        after = (await client.get(response.json()["garment"]["image"])).content
    assert response.json()["photo"] == "kept"
    assert network == []
    assert after == before


async def test_a_photo_that_cannot_be_fetched_still_attaches(sessionmaker_for_test):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "13", "size": "S"}
        )
    body = response.json()
    assert response.status_code == 200
    assert (body["photo"], body["garment"]["image"]) == ("failed", None)
    assert body["photo_error"] == "the store answered 404"
    assert body["garment"]["color_name"] == "Blue"
    assert await count(sessionmaker_for_test, GarmentProduct) == 1


async def test_brand_is_overwritten_only_when_confirmed(sessionmaker_for_test):
    row = await _garment(sessionmaker_for_test, brand="Mine")
    async with client_for(sessionmaker_for_test) as client:
        kept = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11", "size": "M"}
        )
        replaced = await client.patch(
            url_of(row.id),
            json={
                "url": MULTI,
                "external_id": "11",
                "size": "M",
                "replace_product": True,
                "replace_brand": True,
            },
        )
    assert kept.json()["garment"]["brand"] == "Mine"
    assert replaced.json()["garment"]["brand"] == "Acme"


async def test_attaching_again_replaces_only_after_confirmation(
    sessionmaker_for_test,
):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11", "size": "M"}
        )
        preview = (await client.post(url_of(row.id), json={"url": DUER})).json()
        again = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "13", "size": "S"}
        )
        replaced = await client.patch(
            url_of(row.id),
            json={
                "url": MULTI,
                "external_id": "13",
                "size": "S",
                "replace_product": True,
            },
        )
    assert preview["attached"]["title"] == "Test Crew"
    assert again.status_code == 409
    assert replaced.status_code == 200
    assert await count(sessionmaker_for_test, GarmentProduct) == 1
    assert replaced.json()["garment"]["color_name"] == "Blue"
    async with sessionmaker_for_test() as session:
        product = await session.scalar(select(GarmentProduct))
    assert product.snapshot["chosen"] == "13"


async def test_attach_leaves_the_tag_state_and_a_typed_primary_colour(
    sessionmaker_for_test,
):
    row = await _garment(
        sessionmaker_for_test,
        primary_color="navy",
        status=GarmentStatus.ACTIVE,
        tag_source=GarmentTagSource.MANUAL,
        color_name="Old", color_source=GarmentColorSource.VENDOR,
    )  # fmt: skip
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11", "size": "M"}
        )
    garment = response.json()["garment"]
    assert garment["primary_color"] == "navy"
    assert (garment["status"], garment["tag_source"]) == ("active", "manual")
    assert (garment["color_name"], garment["color_source"]) == ("Red", "vendor")


async def test_a_hand_entered_colour_and_size_are_kept_unless_replaced(
    sessionmaker_for_test,
):
    row = await _garment(
        sessionmaker_for_test,
        color_name="Slate",
        color_source=GarmentColorSource.MANUAL,
        size="L",
    )
    body = {"url": MULTI, "external_id": "11", "size": "M", "replace_product": True}
    async with client_for(sessionmaker_for_test) as client:
        kept = (await client.patch(url_of(row.id), json=body)).json()
        both = (
            await client.patch(
                url_of(row.id),
                json={**body, "replace_color": True, "replace_size": True},
            )
        ).json()
    assert sorted(kept["kept"]) == ["colour", "size"]
    assert (kept["garment"]["color_name"], kept["garment"]["size"]) == ("Slate", "L")
    assert (kept["garment"]["color_source"]) == "manual"
    assert both["kept"] == []
    assert (both["garment"]["color_name"], both["garment"]["size"]) == ("Red", "M")
    assert both["garment"]["color_source"] == "vendor"


async def test_a_single_size_only_fills_an_empty_size(sessionmaker_for_test):
    full = await _garment(sessionmaker_for_test, size="XL")
    empty = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        # Blue has one size (S), taken without being asked when none is typed.
        a = await client.patch(
            url_of(full.id), json={"url": MULTI, "external_id": "13"}
        )
        b = await client.patch(
            url_of(empty.id), json={"url": MULTI, "external_id": "13"}
        )
    assert a.json()["garment"]["size"] == "XL"
    assert b.json()["garment"]["size"] == "S"


async def test_a_photo_added_during_the_lookup_is_never_overwritten(
    sessionmaker_for_test, monkeypatch, network
):
    row = await _garment(sessionmaker_for_test)
    real = closet_product.resolve

    async def slow(url, **kw):
        # The owner uploads a photo while the store is being read.
        async with client_for(sessionmaker_for_test) as other:
            await other.post(
                f"/api/closet/garments/{row.id}/photo",
                files={"photo": ("a.jpg", jpeg(300, 200, (9, 9, 9)), "image/jpeg")},
            )
        return await real(url, **kw)

    monkeypatch.setattr(closet_product, "resolve", slow)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11", "size": "M"}
        )
    assert response.status_code == 200, response.text
    assert response.json()["photo"] == "kept"
    async with sessionmaker_for_test() as session:
        stored = await session.get(GarmentImage, row.id)
    assert (stored.width, stored.height) == (300, 200)


async def test_a_garment_deleted_during_the_lookup_is_404_not_500(
    sessionmaker_for_test, monkeypatch
):
    row = await _garment(sessionmaker_for_test)
    real = closet_product.resolve

    async def gone(url, **kw):
        async with sessionmaker_for_test() as session:
            await session.delete(await session.get(Garment, row.id))
            await session.commit()
        return await real(url, **kw)

    monkeypatch.setattr(closet_product, "resolve", gone)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11"}
        )
    assert response.status_code == 404
    assert await count(sessionmaker_for_test, GarmentProduct) == 0


async def test_a_product_added_during_the_lookup_is_a_409(
    sessionmaker_for_test, monkeypatch
):
    row = await _garment(sessionmaker_for_test)
    real = closet_product.resolve

    async def racing(url, **kw):
        async with sessionmaker_for_test() as session:
            session.add(GarmentProduct(garment_id=row.id, title="Other"))
            await session.commit()
        return await real(url, **kw)

    monkeypatch.setattr(closet_product, "resolve", racing)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11"}
        )
    assert response.status_code == 409
    assert await count(sessionmaker_for_test, GarmentProduct) == 1


async def test_a_lost_insert_race_is_a_409_never_a_500(
    sessionmaker_for_test, monkeypatch
):
    """The backstop: a unique-key failure at commit (two attaches, two photo
    writes) is rolled back and answered, whatever the lock let through."""
    row = await _garment(sessionmaker_for_test)

    async def collide(*args, **kw):
        raise IntegrityError("insert", {}, Exception("duplicate key"))

    monkeypatch.setattr(closet_product, "attach", collide)
    monkeypatch.setattr(closet_product, "store_photo", collide)
    async with client_for(sessionmaker_for_test) as client:
        attach = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11"}
        )
        photo = await client.post(
            f"/api/closet/garments/{row.id}/photo",
            files={"photo": ("a.jpg", jpeg(), "image/jpeg")},
        )
    assert (attach.status_code, photo.status_code) == (409, 409)


async def test_an_attach_strips_after_truncating_the_colour(
    sessionmaker_for_test, monkeypatch
):
    row = await _garment(sessionmaker_for_test)
    long = "Red " + "x" * 75 + " tail"  # character 80 falls on a space
    product = cr.parse_shopify_json(shopify(), MULTI)
    colour = product.colours[0]
    padded = cr.Colour(
        colour.external_id,
        long[:79] + " z",
        colour.image_url,
        colour.price,
        colour.sizes,
    )
    answer = cr.Resolution(
        MULTI, product=cr.Product("shopify", MULTI, "T", None, "USD", (padded,))
    )

    async def fake(url, **kw):
        return answer

    monkeypatch.setattr(closet_product, "resolve", fake)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11", "size": "M"}
        )
    name = response.json()["garment"]["color_name"]
    assert name == name.strip() and len(name) <= 80


async def test_the_product_routes_are_admin_only(sessionmaker_for_test, network):
    row = await _garment(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        read = await client.post(url_of(row.id), json={"url": MULTI})
        write = await client.patch(
            url_of(row.id), json={"url": MULTI, "external_id": "11"}
        )
    assert (read.status_code, write.status_code) == (401, 401)
    assert await count(sessionmaker_for_test, GarmentProduct) == 0
    assert network == []


async def test_a_colour_in_the_title_after_a_pipe_attaches_as_the_store_colour(
    sessionmaker_for_test,
):
    row = await _garment(
        sessionmaker_for_test, status=GarmentStatus.ACTIVE, name="Shirt"
    )
    async with client_for(sessionmaker_for_test) as client:
        preview = await client.post(url_of(row.id), json={"url": PIPE})
        candidate = preview.json()["candidates"][0]
        response = await client.patch(
            url_of(row.id),
            json={"url": PIPE, "external_id": candidate["external_id"], "size": "M"},
        )
    assert [c["color_name"] for c in preview.json()["candidates"]] == ["Cocoa"]
    garment = response.json()["garment"]
    assert response.status_code == 200, response.text
    assert (garment["color_name"], garment["color_source"]) == ("Cocoa", "vendor")
    assert garment["name"] == "Shirt"
