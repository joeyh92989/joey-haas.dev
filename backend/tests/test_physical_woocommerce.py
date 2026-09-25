"""The WooCommerce adapter, on the recorded Store API pages."""

import json
from decimal import Decimal
from pathlib import Path

import httpx2
import pytest

from physical_sources.stores import STORES
from physical_sources.woocommerce import category_url, explode, list_products

WOO = Path(__file__).parent / "fixtures" / "physical" / "woocommerce"


def products(store: str) -> list[dict]:
    (path,) = (WOO / store).glob("*.json")
    return json.loads(path.read_text())


def rows(store: str):
    config = STORES[store]
    return [row for product in products(store) for row in explode(product, config)]


def test_pixelheart_keeps_only_the_english_listing():
    duplicates = [
        p for p in products("pixelheart") if "Rage of the Dragons" in p["name"]
    ]
    assert len(duplicates) == 2
    (row,) = [r for r in rows("pixelheart") if "Rage of the Dragons" in r.title]
    assert "/en/" in row.url
    assert (row.price, row.currency, row.region) == (Decimal("44.90"), "EUR", "EUR")
    assert (row.platform_id, row.title_normalized) == (130, "rage of the dragons neo")
    assert row.availability == "sold_out"
    assert (row.format_hint, row.format_tier) == ("game_card", "platform_policy")


def test_pixelheart_drops_every_french_duplicate():
    kept = rows("pixelheart")
    assert all("/en/" in row.url for row in kept)
    assert len(kept) == sum("/en/" in p["permalink"] for p in products("pixelheart"))


def test_pixelheart_platform_attribute():
    attributes = {
        row.raw["attributes"].get("plate-forme", [None])[0]
        for row in rows("pixelheart")
    }
    assert "Nintendo Switch" in attributes


def test_gamefairy_case_and_cartridge():
    row = next(r for r in rows("gamefairy") if r.title.startswith("Symphonia"))
    assert (row.format_hint, row.format_tier, row.format_evidence) == (
        "game_card",
        "store_text",
        "Switch Case and Cartridge",
    )
    assert (row.currency, row.title_normalized) == ("USD", "symphonia")
    # The HTML in the name is read as text.
    assert "<span" not in row.title


def test_oneprint_bundle_is_one_game_listing():
    (row,) = [
        r
        for r in rows("oneprint")
        if r.title == "In Other Waters And Sky Racket (Nintendo Switch)"
    ]
    assert (row.platform_id, row.is_game) == (130, True)
    assert row.title_normalized == "in other waters and sky racket"


def test_backorder_is_preorder():
    product = {**products("oneprint")[0], "is_on_backorder": True, "is_in_stock": True}
    (row,) = explode(product, STORES["oneprint"])
    assert row.availability == "preorder"


def _serve(store, empty=False):
    config = STORES[store]
    body = [] if empty else products(store)

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx2.Response(404)
        assert str(request.url) == category_url(config, config.collections[0], 1)
        return httpx2.Response(200, json=body)

    return handler


@pytest.mark.asyncio
async def test_list_products_reads_one_short_page():
    async with httpx2.AsyncClient(
        transport=httpx2.MockTransport(_serve("gamefairy"))
    ) as client:
        found, errors = await list_products(STORES["gamefairy"], client, None)
    assert errors == [] and len(found) == len(products("gamefairy"))


@pytest.mark.asyncio
async def test_an_empty_category_is_reported():
    handler = _serve("gamefairy", empty=True)
    async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
        found, errors = await list_products(STORES["gamefairy"], client, None)
    assert found == [] and [e.code for e in errors] == ["empty_collection"]
