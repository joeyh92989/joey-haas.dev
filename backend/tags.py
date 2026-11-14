"""Tags: a curated set of words per item type (shelf sweep item 7). Pure.

A tag is a word from a type's closed vocabulary, shown in labelled groups and
never mixed with platforms (docs/design-system.md). Stored as
`items.tags`, a list of `{group, tag}`; the keys here are the contract, and
the frontend's `content/tags.js` holds the words people read, matched by key.

Games are tagged by a plain mapping from IGDB's genres, themes and keywords:
no model is involved. Comics carry no genre field at Comic Vine, so one model
call per series answers with indices into the numbered vocabulary, the way
Discover chooses among candidates, and so it can never invent a tag.

Tags the owner saved (`tags_edited`) are never regenerated.
"""

from __future__ import annotations

from collections.abc import Iterable

# (group, tags) per type, in the order they are shown and stored.
VOCABULARY: dict[str, tuple[tuple[str, tuple[str, ...]], ...]] = {
    "game": (
        (
            "play_style",
            (
                "shooter",
                "rpg",
                "platformer",
                "open-world",
                "puzzle",
                "strategy",
                "racing",
                "simulation",
                "survival",
                "party",
                "beat-em-up",
                "stealth",
                "fighting",
                "card-and-board",
                "sports",
                "story-led",
                "metroidvania",
                "roguelike",
                "soulslike",
            ),
        ),
        (
            "setting",
            ("sci-fi", "fantasy", "horror", "mystery", "war", "historical"),
        ),
        ("tone", ("comedy", "drama", "family")),
    ),
    "comic": (
        (
            "genre",
            (
                "horror",
                "sci-fi",
                "fantasy",
                "crime",
                "action",
                "comedy",
                "superhero",
                "war",
                "western",
                "romance",
                "post-apocalyptic",
            ),
        ),
        ("based_on", ("movie", "tv", "game", "original")),
        ("form", ("anthology", "mini-series", "ongoing", "one-shot", "pin-up")),
    ),
}

# Group titles, for the model's numbered list. The site's words are in the
# frontend; these only label the prompt.
GROUP_TITLES = {
    "genre": "Genre",
    "based_on": "Based on",
    "form": "Form",
}

# (snapshot key, exact IGDB string) -> (group, tag). Keyword strings are the
# ones facets.FACET_MAP holds (copied from source snapshots). Left out on
# purpose, so no filter chip matches most of the shelf: Adventure, Action,
# Indie, Arcade, Quiz/Trivia, Sandbox, Erotic, Business, Thriller, Non-fiction.
IGDB_GAME_MAP: dict[tuple[str, str], tuple[str, str]] = {
    ("genres", "Shooter"): ("play_style", "shooter"),
    ("genres", "Role-playing (RPG)"): ("play_style", "rpg"),
    ("genres", "Platform"): ("play_style", "platformer"),
    ("themes", "Open world"): ("play_style", "open-world"),
    ("genres", "Puzzle"): ("play_style", "puzzle"),
    ("genres", "Strategy"): ("play_style", "strategy"),
    ("genres", "Tactical"): ("play_style", "strategy"),
    ("genres", "Turn-based strategy (TBS)"): ("play_style", "strategy"),
    ("genres", "Real Time Strategy (RTS)"): ("play_style", "strategy"),
    ("genres", "Racing"): ("play_style", "racing"),
    ("genres", "Simulator"): ("play_style", "simulation"),
    ("themes", "Survival"): ("play_style", "survival"),
    ("themes", "Party"): ("play_style", "party"),
    ("genres", "Hack and slash/Beat 'em up"): ("play_style", "beat-em-up"),
    ("themes", "Stealth"): ("play_style", "stealth"),
    ("genres", "Fighting"): ("play_style", "fighting"),
    ("genres", "Card & Board Game"): ("play_style", "card-and-board"),
    ("genres", "Sport"): ("play_style", "sports"),
    ("genres", "Point-and-click"): ("play_style", "story-led"),
    ("genres", "Visual Novel"): ("play_style", "story-led"),
    ("keywords", "metroidvania"): ("play_style", "metroidvania"),
    ("keywords", "roguelike"): ("play_style", "roguelike"),
    ("keywords", "roguelite"): ("play_style", "roguelike"),
    ("keywords", "action roguelike"): ("play_style", "roguelike"),
    ("keywords", "roguelike deckbuilder"): ("play_style", "roguelike"),
    ("keywords", "soulslike"): ("play_style", "soulslike"),
    ("themes", "Science fiction"): ("setting", "sci-fi"),
    ("themes", "Fantasy"): ("setting", "fantasy"),
    ("themes", "Horror"): ("setting", "horror"),
    ("themes", "Mystery"): ("setting", "mystery"),
    ("themes", "Warfare"): ("setting", "war"),
    ("themes", "Historical"): ("setting", "historical"),
    ("themes", "Comedy"): ("tone", "comedy"),
    ("themes", "Drama"): ("tone", "drama"),
    ("themes", "Kids"): ("tone", "family"),
}


def _order(item_type: str) -> dict[tuple[str, str], int]:
    return {
        (group, tag): index
        for index, (group, tag) in enumerate(
            (g, t) for g, ts in VOCABULARY[item_type] for t in ts
        )
    }


def _as_tags(pairs: Iterable[tuple[str, str]], item_type: str) -> list[dict]:
    """Pairs in vocabulary order, once each, as stored."""
    order = _order(item_type)
    return [
        {"group": group, "tag": tag}
        for group, tag in sorted(set(pairs), key=order.__getitem__)
    ]


def game_tags(snapshot: dict | None) -> list[dict]:
    """A game's tags from its IGDB snapshot (genres, themes, keywords)."""
    if not isinstance(snapshot, dict):
        return []
    found: set[tuple[str, str]] = set()
    for kind in ("genres", "themes", "keywords"):
        values = snapshot.get(kind)
        if not isinstance(values, list):
            continue
        for value in values:
            if isinstance(value, str) and (kind, value) in IGDB_GAME_MAP:
                found.add(IGDB_GAME_MAP[(kind, value)])
    return _as_tags(found, "game")


def clean_tags(item_type: str, given: Iterable[dict]) -> list[dict]:
    """The owner's tags, checked against the type's vocabulary: unknown ones
    raise ValueError, repeats collapse, the order is the vocabulary's."""
    if item_type not in VOCABULARY:
        if list(given):
            raise ValueError(f"A {item_type} has no tags")
        return []
    order = _order(item_type)
    pairs: set[tuple[str, str]] = set()
    for entry in given:
        pair = (entry.get("group"), entry.get("tag"))
        if pair not in order:
            raise ValueError(f"{pair[1]!r} is not a {pair[0]!r} tag for a {item_type}")
        pairs.add(pair)
    return _as_tags(pairs, item_type)


# --- Comics -----------------------------------------------------------------


def comic_options() -> list[tuple[str, str]]:
    """The numbered vocabulary the model answers in: (group, tag) by index."""
    return [(g, t) for g, ts in VOCABULARY["comic"] for t in ts]


MAX_DESCRIPTION = 1500
MAX_ANSWER = 8
# The forms that say how a run goes: a series is one of them.
RUN_FORMS = ("mini-series", "ongoing", "one-shot")

COMIC_SCHEMA = {
    "type": "object",
    "properties": {
        "tags": {
            "type": "array",
            "maxItems": MAX_ANSWER,
            "items": {
                "type": "integer",
                "minimum": 0,
                "maximum": len(comic_options()) - 1,
            },
        }
    },
    "required": ["tags"],
}

INSTRUCTIONS = (
    "You tag one comic series for a collector's shelf. Below are the series' "
    "details and a numbered list of tags. Answer with the numbers of the tags "
    "that fit, at most eight: the genres it plainly belongs to, what it is "
    "based on (movie, tv, game, or original when it is not based on anything "
    "else), and its form (mini-series, ongoing, one-shot, anthology, pin-up). "
    "Use only numbers from the list. Choose a tag only when the details "
    "support it."
)


def comic_prompt(
    title: str,
    publisher: str | None,
    start_year: int | str | None,
    issue_count: int | None,
    description: Iterable[str],
) -> str:
    """The one prompt a series gets: its details, then the numbered list."""
    lines = [INSTRUCTIONS, "", f"Title: {title}"]
    if publisher:
        lines.append(f"Publisher: {publisher}")
    if start_year:
        lines.append(f"First published: {start_year}")
    if isinstance(issue_count, int) and not isinstance(issue_count, bool):
        lines.append(f"Issues so far: {issue_count}")
    text = " ".join(p.strip() for p in description if p and p.strip())
    if text:
        lines.append(f"Description: {text[:MAX_DESCRIPTION]}")
    lines += ["", "Tags:"]
    for index, (group, tag) in enumerate(comic_options()):
        lines.append(f"{index}: {GROUP_TITLES[group]} / {tag}")
    return "\n".join(lines)


def comic_tags_from(payload: object) -> list[dict] | None:
    """A model answer as tags, or None when nothing usable came back.

    Indices outside the list (and anything not an integer) are dropped, not
    trusted. A series is one of mini-series, ongoing or one-shot (the first
    in vocabulary order wins), and Original never sits beside a source it is
    based on."""
    if not isinstance(payload, dict) or not isinstance(payload.get("tags"), list):
        return None
    options = comic_options()
    pairs = {
        options[i]
        for i in payload["tags"]
        if isinstance(i, int) and not isinstance(i, bool) and 0 <= i < len(options)
    }
    if ("based_on", "original") in pairs and pairs & {
        ("based_on", "movie"),
        ("based_on", "tv"),
        ("based_on", "game"),
    }:
        pairs.discard(("based_on", "original"))
    runs = [("form", f) for f in RUN_FORMS if ("form", f) in pairs]
    pairs -= set(runs[1:])
    return _as_tags(pairs, "comic") or None
