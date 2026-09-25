"""STORES: every boutique store the catalogue reads, as data.

Transcribed from the spec §2 table and corrected by the recorded fixtures
(2026-09-25; the plan's Execution summary lists each difference). Adding a
store is a row here, a fixture per handle, and tests; no adapter code.

Platform strategies are tried in order; the first that names a platform
wins. When a product has the option a strategy names, tags are never
consulted: Limited Run's "Riven (PS5, Xbox)" carries a Switch tag and no
Switch variant.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from physical_sources.parse import platform_of

_I = re.IGNORECASE


@dataclass(frozen=True)
class StoreConfig:
    """How one store is read.

    `platform` steps: "option:<name>", "product_type", "title",
    "sku_prefix:<prefix>=<label>", "sku_contains:<text>=<label>",
    "collection:<handle>=<label>", "attribute:<name>" (WooCommerce), "tags".
    `status` steps: see parse.status_from. `game_filter` entries:
    "type:<t>", "type_contains:<s>", "tag:<t>" (any one admits the product)
    and "not_type:<t>", "not_tag:<t>", "not_title:<regex>", "not_option:<name>"
    (any one excludes it).
    """

    key: str
    name: str
    adapter: str
    domain: str
    currency: str
    region: str
    collections: tuple[str, ...]
    title_strip: tuple[re.Pattern, ...] = ()
    platform: tuple[str, ...] = ("option:Platform", "product_type", "title", "tags")
    status: tuple[str, ...] = ("available",)
    game_filter: tuple[str, ...] = ()
    url_keep: re.Pattern | None = None
    format_policy: str | None = None
    # Collections whose members the format policy does not cover.
    policy_exempt: tuple[str, ...] = ()
    html_step: bool = False
    # Collections whose Switch 2 variants get the HTML step.
    html_collections: tuple[str, ...] = ()


# Product types that are never a game, from every store's recorded fixtures.
# Titles are not filtered on "soundtrack": "Spirit Hunter: Death Mark II -
# Standard Edition (with Soundtrack)" is a game.
_MERCH = tuple(
    f"not_type:{kind}"
    for kind in (
        "apparel",
        "art card",
        "art print",
        "books",
        "card sleeves",
        "cassette",
        "cds",
        "collectible coin",
        "collectible trading cards",
        "game soundtrack",
        "hats",
        "keychains",
        "lp vinyl",
        "merch",
        "merchandise",
        "music album",
        "music cds",
        "pin",
        "records & lps",
        "shipping",
        "shirts",
        "trading cards",
    )
) + ("not_title:\\b(t-?shirt|hoodie|vinyl figure|poster)\\b",)

STORES: dict[str, StoreConfig] = {
    config.key: config
    for config in (
        StoreConfig(
            key="limited_run",
            name="Limited Run",
            adapter="shopify",
            domain="limitedrungames.com",
            currency="USD",
            region="USA",
            collections=(
                "coming-soon",
                "latest-releases",
                "distro",
                "the-lr-vault",
                "in-stock-switch",
            ),
            title_strip=(
                re.compile(r"^(Switch|PS5|PS4|Xbox) Limited Run #\d+:\s*", _I),
            ),
            platform=(
                "option:Platform",
                "sku_prefix:NS2-=Switch 2",
                "sku_prefix:NSW-=Switch",
                "sku_prefix:NS1-=Switch",
                "title",
                "tags",
            ),
            status=(
                "collection:coming-soon=preorder",
                "collection:latest-releases=preorder",
                "available",
            ),
            game_filter=("type:games", *_MERCH),
            format_policy="game_card",
            policy_exempt=("distro",),
            html_step=True,
            html_collections=("coming-soon", "latest-releases"),
        ),
        StoreConfig(
            key="iam8bit",
            name="iam8bit",
            adapter="shopify",
            domain="www.iam8bit.com",
            currency="USD",
            region="USA",
            collections=("games", "nintendo", "pre-order", "new", "restock"),
            platform=(
                "option:Platform",
                "title",
                "sku_contains:-N2-=Switch 2",
                "product_type",
                "tags",
            ),
            status=(
                "tag_if_unavailable:sold-out=sold_out",
                "tag:pre-order=preorder",
                "available",
            ),
            game_filter=(
                "type:switch",
                "type:playstation",
                "type:xbox",
                "type:collector's edition",
                "tag:physical games",
                "tag:physical edition game",
                *_MERCH,
            ),
        ),
        StoreConfig(
            key="strictly_limited",
            name="Strictly Limited",
            adapter="shopify",
            domain="www.strictlylimitedgames.com",
            currency="EUR",
            region="EUR",
            collections=(
                "nintendo-switch-2",
                "nintendo-switch",
                "pre-order",
                "coming-soon",
                "in-stock",
            ),
            platform=("product_type", "title", "tags"),
            status=(
                "tag_if_unavailable:sold out=sold_out",
                "tag:pre-order=preorder",
                "available",
            ),
            game_filter=(
                "type_contains:game",
                "type_contains:edition",
                "not_tag:no game",
                "not_title:\\(no game\\)",
                *_MERCH,
            ),
        ),
        StoreConfig(
            key="premium_edition",
            name="Premium Edition",
            adapter="shopify",
            domain="premiumeditiongames.com",
            currency="USD",
            region="USA",
            collections=(
                "pre-order",
                "latest-preorders",
                "coming-soon-2",
                "in-stock",
                "in-stock-partners",
            ),
            platform=("product_type", "title", "tags"),
            status=(
                "collection:pre-order=preorder",
                "collection:latest-preorders=preorder",
                "collection:coming-soon-2=preorder",
                "title_contains:(pre-order)=preorder",
                "available",
            ),
            game_filter=(
                "type_contains:games",
                "type:sega",
                "type:nintendo ds",
                *_MERCH,
            ),
        ),
        StoreConfig(
            key="nicalis",
            name="Nicalis",
            adapter="shopify",
            domain="store.nicalis.com",
            currency="USD",
            region="USA",
            collections=("nintendo-switch-2", "nintendo-switch", "new"),
            platform=(
                "option:Platform",
                "sku_contains:-NSW2-=Switch 2",
                "sku_contains:-NSW-=Switch",
                "tags",
            ),
            status=("tag:preorder=preorder", "available"),
            game_filter=("type:video game", *_MERCH),
        ),
        StoreConfig(
            key="aksys_us",
            name="Aksys Games",
            adapter="shopify",
            domain="store.aksysgames.com",
            currency="USD",
            region="USA",
            collections=("preorder-now", "new-releases", "switch"),
            title_strip=(
                re.compile(r"^PRE-ORDER:\s*", _I),
                re.compile(r"^ONLINE EXCLUSIVE EDITION\s*-\s*", _I),
            ),
            platform=(
                "option:Platform",
                "option:Video game platform",
                "option:Console",
                "title",
                "sku_prefix:SW-=Switch",
                "sku_prefix:PS5-=PS5",
                "sku_prefix:PS4-=PS4",
            ),
            status=(
                "title_prefix:pre-order: =preorder",
                "collection:preorder-now=preorder",
                "available",
            ),
            game_filter=("not_option:t-shirt size", *_MERCH),
        ),
        StoreConfig(
            key="aksys_eu",
            name="Aksys Games Europe",
            adapter="shopify",
            domain="store.aksyseurope.com",
            currency="GBP",
            region="EUR",
            collections=(
                "nintendo-switch™-1",
                "nintendo-switch-game",
                "pre-order-now",
                "buy-now",
                "sold-out",
            ),
            title_strip=(re.compile(r"\s*-\s*Nintendo Switch™?\s*$", _I),),
            platform=(
                "option:Platform",
                "product_type",
                "title",
                "collection:nintendo-switch™-1=Switch",
                "collection:nintendo-switch-game=Switch",
            ),
            status=("collection:pre-order-now=preorder", "available"),
            game_filter=("not_option:shirt size", *_MERCH),
        ),
        StoreConfig(
            key="fangamer",
            name="Fangamer",
            adapter="shopify",
            domain="www.fangamer.com",
            currency="USD",
            region="USA",
            collections=("physical-games", "video-games"),
            title_strip=(
                # "Stardew Valley - Stardew Valley Standard Edition"
                re.compile(r"^(.+?) - (?=\1)"),
                re.compile(
                    r"\s*-?\s*(?:Game )?Physical Edition"
                    r"(?: for Nintendo Switch(?:™| 2)?)?\s*$",
                    _I,
                ),
            ),
            platform=(
                "option:edition",
                "option:Platform",
                "option:Style",
                "title",
                "tags",
            ),
            status=("tag:preorder=preorder", "available"),
            game_filter=("type:games", *_MERCH),
        ),
        StoreConfig(
            key="super_rare",
            name="Super Rare Games",
            adapter="shopify",
            domain="superraregames.com",
            currency="GBP",
            region="EUR",
            collections=("switch-2", "switch", "srg-store-new-web"),
            title_strip=(
                re.compile(r"^\[[^\]]+\]\s*", _I),
                re.compile(r"^(?:Sw2|SRG|SE|SW|PS5|PS4|DE|PB)#\d+\s*[:\-]\s*", _I),
            ),
            platform=("product_type", "title", "tags"),
            status=("tag:pre-order=preorder", "available"),
            game_filter=(
                "not_type:trading cards",
                "not_type:steelbook",
                "not_type:super rare club membership",
                "not_tag:clubproducts",
                "not_title:\\bteeto key\\b",
                *_MERCH,
            ),
        ),
        StoreConfig(
            key="pixelheart",
            name="PixelHeart",
            adapter="woocommerce",
            domain="www.pixelheart.eu",
            currency="EUR",
            region="EUR",
            collections=("65",),
            platform=("attribute:Platform", "title"),
            url_keep=re.compile(r"/en/"),
        ),
        StoreConfig(
            key="gamefairy",
            name="GameFairy",
            adapter="woocommerce",
            domain="gamefairy.io",
            currency="USD",
            region="USA",
            collections=("22",),
            platform=("attribute:Platform", "title"),
        ),
        StoreConfig(
            key="oneprint",
            name="1Print Games",
            adapter="woocommerce",
            domain="1printgames.com",
            currency="USD",
            region="USA",
            collections=("18",),
            platform=("attribute:Platform", "title"),
        ),
    )
}


# --- Reading a product through its store's config ---------------------------------


def _label(value: str) -> tuple[int | None, str | None]:
    return platform_of(value)


def resolve_platform(
    config: StoreConfig,
    *,
    options: dict[str, str],
    product_type: str,
    title: str,
    sku: str,
    tags: list[str],
    collections_seen: set[str],
    attributes: dict[str, list[str]] | None = None,
) -> tuple[int | None, str | None]:
    """(platform_id, label) from the config's platform steps, first hit wins.

    `options` maps this variant's option names (case-folded) to its values;
    `attributes` maps WooCommerce attribute names (case-folded) to terms.
    """
    has_named_option = False
    for step in config.platform:
        kind, _, rule = step.partition(":")
        found: tuple[int | None, str | None] = (None, None)
        if kind == "option":
            value = options.get(rule.lower())
            if value is not None:
                has_named_option = True
                found = _label(value)
        elif kind == "attribute":
            terms = (attributes or {}).get(rule.lower(), [])
            found = _label(" ".join(terms)) if terms else (None, None)
        elif kind == "product_type":
            found = _label(product_type)
        elif kind == "title":
            found = _label(title)
        elif kind in ("sku_prefix", "sku_contains", "collection"):
            needle, _, label = rule.rpartition("=")
            hit = (
                sku.upper().startswith(needle.upper())
                if kind == "sku_prefix"
                else needle.upper() in sku.upper()
                if kind == "sku_contains"
                else needle.lower() in collections_seen
            )
            found = _label(label) if hit else (None, None)
        elif kind == "tags" and not has_named_option:
            named = {_label(tag) for tag in tags} - {(None, None)}
            found = named.pop() if len(named) == 1 else (None, None)
        if found != (None, None):
            return found
    return None, None


def admits(
    config: StoreConfig,
    *,
    product_type: str,
    tags: list[str],
    title: str,
    option_names: list[str],
) -> bool:
    """Whether the config's game_filter counts this product as a game."""
    kind_type = product_type.strip().lower()
    tag_set = {tag.strip().lower() for tag in tags}
    names = {name.strip().lower() for name in option_names}
    positive = False
    admitted = False
    for entry in config.game_filter:
        kind, _, value = entry.partition(":")
        value = value.lower()
        if kind == "not_type" and kind_type == value:
            return False
        if kind == "not_tag" and value in tag_set:
            return False
        if kind == "not_title" and re.search(value, title, re.IGNORECASE):
            return False
        if kind == "not_option" and value in names:
            return False
        if kind in ("type", "type_contains", "tag"):
            positive = True
            admitted = admitted or (
                (kind == "type" and kind_type == value)
                or (kind == "type_contains" and value in kind_type)
                or (kind == "tag" and value in tag_set)
            )
    return admitted or not positive
