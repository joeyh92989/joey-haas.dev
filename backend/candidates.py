"""The spot finder's scoring: which found places to queue, and how they fit.

The `discover.py` pattern. A server-built list is sent in **one** model
call. The model answers with **indices** into that list, so it can never
add a place of its own, and `validate` keeps only the answers that hold
up. When the model cannot answer at all, `fallback` still fills the
queue: `fit` stays null, the reason reads "not scored", and the tags come
from the place's category. The finder never blocks on the model.

The shortlist is the cap on the queue. OSM returns restaurants far more
than anything else (104 of 136 places in the recorded answer), so the
shortlist takes categories in turn rather than top-down, and a week's
queue is not all restaurants.

Pure: no FastAPI, no SQLAlchemy (tests/test_physical_imports.py). Spec and
plan: docs/planning/2026-11-08-denver-spots-design.md.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from spot_sources.overpass import CandidateRow
from spots import TAGS, distance_line

MAX_QUEUE = 40
MAX_REASON = 300
PROFILE_SIZE = 30

# The tags a category suggests before anyone has scored it: the fallback's
# answer, and the pre-score's guess at what the owner would tag it.
CATEGORY_TAGS: dict[str, tuple[str, ...]] = {
    "cafe": ("coffee", "rainy-day"),
    "restaurant": ("food",),
    "park": ("park", "kid-ok"),
    "playground": ("park", "kid-ok"),
    "library": ("rainy-day", "kid-ok"),
    "museum": ("rainy-day", "kid-ok"),
    "attraction": (),
}

# Pre-score: up to AFFINITY points for tags the owner already uses, less
# DISTANCE_PENALTY a mile from the nearest anchor. Only the shortlist reads
# it; the queue is ordered by the model's fit.
AFFINITY = 60.0
DISTANCE_PENALTY = 8.0
NOT_SCORED = "not scored"

SCORES_SCHEMA = {
    "type": "object",
    "properties": {
        "scores": {
            "type": "array",
            "maxItems": MAX_QUEUE,
            "items": {
                "type": "object",
                "properties": {
                    "index": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": MAX_QUEUE - 1,
                    },
                    "fit": {"type": "integer", "minimum": 0, "maximum": 100},
                    "reason": {"type": "string"},
                    "tags": {
                        "type": "array",
                        "items": {"type": "string", "enum": list(TAGS)},
                    },
                },
                "required": ["index", "fit", "reason", "tags"],
            },
        }
    },
    "required": ["scores"],
}

INSTRUCTIONS = (
    "You help one Denver parent find places to go: coffee, parks, food, "
    "rainy-day indoor spots, somewhere a small child is welcome, somewhere "
    "to reach by bike. Below are spots they already go to, with their tags, "
    "then a numbered list of places nearby they have not added. Score every "
    "place from 0 to 100 for how well it fits what they already like. For "
    "each give its index, the fit, one or two plain sentences saying why "
    "(name the tags that match), and the tags that would apply, chosen only "
    "from the allowed list. Only use indices from the list; never mention a "
    "place that is not in either list. No marketing language."
)


@dataclass(frozen=True)
class ProfileSpot:
    """One of the owner's spots, as the prompt and the pre-score read it."""

    name: str
    tags: tuple[str, ...]
    visits: int = 0


@dataclass(frozen=True)
class Queued:
    """A found place, its nearest anchor and its pre-score."""

    row: CandidateRow
    miles: float | None
    anchor_name: str | None
    suggested: tuple[str, ...]
    prescore: float

    @property
    def distance(self) -> str | None:
        if self.miles is None or self.anchor_name is None:
            return None
        return distance_line(self.miles, self.anchor_name)


@dataclass(frozen=True)
class Score:
    fit: int | None
    reason: str
    tags: tuple[str, ...]


@dataclass(frozen=True)
class Scored:
    queued: Queued
    score: Score


def suggest_tags(row: CandidateRow) -> tuple[str, ...]:
    return CATEGORY_TAGS.get(row.category, ())


def tag_weights(profile: Iterable[ProfileSpot]) -> dict[str, float]:
    """How much the owner uses each tag, 0 to 1: a spot counts once plus
    once per visit, so a tag on a place they keep going back to counts most."""
    counts: Counter[str] = Counter()
    for spot in profile:
        for tag in spot.tags:
            counts[tag] += 1 + spot.visits
    top = max(counts.values(), default=0)
    return {tag: count / top for tag, count in counts.items()} if top else {}


def prescore(
    suggested: Iterable[str], miles: float | None, weights: Mapping[str, float]
) -> float:
    tags = list(suggested)
    affinity = sum(weights.get(tag, 0.0) for tag in tags) / len(tags) if tags else 0
    distance = (miles or 0.0) * DISTANCE_PENALTY
    return round(AFFINITY * affinity - distance, 3)


def queue(
    row: CandidateRow,
    miles: float | None,
    anchor_name: str | None,
    weights: Mapping[str, float],
) -> Queued:
    suggested = suggest_tags(row)
    return Queued(
        row=row,
        miles=miles,
        anchor_name=anchor_name,
        suggested=suggested,
        prescore=prescore(suggested, miles, weights),
    )


def shortlist(found: Iterable[Queued], limit: int = MAX_QUEUE) -> list[Queued]:
    """Up to `limit` places, one category at a time.

    Each category is ranked by pre-score (name breaks ties, so a run is
    repeatable), and the categories take turns, best first, until the cap.
    """
    groups: dict[str, list[Queued]] = defaultdict(list)
    for item in found:
        groups[item.row.category].append(item)
    for items in groups.values():
        items.sort(key=lambda item: (-item.prescore, item.row.name, item.row.source_id))
    order = sorted(groups, key=lambda key: (-groups[key][0].prescore, key))
    picked: list[Queued] = []
    depth = 0
    while len(picked) < limit and any(depth < len(groups[k]) for k in order):
        for key in order:
            if depth < len(groups[key]) and len(picked) < limit:
                picked.append(groups[key][depth])
        depth += 1
    return picked


def references(profile: Iterable[ProfileSpot]) -> list[ProfileSpot]:
    """The spots the prompt names: the most visited first, at most
    PROFILE_SIZE, so a long list costs a bounded prompt."""
    ranked = sorted(profile, key=lambda spot: (-spot.visits, spot.name))
    return [spot for spot in ranked if spot.tags][:PROFILE_SIZE]


def build_prompt(shortlisted: list[Queued], profile: Iterable[ProfileSpot]) -> str:
    """The one prompt: the owner's spots, the allowed tags, and the places
    by index. No other place appears."""
    lines = [INSTRUCTIONS, "", f"Allowed tags: {', '.join(TAGS)}", ""]
    refs = references(profile)
    if refs:
        lines.append("Spots they go to:")
        for spot in refs:
            visits = f", {spot.visits} visits" if spot.visits else ""
            lines.append(f"- {spot.name} ({', '.join(spot.tags)}{visits})")
    else:
        lines.append("They have not tagged any spots yet.")
    lines += ["", "Places nearby:"]
    for index, item in enumerate(shortlisted):
        kind = item.row.category.replace("_", " ")
        detail = f", {item.row.detail}" if item.row.detail else ""
        where = f" · {item.distance}" if item.distance else ""
        lines.append(f"[{index}] {item.row.name} — {kind}{detail}{where}")
    return "\n".join(lines)


def _int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def validate(payload: object, shortlisted: list[Queued]) -> dict[int, Score]:
    """The model's scores that hold up, by index; the rest are dropped.

    A score needs an index in range and not seen before, a fit from 0 to
    100, and a reason. Tags outside the vocabulary are dropped; a score
    left with none takes the category's suggestion.
    """
    entries = payload.get("scores") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        return {}
    found: dict[int, Score] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        index, fit = _int(entry.get("index")), _int(entry.get("fit"))
        if index is None or not 0 <= index < len(shortlisted) or index in found:
            continue
        if fit is None or not 0 <= fit <= 100:
            continue
        reason = entry.get("reason")
        reason = " ".join(reason.split()) if isinstance(reason, str) else ""
        if not reason:
            continue
        raw = entry.get("tags")
        wanted = (
            {tag for tag in raw if isinstance(tag, str)}
            if isinstance(raw, list)
            else set()
        )
        tags = tuple(tag for tag in TAGS if tag in wanted)
        found[index] = Score(
            fit=fit,
            reason=reason[:MAX_REASON],
            tags=tags or shortlisted[index].suggested,
        )
    return found


def fallback(item: Queued) -> Score:
    return Score(fit=None, reason=NOT_SCORED, tags=item.suggested)


def merge(shortlisted: list[Queued], scores: Mapping[int, Score]) -> list[Scored]:
    """Every shortlisted place with its score: the model's where it gave a
    valid one, the fallback's otherwise, so a partial answer still queues
    everything."""
    return [
        Scored(item, scores.get(index) or fallback(item))
        for index, item in enumerate(shortlisted)
    ]
