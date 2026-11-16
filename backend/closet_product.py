"""Attaching a store's product to a garment that already exists (#399).

Two steps, so nothing is written on a guess:

1. `preview(url)` reads the link with `closet_resolver.resolve` (https only,
   public addresses only, robots honoured) and answers the colours the store
   offers. It writes nothing.
2. `attach(...)` reads the link again and takes the colour the owner chose
   *from that fresh reading*: the client sends only the colour's id and a
   size, never a colour name or a price, so the page can pick among the
   store's answers and nothing else. It then fills the store colour
   (`color_source` vendor), the brand (only when empty, or when the owner
   confirmed the overwrite), the size, the plain colour family when
   `primary_color` is empty, and writes the garment's one `garment_products`
   row. A garment with no photo gets the colour's photo, fetched once through
   `intake.seed_image.fetch_image` (which re-checks the address); a garment
   with a photo keeps it.

The routes (`closet_routes.py`) own the HTTP answer; this module owns the
rules and raises `AttachRefused` with the owner's sentence and a status.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from closet_colors import colour_family
from closet_images import ClosetImageError, make_garment_image
from closet_resolver import Resolution, item_ref, resolve, source_for
from intake.seed_image import ImageFetchError, fetch_image
from models import (
    Garment,
    GarmentColorSource,
    GarmentImage,
    GarmentProduct,
    GarmentProductSource,
)

MAX_PRICE = Decimal("999999.99")


class AttachRefused(Exception):
    """The attach cannot go ahead; `status` is the HTTP answer."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass
class PhotoResult:
    """`state`: added, kept (the garment already had one), none (the colour
    has no photo) or failed (`error` says why)."""

    state: str
    error: str | None = None


def touch(row: Garment) -> None:
    """Moves `updated_at`, the image URL's version and ETag, so a changed
    photo is fetched again."""
    row.updated_at = datetime.now(UTC)


async def store_photo(session: AsyncSession, row: Garment, thumbnail: Any) -> None:
    """The garment's photo, replacing the old one. Flushed, not committed."""
    stored = await session.get(GarmentImage, row.id)
    if stored is None:
        session.add(
            GarmentImage(
                garment_id=row.id,
                webp=thumbnail.webp,
                width=thumbnail.width,
                height=thumbnail.height,
            )
        )
    else:
        stored.webp = thumbnail.webp
        stored.width = thumbnail.width
        stored.height = thumbnail.height
    touch(row)
    await session.flush()


def _reason(resolution: Resolution) -> str:
    """The resolver's sentence without its intake tail ("; the link is kept")."""
    text = (resolution.message or "That link could not be read").split(";")[0]
    return text.strip()


def _attached(product: GarmentProduct | None) -> dict[str, Any] | None:
    if product is None:
        return None
    return {
        "url": product.url,
        "title": product.title,
        "source": product.source.value if product.source else None,
    }


async def current_product(
    session: AsyncSession, garment_id: Any
) -> GarmentProduct | None:
    return await session.scalar(
        select(GarmentProduct).where(GarmentProduct.garment_id == garment_id)
    )


async def preview(
    session: AsyncSession, row: Garment, url: str, *, has_photo: bool
) -> dict[str, Any]:
    """What the link offers, written nowhere. Never raises for a store."""
    existing = _attached(await current_product(session, row.id))
    resolution = await resolve(url)
    base = {
        "url": resolution.url,
        "attached": existing,
        "has_photo": has_photo,
        "candidates": [],
    }
    product = resolution.product
    if product is None:
        return {
            **base,
            "state": "refused",
            "message": _reason(resolution),
            "title": None,
            "brand": None,
            "currency": None,
        }
    return {
        **base,
        "state": "read",
        "message": None,
        "title": product.title,
        "brand": product.brand,
        "currency": product.currency,
        "candidates": [colour.as_json() for colour in product.colours],
    }


def _price(currency: str | None, price: str | None) -> Decimal | None:
    """Dollars only: the closet's price column is dollars."""
    if currency not in (None, "USD") or not price:
        return None
    try:
        value = Decimal(price).quantize(Decimal("0.01"))
    except (InvalidOperation, ArithmeticError):
        return None
    return value if Decimal(0) <= value <= MAX_PRICE else None


def _chosen_size(candidate: dict[str, Any], size: str | None) -> str | None:
    sizes = [s["size"] for s in candidate["sizes"] if s.get("size")]
    if size:
        if size not in sizes:
            raise AttachRefused(422, "That size is not one this colour comes in")
        return size
    return sizes[0] if len(sizes) == 1 else None


async def _fetch_photo(candidate: dict[str, Any]) -> tuple[Any | None, PhotoResult]:
    image_url = candidate.get("image_url")
    if not image_url:
        return None, PhotoResult("none")
    try:
        data = await fetch_image(image_url)
        thumbnail = await asyncio.to_thread(make_garment_image, data)
    except ImageFetchError as error:
        return None, PhotoResult("failed", str(error))
    except ClosetImageError as error:
        return None, PhotoResult("failed", str(error))
    return thumbnail, PhotoResult("added")


async def attach(
    session: AsyncSession,
    row: Garment,
    *,
    url: str,
    external_id: str,
    size: str | None,
    replace_brand: bool,
    replace_product: bool,
    has_photo: bool,
) -> tuple[PhotoResult, GarmentProduct]:
    """Writes the chosen colour onto the garment. Flushed, not committed:
    the caller commits. Raises `AttachRefused`."""
    existing = await current_product(session, row.id)
    if existing is not None and not replace_product:
        raise AttachRefused(
            409, "This garment already has a product; confirm to replace it"
        )
    resolution = await resolve(url)
    product = resolution.product
    if product is None:
        raise AttachRefused(422, _reason(resolution))
    candidate = next(
        (c.as_json() for c in product.colours if c.external_id == external_id), None
    )
    if candidate is None:
        raise AttachRefused(422, "That colour is not one this link offers")
    chosen_size = _chosen_size(candidate, size)

    photo = PhotoResult("kept")
    thumbnail = None
    if not has_photo:
        thumbnail, photo = await _fetch_photo(candidate)

    name = candidate.get("color_name")
    if name:
        row.color_name = name[:80]
        row.color_source = GarmentColorSource.VENDOR
        if not row.primary_color and (family := colour_family(name)):
            row.primary_color = family
    if product.brand and (replace_brand or not row.brand):
        row.brand = product.brand[:80]
    if chosen_size:
        row.size = chosen_size[:40]
    touch(row)

    snapshot = {**product.as_json(), "chosen": external_id, "size": chosen_size}
    fields = {
        "source": GarmentProductSource(source_for(resolution.url)),
        "url": resolution.url[:2000],
        "store_item_no": item_ref(resolution.url, external_id),
        "title": product.title,
        "price": _price(product.currency, candidate.get("price")),
        "snapshot": snapshot,
        "fetched_at": datetime.now(UTC),
    }
    if existing is None:
        existing = GarmentProduct(garment_id=row.id, **fields)
        session.add(existing)
    else:
        for key, value in fields.items():
            setattr(existing, key, value)
    if thumbnail is not None:
        await store_photo(session, row, thumbnail)
    await session.flush()
    return photo, existing


def attached(product: GarmentProduct) -> dict[str, Any]:
    return _attached(product) or {}
