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

from physical_sources.limits import (
    MAX_PRICE,
    RATE_LIMIT_DEFAULT_WAIT,
    RATE_LIMIT_MAX_WAIT,
    RATE_LIMIT_RETRIES_PER_HOST,
    REQUESTS_PER_SECOND,
)


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

    def __init__(
        self,
        per_second: float = REQUESTS_PER_SECOND,
        retries: int = RATE_LIMIT_RETRIES_PER_HOST,
    ) -> None:
        self._interval = 1.0 / per_second
        self._next: dict[str, float] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._retries = retries
        self._retried: dict[str, int] = {}

    def take_retry(self, host: str) -> bool:
        """Whether `host` may have one more 429 retry this run."""
        used = self._retried.get(host, 0)
        if used >= self._retries:
            return False
        self._retried[host] = used + 1
        return True

    async def wait(self, host: str) -> None:
        lock = self._locks.setdefault(host, asyncio.Lock())
        async with lock:
            loop = asyncio.get_running_loop()
            delay = self._next.get(host, 0.0) - loop.time()
            if delay > 0:
                await asyncio.sleep(delay)
            self._next[host] = loop.time() + self._interval


def _same_site(host: str, other: str | None) -> bool:
    """`other` is `host`, or the same host with or without `www.`."""
    bare = host.removeprefix("www.")
    return (other or "").removeprefix("www.") == bare


def retry_after(value: str | None) -> float:
    """Seconds to wait before retrying a 429: Retry-After in seconds, capped
    at RATE_LIMIT_MAX_WAIT, or RATE_LIMIT_DEFAULT_WAIT for none or a date."""
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return RATE_LIMIT_DEFAULT_WAIT
    if not seconds >= 0:  # negative, or NaN
        return RATE_LIMIT_DEFAULT_WAIT
    return min(seconds, RATE_LIMIT_MAX_WAIT)


def may_retry(host: str, throttle: HostThrottle | None) -> bool:
    """Whether a 429 from `host` gets its retry; always, without a throttle."""
    return throttle is None or throttle.take_retry(host)


async def _get(client, url: str, host: str, throttle: HostThrottle | None):
    if throttle is not None:
        await throttle.wait(host)
    try:
        response = await client.get(url)
    except Exception as error:
        raise PhysicalSourceError(
            f"{url}: {type(error).__name__}", code="http_error"
        ) from None
    if response.history and (
        response.url.scheme != "https" or not _same_site(host, response.url.host)
    ):
        raise PhysicalSourceError(
            f"{url} redirected to {response.url.host}", code="redirected_off_site"
        )
    return response


async def throttled_get(
    client, url: str, host: str, throttle: HostThrottle | None, sleep=asyncio.sleep
):
    """One GET, spaced per host; a transport failure becomes an http_error.

    Redirects are followed only within the store's own site (four stores
    move their bare domain to `www.`). One that leaves it is refused: that
    host's robots.txt was never read and its throttle never applied.

    A 429 is retried once, after retry_after(), while the host has retries
    left in the throttle's budget; a second 429 goes back to the caller,
    which handles it like any other status. `sleep` is for tests.
    """
    response = await _get(client, url, host, throttle)
    if response.status_code == 429 and may_retry(host, throttle):
        await sleep(retry_after(response.headers.get("retry-after")))
        response = await _get(client, url, host, throttle)
    return response


def plausible_price(value: Decimal | None) -> Decimal | None:
    """A price, or None when it is not one a store means.

    Nicalis lists 1001 Spikes at $1,001,001.00, a joke; stored as is it
    overflows store_listings.price and loses the whole store's run.
    """
    if value is None or value < 0 or value > MAX_PRICE:
        return None
    return value
