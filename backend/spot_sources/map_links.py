"""Read pasted lines for the paste way: map links, coordinate pairs, names.

Pure: standard library plus the `spots` coordinate patterns. No network, no
clock, no randomness, no database. A link is only ever *read*, never fetched:
a short link (`maps.app.goo.gl`, `goo.gl`) is reported as unreadable rather
than expanded, and a URL on any host this module does not know is treated as
plain text to search.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import parse_qs, unquote_plus, urlsplit

from spots import _AT_PAIR, _NUMBER, _PAIR, _PLACE_PAIR, parse_coords

# --- data ------------------------------------------------------------------
GOOGLE_MAPS_HOSTS = frozenset({"google.com", "www.google.com"})  # path /maps...
GOOGLE_MAPS_ONLY_HOSTS = frozenset({"maps.google.com"})  # any path
OSM_HOSTS = frozenset({"openstreetmap.org", "www.openstreetmap.org"})
SHORT_ANY_PATH_HOSTS = frozenset({"maps.app.goo.gl", "goo.gl"})
SHORT_MAPS_PATH_HOSTS = frozenset({"g.co"})  # only with a /maps path

MAX_LINE_CHARS = 300
MAX_NAME_CHARS = 200
MAX_LINES = 200

SHORT_LINK_NOTE = "Short links can't be read; open it and paste the full address"
TOO_LONG_NOTE = f"Line is over {MAX_LINE_CHARS} characters"

_OSM_FRAGMENT = re.compile(rf"map=\d+(?:\.\d+)?/({_NUMBER})/({_NUMBER})")


@dataclass(frozen=True)
class LineRead:
    """What one pasted line is.

    `kind` is one of `coords` (lat, lng and maybe a name), `name_link` (a map
    link with a name only), `short_link` (host set), `name` (plain text to
    search), `too_long` or `empty`. `note` is a short human line when needed.
    """

    kind: str
    lat: float | None = None
    lng: float | None = None
    name: str | None = None
    host: str | None = None
    note: str | None = None


@dataclass(frozen=True)
class SplitResult:
    """A pasted blob split into lines: kept lines in order plus the counts."""

    lines: list[str]
    blank: int
    duplicates: int
    over_limit: int


_HIDDEN = ("Cc", "Cf")  # control and format characters (NUL, zero-width, bidi)


def clean_line(value: str) -> str:
    """A pasted line as text a person can see: control characters (NUL
    included, but not tab) and invisible format characters (zero-width,
    bidi overrides) removed, whitespace collapsed. May come out empty."""
    kept = (c for c in value if c == "\t" or unicodedata.category(c) not in _HIDDEN)
    return " ".join("".join(kept).split())


def clean_name(value: str | None) -> str | None:
    """Control and format characters removed, whitespace collapsed, cut to
    200; else None."""
    if not value:
        return None
    text = "".join(c for c in value if unicodedata.category(c) not in _HIDDEN)
    text = " ".join(text.split())[:MAX_NAME_CHARS].strip()
    return text or None


def _valid(lat: str, lng: str) -> tuple[float, float] | None:
    try:
        return parse_coords(f"{lat}, {lng}")
    except ValueError:
        return None


def _pair_in(value: str) -> tuple[str, str] | None:
    """A bare pair, comma or space separated (the shape a bare line uses)."""
    match = _PAIR.match(value)
    return (match.group(1), match.group(2)) if match else None


def _link_name(value: str | None) -> str | None:
    """A name taken from a link: cleaned, and dropped when it is not text a
    person wrote (bad UTF-8 decodes to U+FFFD; `/place/@1,2` is a position)."""
    name = clean_name(value)
    if name is None or "\ufffd" in name or name.startswith("@"):
        return None
    return name


def _is_maps_path(path: str) -> bool:
    """`/maps` alone or followed by `/`, any case; not `/mapsfoo`."""
    lowered = path.lower()
    return lowered == "/maps" or lowered.startswith("/maps/")


def _google(parts, query: dict[str, list[str]]) -> LineRead:
    text = parts.path + ("?" + parts.query if parts.query else "")
    candidate = None
    match = _PLACE_PAIR.search(text) or _AT_PAIR.search(text)
    if match:
        candidate = (match.group(1), match.group(2))
    else:
        for key in ("q", "query", "ll"):
            for value in query.get(key, []):
                candidate = _pair_in(value)
                if candidate:
                    break
            if candidate:
                break
    name = None
    segments = parts.path.split("/")
    if "place" in segments:
        index = segments.index("place") + 1
        if index < len(segments):
            name = _link_name(unquote_plus(segments[index]))
    if name is None:
        for key in ("q", "query"):
            for value in query.get(key, []):
                if not _pair_in(value) and _link_name(value):
                    name = _link_name(value)
                    break
            if name:
                break
    return _result(candidate, name)


def _osm(parts, query: dict[str, list[str]]) -> LineRead:
    candidate = None
    if "mlat" in query and "mlon" in query:
        candidate = (query["mlat"][0], query["mlon"][0])
    else:
        match = _OSM_FRAGMENT.search(parts.fragment)
        if match:
            candidate = (match.group(1), match.group(2))
    return _result(candidate, None)


def _result(candidate: tuple[str, str] | None, name: str | None) -> LineRead:
    point = _valid(*candidate) if candidate else None
    if point:
        return LineRead("coords", lat=point[0], lng=point[1], name=name)
    if name:
        return LineRead("name_link", name=name)
    return LineRead("name")  # a map link with nothing usable; caller keeps text


def read_line(text: str) -> LineRead:
    """Classify one pasted line; never raises and never touches the network."""
    line = clean_line(text)
    if not line:
        return LineRead("empty")
    if len(line) > MAX_LINE_CHARS:
        return LineRead("too_long", note=TOO_LONG_NOTE)
    plain = LineRead("name", name=clean_name(line))
    if line.lower().startswith(("http://", "https://")):
        try:
            parts = urlsplit(line)
            host = (parts.hostname or "").lower()
            query = parse_qs(parts.query)
        except ValueError:
            return plain
        path = parts.path
        if host in SHORT_ANY_PATH_HOSTS or (
            host in SHORT_MAPS_PATH_HOSTS and _is_maps_path(path)
        ):
            return LineRead("short_link", host=host, note=SHORT_LINK_NOTE)
        if host in GOOGLE_MAPS_ONLY_HOSTS or (
            host in GOOGLE_MAPS_HOSTS and _is_maps_path(path)
        ):
            found = _google(parts, query)
        elif host in OSM_HOSTS:
            found = _osm(parts, query)
        else:
            return plain
        return found if found.kind != "name" else plain
    pair = _PAIR.match(line)
    if pair:
        point = _valid(pair.group(1), pair.group(2))
        if point:
            return LineRead("coords", lat=point[0], lng=point[1])
    return plain


def split_lines(text: str) -> SplitResult:
    """Split a blob into kept lines (no blanks, no repeats, at most MAX_LINES)."""
    kept: list[str] = []
    seen: set[str] = set()
    blank = duplicates = 0
    for raw in text.splitlines():
        line = clean_line(raw)
        if not line:
            blank += 1
            continue
        key = " ".join(line.split()).casefold()
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        kept.append(line)
    return SplitResult(
        kept[:MAX_LINES], blank, duplicates, max(0, len(kept) - MAX_LINES)
    )
