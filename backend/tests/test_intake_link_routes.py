"""The closet's "From links": paste, Check's colour choice, commit (#398).

The store answers are the recorded Marine Layer and Duer fixtures, read by
the real parsers; the network is the only thing replaced (`link_import.resolve`
and the photo fetch). The multi-colour product and the refusals are
SYNTHETIC."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import func, select

import closet_resolver as cr
from intake import link_import, seed_import
from intake.seed_image import ImageFetchError
from models import (
    ClosetSetting,
    Garment,
    GarmentColorSource,
    GarmentImage,
    GarmentProduct,
    GarmentProductSource,
    GarmentStatus,
    IntakePhoto,
)
from tests.test_closet_resolver import shopify
from tests.test_closet_routes import jpeg
from tests.test_intake_kinds import client_for

FIXTURES = Path(__file__).parent / "fixtures" / "closet"
ML = "https://www.marinelayer.com/products/chalet-lounge-pant"
DUER = "https://www.duer.com/products/no-sweat-athletic-taper-chestnut"
MULTI = "https://small-brand.test/products/test-crew"
REFUSED = "https://refuses.test/products/x"
MISSING_PHOTO = "https://cdn.test/blue.jpg"
PLAIN_A = "https://plain.test/p/hat-a"
PLAIN_B = "https://plain.test/p/hat-b"


def skuless(name: str) -> str:
    """SYNTHETIC: a page whose JSON-LD Product has no sku and no colour, so
    its colour id falls back to c0 on every such page."""
    return (
        '<script type="application/ld+json">'
        f'{{"@type":"Product","name":"{name}","offers":{{"price":"20"}}}}'
        "</script>"
    )


def recorded(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}_product.json").read_text())


@pytest.fixture(autouse=True)
def network(monkeypatch):
    """Resolves the recorded links with the real parsers, the synthetic ones
    from the table below; photos are a 1600 px JPEG."""
    answers = {
        ML: cr.parse_shopify_json(recorded("marinelayer"), ML),
        DUER: cr.parse_shopify_json(recorded("duer"), DUER),
        MULTI: cr.parse_shopify_json(shopify(), MULTI),
        PLAIN_A: cr.parse_jsonld(skuless("Hat A"), PLAIN_A),
        PLAIN_B: cr.parse_jsonld(skuless("Hat B"), PLAIN_B),
    }

    async def fake(url, *, fetcher=None):
        url = cr.normalise(url)
        if url.split("?")[0] in answers:
            return cr.Resolution(url, product=answers[url.split("?")[0]])
        return cr.Resolution(
            url,
            code="robots",
            message="refuses.test asks programs not to read that page "
            "(robots.txt); the link is kept as typed",
        )

    async def photo(url, **_):
        if url == MISSING_PHOTO:
            raise ImageFetchError("the store answered 404")
        return jpeg(1600, 1200)

    monkeypatch.setattr(link_import, "resolve", fake)
    monkeypatch.setattr(seed_import, "fetch_image", photo)


async def start(client) -> str:
    response = await client.post(
        "/api/intake/sittings", json={"area": "closet", "kind": "garment"}
    )
    return response.json()["id"]


async def paste(client, sitting_id, urls):
    return await client.post(
        f"/api/intake/sittings/{sitting_id}/links", json={"urls": urls}
    )


async def fetch_all(client, sitting_id):
    while True:
        body = (
            await client.post(f"/api/intake/sittings/{sitting_id}/seed-images")
        ).json()
        if body["pending"] == 0:
            return body


@pytest.mark.asyncio
async def test_a_paste_makes_one_draft_per_link_with_the_stores_facts(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        response = await paste(client, sitting_id, [ML, DUER, REFUSED, "just words"])
    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["read"], body["kept"], body["not_links"]) == (2, 1, 1)
    ml, duer, kept = body["entries"]
    assert ml["state"] == "typed"
    p = ml["payload"]
    assert (p["name"], p["brand"], p["color_name"]) == (
        "Chalet Lounge Pant",
        "Marine Layer",
        "Grey Twill",
    )
    assert p["link"] == {
        "url": ML,
        "state": "resolved",
        "via": "shopify",
        "code": None,
        "message": None,
    }
    assert p["seed"]["source"] == "marinelayer" and p["seed"]["price_usd"] == "118.00"
    assert p["image"] == "pending" and "size" not in p
    # The colour is persisted as the entry's candidate, sizes and all.
    [candidate] = ml["candidates"]
    assert candidate["external_id"] == "42542862794826"
    assert [s["size"] for s in candidate["sizes"]][:2] == ["Small", "Medium"]
    assert duer["payload"]["seed"]["source"] == "duer"
    assert duer["payload"]["color_name"] == "Chestnut"
    # The refusing site is kept as typed, link saved, reason said.
    assert kept["state"] == "typed" and kept["candidates"] == []
    assert kept["payload"]["link"]["state"] == "kept"
    assert "robots.txt" in kept["payload"]["link"]["message"]
    assert kept["payload"]["name"] == "X"
    assert kept["payload"]["seed"] == {
        **kept["payload"]["seed"],
        "source": "link",
        "image_url": None,
    }
    assert kept["payload"]["image"] == "none"


@pytest.mark.asyncio
async def test_the_sitting_moves_to_check_and_a_shelf_sitting_is_refused(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await paste(client, sitting_id, [ML])
        sitting = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()
        shelf = await client.post("/api/intake/sittings", json={"area": "shelf"})
        refused = await paste(client, shelf.json()["id"], [ML])
    assert sitting["step"] == "check"
    assert refused.status_code == 409


@pytest.mark.asyncio
async def test_nothing_that_is_an_address_is_a_422_and_too_many_is_refused(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        none = await paste(client, sitting_id, ["hello", "ftp: no"])
        many = await paste(
            client, sitting_id, [f"https://a.test/{i}" for i in range(11)]
        )
        empty = await paste(client, sitting_id, [])
    assert none.status_code == 422
    assert many.status_code == 422 and empty.status_code == 422


@pytest.mark.asyncio
async def test_the_same_link_twice_is_one_entry(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        first = await paste(client, sitting_id, [ML, ML + "#top"])
        again = await paste(client, sitting_id, [ML])
    assert first.json()["duplicates"] == 1 and len(first.json()["entries"]) == 1
    assert again.status_code == 201 and again.json()["duplicates"] == 1
    assert again.json()["entries"] == []


@pytest.mark.asyncio
async def test_photos_are_fetched_once_and_held_at_800px(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await paste(client, sitting_id, [ML, REFUSED])
        await fetch_all(client, sitting_id)
        entries = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()[
            "entries"
        ]
    held, kept = entries
    assert held["payload"]["image"] == "held" and held["photo_id"]
    assert kept["photo_id"] is None
    async with sessionmaker_for_test() as session:
        photo = await session.scalar(select(IntakePhoto))
        assert max(photo.width, photo.height) == 800


@pytest.mark.asyncio
async def test_several_colours_wait_for_a_choice_and_the_choice_swaps_the_photo(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        [entry] = (await paste(client, sitting_id, [MULTI])).json()["entries"]
        # Two colours: none chosen yet, the candidates are the radio.
        assert [c["title"] for c in entry["candidates"]] == ["Red", "Blue"]
        assert "color_name" not in entry["payload"]
        await fetch_all(client, sitting_id)
        chosen = await client.post(
            f"/api/intake/entries/{entry['id']}/choose",
            json={"external_id": "13"},
        )
        assert chosen.status_code == 200, chosen.text
        body = chosen.json()
        p = body["payload"]
        assert (p["color_name"], p["primary_color"]) == ("Blue", "blue")
        assert p["seed"]["image_url"] == "https://cdn.test/blue.jpg"
        assert (
            p["seed"]["store_item_no"] == "small-brand.test/products/test-crew|13"
            and p["seed"]["price_usd"] == "40.00"
        )
        # The red photo is dropped; the blue one is fetched next.
        assert body["photo_id"] is None and p["image"] == "pending"
        # A colour the link never offered, and an entry with no colours.
        bad = await client.post(
            f"/api/intake/entries/{entry['id']}/choose", json={"external_id": "99"}
        )
        [typed] = (await paste(client, sitting_id, [REFUSED])).json()["entries"]
        none = await client.post(
            f"/api/intake/entries/{typed['id']}/choose", json={"external_id": "13"}
        )
    assert bad.status_code == 422 and none.status_code == 422
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count()).select_from(IntakePhoto)) == 0


@pytest.mark.asyncio
async def test_choosing_the_same_colour_keeps_the_held_photo(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        [entry] = (await paste(client, sitting_id, [MULTI])).json()["entries"]
        await client.post(
            f"/api/intake/entries/{entry['id']}/choose", json={"external_id": "11"}
        )
        await fetch_all(client, sitting_id)
        again = await client.post(
            f"/api/intake/entries/{entry['id']}/choose", json={"external_id": "11"}
        )
    assert again.json()["photo_id"] and again.json()["payload"]["image"] == "held"


def test_a_variant_in_the_link_chooses_its_colour():
    product = cr.parse_shopify_json(shopify(), MULTI)
    link = MULTI + "?variant=13"
    payload, candidates = link_import.draft(
        cr.Resolution(link, product=product), datetime.now(UTC)
    )
    assert payload["color_name"] == "Blue" and len(candidates) == 2
    assert payload["seed"]["store_item_no"].endswith("|13")
    # A link naming no variant leaves several colours to Check.
    plain, _ = link_import.draft(
        cr.Resolution(MULTI, product=product), datetime.now(UTC)
    )
    assert "color_name" not in plain


@pytest.mark.asyncio
async def test_check_cannot_change_the_server_keys(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        [entry] = (await paste(client, sitting_id, [ML])).json()["entries"]
        patched = await client.patch(
            f"/api/intake/entries/{entry['id']}",
            json={
                "payload": {
                    **entry["payload"],
                    "link": {"url": "https://evil.test/", "state": "kept"},
                    "seed": {"source": "duer", "image_url": "https://evil.test/a.jpg"},
                    "size": "Medium",
                    "name": "Lounge pants",
                }
            },
        )
    p = patched.json()["payload"]
    assert p["link"]["url"] == ML and p["seed"]["image_url"].startswith("https://")
    assert p["seed"]["source"] == "marinelayer"
    assert (p["size"], p["name"]) == ("Medium", "Lounge pants")


@pytest.mark.asyncio
async def test_a_link_piece_cannot_be_marked_not_owned(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        [entry] = (await paste(client, sitting_id, [ML])).json()["entries"]
        response = await client.post(f"/api/intake/entries/{entry['id']}/not-owned")
    assert response.status_code == 409
    async with sessionmaker_for_test() as session:
        assert await session.get(ClosetSetting, "import.not_owned") is None


@pytest.mark.asyncio
async def test_commit_writes_garment_product_and_photo(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        ml, duer, kept, multi = (
            await paste(client, sitting_id, [ML, DUER, REFUSED, MULTI])
        ).json()["entries"]
        await fetch_all(client, sitting_id)
        # Check: a size for Marine Layer; the multi-colour one is chosen.
        await client.patch(
            f"/api/intake/entries/{ml['id']}",
            json={"payload": {**ml["payload"], "size": "Medium"}},
        )
        await client.post(
            f"/api/intake/entries/{multi['id']}/choose", json={"external_id": "13"}
        )
        await fetch_all(client, sitting_id)
        response = await client.post(
            f"/api/intake/sittings/{sitting_id}/commit", json={"today": "2026-11-16"}
        )
    assert response.status_code == 200, response.text
    # The refused link has no photo and the blue one's photo 404s (the
    # fake's MISSING_PHOTO): both are added without one.
    assert response.json()["added"] == 4 and response.json()["images_missing"] == 2
    async with sessionmaker_for_test() as session:
        garments = {g.name: g for g in (await session.scalars(select(Garment))).all()}
        lounge = garments["Chalet Lounge Pant"]
        assert (lounge.brand, lounge.color_name, lounge.size) == (
            "Marine Layer",
            "Grey Twill",
            "Medium",
        )
        assert lounge.color_source is GarmentColorSource.VENDOR
        assert lounge.status is GarmentStatus.UNTAGGED and lounge.tag_source is None
        assert lounge.primary_hex is None
        product = await session.scalar(
            select(GarmentProduct).where(GarmentProduct.garment_id == lounge.id)
        )
        assert product.source is GarmentProductSource.MARINELAYER
        assert product.url == ML and product.title == "Chalet Lounge Pant"
        assert str(product.price) == "118.00" and product.fetched_at is not None
        # The snapshot is the parsed product, never the page or raw JSON.
        assert product.snapshot["via"] == "shopify"
        assert "body_html" not in json.dumps(product.snapshot)
        assert product.snapshot["chosen"] == "42542862794826"
        image = await session.scalar(
            select(GarmentImage).where(GarmentImage.garment_id == lounge.id)
        )
        assert max(image.width, image.height) == 800
        duer_product = await session.scalar(
            select(GarmentProduct).where(
                GarmentProduct.garment_id
                == garments["No Sweat Athletic Taper - Chestnut"].id
            )
        )
        assert duer_product.source is GarmentProductSource.DUER
        # A kept link is a garment typed as the entry says, its link saved.
        piece = garments["X"]
        assert piece.color_name is None
        kept_product = await session.scalar(
            select(GarmentProduct).where(GarmentProduct.garment_id == piece.id)
        )
        assert kept_product.source is GarmentProductSource.LINK
        assert kept_product.url == REFUSED and kept_product.price is None
        crew = garments["Test Crew"]
        assert (crew.color_name, crew.primary_color) == ("Blue", "blue")


@pytest.mark.asyncio
async def test_the_same_link_again_is_already_owned(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        one = await start(client)
        await paste(client, one, [ML])
        await fetch_all(client, one)
        first = await client.post(f"/api/intake/sittings/{one}/commit", json={})
        two = await start(client)
        await paste(client, two, [ML])
        second = await client.post(f"/api/intake/sittings/{two}/commit", json={})
    assert first.json()["added"] == 1
    assert second.status_code == 200
    assert (second.json()["added"], second.json()["already_owned"]) == (0, 1)
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count()).select_from(Garment)) == 1


@pytest.mark.asyncio
async def test_the_routes_need_an_admin(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        links = await client.post(
            "/api/intake/sittings/00000000-0000-0000-0000-000000000000/links",
            json={"urls": [ML]},
        )
        choose = await client.post(
            "/api/intake/entries/00000000-0000-0000-0000-000000000000/choose",
            json={"external_id": "1"},
        )
    assert links.status_code in (401, 403) and choose.status_code in (401, 403)


# --- review findings ----------------------------------------------------------


@pytest.mark.asyncio
async def test_two_products_with_no_sku_are_two_pieces(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        entries = (await paste(client, sitting_id, [PLAIN_A, PLAIN_B])).json()[
            "entries"
        ]
        refs = {e["payload"]["seed"]["store_item_no"] for e in entries}
        response = await client.post(
            f"/api/intake/sittings/{sitting_id}/commit", json={}
        )
        again = await start(client)
        await paste(client, again, [PLAIN_A])
        second = await client.post(f"/api/intake/sittings/{again}/commit", json={})
    assert len(refs) == 2 and all(len(r) <= 80 for r in refs)
    assert (response.json()["added"], response.json()["already_owned"]) == (2, 0)
    # The same product again is the same piece.
    assert (second.json()["added"], second.json()["already_owned"]) == (0, 1)
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count()).select_from(Garment)) == 2


@pytest.mark.asyncio
async def test_a_photo_for_a_colour_no_longer_chosen_is_not_kept(
    sessionmaker_for_test, monkeypatch
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        [entry] = (await paste(client, sitting_id, [MULTI + "?variant=11"])).json()[
            "entries"
        ]

        async def slow(url, **_):
            # The owner picks blue while the red photo is on its way.
            await client.post(
                f"/api/intake/entries/{entry['id']}/choose",
                json={"external_id": "13"},
            )
            return jpeg(1600, 1200)

        monkeypatch.setattr(seed_import, "fetch_image", slow)
        first = (
            await client.post(f"/api/intake/sittings/{sitting_id}/seed-images")
        ).json()
        assert first["entries"] == [] and first["pending"] == 1
        monkeypatch.setattr(seed_import, "fetch_image", photo_ok)
        await fetch_all(client, sitting_id)
        [shown] = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()[
            "entries"
        ]
    assert shown["payload"]["color_name"] == "Blue"
    assert shown["payload"]["image"] == "held" and shown["photo_id"]
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count()).select_from(IntakePhoto)) == 1


async def photo_ok(url, **_):
    return jpeg(1600, 1200)


@pytest.mark.asyncio
async def test_a_kept_link_is_one_piece_however_often_it_is_pasted(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        one = await start(client)
        await paste(client, one, [REFUSED])
        await client.post(f"/api/intake/sittings/{one}/commit", json={})
        two = await start(client)
        await paste(client, two, [REFUSED])
        second = await client.post(f"/api/intake/sittings/{two}/commit", json={})
    assert (second.json()["added"], second.json()["already_owned"]) == (0, 1)
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count()).select_from(Garment)) == 1


@pytest.mark.asyncio
async def test_commit_refuses_a_multi_colour_piece_with_no_colour_chosen(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        [entry] = (await paste(client, sitting_id, [MULTI])).json()["entries"]
        refused = await client.post(
            f"/api/intake/sittings/{sitting_id}/commit", json={}
        )
        await client.post(
            f"/api/intake/entries/{entry['id']}/choose", json={"external_id": "11"}
        )
        fine = await client.post(f"/api/intake/sittings/{sitting_id}/commit", json={})
    assert refused.status_code == 422
    assert refused.json()["refused"][0]["field"] == "color_name"
    assert fine.status_code == 200 and fine.json()["added"] == 1


@pytest.mark.asyncio
async def test_a_different_size_of_one_colour_is_a_different_piece(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        entries = (
            await paste(
                client,
                sitting_id,
                [
                    MULTI + "?variant=11",
                    MULTI + "?variant=12",
                    MULTI + "?variant=11&x=1",
                ],
            )
        ).json()["entries"]
        sizes = [e["payload"].get("size") for e in entries]
        response = await client.post(
            f"/api/intake/sittings/{sitting_id}/commit", json={}
        )
    assert sizes == ["S", "M", "S"]  # the link's variant names the size
    # S and M are two pieces; the third link is S again, counted not silent.
    assert (response.json()["added"], response.json()["already_owned"]) == (2, 1)


def test_a_typed_size_survives_a_colour_with_no_sizes():
    payload = {
        "seed": {"source": "link"},
        "link": {"url": "https://shop.test/products/p"},
        "size": "XL",
    }
    colour = {"external_id": "9", "color_name": "Plain", "sizes": []}
    out = link_import.apply_colour(payload, {"currency": "USD"}, colour)
    assert out["size"] == "XL"
    listed = {**colour, "sizes": [{"size": "S"}, {"size": "M"}]}
    assert "size" not in link_import.apply_colour(payload, {}, listed)


@pytest.mark.asyncio
async def test_a_blur_save_cannot_undo_a_colour_choice(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        [entry] = (await paste(client, sitting_id, [MULTI])).json()["entries"]
        await client.post(
            f"/api/intake/entries/{entry['id']}/choose", json={"external_id": "13"}
        )
        # A save sent before the choice carries only the field it edits.
        patched = await client.patch(
            f"/api/intake/entries/{entry['id']}",
            json={"payload": {"name": "Renamed", "brand": ""}},
        )
    p = patched.json()["payload"]
    assert (p["name"], p["color_name"]) == ("Renamed", "Blue")
    assert "brand" not in p and p["seed"]["row"]["chosen"] == "13"


@pytest.mark.asyncio
async def test_a_removed_piece_cannot_be_given_a_colour(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        [entry] = (await paste(client, sitting_id, [MULTI])).json()["entries"]
        await client.patch(
            f"/api/intake/entries/{entry['id']}", json={"state": "ignored"}
        )
        response = await client.post(
            f"/api/intake/entries/{entry['id']}/choose", json={"external_id": "13"}
        )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_a_sitting_holds_at_most_so_many_links(
    sessionmaker_for_test, monkeypatch
):
    monkeypatch.setattr(link_import, "MAX_ENTRIES", 3)
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await paste(client, sitting_id, [ML, DUER])
        over = await paste(client, sitting_id, [MULTI, PLAIN_A])
        ok = await paste(client, sitting_id, [MULTI])
    assert over.status_code == 422 and "at most 3" in over.json()["detail"]
    assert ok.status_code == 201


@pytest.mark.asyncio
async def test_a_slow_store_is_kept_as_typed_not_waited_for(
    sessionmaker_for_test, monkeypatch
):
    import asyncio

    async def hang(url, *, fetcher=None):
        await asyncio.sleep(30)

    monkeypatch.setattr(link_import, "resolve", hang)
    monkeypatch.setattr(link_import, "TOTAL_SECONDS", 0.05)
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        response = await paste(client, sitting_id, [ML])
    [entry] = response.json()["entries"]
    assert entry["payload"]["link"]["state"] == "kept"
    assert entry["payload"]["link"]["code"] == "timeout"
