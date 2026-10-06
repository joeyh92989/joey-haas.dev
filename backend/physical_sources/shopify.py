"""Shopify stores: /collections/<handle>/products.json, one row per variant.

Pure except list_products and fetch_product_page, the only network calls.
explode() turns one product into one StoreProduct per variant: platform from
the store's strategy, availability from its status steps, dates from the
body, and the format from the classifier over title and body. The format
policy and the classifier speak only for the catalogue's platforms; a PS5
variant of a Switch game gets no format from text about the Switch.
"""

from __future__ import annotations

import dataclasses
import json
import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

from matching import normalize_title
from physical_sources.base import (
    HostThrottle,
    PhysicalSourceError,
    StoreProduct,
    plausible_price,
    throttled_get,
)
from physical_sources.courtesy import Robots, allowed
from physical_sources.format import UPGRADE_PACK, classify, plain_text
from physical_sources.limits import (
    CATALOGUE_PLATFORMS,
    MAX_PAGES,
    PAGE_SIZE_SHOPIFY,
    SWITCH_2,
)
from physical_sources.parse import (
    edition_label,
    parse_preorder_close,
    parse_release,
    status_from,
    strip_title,
)
from physical_sources.stores import StoreConfig, admits, resolve_platform

logger = logging.getLogger(__name__)

BODY_EXCERPT = 2000


def _tags(product: dict) -> list[str]:
    tags = product.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split(",")
    return [tag.strip() for tag in tags if tag.strip()]


def _price(value: object) -> Decimal | None:
    try:
        return plausible_price(Decimal(str(value))) if value not in (None, "") else None
    except InvalidOperation:
        return None


def _variant_options(product: dict, variant: dict) -> dict[str, str]:
    """{option name (case-folded): this variant's value}."""
    options = {}
    for index, option in enumerate(product.get("options") or [], start=1):
        value = variant.get(f"option{index}")
        if value is not None and option.get("name"):
            options[option["name"].strip().lower()] = str(value)
    return options


def parse_page(payload: dict) -> list[dict]:
    """The products of one products.json page."""
    products = payload.get("products") if isinstance(payload, dict) else None
    if not isinstance(products, list):
        raise PhysicalSourceError("no products list in the body", code="http_error")
    # A malformed entry is dropped, never allowed to fail the store.
    return [p for p in products if isinstance(p, dict) and p.get("id") is not None]


def explode(
    product: dict, config: StoreConfig, collections_seen: set[str]
) -> list[StoreProduct]:
    """One StoreProduct per variant of a product."""
    title = product.get("title") or ""
    body = plain_text(product.get("body_html") or "")
    product_type = product.get("product_type") or ""
    tags = _tags(product)
    seen = {handle.lower() for handle in collections_seen}
    variants = product.get("variants") or []
    option_names = [option.get("name", "") for option in product.get("options") or []]
    is_game = admits(
        config,
        product_type=product_type,
        tags=tags,
        title=title,
        option_names=option_names,
    )
    policy = (
        None
        if any(handle.lower() in seen for handle in config.policy_exempt)
        else config.format_policy
    )
    closes = parse_preorder_close(body)
    released, precision, release_text = parse_release(f"{title} {body}")
    image = next(iter(product.get("images") or []), None)
    stripped = strip_title(title, config.title_strip)

    rows = []
    for variant in variants:
        options = _variant_options(product, variant)
        platform_id, label = resolve_platform(
            config,
            options=options,
            product_type=product_type,
            title=title,
            sku=str(variant.get("sku") or ""),
            tags=tags,
            collections_seen=seen,
        )
        text = f"{title} {body}"
        if platform_id not in (SWITCH_2, None):
            # The Fangamer upgrade-pack sentence is about the Switch 2
            # edition; it says nothing about a PS5 variant.
            text = UPGRADE_PACK.sub(" ", text)
        speaks = platform_id in CATALOGUE_PLATFORMS or (
            platform_id is None and label is None
        )
        found = classify(text, policy if speaks else None, platform_id)
        if found.platform_override and platform_id in (SWITCH_2, None):
            platform_id, label = found.platform_override, "Nintendo Switch"
        if not speaks:
            found = dataclasses.replace(found, format=None, tier=None, evidence=None)
        variant_id = str(variant.get("id") or product.get("id"))
        url = f"https://{config.domain}/products/{product.get('handle', '')}"
        if len(variants) > 1:
            url += f"?variant={variant_id}"
        rows.append(
            StoreProduct(
                store=config.key,
                store_product_id=str(product.get("id")),
                variant_id=variant_id,
                handle=product.get("handle") or "",
                url=url,
                region=config.region,
                title=title,
                title_normalized=normalize_title(stripped),
                edition_label=edition_label(title, *options.values()),
                platform_id=platform_id,
                platform_label=label,
                is_game=is_game,
                collections_seen=tuple(sorted(collections_seen)),
                price=_price(variant.get("price")),
                currency=config.currency,
                availability=status_from(config.status, product, variant, seen),
                preorder_closes_at=closes,
                release_date=released,
                release_precision=precision,
                release_text=release_text,
                format_hint=found.format,
                format_tier=found.tier,
                format_evidence=found.evidence,
                image_url=(image or {}).get("src"),
                raw={
                    "product_type": product_type,
                    "tags": tags,
                    "options": product.get("options") or [],
                    "variant": {
                        key: variant.get(key)
                        for key in (
                            "id",
                            "title",
                            "sku",
                            "available",
                            "price",
                            "option1",
                            "option2",
                            "option3",
                        )
                    },
                    "body": body[:BODY_EXCERPT],
                },
            )
        )
    return rows


# --- The Limited Run HTML step ------------------------------------------------------


@dataclasses.dataclass(frozen=True)
class PageFacts:
    """What a product page adds to its JSON: a key-card note and a ship date."""

    key_card_seen: bool
    ship_text: str | None
    ship_date: date | None
    ship_precision: str | None


_KEY_CARD = re.compile(r"\bgame[- ]?key[- ]?card\b", re.IGNORECASE)
_PLAN_NAME = re.compile(r'"name":"([^"]*estimated ship date[^"]*)"', re.IGNORECASE)


def parse_product_page(html: str) -> PageFacts:
    """A Limited Run product page: whether it names a Game Key Card, and the
    earliest ship window its pre-order selling plans state. Both are absent
    from every JSON endpoint; the ship date moved from theme text into the
    selling-plan JSON by 2026-09-25."""
    key_card = bool(_KEY_CARD.search(plain_text(html)))
    earliest: tuple[date, str, str] | None = None
    for raw_name in _PLAN_NAME.findall(html):
        try:
            name = json.loads(f'"{raw_name}"')
        except ValueError:
            name = raw_name
        value, precision, _ = parse_release(name)
        if value is not None and (earliest is None or value < earliest[0]):
            earliest = (value, precision, name.strip())
    if earliest is None:
        return PageFacts(key_card, None, None, None)
    value, precision, name = earliest
    text = re.sub(r"^[^A-Za-z]+", "", name)
    return PageFacts(key_card, text, value, precision)


def apply_page(product: StoreProduct, facts: PageFacts, today: date) -> StoreProduct:
    """A listing with what its product page added. A Game Key Card note beats
    the store's policy; a ship date fills only a missing release date."""
    changes: dict = {"raw": {**product.raw, "html_checked_at": today.isoformat()}}
    if facts.key_card_seen:
        changes.update(
            format_hint="game_key_card",
            format_tier="store_text",
            format_evidence="Game Key Card",
        )
    if facts.ship_date and product.release_date is None:
        changes.update(
            release_date=facts.ship_date,
            release_precision=facts.ship_precision,
            release_text=facts.ship_text,
        )
    return dataclasses.replace(product, **changes)


# --- Network ------------------------------------------------------------------------


def collection_url(config: StoreConfig, handle: str, page: int) -> str:
    return (
        f"https://{config.domain}/collections/{quote(handle, safe='')}/products.json"
        f"?limit={PAGE_SIZE_SHOPIFY}&page={page}"
    )


async def _walk(
    config, handle, client, robots, throttle
) -> tuple[list[dict], PhysicalSourceError | None]:
    """A handle's products, and a warning when the walk could not finish.

    A full page with nothing new means the host ignores `page`: what was read
    is kept, but the warning stops the run archiving what it never reached.
    """
    products: list[dict] = []
    seen: set = set()
    for page in range(1, MAX_PAGES + 1):
        url = collection_url(config, handle, page)
        if not allowed(robots, url):
            raise PhysicalSourceError(
                f"robots.txt disallows {handle}", code="robots_disallowed"
            )
        response = await throttled_get(client, url, config.domain, throttle)
        if response.status_code != 200:
            raise PhysicalSourceError(
                f"{handle} page {page}: HTTP {response.status_code}", code="http_error"
            )
        try:
            batch = parse_page(response.json())
        except ValueError:
            raise PhysicalSourceError(
                f"{handle} page {page}: body is not JSON", code="http_error"
            ) from None
        if not batch and page == 1:
            raise PhysicalSourceError(f"{handle} is empty", code="empty_collection")
        fresh = [p for p in batch if p["id"] not in seen]
        seen.update(p["id"] for p in fresh)
        products += fresh
        if len(batch) < PAGE_SIZE_SHOPIFY:
            return products, None
        if not fresh:
            return products, PhysicalSourceError(
                f"{handle}: page {page} repeated an earlier page", code="page_ignored"
            )
    raise PhysicalSourceError(
        f"{handle}: more than {MAX_PAGES} pages", code="too_many_pages"
    )


async def fetch_product_page(
    config: StoreConfig, handle: str, client, robots, throttle
) -> str | None:
    url = f"https://{config.domain}/products/{quote(handle, safe='')}"
    if not allowed(robots, url):
        return None
    try:
        response = await throttled_get(client, url, config.domain, throttle)
    except PhysicalSourceError as error:
        # The page only adds a key-card note and a ship date: losing it for
        # one run must not lose the store. The row keeps no html_checked_at,
        # so the next run tries again.
        logger.warning("%s product page %s skipped: %s", config.key, handle, error)
        return None
    return response.text if response.status_code == 200 else None


async def list_products(
    config: StoreConfig,
    client,
    robots: Robots | None,
    throttle: HostThrottle | None = None,
    html_skip: frozenset[str] = frozenset(),
    today: date | None = None,
) -> tuple[list[StoreProduct], list[PhysicalSourceError]]:
    """Every variant on the store's handles, and one error per failed handle.

    Products seen in several handles are exploded once, with every handle in
    collections_seen. `html_skip` holds product handles whose page was read
    within HTML_RECHECK_DAYS; the caller knows, from the stored rows.
    """
    errors: list[PhysicalSourceError] = []
    found: dict[str, dict] = {}
    handles_of: dict[str, set[str]] = {}
    for handle in config.collections:
        try:
            batch, warning = await _walk(config, handle, client, robots, throttle)
        except PhysicalSourceError as error:
            errors.append(error)
            continue
        if warning is not None:
            errors.append(warning)
        for product in batch:
            key = str(product.get("id"))
            found.setdefault(key, product)
            handles_of.setdefault(key, set()).add(handle)

    rows: list[StoreProduct] = []
    today = today or date.today()
    for key, product in found.items():
        try:
            exploded = explode(product, config, handles_of[key])
        except Exception as error:
            # One malformed product is skipped and recorded; the error also
            # keeps the run from archiving its old listing.
            logger.warning("%s product %s skipped: %s", config.key, key, error)
            errors.append(
                PhysicalSourceError(
                    f"product {key}: {type(error).__name__}", code="malformed_product"
                )
            )
            continue
        wants_page = (
            config.html_step
            and product.get("handle")
            and product.get("handle") not in html_skip
            and handles_of[key] & set(config.html_collections)
            and any(row.platform_id == SWITCH_2 for row in exploded)
        )
        if wants_page:
            html = await fetch_product_page(
                config, product.get("handle"), client, robots, throttle
            )
            if html is not None:
                facts = parse_product_page(html)
                exploded = [
                    apply_page(row, facts, today)
                    if row.platform_id == SWITCH_2
                    else row
                    for row in exploded
                ]
        rows += exploded
    logger.info(
        "%s: %d variants from %d products, %d errors",
        config.key,
        len(rows),
        len(found),
        len(errors),
    )
    return rows, errors
