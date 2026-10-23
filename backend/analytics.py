"""First-party page analytics: the pure core (site refresh spec, PR 4).

No FastAPI or SQLAlchemy here; analytics_routes.py loads and stores rows.

A beacon from a public page carries `{path, ref, device}` and nothing that
identifies anyone. The server counts a visitor as an HMAC of the client's IP
and user agent under a salt derived from SESSION_SECRET and the UTC date, so
the salt changes at midnight: one person is one visitor per day, and the
stored hashes do not link one day to the next. The salt is derived, not
thrown away, so whoever holds SESSION_SECRET could still test a known IP
and user agent against a stored day. Neither the IP nor the user agent is
stored or logged.

Abuse is bounded four ways: every field is validated and anything unexpected
is dropped; one IP (an IPv6 /64) counts at most DAILY_CAP views a day; the
whole site stores at most DAILY_TOTAL views a day (both in memory, which is
enough on one free dyno); and the body is capped at MAX_BODY_BYTES.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, timedelta

# The day the beacon went live: the empty state's "live since", and where
# the All range starts. Set to the merge date.
ANALYTICS_LIVE_SINCE = date(2026, 10, 20)

MAX_BODY_BYTES = 1024
MAX_PATH = 200
MAX_REF = 100
DAILY_CAP = 100
# Views stored a day across every IP: far above a personal site's traffic,
# and a ceiling on what a flood from many addresses can add to the table.
DAILY_TOTAL = 5_000
# Distinct IPs the cap remembers in a day. Past it, new IPs are refused
# rather than evicting old ones, so memory stays bounded under a flood.
CAP_KEYS = 10_000
RETENTION_DAYS = 90
# Rows per list on the Analytics page.
LIST_SIZE = 10

DEVICES = ("desktop", "phone", "tablet")
DIMENSIONS = ("total", "path", "referrer", "device")
RANGES: dict[str, int | None] = {"7d": 7, "30d": 30, "90d": 90, "all": None}

# The public routes, as the router in frontend/src/App.jsx has them. A path
# that matches none of them is not counted: a typo, a scan or a 404. The
# pre-rename /spine* paths are not counted either: they only redirect to
# /shelf*, which the beacon then reports, so counting both would count a
# visit twice. Rows recorded before the rename keep their /spine path.
_EXACT_PATHS = frozenset(
    {
        "/",
        "/about",
        "/projects",
        "/now",
        "/colophon",
        "/blog",
        "/shelf",
        "/shelf/next",
        "/shelf/how",
        "/shelf/year",
    }
)
_PATTERNS = (
    re.compile(r"/shelf/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"),
    re.compile(r"/shelf/year/\d{4}"),
    re.compile(r"/shelf/journal/\d{4}-\d{2}"),
    re.compile(r"/blog/[a-z0-9]+(?:-[a-z0-9]+)*"),
)
_HOSTNAME = re.compile(
    r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*"
)


@dataclass(frozen=True)
class Event:
    """One accepted view, validated. `ref` is the referring hostname, '' for
    a visit that came direct, or None for a later view of the same visit,
    which says nothing about where the visit came from."""

    path: str
    ref: str | None
    device: str


def client_ip(headers: Mapping[str, str], fallback: str | None) -> str:
    """The visitor's IP: Cloudflare's header, then True-Client-IP, then the
    socket (local development). `headers` is case-insensitive (Starlette's)
    or lower-case keyed.

    Never X-Forwarded-For: Render's proxy appends to it, so its first entry
    is whatever the caller sent. Assumed, not verified from this repo: that
    Render's Cloudflare edge sets CF-Connecting-IP on every request, so the
    caller cannot choose it. Were it missing, a caller could pick its
    True-Client-IP and with it a fresh cap.
    """
    for name in ("cf-connecting-ip", "true-client-ip"):
        value = (headers.get(name) or "").strip()
        if value:
            return value
    return fallback or ""


def daily_salt(secret: str, day: date) -> bytes:
    """The day's salt, derived rather than stored: it changes at UTC midnight."""
    return hmac.new(
        secret.encode(), f"analytics-salt:{day.isoformat()}".encode(), hashlib.sha256
    ).digest()


def visitor_hash(salt: bytes, ip: str, user_agent: str) -> str:
    """One visitor for the day: 32 hex characters, from which neither the IP
    nor the user agent can be read back."""
    message = f"{ip}\n{user_agent}".encode()
    return hmac.new(salt, message, hashlib.sha256).hexdigest()[:32]


def cap_key(salt: bytes, ip: str) -> str:
    """What the daily cap counts by: the IP alone, salted. Not the visitor
    hash, whose user agent half the caller chooses: varying it would make
    every view a new visitor with a fresh allowance. An IPv6 address counts
    as its /64, the block one host is usually given, for the same reason."""
    try:
        if ipaddress.ip_address(ip).version == 6:
            ip = str(ipaddress.ip_network(f"{ip}/64", strict=False))
    except ValueError:
        pass
    return hmac.new(salt, f"cap\n{ip}".encode(), hashlib.sha256).hexdigest()[:32]


def normalise_path(value: object) -> str | None:
    """A public route path without its query, fragment or trailing slash, or
    None when it is not one."""
    if not isinstance(value, str) or not value.startswith("/"):
        return None
    path = value.split("?", 1)[0].split("#", 1)[0]
    if len(path) > MAX_PATH:
        return None
    if path != "/":
        path = path.rstrip("/")
    if path in _EXACT_PATHS or any(p.fullmatch(path) for p in _PATTERNS):
        return path
    return None


def normalise(body: bytes) -> Event | None:
    """The beacon body as an Event, or None to drop it.

    `sendBeacon` posts a text/plain string, so the body is parsed here
    rather than by FastAPI. Every field must be valid: a bad path, referrer
    or device drops the view. A null or missing `ref` is a later view of a
    visit; '' is a direct one.
    """
    if len(body) > MAX_BODY_BYTES:
        return None
    try:
        data = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    path = normalise_path(data.get("path"))
    device = data.get("device")
    ref = data.get("ref")
    if path is None or device not in DEVICES:
        return None
    if ref is not None:
        if not isinstance(ref, str) or len(ref) > MAX_REF:
            return None
        ref = ref.lower()
        if ref and not _HOSTNAME.fullmatch(ref):
            return None
    return Event(path=path, ref=ref, device=device)


class DailyCap:
    """At most `limit` accepted views per key and `total` across all keys
    per UTC day, in memory.

    Forgets everything at the first call of a new day. Holds at most
    `max_keys` keys; a new key past that is refused.
    """

    def __init__(
        self,
        limit: int = DAILY_CAP,
        max_keys: int = CAP_KEYS,
        total: int = DAILY_TOTAL,
    ) -> None:
        self._limit = limit
        self._max_keys = max_keys
        self._total = total
        self._day: date | None = None
        self._counts: dict[str, int] = {}
        self._allowed = 0

    def allow(self, key: str, day: date) -> bool:
        if day != self._day:
            self._day = day
            self._counts.clear()
            self._allowed = 0
        count = self._counts.get(key, 0)
        if count >= self._limit or self._allowed >= self._total:
            return False
        if count == 0 and len(self._counts) >= self._max_keys:
            return False
        self._counts[key] = count + 1
        self._allowed += 1
        return True


@dataclass(frozen=True)
class Stat:
    """One day's counts for one value of one dimension: a daily_stats row."""

    day: date
    dimension: str
    value: str
    views: int
    visitors: int


def rollup_day(
    day: date, views: Iterable[tuple[str, str | None, str, str]]
) -> list[Stat]:
    """A day's Stat rows from its raw views, `(path, referrer_host, device,
    visitor_hash)` each. The total row counts the day's distinct visitors;
    per-value rows count theirs, which do not add up to it. Referrer rows
    count only the views that carried one, the first of each visit ('' for
    direct); a NULL referrer is a later view and is left out of them."""
    groups: dict[tuple[str, str], tuple[int, set[str]]] = {}

    def add(dimension: str, value: str, visitor: str) -> None:
        count, visitors = groups.get((dimension, value), (0, set()))
        visitors.add(visitor)
        groups[(dimension, value)] = (count + 1, visitors)

    for path, referrer, device, visitor in views:
        add("total", "", visitor)
        add("path", path, visitor)
        if referrer is not None:
            add("referrer", referrer, visitor)
        add("device", device, visitor)
    return [
        Stat(day, dimension, value, count, len(visitors))
        for (dimension, value), (count, visitors) in sorted(groups.items())
    ]


def range_start(key: str, today: date) -> date:
    """The first day of a range ending today. All starts at the launch."""
    days = RANGES[key]
    if days is None:
        return min(ANALYTICS_LIVE_SINCE, today)
    return today - timedelta(days=days - 1)


def _ranked(totals: dict[str, int], first: str | None = None) -> list[dict]:
    rows = sorted(totals.items(), key=lambda pair: (-pair[1], pair[0]))
    if first is not None:
        rows.sort(key=lambda pair: pair[0] != first)
    return [{"value": value, "count": count} for value, count in rows[:LIST_SIZE]]


def summarise(stats: Iterable[Stat], start: date, end: date) -> dict:
    """The Analytics page's body over `start`..`end` inclusive.

    Visitors over a range are the sum of each day's visitors: the salt
    changes daily, so one person on two days is two. Best day is the day
    with the most views (the latest on a tie), with the referrer that
    brought more than half of its visits, when one did.
    """
    by_day: dict[date, int] = {}
    visitors = 0
    pages: dict[str, int] = {}
    referrers: dict[str, int] = {}
    devices: dict[str, int] = {}
    day_referrers: dict[date, dict[str, int]] = {}
    # Visits begun each day: the views that carried a referrer, '' included.
    day_entries: dict[date, int] = {}
    for stat in stats:
        if not start <= stat.day <= end:
            continue
        if stat.dimension == "total":
            by_day[stat.day] = by_day.get(stat.day, 0) + stat.views
            visitors += stat.visitors
        elif stat.dimension == "path":
            pages[stat.value] = pages.get(stat.value, 0) + stat.views
        elif stat.dimension == "referrer":
            referrers[stat.value] = referrers.get(stat.value, 0) + stat.visitors
            day_entries[stat.day] = day_entries.get(stat.day, 0) + stat.views
            if stat.value:
                day_referrers.setdefault(stat.day, {})[stat.value] = stat.views
        elif stat.dimension == "device":
            devices[stat.value] = devices.get(stat.value, 0) + stat.views

    views = sum(by_day.values())
    best = None
    if views:
        best_day = max(by_day, key=lambda day: (by_day[day], day))
        best_views = by_day[best_day]
        dominant = next(
            (
                host
                for host, count in day_referrers.get(best_day, {}).items()
                if count * 2 > day_entries.get(best_day, 0)
            ),
            None,
        )
        best = {"day": best_day, "views": best_views, "referrer": dominant}

    series = []
    day = start
    while day <= end:
        series.append({"day": day, "views": by_day.get(day, 0)})
        day += timedelta(days=1)

    return {
        "start": start,
        "end": end,
        "views": views,
        "visitors": visitors,
        "views_per_visitor": round(views / visitors, 1) if visitors else 0,
        "best_day": best,
        "series": series,
        "pages": _ranked(pages),
        "referrers": _ranked(referrers, first=""),
        "devices": _ranked(devices),
        "live_since": ANALYTICS_LIVE_SINCE,
    }
