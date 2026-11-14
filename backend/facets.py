"""Facets: one vocabulary of taste across games, comics and movies.

A facet is a short, owner-readable word that taste attaches to: `space`,
`horror`, `comedy`, `platformer`. Each source tags its rows in its own words
(IGDB themes and keywords, TMDB genres and keywords, Comic Vine concepts,
characters, teams and locations); FACET_MAP translates the exact strings into
facets, so a comic set in space and a game set in space finally meet.

Three kinds of facet:

- theme: what it is about (space, war, dinosaurs). Bridges media.
- tone: how it feels (comedy, grim, cozy). Bridges media.
- form: what kind of thing it is (platformer, tactics, superhero). Stored
  type-scoped, as "game:form:platformer", so it never bridges media: a game's
  form says nothing about which comics I like.

A tag with no mapping becomes a type-scoped facet of its own
("game:keyword:luigi"), so nothing the engine could match on is lost, and the
map grows from what the collection actually carries. Storefront noise (store
features, festival and award lists, Comic Vine's variant-cover concepts) is
ignored outright: it says nothing about taste and, being rare, would read as
very distinctive.

Mapped strings are exact and copied from source snapshots, never typed from
memory (the MOOD_BUCKETS rule); `tests/test_facets.py` holds every one to a
fixture or the collection export. Curation rule: a facet earns a row when at
least two items would share it. `scripts/facet_coverage.py` reports the
unmapped tags by count, which is how the map is tended.

Pure: no FastAPI, no SQLAlchemy.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Protocol

# Snapshot keys that carry taste, as the adapters write them. Game modes and
# player perspectives are deliberately absent: how many people play, or where
# the camera sits, is not a facet.
TAG_KINDS = (
    "genres",
    "themes",
    "keywords",
    "characters",
    "concepts",
    "teams",
    "locations",
)

THEME_FACETS = frozenset(
    {
        "post-apocalyptic",
        "dystopia",
        "space",
        "science fiction",
        "fantasy",
        "horror",
        "war",
        "crime",
        "mystery",
        "dinosaurs",
        "robots",
        "aliens",
        "animals",
        "zombies",
        "vampires",
        "supernatural",
        "ocean",
        "time travel",
        "mythology",
        "history",
        "steampunk",
        "cyberpunk",
        "desert",
        "revenge",
        "romance",
        "monsters",
        "politics",
        "feudal japan",
        "anime",
        "survival",
        "aviation",
    }
)

TONE_FACETS = frozenset(
    {"comedy", "cozy", "grim", "melancholy", "noir", "surreal", "spooky"}
)

FORM_FACETS = frozenset(
    {
        "adventure",
        "platformer",
        "metroidvania",
        "roguelike",
        "deckbuilder",
        "shooter",
        "tactics",
        "strategy",
        "rpg",
        "visual novel",
        "puzzle",
        "racing",
        "fighting",
        "beat 'em up",
        "simulation",
        "point-and-click",
        "soulslike",
        "rhythm",
        "sports",
        "party",
        "open world",
        "licensed",
        "stealth",
    }
)


def _rows(source: str, kind: str, facet: str, *values: str) -> dict:
    return {(source, kind, value): facet for value in values}


# (source, snapshot key, exact source string) -> facet.
FACET_MAP: dict[tuple[str, str, str], str] = {
    # --- themes ---
    **_rows("igdb", "keywords", "post-apocalyptic", "post-apocalyptic", "apocalypse"),
    **_rows("igdb", "keywords", "dystopia", "dystopian"),
    **_rows("tmdb", "keywords", "dystopia", "dystopia"),
    **_rows("igdb", "keywords", "space", "space", "spaceship", "planet", "alien world"),
    **_rows("tmdb", "keywords", "space", "space", "space opera"),
    **_rows("comicvine", "locations", "space", "Space"),
    **_rows("igdb", "themes", "science fiction", "Science fiction"),
    **_rows("tmdb", "genres", "science fiction", "Science Fiction"),
    **_rows("igdb", "themes", "fantasy", "Fantasy"),
    **_rows(
        "igdb",
        "keywords",
        "fantasy",
        "high fantasy",
        "dark fantasy",
        "sword & sorcery",
        "magic",
        "wizards",
        "dragons",
    ),
    **_rows("igdb", "themes", "horror", "Horror"),
    **_rows(
        "igdb",
        "keywords",
        "horror",
        "survival horror",
        "psychological horror",
        "gothic horror",
        "cosmic horror",
    ),
    **_rows("igdb", "themes", "war", "Warfare"),
    **_rows(
        "igdb",
        "keywords",
        "war",
        "war",
        "korean war",
        "civil war",
        "modern warfare",
        "tank",
    ),
    **_rows("tmdb", "keywords", "war", "army"),
    **_rows(
        "igdb",
        "keywords",
        "crime",
        "crime",
        "organized crime",
        "mafia",
        "crime fighting",
    ),
    **_rows("igdb", "themes", "mystery", "Mystery"),
    **_rows(
        "igdb",
        "keywords",
        "mystery",
        "murder mystery",
        "detective",
        "investigation",
        "private detective",
        "crime solving",
        "supernatural mystery",
    ),
    **_rows("igdb", "keywords", "dinosaurs", "dinosaurs", "prehistoric"),
    **_rows(
        "igdb",
        "keywords",
        "robots",
        "robots",
        "androids",
        "mech",
        "artificial intelligence",
    ),
    **_rows("comicvine", "locations", "robots", "Robot Kingdom"),
    **_rows("igdb", "keywords", "aliens", "aliens", "alien", "ufo"),
    **_rows(
        "igdb",
        "keywords",
        "animals",
        "animals",
        "animal protagonist",
        "anthropomorphism",
    ),
    **_rows(
        "igdb",
        "keywords",
        "zombies",
        "zombies",
        "undead invasion",
        "zombie virus",
        "zombie shooter",
    ),
    **_rows("igdb", "keywords", "vampires", "vampire", "vampires"),
    **_rows(
        "igdb",
        "keywords",
        "supernatural",
        "supernatural",
        "ghost",
        "ghosts",
        "occult",
        "yokai",
        "youkai",
        "demons",
    ),
    **_rows("igdb", "keywords", "ocean", "underwater", "shark", "dolphin"),
    **_rows(
        "igdb",
        "keywords",
        "time travel",
        "time travel",
        "time loop",
        "time machine",
        "time paradox",
        "groundhog day scenario",
    ),
    **_rows(
        "igdb", "keywords", "mythology", "mythology", "irish mythology", "folklore"
    ),
    **_rows("igdb", "themes", "history", "Historical"),
    **_rows(
        "igdb",
        "keywords",
        "history",
        "historical fiction",
        "world history",
        "alternate history",
    ),
    **_rows("igdb", "keywords", "steampunk", "steampunk"),
    **_rows("igdb", "keywords", "cyberpunk", "cyberpunk"),
    **_rows("igdb", "keywords", "desert", "desert"),
    **_rows("tmdb", "keywords", "desert", "desert", "sand dune"),
    **_rows("igdb", "keywords", "revenge", "revenge"),
    **_rows("tmdb", "keywords", "revenge", "revenge"),
    **_rows("igdb", "themes", "romance", "Romance"),
    **_rows(
        "igdb",
        "keywords",
        "romance",
        "dating",
        "dating simulation",
        "love triangle",
        "forbidden love",
        "otome",
    ),
    **_rows("igdb", "keywords", "monsters", "monsters", "monster", "kaiju", "godzilla"),
    **_rows("tmdb", "keywords", "monsters", "creature", "giant creature"),
    **_rows("igdb", "keywords", "politics", "political thriller", "conspiracy"),
    **_rows("tmdb", "keywords", "politics", "empire", "treason"),
    **_rows(
        "igdb",
        "keywords",
        "feudal japan",
        "feudal japan",
        "historical japan",
        "samurai",
    ),
    **_rows(
        "igdb", "keywords", "anime", "anime", "based on - anime", "based on - manga"
    ),
    **_rows("igdb", "themes", "survival", "Survival"),
    **_rows("igdb", "keywords", "aviation", "flight", "helicopter"),
    # --- tones ---
    **_rows("igdb", "themes", "comedy", "Comedy"),
    **_rows(
        "igdb",
        "keywords",
        "comedy",
        "funny",
        "humor",
        "humour",
        "goofy",
        "satire",
        "surreal comedy",
        "dark humor",
    ),
    **_rows(
        "igdb",
        "keywords",
        "cozy",
        "cozy",
        "cozy adventure",
        "wholesome",
        "relaxing",
        "chill",
        "cute",
    ),
    **_rows(
        "igdb",
        "keywords",
        "grim",
        "dark",
        "gore",
        "violent",
        "bloody",
        "violence",
        "extreme violence",
    ),
    **_rows("igdb", "keywords", "melancholy", "emotional", "depression", "tragic hero"),
    **_rows("igdb", "keywords", "noir", "noir", "film noir", "pulp fiction"),
    **_rows("igdb", "keywords", "surreal", "surreal", "weird"),
    **_rows("igdb", "keywords", "spooky", "spooky", "creepy", "halloween"),
    # --- forms (type-scoped when stored) ---
    **_rows("igdb", "genres", "adventure", "Adventure"),
    **_rows("tmdb", "genres", "adventure", "Adventure"),
    **_rows("igdb", "genres", "platformer", "Platform"),
    **_rows(
        "igdb",
        "keywords",
        "platformer",
        "2d platformer",
        "3d platformer",
        "puzzle platformer",
        "action platformer",
        "physics-based platformer",
    ),
    **_rows("igdb", "keywords", "metroidvania", "metroidvania"),
    **_rows(
        "igdb",
        "keywords",
        "roguelike",
        "roguelike",
        "roguelite",
        "action roguelike",
        "roguelike deckbuilder",
    ),
    **_rows(
        "igdb",
        "keywords",
        "deckbuilder",
        "deckbuilder",
        "deckbuilding",
        "card battler",
        "card based combat",
    ),
    **_rows("igdb", "genres", "shooter", "Shooter"),
    **_rows(
        "igdb",
        "keywords",
        "shooter",
        "boomer shooter",
        "multiplayer fps",
        "shoot 'em up",
        "shmup",
        "bullet hell",
    ),
    **_rows("igdb", "genres", "tactics", "Tactical", "Turn-based strategy (TBS)"),
    **_rows(
        "igdb",
        "keywords",
        "tactics",
        "turn-based tactics",
        "tactical rpg ( trpg )",
        "trpg",
        "srpg",
    ),
    **_rows("igdb", "genres", "strategy", "Strategy", "Real Time Strategy (RTS)"),
    **_rows("igdb", "genres", "rpg", "Role-playing (RPG)"),
    **_rows(
        "igdb",
        "keywords",
        "rpg",
        "jrpg",
        "turn-based rpg",
        "crpg",
        "action-rpg",
        "japanese rpg",
    ),
    **_rows("igdb", "genres", "visual novel", "Visual Novel"),
    **_rows("igdb", "keywords", "visual novel", "interactive fiction"),
    **_rows("igdb", "genres", "puzzle", "Puzzle"),
    **_rows("igdb", "keywords", "puzzle", "sokoban", "sokoban-like"),
    **_rows("igdb", "genres", "racing", "Racing"),
    **_rows("igdb", "keywords", "racing", "kart racing", "anti-gravity racing"),
    **_rows("igdb", "genres", "fighting", "Fighting"),
    **_rows("igdb", "keywords", "fighting", "2d fighter", "arena fighter"),
    **_rows("igdb", "genres", "beat 'em up", "Hack and slash/Beat 'em up"),
    **_rows("igdb", "genres", "simulation", "Simulator"),
    **_rows(
        "igdb",
        "keywords",
        "simulation",
        "life simulation",
        "farming simulator",
        "life sim",
        "life simulator",
    ),
    **_rows("igdb", "genres", "point-and-click", "Point-and-click"),
    **_rows("igdb", "keywords", "soulslike", "soulslike"),
    **_rows("igdb", "genres", "rhythm", "Music"),
    **_rows("igdb", "keywords", "rhythm", "rhythm", "music and rhythm"),
    **_rows("igdb", "genres", "sports", "Sport"),
    **_rows("igdb", "themes", "party", "Party"),
    **_rows("igdb", "themes", "open world", "Open world", "Sandbox"),
    **_rows("igdb", "themes", "stealth", "Stealth"),
    **_rows(
        "igdb",
        "keywords",
        "licensed",
        "licensed game",
        "based on - comics",
        "based on - movie",
        "based on - tv show",
        "based on - cartoons",
    ),
}

# Tags that say nothing about taste: store features, festivals, awards,
# platform services and accessibility settings (IGDB), cover variants
# (Comic Vine). Exact strings, plus prefixes for the families that grow every
# year.
IGNORED_PREFIXES = (
    "steam ",
    "nextfest",
    "the game awards",
    "available on",
    "previously on",
    "gamescom",
    "tokyo game show",
    "pax ",
    "crowdfunding",
    "kickstarter",
    "Variant ",
)
IGNORED_TAGS = frozenset(
    {
        "accessibility options",
        "custom volume controls",
        "stereo sound",
        "surround sound",
        "subtitles",
        "closed captions",
        "adjustable text size",
        "color alternatives",
        "camera comfort",
        "controller support",
        "controller recommendation",
        "controller required",
        "keyboard only option",
        "mouse only option",
        "touch only option",
        "playable without timed input",
        "save anytime",
        "xbox controller support for pc",
        "dualsense support for pc",
        "dualshock 4 support for pc",
        "achievements",
        "cloud saves",
        "remote play",
        "cross-platform",
        "games with gold",
        "apple arcade",
        "free demo",
        "free dlc",
        "expansion pass",
        "valve anti-cheat",
        "gog preservation program",
        "fan translation - english",
        "60 fps on consoles",
        "retroachievements",
        "upcoming",
        "canceled games",
        "Variant Cover",
    }
)

# Curated tags (tags.py) the owner or a model chose, read as facets so a comic
# gets "why this pick" reasons too. (item type, group, tag) -> facet; a tag
# with no entry says nothing about taste (Based on, Form, Family, Drama) and
# adds no facet. A mapped name that is a form facet is stored type-scoped.
_CURATED_GAME = {
    **{
        ("play_style", tag): facet
        for tag, facet in {
            "shooter": "shooter",
            "rpg": "rpg",
            "platformer": "platformer",
            "open-world": "open world",
            "puzzle": "puzzle",
            "strategy": "strategy",
            "racing": "racing",
            "simulation": "simulation",
            "survival": "survival",
            "party": "party",
            "beat-em-up": "beat 'em up",
            "stealth": "stealth",
            "fighting": "fighting",
            "sports": "sports",
            "metroidvania": "metroidvania",
            "roguelike": "roguelike",
            "soulslike": "soulslike",
        }.items()
    },
    ("setting", "sci-fi"): "science fiction",
    ("setting", "fantasy"): "fantasy",
    ("setting", "horror"): "horror",
    ("setting", "mystery"): "mystery",
    ("setting", "war"): "war",
    ("setting", "historical"): "history",
    ("tone", "comedy"): "comedy",
}
_CURATED_COMIC = {
    ("genre", "horror"): "horror",
    ("genre", "sci-fi"): "science fiction",
    ("genre", "fantasy"): "fantasy",
    ("genre", "crime"): "crime",
    ("genre", "comedy"): "comedy",
    ("genre", "war"): "war",
    ("genre", "romance"): "romance",
    ("genre", "post-apocalyptic"): "post-apocalyptic",
}
CURATED = "curated"
# Comic genres no shared facet names: type-scoped words of their own.
_CURATED_COMIC_OWN = ("action", "superhero", "western")


def curated_pair(group: str, tag: str) -> tuple[str, str]:
    """A stored tag as the (kind, value) pair an item's tags tuple carries."""
    return (CURATED, f"{group}/{tag}")


def _curated_facet(item_type: str, value: str) -> str | None:
    group, _, tag = value.partition("/")
    table = {"game": _CURATED_GAME, "comic": _CURATED_COMIC}.get(item_type, {})
    name = table.get((group, tag))
    if name is None:
        if item_type == "comic" and group == "genre" and tag in _CURATED_COMIC_OWN:
            return f"comic:tag:{tag}"
        return None
    return f"{item_type}:form:{name}" if name in FORM_FACETS else name


_SINGULAR = {
    "genres": "genre",
    "themes": "theme",
    "keywords": "keyword",
    "characters": "character",
    "concepts": "concept",
    "teams": "team",
    "locations": "location",
}


class Tagged(Protocol):
    """What facets read from an item: its type, its source and its tags."""

    type: str
    source: str | None
    tags: tuple[tuple[str, str], ...]


def snapshot_tags(
    snapshot: dict | None, curated: Iterable[dict] | None = None
) -> tuple[tuple[str, str], ...]:
    """Every (snapshot key, string) pair a source snapshot carries, in order,
    then the item's curated tags as ("curated", "group/tag").

    Strings only: IGDB's similar_games are ids and live elsewhere.
    """
    pairs: list[tuple[str, str]] = []
    if isinstance(snapshot, dict):
        for kind in TAG_KINDS:
            values = snapshot.get(kind)
            if isinstance(values, list):
                pairs.extend((kind, v) for v in values if isinstance(v, str) and v)
    for entry in curated or ():
        if (
            isinstance(entry, dict)
            and isinstance(entry.get("group"), str)
            and isinstance(entry.get("tag"), str)
        ):
            pairs.append(curated_pair(entry["group"], entry["tag"]))
    return tuple(pairs)


def is_ignored(value: str) -> bool:
    return value in IGNORED_TAGS or value.startswith(IGNORED_PREFIXES)


def is_form(facet: str) -> bool:
    """A type-scoped form facet ("game:form:platformer")."""
    parts = facet.split(":", 2)
    return len(parts) == 3 and parts[1] == "form"


def facet_kind(facet: str) -> str:
    """theme, tone, form, or tag (an unmapped, type-scoped source tag)."""
    if is_form(facet):
        return "form"
    if facet in THEME_FACETS:
        return "theme"
    if facet in TONE_FACETS:
        return "tone"
    return "tag"


def facet_label(facet: str) -> str:
    """The word a reason uses: the facet itself, or the tag's own string."""
    return facet.split(":", 2)[2] if ":" in facet else facet


def bridges(facet: str) -> bool:
    """Whether the facet may connect items of different types."""
    return facet_kind(facet) in ("theme", "tone")


def facet_for(item_type: str, source: str | None, kind: str, value: str) -> str:
    mapped = FACET_MAP.get((source or "", kind, value))
    if mapped is None:
        return f"{item_type}:{_SINGULAR[kind]}:{value}"
    if mapped in FORM_FACETS:
        return f"{item_type}:form:{mapped}"
    return mapped


def facets_of(item: Tagged) -> frozenset[str]:
    """The item's facets: mapped where the map knows the tag, type-scoped
    where it does not, and nothing for ignored or untracked kinds."""
    found = {
        facet_for(item.type, item.source, kind, value)
        for kind, value in item.tags
        if kind in _SINGULAR and not is_ignored(value)
    }
    for kind, value in item.tags:
        if kind == CURATED and (facet := _curated_facet(item.type, value)):
            found.add(facet)
    return frozenset(found)


def specificity(items: Iterable[Tagged]) -> dict[str, float]:
    """How distinctive each facet is across the whole collection, 0-1.

    log(N / carriers), where N counts the items carrying any facet, divided
    by the largest such value within the facet's kind: within a kind, the
    rarest facet is 1 and a facet on every item is 0.
    """
    carriers: dict[str, int] = {}
    total = 0
    for item in items:
        found = facets_of(item)
        if not found:
            continue
        total += 1
        for facet in found:
            carriers[facet] = carriers.get(facet, 0) + 1
    raw = {facet: math.log(total / count) for facet, count in carriers.items()}
    top: dict[str, float] = {}
    for facet, value in raw.items():
        kind = facet_kind(facet)
        top[kind] = max(top.get(kind, 0.0), value)
    return {
        facet: (value / top[facet_kind(facet)] if top[facet_kind(facet)] else 0.0)
        for facet, value in raw.items()
    }


def coverage(items: Iterable[Tagged]) -> list[tuple[str, str, str, int]]:
    """Unmapped, unignored tags as (source, kind, value, items carrying it),
    most common first: the list a curation pass works down."""
    counts: dict[tuple[str, str, str], int] = {}
    for item in items:
        seen = {
            (item.source or "", kind, value)
            for kind, value in item.tags
            if kind in _SINGULAR
            and not is_ignored(value)
            and (item.source or "", kind, value) not in FACET_MAP
        }
        for key in seen:
            counts[key] = counts.get(key, 0) + 1
    return sorted(
        ((*key, count) for key, count in counts.items()),
        key=lambda row: (-row[3], row[0], row[1], row[2]),
    )
