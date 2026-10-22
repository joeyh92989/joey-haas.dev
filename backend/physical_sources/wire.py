"""Store rows as JSON, for a walk run somewhere other than the API.

The nightly runner walks the Shopify stores (Render's shared IP is rate
limited by Shopify; the runner's is not) and posts what it parsed to the
ingest route. This is that body's shape, both ways: dates as ISO strings,
the price as a decimal string, collections_seen as a list. Reading back is
strict -- the exact key set and exact types -- and raises ValueError, so a
body from an older or newer walk is refused rather than half read.
"""

from __future__ import annotations

import dataclasses
from datetime import date
from decimal import Decimal, InvalidOperation

from physical_sources.base import PhysicalSourceError, StoreProduct

_FIELDS = {field.name: field for field in dataclasses.fields(StoreProduct)}
_TEXT = {
    "store",
    "store_product_id",
    "variant_id",
    "handle",
    "url",
    "region",
    "title",
    "title_normalized",
    "currency",
    "availability",
}
_OPTIONAL_TEXT = {
    "edition_label",
    "platform_label",
    "release_precision",
    "release_text",
    "format_hint",
    "format_tier",
    "format_evidence",
    "image_url",
}
_DATES = {"preorder_closes_at", "release_date"}
# Every field is decided above or below; a new StoreProduct field fails
# test_physical_wire until it is.
_OTHER = {"platform_id", "is_game", "collections_seen", "price", "raw"}


def product_to_wire(product: StoreProduct) -> dict:
    """One row as a JSON-safe dict."""
    out = {name: getattr(product, name) for name in _FIELDS}
    for name in _DATES:
        out[name] = out[name].isoformat() if out[name] is not None else None
    out["price"] = str(product.price) if product.price is not None else None
    out["collections_seen"] = list(product.collections_seen)
    return out


def product_from_wire(data: object) -> StoreProduct:
    """The row `product_to_wire` wrote; ValueError for anything else."""
    if not isinstance(data, dict):
        raise ValueError("a product is not an object")
    if set(data) != set(_FIELDS):
        missing = sorted(set(_FIELDS) - set(data))
        extra = sorted(set(data) - set(_FIELDS))
        raise ValueError(f"product keys differ: missing {missing}, extra {extra}")
    values: dict = {}
    for name in _TEXT:
        values[name] = _text(data, name)
    for name in _OPTIONAL_TEXT:
        values[name] = None if data[name] is None else _text(data, name)
    for name in _DATES:
        values[name] = _date(data, name)
    platform_id = data["platform_id"]
    # bool is an int in Python; True is not a platform.
    if platform_id is not None and (
        isinstance(platform_id, bool) or not isinstance(platform_id, int)
    ):
        raise ValueError("platform_id is not an integer")
    values["platform_id"] = platform_id
    if not isinstance(data["is_game"], bool):
        raise ValueError("is_game is not a boolean")
    values["is_game"] = data["is_game"]
    seen = data["collections_seen"]
    if not isinstance(seen, list) or not all(isinstance(h, str) for h in seen):
        raise ValueError("collections_seen is not a list of strings")
    values["collections_seen"] = tuple(seen)
    values["price"] = _price(data["price"])
    if not isinstance(data["raw"], dict):
        raise ValueError("raw is not an object")
    values["raw"] = data["raw"]
    return StoreProduct(**values)


def error_to_wire(error: PhysicalSourceError) -> dict[str, str]:
    """One walk error as its catalogue_runs.errors entry."""
    return error.as_entry()


def error_from_wire(data: object) -> PhysicalSourceError:
    """The error `error_to_wire` wrote; ValueError for anything else."""
    if not isinstance(data, dict) or set(data) != {"code", "detail"}:
        raise ValueError("an error is not {code, detail}")
    code, detail = data["code"], data["detail"]
    if not isinstance(code, str) or not isinstance(detail, str) or not code:
        raise ValueError("an error's code and detail are not strings")
    return PhysicalSourceError(detail, code)


def _text(data: dict, name: str) -> str:
    value = data[name]
    if not isinstance(value, str):
        raise ValueError(f"{name} is not a string")
    return value


def _date(data: dict, name: str) -> date | None:
    value = data[name]
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{name} is not a date string")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"{name} is not an ISO date") from None


def _price(value: object) -> Decimal | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("price is not a decimal string")
    try:
        price = Decimal(value)
    except InvalidOperation:
        raise ValueError("price is not a decimal") from None
    if not price.is_finite():
        raise ValueError("price is not finite")
    return price
