"""WooCommerce stores, through the public Store API.

/wp-json/wc/store/v1/products?per_page=100&page=N&category=<id>. Each product
is one listing: these stores sell no platform variants. Names arrive as HTML
("Symphonia <span>Nintendo Switch</span>"), prices in minor units, and
PixelHeart lists every product twice, under /en/ and /fr/, which the store's
url_keep settles. Pure except list_products.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation

from matching import normalize_title
from physical_sources.base import (
    HostThrottle,
    PhysicalSourceError,
    StoreProduct,
    plausible_price,
    throttled_get,
)
from physical_sources.courtesy import Robots, allowed
from physical_sources.format import classify, plain_text
from physical_sources.limits import CATALOGUE_PLATFORMS, PAGE_SIZE_WOO
from physical_sources.parse import edition_label, parse_release, strip_title
from physical_sources.stores import StoreConfig, admits, resolve_platform

logger = logging.getLogger(__name__)

BODY_EXCERPT = 2000


def _price(prices: dict) -> Decimal | None:
    try:
        minor = int(prices.get("currency_minor_unit", 2))
        return plausible_price(Decimal(str(prices["price"])) / (10**minor))
    except (KeyError, InvalidOperation, TypeError, ValueError):
        return None


def availability(product: dict) -> str:
    """Backorder is a pre-order; otherwise stock decides."""
    if product.get("is_on_backorder"):
        return "preorder"
    return "in_stock" if product.get("is_in_stock") else "sold_out"


def explode(product: dict, config: StoreConfig) -> list[StoreProduct]:
    """The product as one listing, or none when url_keep drops it."""
    url = product.get("permalink") or ""
    if config.url_keep is not None and not config.url_keep.search(url):
        return []
    title = plain_text(product.get("name") or "")
    body = plain_text(
        f"{product.get('short_description') or ''} {product.get('description') or ''}"
    )
    attributes = {
        (attribute.get("name") or "").strip().lower(): [
            term.get("name", "") for term in attribute.get("terms") or []
        ]
        for attribute in product.get("attributes") or []
    }
    tags = [tag.get("name", "") for tag in product.get("tags") or []]
    categories = {str(c.get("id")) for c in product.get("categories") or []}
    platform_id, label = resolve_platform(
        config,
        options={},
        product_type="",
        title=title,
        sku=str(product.get("sku") or ""),
        tags=tags,
        collections_seen=categories,
        attributes=attributes,
    )
    speaks = platform_id in CATALOGUE_PLATFORMS or (
        platform_id is None and label is None
    )
    found = classify(f"{title} {body}", None, platform_id if speaks else None)
    if not speaks:
        found = classify("", None, None)
    released, precision, release_text = parse_release(body)
    image = next(iter(product.get("images") or []), None)
    product_id = str(product.get("id"))
    return [
        StoreProduct(
            store=config.key,
            store_product_id=product_id,
            variant_id=product_id,
            handle=product.get("slug") or "",
            url=url,
            region=config.region,
            title=title,
            title_normalized=normalize_title(strip_title(title, config.title_strip)),
            edition_label=edition_label(title, *attributes.get("edition", [])),
            platform_id=platform_id,
            platform_label=label,
            is_game=admits(
                config,
                product_type="",
                tags=tags,
                title=title,
                option_names=[],
            ),
            collections_seen=tuple(sorted(categories & set(config.collections))),
            price=_price(product.get("prices") or {}),
            currency=config.currency,
            availability=availability(product),
            release_date=released,
            release_precision=precision,
            release_text=release_text,
            format_hint=found.format,
            format_tier=found.tier,
            format_evidence=found.evidence,
            image_url=(image or {}).get("src"),
            raw={
                "sku": product.get("sku"),
                "attributes": attributes,
                "tags": tags,
                "is_in_stock": product.get("is_in_stock"),
                "is_on_backorder": product.get("is_on_backorder"),
                "body": body[:BODY_EXCERPT],
            },
        )
    ]


def category_url(config: StoreConfig, category: str, page: int) -> str:
    return (
        f"https://{config.domain}/wp-json/wc/store/v1/products"
        f"?per_page={PAGE_SIZE_WOO}&page={page}&category={category}"
    )


async def list_products(
    config: StoreConfig,
    client,
    robots: Robots | None,
    throttle: HostThrottle | None = None,
) -> tuple[list[StoreProduct], list[PhysicalSourceError]]:
    """Every product in the store's categories, and one error per failed one."""
    errors: list[PhysicalSourceError] = []
    found: dict[str, dict] = {}
    for category in config.collections:
        page = 1
        try:
            while True:
                url = category_url(config, category, page)
                if not allowed(robots, url):
                    raise PhysicalSourceError(
                        f"robots.txt disallows category {category}",
                        code="robots_disallowed",
                    )
                response = await throttled_get(client, url, config.domain, throttle)
                if response.status_code != 200:
                    raise PhysicalSourceError(
                        f"category {category} page {page}: HTTP {response.status_code}",
                        code="http_error",
                    )
                try:
                    batch = response.json()
                except ValueError:
                    raise PhysicalSourceError(
                        f"category {category} page {page}: body is not JSON",
                        code="http_error",
                    ) from None
                if not isinstance(batch, list):
                    raise PhysicalSourceError(
                        f"category {category}: expected a list", code="http_error"
                    )
                if not batch and page == 1:
                    raise PhysicalSourceError(
                        f"category {category} is empty", code="empty_collection"
                    )
                for product in batch:
                    found.setdefault(str(product.get("id")), product)
                if len(batch) < PAGE_SIZE_WOO:
                    break
                page += 1
        except PhysicalSourceError as error:
            errors.append(error)
    rows = [row for product in found.values() for row in explode(product, config)]
    logger.info(
        "%s: %d listings from %d products, %d errors",
        config.key,
        len(rows),
        len(found),
        len(errors),
    )
    return rows, errors
