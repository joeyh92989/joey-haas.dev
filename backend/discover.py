"""Discover: released physical games the owner would love and doesn't have.
Pure.

The pool arrives as Radar's views (`radar_load.load_pool`); this module
keeps the released, eligible games, pre-scores them against Play Next's
profile, shortlists twenty in a seeded shuffle, writes the one prompt the
model sees and the schema it answers in, validates what comes back, and
builds the deterministic eight that stand in when the model cannot answer.
The model only ever chooses among indices the server built: it never
introduces a title (parent spec §2.2).
"""

from __future__ import annotations

import dataclasses
import math
import random
from dataclasses import dataclass
from datetime import date

from picker import (
    PickerItem,
    affinity,
    attribute_table,
    quality,
    reference_weights,
    similarity,
)
from radar import (
    FORMAT_WORDS,
    KEY_CARD_FORMATS,
    PLATFORM_WORDS,
    PoolGame,
    _picker_item,
    _taste_reasons,
    _window_reason,
)

# Picker's 0-100 scales, summing to 1: taste first, then the community.
DISCOVER_WEIGHTS = {"affinity": 0.45, "similarity": 0.35, "quality": 0.20}
POPULARITY_WEIGHT = 15
# IGDB rating count at which popularity counts in full.
POPULARITY_SCALE = 2000
POPULARITY_SIGN = {"safe": 1, "balanced": 0, "deep": -1}
BUYABLE_BONUS = 10
UNKNOWN_FORMAT_PENALTY = 10
CANDIDATES = 20
PICKS = 8
PROFILE_SIZE = 10
RECENT_YEARS = 3
MAX_REASON = 300
LIKED_SIZE = 5
# When a game is on several platforms, the one kept on a tie: the platform
# the owner buys for now first.
PLATFORM_PREFERENCE = (508, 130, 4)

PICKS_SCHEMA = {
    "type": "object",
    "properties": {
        "picks": {
            "type": "array",
            "maxItems": PICKS,
            "items": {
                "type": "object",
                "properties": {
                    "index": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": CANDIDATES - 1,
                    },
                    "reason": {"type": "string"},
                    "based_on": {
                        "type": "array",
                        "items": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": PROFILE_SIZE,
                        },
                    },
                },
                "required": ["index", "reason", "based_on"],
            },
        }
    },
    "required": ["picks"],
}

INSTRUCTIONS = (
    "You recommend physical video games to one collector. Below are games "
    "they own and how they felt about them, then a numbered list of "
    "candidates they do not own. Pick up to eight candidates they would "
    "love, favouring variety across genres. For each pick give its index, "
    "one plain sentence saying why, naming the owned games behind it, and "
    "those owned games' numbers in based_on. Only use indices from the "
    "candidate list; never mention a game that is not in either list. No "
    "marketing language."
)


@dataclass(frozen=True)
class Candidate:
    """A released, eligible game with its pre-score."""

    game: PoolGame
    item: PickerItem
    score: int
    similar_to: PickerItem | None
    buyable: bool


@dataclass(frozen=True)
class Pick:
    """A chosen candidate, ready to store."""

    candidate: Candidate
    reasons: tuple[str, ...]
    based_on: tuple[str, ...]  # the owner's item ids behind the reasons
    ranked_by: str  # "model" | "template"


def released(game: PoolGame, today: date, window: str) -> bool:
    """Out already (or undated), and within the window when it is recent.

    Everything dated after today belongs to Radar (parent spec §7.1).
    """
    when = game.candidate.release_date
    if when is not None and when > today:
        return False
    if window == "recent":
        return when is not None and when >= _years_before(today, RECENT_YEARS)
    return True


def _years_before(today: date, years: int) -> date:
    """The same day `years` earlier; 29 February becomes the 28th."""
    try:
        return today.replace(year=today.year - years)
    except ValueError:
        return today.replace(year=today.year - years, day=28)


def buyable(game: PoolGame, today: date) -> bool:
    """In stock somewhere, or on a pre-order whose window is still open."""
    return any(
        line.availability == "in_stock"
        or (
            line.availability == "preorder"
            and (line.preorder_closes_at is None or line.preorder_closes_at >= today)
        )
        for line in game.candidate.store_lines
    )


def eligible(
    pool: list[PoolGame],
    excluded: set[int],
    today: date,
    window: str,
    include_key_cards: bool,
) -> list[PoolGame]:
    """The pool Discover may suggest from: released, not decided, and no
    Game-Key Card or code in a box unless asked (D7). An unknown format
    stays, marked and marked down."""
    return [
        game
        for game in pool
        if game.candidate.igdb_id not in excluded
        and released(game, today, window)
        and (
            include_key_cards or game.candidate.physical_format not in KEY_CARD_FORMATS
        )
    ]


def _popularity(snapshot: dict) -> float:
    votes = snapshot.get("community_votes")
    votes = votes if isinstance(votes, int) and votes > 0 else 0
    return min(1.0, math.log1p(votes) / math.log1p(POPULARITY_SCALE))


def _community_score(snapshot: dict) -> float | None:
    score = snapshot.get("community_score")
    if isinstance(score, bool) or not isinstance(score, int | float):
        return None
    return float(score)


def prescore(
    pool: list[PoolGame], profile: list[PickerItem], popularity: str, today: date
) -> list[Candidate]:
    """Every game's pre-score, best first (spec §2)."""
    weights = reference_weights(profile)
    refs = [item for item in profile if item.id in weights]
    table = attribute_table(profile, weights) if refs else {}
    sign = POPULARITY_SIGN[popularity]
    found: list[Candidate] = []
    for game in pool:
        candidate = game.candidate
        item = dataclasses.replace(
            _picker_item(
                candidate.igdb_id,
                candidate.title,
                game.snapshot,
                candidate.platform_id,
                candidate.release_date,
            ),
            community_score=_community_score(game.snapshot),
        )
        if refs:
            near, similar_to = similarity(item, refs, weights)
            taste = affinity(item, table)
        else:
            near, similar_to, taste = 0.0, None, 50.0
        value = (
            DISCOVER_WEIGHTS["affinity"] * taste
            + DISCOVER_WEIGHTS["similarity"] * near
            + DISCOVER_WEIGHTS["quality"] * quality(item)
            + sign * POPULARITY_WEIGHT * _popularity(game.snapshot)
        )
        can_buy = buyable(game, today)
        if can_buy:
            value += BUYABLE_BONUS
        if candidate.physical_format is None:
            value -= UNKNOWN_FORMAT_PENALTY
        found.append(Candidate(game, item, round(value), similar_to, can_buy))
    return _one_per_game(found)


def _platform_rank(platform_id: int) -> int:
    if platform_id in PLATFORM_PREFERENCE:
        return PLATFORM_PREFERENCE.index(platform_id)
    return len(PLATFORM_PREFERENCE)


def _one_per_game(found: list[Candidate]) -> list[Candidate]:
    """Each game once, best first: the catalogue keys a game per platform,
    so a game out on two would otherwise take two of the eight picks."""
    kept: dict[int, Candidate] = {}
    for entry in sorted(
        found,
        key=lambda entry: (
            -entry.score,
            _platform_rank(entry.game.candidate.platform_id),
        ),
    ):
        kept.setdefault(entry.game.candidate.igdb_id, entry)
    return sorted(
        kept.values(), key=lambda entry: (-entry.score, entry.game.candidate.igdb_id)
    )


def shortlist(candidates: list[Candidate], seed: int) -> list[Candidate]:
    """The top CANDIDATES, shuffled: a model moves late entries up less
    often, so the pre-score's order must not be the prompt's. Seeded, so a
    batch can be reproduced."""
    top = list(candidates[:CANDIDATES])
    random.Random(seed).shuffle(top)
    return top


def references(profile: list[PickerItem]) -> list[PickerItem]:
    """The owner's games that say most about their taste, strongest first."""
    weights = reference_weights(profile)
    ranked = sorted(
        (item for item in profile if weights.get(item.id, 0.0) > 0),
        key=lambda item: (-weights[item.id], item.title),
    )
    return ranked[:PROFILE_SIZE]


def _feeling(item: PickerItem) -> str:
    parts = []
    if item.rating is not None:
        parts.append(f"rated {item.rating}")
    if item.status in ("finished", "abandoned"):
        parts.append(item.status)
    return f" ({', '.join(parts)})" if parts else ""


def build_prompt(
    shortlist: list[Candidate],
    refs: list[PickerItem],
    table: dict[tuple[str, str], float],
) -> str:
    """The one prompt: the owner's games numbered from 1, what they like
    most, and the candidates by index. No other title appears."""
    lines = [INSTRUCTIONS, "", "The owner's games:"]
    for number, item in enumerate(refs, 1):
        # Not picker._named: its "which I rated" is the public reasons' voice,
        # and _feeling already gives the rating.
        named = f"{item.title}{' ♥' if item.favorite else ''}"
        lines.append(f"{number}. {named}{_feeling(item)}")
    # Only what they liked: an abandoned game's genres weigh below zero.
    liked = [
        value
        for (kind, value), weight in sorted(table.items(), key=lambda pair: -pair[1])
        if kind in ("genre", "theme") and weight > 0
    ][:LIKED_SIZE]
    if liked:
        lines.append(f"What they like most: {', '.join(liked)}")
    lines += ["", "Candidates:"]
    for index, candidate in enumerate(shortlist):
        item = candidate.item
        year = f" ({item.year})" if item.year else ""
        traits = "; ".join(
            part
            for part in (", ".join(item.genres[:3]), ", ".join(item.themes[:3]))
            if part
        )
        platform = PLATFORM_WORDS.get(candidate.game.candidate.platform_id, "")
        fmt = FORMAT_WORDS.get(candidate.game.candidate.physical_format or "", "")
        details = " · ".join(part for part in (traits, platform, fmt.lower()) if part)
        lines.append(f"[{index}] {item.title}{year} — {details}")
    return "\n".join(lines)


def _extras(candidate: Candidate, today: date) -> list[str]:
    """The admin card's facts after the reason: the window and the format."""
    found = []
    window = _window_reason(candidate.game.candidate.store_lines, today)
    if window:
        found.append(window)
    fmt = candidate.game.candidate.physical_format
    note = candidate.game.candidate.format_note
    if note or FORMAT_WORDS.get(fmt or ""):
        found.append(note or FORMAT_WORDS[fmt])
    return found


def validate(
    payload: dict,
    shortlist: list[Candidate],
    refs: list[PickerItem],
    today: date | None = None,
) -> list[Pick]:
    """The model's picks that hold up, in its order; the rest are dropped.

    A pick needs an index in range and not seen before, and a reason; a
    based_on number outside the owner's list is dropped from the pick.
    """
    picks = payload.get("picks") if isinstance(payload, dict) else None
    if not isinstance(picks, list):
        return []
    seen: set[int] = set()
    found: list[Pick] = []
    for entry in picks:
        if len(found) == PICKS:
            break
        if not isinstance(entry, dict):
            continue
        index = entry.get("index")
        if isinstance(index, bool) or not isinstance(index, int):
            continue
        if not 0 <= index < len(shortlist) or index in seen:
            continue
        reason = entry.get("reason")
        # One line: the card splits reasons on newlines, so a line break in
        # the model's text would read as a separate fact.
        reason = " ".join(reason.split()) if isinstance(reason, str) else ""
        if not reason:
            continue
        numbers = entry.get("based_on")
        based_on: list[str] = []
        for number in numbers if isinstance(numbers, list) else []:
            if isinstance(number, int) and not isinstance(number, bool):
                if 1 <= number <= len(refs) and refs[number - 1].id not in based_on:
                    based_on.append(refs[number - 1].id)
        seen.add(index)
        candidate = shortlist[index]
        extras = _extras(candidate, today) if today else []
        found.append(
            Pick(
                candidate=candidate,
                reasons=(reason[:MAX_REASON], *extras),
                based_on=tuple(based_on),
                ranked_by="model",
            )
        )
    return found


def fallback(
    candidates: list[Candidate],
    profile: list[PickerItem],
    today: date,
) -> list[Pick]:
    """The deterministic top PICKS with template reasons, for when the model
    cannot answer: Discover never blocks on it."""
    weights = reference_weights(profile)
    refs = [item for item in profile if item.id in weights]
    table = attribute_table(profile, weights) if refs else {}
    found = []
    for candidate in candidates[:PICKS]:
        reasons, based_on = _taste_reasons(
            candidate.item, candidate.similar_to, refs, weights, table
        )
        reasons += _extras(candidate, today)
        if not reasons:
            reasons = ["Well rated on IGDB"]
        found.append(
            Pick(
                candidate=candidate,
                reasons=tuple(reasons[:3]),
                based_on=based_on,
                ranked_by="template",
            )
        )
    return found
