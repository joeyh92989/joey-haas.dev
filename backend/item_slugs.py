"""Readable item URLs: the slug an item is known by (#479).

`/shelf/catherine-full-body/` instead of `/shelf/<uuid>/`. One generator for
every way an item is born: the ORM insert listener (any `Item(...)` added to a
session), the bulk importer's Core insert, and migration 0029's backfill.

The pure functions here import nothing from the app, so the migration can use
them without dragging in the models. Keep it that way.

A slug is set once, at insert, and never follows a title change: links already
shared must keep working. Collisions, reserved words and UUID-shaped slugs get
a short id suffix.
"""

import re
import unicodedata
import uuid
from collections.abc import Callable, Iterable

# Pages under /shelf/ that are not items (App.jsx's declared routes), plus
# `feed-xml` (the feed's own file). An item slugged `games` would be
# unreachable, so it gets a suffix like any other collision.
RESERVED = frozenset(
    {"games", "comics", "intake", "next", "how", "year", "journal", "daily"}
    | {"feed-xml"}
)

MAX_LENGTH = 80

_NON_SLUG = re.compile(r"[^a-z0-9]+")
_UUID = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)
# What a slug looks like on the wire: lowercase words joined by single hyphens.
SLUG_SHAPE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def slugify(title: str | None, kind: str = "item") -> str:
    """Lowercase ASCII words joined by hyphens.

    Diacritics are stripped (`Pokémon` -> `pokemon`), an apostrophe vanishes
    rather than splitting the word (`Baldur's` -> `baldurs`), and anything else
    non-alphanumeric is a hyphen. At most MAX_LENGTH characters, cut at a hyphen.
    A title with nothing usable (`???`, an emoji) falls back to `kind`.
    """
    text = unicodedata.normalize("NFKD", title or "")
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"['’`]", "", text)
    slug = _NON_SLUG.sub("-", text).strip("-")
    if len(slug) > MAX_LENGTH:
        cut = slug[:MAX_LENGTH]
        slug = (cut.rsplit("-", 1)[0] if "-" in cut else cut).strip("-")
    if not slug:
        return slugify(kind, "item") if kind != "item" else "item"
    return slug


def unique_slug(
    title: str | None,
    kind: str,
    item_id: uuid.UUID,
    taken: Callable[[str], bool],
) -> str:
    """The slug for a new item: the bare slug if free, else with a short id.

    `taken(candidate)` says whether a candidate is already someone's. The bare
    form is refused when taken, reserved, or UUID-shaped (a UUID-shaped slug
    would be read as an id by the lookup). The suffix is the first 6 hex of the
    item's id, then 8, 12 and the whole id if those are taken too.
    """
    base = slugify(title, kind)
    if base not in RESERVED and not _UUID.fullmatch(base) and not taken(base):
        return base
    hexid = item_id.hex
    for length in (6, 8, 12, 32):
        candidate = f"{base}-{hexid[:length]}"
        if not taken(candidate):
            return candidate
    # A full 32-hex suffix is unique per id; reaching here means the id itself
    # was reused, which the primary key forbids anyway.
    return f"{base}-{hexid}"


def backfill(rows: Iterable[tuple[uuid.UUID, str | None, str]]) -> dict[uuid.UUID, str]:
    """Slugs for existing rows, in the order given (oldest first, so the oldest
    of a set of same-titled items keeps the bare slug). `rows` are
    `(id, title, kind)`. Used by migration 0029."""
    used: set[str] = set()
    out: dict[uuid.UUID, str] = {}
    for item_id, title, kind in rows:
        slug = unique_slug(title, kind, item_id, used.__contains__)
        used.add(slug)
        out[item_id] = slug
    return out


def is_id(key: str) -> bool:
    """Whether a URL key is an item id rather than a slug."""
    return _UUID.fullmatch(key) is not None
