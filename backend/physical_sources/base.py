"""What every physical source emits, and the error it reports with.

Registries emit EditionRows, stores emit StoreProducts: each already one row
per region or per platform variant, with its format classified. Fields hold
plain strings (the enum values), never model enums, so nothing here needs
SQLAlchemy.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from physical_sources.limits import REQUESTS_PER_SECOND


@dataclass(frozen=True)
class EditionRow:
    """One registry edition: a title in a region, or a platform-policy game."""

    source: str
    source_ref: str
    title: str
    title_normalized: str
    platform_id: int
    region: str
    is_physical: bool | None
    physical_format: str | None
    format_source: str | None
    cart_id: str | None = None
    publisher: str | None = None
    editions: str | None = None
    ns1_compatible: bool | None = None
    release_date: date | None = None
    release_precision: str | None = None
    igdb_id: int | None = None


@dataclass(frozen=True)
class StoreProduct:
    """One platform variant of one store product."""

    store: str
    store_product_id: str
    variant_id: str
    handle: str
    url: str
    region: str
    title: str
    title_normalized: str
    edition_label: str | None
    # platform_id is set only for platforms with a known IGDB id (the
    # catalogue's three plus the modern ones in sources.igdb.PLATFORM_NAMES).
    # A retro platform (SNES, Genesis, ...) has a label and no id; neither
    # means the platform could not be read, and the listing goes to Needs match.
    platform_id: int | None
    platform_label: str | None
    is_game: bool
    collections_seen: tuple[str, ...]
    price: Decimal | None
    currency: str
    availability: str
    preorder_closes_at: date | None = None
    release_date: date | None = None
    release_precision: str | None = None
    release_text: str | None = None
    format_hint: str | None = None
    format_tier: str | None = None
    format_evidence: str | None = None
    image_url: str | None = None
    raw: dict = field(default_factory=dict, compare=False)


class PhysicalSourceError(Exception):
    """A source problem that becomes one catalogue_runs.errors entry.

    `code` is machine-readable (robots_disallowed, empty_collection,
    schema_missing_columns, http_error, ...); `detail` is shown as is.
    """

    code = "error"

    def __init__(self, detail: str, code: str | None = None) -> None:
        super().__init__(detail)
        if code is not None:
            self.code = code
        self.detail = detail

    def as_entry(self) -> dict[str, str]:
        return {"code": self.code, "detail": self.detail}


class HostThrottle:
    """Spaces requests to each host by 1 / REQUESTS_PER_SECOND seconds.

    Per host, so one slow store never paces another. sources.base.Throttle
    does the same per source, but importing it would pull in SQLAlchemy.
    """

    def __init__(self, per_second: float = REQUESTS_PER_SECOND) -> None:
        self._interval = 1.0 / per_second
        self._next: dict[str, float] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def wait(self, host: str) -> None:
        lock = self._locks.setdefault(host, asyncio.Lock())
        async with lock:
            loop = asyncio.get_running_loop()
            delay = self._next.get(host, 0.0) - loop.time()
            if delay > 0:
                await asyncio.sleep(delay)
            self._next[host] = loop.time() + self._interval
