"""A store's colour wording to a plain colour family (design D3).

Pure: no model call, no FastAPI, no database. `colour_family("Burgundy")`
is `"red"`; `garments.color_name` keeps the store's own words and
`primary_color` (filters, duplicate detection) keeps the family this gives.

The table is keyword data. Words are matched on whole tokens, the longest
phrase first ("stone wash" is blue before "stone" is beige), and modifiers
such as "light" or "dark" are not keywords, so they are ignored. A name that
gives no family, names two that disagree ("Blue/Grey") or describes a print
("Tan Geo Print") returns None: the piece is not guessed at, and Check asks.
"""

from __future__ import annotations

import re

FAMILIES = (
    "black",
    "white",
    "grey",
    "navy",
    "blue",
    "green",
    "red",
    "orange",
    "yellow",
    "pink",
    "purple",
    "brown",
    "beige",
    "tan",
)

_WORDS: dict[str, tuple[str, ...]] = {
    "black": ("black", "jet", "onyx"),
    "white": ("white", "off white", "ivory", "snow"),
    "grey": (
        "grey",
        "gray",
        "gull",
        "slate",
        "charcoal",
        "silver",
        "forged iron",
        "iron",
        "graphite",
        "pewter",
        "ash",
    ),
    "navy": ("navy", "midnight"),
    "blue": (
        "blue",
        "denim",
        "stone wash",
        "galactic",
        "cobalt",
        "royal",
        "sky",
        "teal",
        "aqua",
        "indigo",
        "chambray",
    ),
    "green": (
        "green",
        "olive",
        "mint",
        "sage",
        "forest",
        "hunter",
        "moss",
        "emerald",
        "vetiver",
        "lime",
        "pine",
    ),
    "red": (
        "red",
        "burgundy",
        "maroon",
        "marsala",
        "wine",
        "brick",
        "crimson",
        "cherry",
        "scarlet",
        "ruby",
        "cranberry",
        "oxblood",
    ),
    "orange": (
        "orange",
        "burnt orange",
        "rust",
        "tangerine",
        "pumpkin",
        "terracotta",
    ),
    "yellow": ("yellow", "gold", "mustard", "lemon"),
    "pink": ("pink", "flamingo", "blush", "rose", "salmon", "coral", "fuchsia"),
    "purple": ("purple", "plum", "lavender", "violet", "lilac", "mauve", "eggplant"),
    "brown": (
        "brown",
        "chocolate",
        "coffee",
        "espresso",
        "chestnut",
        "walnut",
        "mocha",
    ),
    "beige": ("beige", "sand", "cream", "ecru", "oatmeal", "stone", "taupe"),
    "tan": ("tan", "khaki", "camel", "caramel"),
}

# Words that make a name a print or pattern: no one family describes it.
_PATTERNS = frozenset(
    {
        "print",
        "stripe",
        "striped",
        "stripes",
        "plaid",
        "check",
        "checked",
        "gingham",
        "floral",
        "camo",
        "camouflage",
        "geo",
        "paisley",
        "houndstooth",
        "multi",
    }
)

_PHRASES: list[tuple[tuple[str, ...], str]] = sorted(
    (
        (tuple(phrase.split()), family)
        for family, phrases in _WORDS.items()
        for phrase in phrases
    ),
    key=lambda entry: -len(entry[0]),
)

_TOKEN = re.compile(r"[a-z0-9]+")


def colour_family(store_name: str | None) -> str | None:
    """The plain family of a store's colour name, or None when it is no
    colour, a print, or names two families."""
    tokens = _TOKEN.findall((store_name or "").lower())
    if not tokens or _PATTERNS.intersection(tokens):
        return None
    found: list[str] = []
    taken = [False] * len(tokens)
    for phrase, family in _PHRASES:
        width = len(phrase)
        for start in range(len(tokens) - width + 1):
            span = range(start, start + width)
            if tuple(tokens[start : start + width]) == phrase and not any(
                taken[i] for i in span
            ):
                for i in span:
                    taken[i] = True
                found.append(family)
    return found[0] if len(set(found)) == 1 else None
