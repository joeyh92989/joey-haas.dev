"""Denver spots: the pure rules every spot write and reader goes through.

The tag vocabulary, slugs, the paste-from-maps coordinate parser, and the
distance line ("0.6 mi from Union Station · by bike"). No FastAPI and no
SQLAlchemy in the import graph -- tests/test_physical_imports.py holds it to
that -- so the routes, the candidates job and the planner share one answer.

Spec and plan: docs/planning/2026-11-08-denver-spots-design.md.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol

# The vocabulary, in display order, and the authority for it: display labels
# live in frontend/src/content/denver.js, and a frontend test holds the two
# sets equal.
TAGS: tuple[str, ...] = (
    "coffee",
    "park",
    "food",
    "kid-ok",
    "rainy-day",
    "bike-friendly",
    "cinema",
    "theatre",
    "ice-cream",
    "brewery",
    "zoo",
    "aquarium",
    "mini-golf",
    "bowling",
    "arcade",
    "climbing",
    "ice-rink",
    "pool",
    "nature-reserve",
    "trailhead",
)

# Straight-line miles from the nearest anchor, never a routed time. Each band
# is (upper bound, mode); the last has no bound.
DISTANCE_MODES: tuple[tuple[float | None, str], ...] = (
    (1.0, "walk"),
    (3.0, "bike"),
    (None, "drive or bus"),
)
_MODE_PHRASES = {"walk": "on foot", "bike": "by bike", "drive or bus": "drive or bus"}

# The one city a public place may be in, as stored (lower case).
DENVER = "denver"
CITY_MAX = 40  # Spot.city is String(40)

EARTH_RADIUS_MILES = 3958.8
SLUG_MAX = 200
# The most a "-<n>" suffix (and the one hyphen rstrip may drop) shortens a
# base by: room for n up to nine digits.
SLUG_SUFFIX_ROOM = 12


def canonical_tags(values: Iterable[str]) -> list[str]:
    """Lower-cased, de-duplicated, in vocabulary order.

    Raises ValueError naming the first tag outside the vocabulary, which a
    route answers with a 422 the form shows as it is.
    """
    wanted = set()
    for value in values:
        tag = value.strip().lower()
        if not tag:
            continue
        if tag not in TAGS:
            raise ValueError(
                f"Unknown tag {value.strip()!r}: use one of {', '.join(TAGS)}"
            )
        wanted.add(tag)
    return [tag for tag in TAGS if tag in wanted]


def normalize_city(raw: str) -> str:
    """The one rule for a stored city: control and zero-width characters
    removed, outer whitespace trimmed, inner runs collapsed to one space, lower
    case. "Denver", " DENVER " and "denver" are one city.

    Raises ValueError("A city is required.") when nothing is left and
    ValueError("A city is at most 40 characters.") when more than 40 are, the
    length counted after trimming and collapsing. The message is fit to show.
    """
    # Local on purpose: map_links imports spots, so importing clean_line would
    # be circular, and a city is a lower-cased match key, so joiners go too.
    visible = "".join(
        ch for ch in raw if ch.isspace() or unicodedata.category(ch) not in ("Cc", "Cf")
    )
    city = " ".join(visible.split()).lower()
    if not city:
        raise ValueError("A city is required.")
    if len(city) > CITY_MAX:
        raise ValueError(f"A city is at most {CITY_MAX} characters.")
    return city


def check_public_city(city: str, is_public: bool) -> None:
    """A public place has to be in Denver: ValueError when `is_public` and the
    normalised city is anything else. Every write path calls this."""
    if is_public and normalize_city(city) != DENVER:
        raise ValueError("A public place has to be in Denver.")


def slugify(name: str) -> str:
    """ASCII, lower case, words joined by hyphens: "Café Max" -> "cafe-max"."""
    ascii_name = (
        unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    slug = slug[:SLUG_MAX].rstrip("-")
    if not slug:
        raise ValueError("A spot needs a name with at least one letter or digit")
    return slug


def unique_slug(name: str, taken: Iterable[str]) -> str:
    """slugify(name), suffixed -2, -3 ... until it is not in `taken`."""
    base = slugify(name)
    used = set(taken)
    if base not in used:
        return base
    n = 2
    while True:
        suffix = f"-{n}"
        candidate = base[: SLUG_MAX - len(suffix)].rstrip("-") + suffix
        if candidate not in used:
            return candidate
        n += 1


_NUMBER = r"[-+]?\d{1,3}(?:\.\d+)?"
# "39.75, -104.99", "39.75,-104.99", "39.75 -104.99", with or without degree
# signs; or a maps URL. A Google place URL carries the pin itself as
# "!3d39.75!4d-104.99" in its data part, and its "@39.7,-104.9,15z" is only
# where the map was centred, so the pin is read first.
_PLACE_PAIR = re.compile(rf"!3d({_NUMBER})!4d({_NUMBER})")
_AT_PAIR = re.compile(rf"@({_NUMBER}),({_NUMBER})")
_PAIR = re.compile(rf"^\s*({_NUMBER})°?\s*[, ]\s*({_NUMBER})°?\s*$")


def parse_coords(value: str) -> tuple[float, float]:
    """`(lat, lng)` from a pasted pair or a maps URL; ValueError otherwise.

    The messages are the form's: they say what was wrong in words the owner
    can act on, including the common slip of pasting longitude first.
    """
    text = value.strip()
    match = _PLACE_PAIR.search(text) or _AT_PAIR.search(text) or _PAIR.match(text)
    if not match:
        raise ValueError(
            'Paste coordinates as "latitude, longitude", e.g. "39.75, -104.99"'
        )
    lat, lng = float(match.group(1)), float(match.group(2))
    if not -90 <= lat <= 90:
        if -90 <= lng <= 90:
            raise ValueError(
                "Latitude must be between -90 and 90: the pair looks reversed"
            )
        raise ValueError("Latitude must be between -90 and 90")
    if not -180 <= lng <= 180:
        raise ValueError("Longitude must be between -180 and 180")
    return lat, lng


def haversine_miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle miles between two `(lat, lng)` points."""
    lat1, lng1 = map(math.radians, a)
    lat2, lng2 = map(math.radians, b)
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(h))


def distance_mode(miles: float) -> str:
    for bound, mode in DISTANCE_MODES:
        if bound is None or miles < bound:
            return mode
    raise AssertionError("DISTANCE_MODES must end with an unbounded band")


def distance_line(miles: float, anchor_name: str) -> str:
    """ "0.6 mi from Union Station · by bike" -- one decimal, the mode word."""
    phrase = _MODE_PHRASES[distance_mode(miles)]
    return f"{miles:.1f} mi from {anchor_name} · {phrase}"


class HasPosition(Protocol):
    lat: float
    lng: float


@dataclass(frozen=True)
class Nearest:
    anchor: HasPosition
    miles: float


def nearest_anchor(
    point: tuple[float, float], anchors: Iterable[HasPosition]
) -> Nearest | None:
    """The closest anchor to `point` and its distance, or None with no anchors."""
    best: Nearest | None = None
    for anchor in anchors:
        miles = haversine_miles(point, (anchor.lat, anchor.lng))
        if best is None or miles < best.miles:
            best = Nearest(anchor, miles)
    return best
