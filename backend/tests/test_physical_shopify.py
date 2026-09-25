"""STORES and the Shopify adapter, on the recorded products.json pages."""

import json
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import httpx2
import pytest

from physical_sources.courtesy import parse_robots
from physical_sources.limits import CATALOGUE_PLATFORMS
from physical_sources.shopify import (
    apply_page,
    collection_url,
    explode,
    list_products,
    parse_product_page,
)
from physical_sources.stores import STORES

FIXTURES = Path(__file__).parent / "fixtures" / "physical"
SHOPIFY = FIXTURES / "shopify"


def fixture_name(handle: str) -> str:
    """The recorder's ASCII file name for a handle."""
    return re.sub(r"[^a-z0-9-]+", "-", handle.replace("™", "-tm").lower()).strip("-")


def page(store: str, handle: str) -> list[dict]:
    path = SHOPIFY / store / f"{fixture_name(handle)}.p1.json"
    return json.loads(path.read_text())["products"]


def store_products(store: str) -> tuple[dict[str, dict], dict[str, set[str]]]:
    """Every product on a store's recorded handles, and the handles it is in."""
    found: dict[str, dict] = {}
    handles: dict[str, set[str]] = {}
    for handle in STORES[store].collections:
        for product in page(store, handle):
            key = str(product["id"])
            found.setdefault(key, product)
            handles.setdefault(key, set()).add(handle)
    return found, handles


def rows_for(store: str, title_start: str):
    found, handles = store_products(store)
    return [
        row
        for key, product in found.items()
        if product["title"].startswith(title_start)
        for row in explode(product, STORES[store], handles[key])
    ]


def by_platform(rows):
    return {row.platform_id: row for row in rows}


# --- STORES ----


def test_twelve_stores_nine_on_shopify():
    assert len(STORES) == 12
    assert sum(config.adapter == "shopify" for config in STORES.values()) == 9
    assert "atari" not in STORES


def test_limited_run_walks_exactly_its_five_handles():
    assert STORES["limited_run"].collections == (
        "coming-soon",
        "latest-releases",
        "distro",
        "the-lr-vault",
        "in-stock-switch",
    )


def test_the_aksys_eu_trademark_handle_is_percent_encoded():
    url = collection_url(STORES["aksys_eu"], "nintendo-switch™-1", 1)
    assert "/collections/nintendo-switch%E2%84%A2-1/products.json" in url


# --- Limited Run ----


def test_terranigma_foiled_explodes_into_three_variants():
    rows = rows_for("limited_run", "Terranigma: Foiled")
    assert len(rows) == 3
    platforms = by_platform(rows)
    assert 508 in platforms
    assert [row.platform_id for row in rows].count(508) == 1
    switch_2 = platforms[508]
    assert switch_2.title_normalized == "terranigma foiled"
    assert switch_2.edition_label == "Standard"
    assert switch_2.preorder_closes_at == date(2026, 11, 8)


def test_coming_soon_is_preorder_even_when_unavailable():
    switch_2 = by_platform(rows_for("limited_run", "Terranigma: Foiled"))[508]
    assert switch_2.raw["variant"]["available"] is False
    assert switch_2.availability == "preorder"


def test_the_policy_skips_distro_titles():
    product = next(
        p
        for p in page("limited_run", "coming-soon")
        if p["title"].startswith("Terranigma: Foiled")
    )
    config = STORES["limited_run"]
    distro = by_platform(explode(product, config, {"coming-soon", "distro"}))[508]
    assert (distro.format_hint, distro.format_tier) == (None, None)
    own = by_platform(explode(product, config, {"coming-soon"}))[508]
    assert (own.format_hint, own.format_tier) == ("game_card", "store_policy")


def test_the_policy_never_speaks_for_a_ps5_variant():
    product = next(
        p
        for p in page("limited_run", "coming-soon")
        if p["title"].startswith("Terranigma: Foiled")
    )
    ps5 = by_platform(explode(product, STORES["limited_run"], {"coming-soon"}))[167]
    assert ps5.format_hint is None


def test_a_numbered_vault_title():
    (row,) = rows_for("limited_run", "Switch Limited Run #270")
    assert row.title_normalized == "9 years of shadows"
    assert row.platform_id == 130
    assert row.availability == "in_stock"
    # The body states it, so the text (step 3) answers before the store
    # policy (step 4) or the platform (step 5) would.
    assert (row.format_hint, row.format_tier) == ("game_card", "store_text")
    assert row.format_evidence == "region-free physical cart"


def test_riven_carries_a_switch_tag_and_no_switch_variant():
    rows = rows_for("limited_run", "Riven Standard Edition")
    assert rows and not {130, 508} & {row.platform_id for row in rows}


def test_merch_is_not_a_game():
    (row,) = rows_for("limited_run", "R-Type DX CD Soundtrack")
    assert row.is_game is False


# --- Super Rare, iam8bit, Strictly Limited ----


def test_super_rare_midnight_walk():
    (row,) = rows_for("super_rare", "Sw2#02")
    assert (row.title_normalized, row.platform_id) == ("the midnight walk", 508)
    assert (row.format_hint, row.format_tier, row.format_evidence) == (
        "game_card",
        "store_text",
        "Fully assembled Nintendo Switch 2 game with cartridge",
    )
    assert (row.currency, row.region, row.price) == ("GBP", "EUR", Decimal("46.20"))


def test_super_rare_special_edition_says_nothing_about_format():
    (row,) = rows_for("super_rare", "[Special Edition] SE#02")
    assert (row.title_normalized, row.platform_id) == ("the midnight walk", 508)
    assert row.format_hint is None


def test_super_rare_trading_cards_are_not_games():
    (row,) = rows_for("super_rare", "Sw2 TC#02")
    assert row.is_game is False


def test_iam8bit_unbeatable_switch_2():
    (row,) = rows_for(
        "iam8bit", "UNBEATABLE - Breakout Edition (iam8bit Nintendo Switch 2"
    )
    assert (row.platform_id, row.is_game) == (508, True)
    assert row.format_evidence == "complete on cartridge"
    # Recorded unavailable with both a pre-order and a sold-out tag: the
    # sold-out tag is trusted because the variant is unavailable.
    assert row.availability == "sold_out"
    assert row.release_date == date(2026, 10, 1)


def test_iam8bit_legacy_cartridge_is_a_game_on_no_catalogue_platform():
    rows = rows_for("iam8bit", "Sonic the Hedgehog (35th Anniversary)")
    assert rows and all(row.is_game for row in rows)
    assert not {130, 508} & {row.platform_id for row in rows}


def test_strictly_limited_shenmue():
    row = by_platform(rows_for("strictly_limited", "Shenmue III Enhanced - Special"))[
        508
    ]
    assert (row.platform_id, row.format_hint, row.format_tier) == (
        508,
        "game_card",
        "store_text",
    )
    # A Sold Out tag on an available variant is not believed.
    assert row.raw["variant"]["available"] is True
    assert row.availability != "sold_out"


# --- The HTML step ----


def test_the_product_page_ship_date():
    facts = parse_product_page((SHOPIFY / "limited_run" / "product.html").read_text())
    assert facts.key_card_seen is False
    assert (facts.ship_date, facts.ship_precision) == (date(2027, 1, 1), "month")
    assert facts.ship_text == "Estimated ship date Jan 12 – 31, 2027"


def test_a_key_card_page_relabels_and_marks_the_check():
    switch_2 = by_platform(rows_for("limited_run", "Terranigma: Foiled"))[508]
    facts = parse_product_page("<p>Switch 2 edition comes with a Game Key Card*</p>")
    updated = apply_page(switch_2, facts, date(2026, 9, 25))
    assert (updated.format_hint, updated.format_tier) == ("game_key_card", "store_text")
    assert updated.raw["html_checked_at"] == "2026-09-25"


# --- Walking a store ----


def serve(store: str, robots_text: str | None = None, empty: str | None = None):
    config = STORES[store]
    by_url = {
        collection_url(config, handle, 1): page(store, handle)
        for handle in config.collections
    }
    html = (SHOPIFY / "limited_run" / "product.html").read_text()
    requested: list[str] = []

    def handler(request):
        url = str(request.url)
        requested.append(url)
        if request.url.path == "/robots.txt":
            return httpx2.Response(200, text=robots_text or "User-agent: *\nAllow: /\n")
        if request.url.path.startswith("/products/"):
            return httpx2.Response(200, text=html)
        for known, products in by_url.items():
            if url == httpx2.URL(known).__str__():
                if empty and f"/{empty}/" in url:
                    return httpx2.Response(200, json={"products": []})
                return httpx2.Response(200, json={"products": products})
        return httpx2.Response(200, json={"products": []})

    return handler, requested


@pytest.mark.asyncio
async def test_list_products_merges_handles_and_runs_the_html_step():
    handler, requested = serve("limited_run")
    async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
        rows, errors = await list_products(
            STORES["limited_run"], client, None, today=date(2026, 9, 25)
        )
    assert errors == []
    terranigma = [r for r in rows if r.title.startswith("Terranigma: Foiled")]
    assert len(terranigma) == 3
    assert set(terranigma[0].collections_seen) == {"coming-soon", "distro"}
    switch_2 = by_platform(terranigma)[508]
    assert switch_2.raw["html_checked_at"] == "2026-09-25"
    assert "/products/terranigma-foiled-standard-edition-switch-2-ps5-xbox" in " ".join(
        requested
    )
    # Short pages end the walk: one request per handle, plus the pages.
    assert sum("/collections/" in url for url in requested) == 5


@pytest.mark.asyncio
async def test_a_recent_html_check_is_not_repeated():
    handler, requested = serve("limited_run")
    skip = frozenset({"terranigma-foiled-standard-edition-switch-2-ps5-xbox"})
    async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
        await list_products(STORES["limited_run"], client, None, html_skip=skip)
    assert not any(
        "terranigma-foiled-standard-edition" in url and "/products/" in url
        for url in requested
    )


@pytest.mark.asyncio
async def test_an_empty_handle_is_an_error_and_the_rest_still_write():
    handler, _ = serve("super_rare", empty="switch-2")
    async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
        rows, errors = await list_products(STORES["super_rare"], client, None)
    assert [error.code for error in errors] == ["empty_collection"]
    assert rows


@pytest.mark.asyncio
async def test_a_disallowed_path_is_never_requested():
    handler, requested = serve("super_rare")
    robots = parse_robots("User-agent: *\nDisallow: /collections/\n")
    async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
        rows, errors = await list_products(STORES["super_rare"], client, robots)
    assert rows == []
    assert {error.code for error in errors} == {"robots_disallowed"}
    assert not any("/collections/" in url for url in requested)


def test_catalogue_platforms_are_the_three():
    assert CATALOGUE_PLATFORMS == {508, 130, 4}
