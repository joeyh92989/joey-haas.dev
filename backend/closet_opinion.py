"""Review's second pass: the model's opinion on what is already flagged.

Pure: no FastAPI or database (tests/test_physical_imports.py holds it to
that). The Sunday job (`POST /api/closet/jobs/opinion`,
`closet_review_routes.py`) builds the deck with `closet.deck`, sends it here
as one prompt, and stores what `validate` keeps under the batch date.

- **Only flagged pieces.** The prompt numbers the deck's cards and the model
  answers with those numbers, so an opinion can only attach to a piece the
  data already flagged; a number out of range is dropped, and a repeated
  number keeps its first entry.
  An opinion is never a flag: a piece with an opinion and no flag is not in
  the deck, so the opinion is never shown.
- **Labelled, last and short.** The deck shows it after the data flags as
  "Opinion: …"; a model that opens with "Opinion:" has it stripped, so the
  label is never doubled. At most `MAX_OPINION` characters.
- **Any failure stores nothing**: the route keeps the last good batch and
  writes the reason to `opinion.last_run`; the deck is the data either way.
  A valid answer with no opinions is not a failure: it stores an empty
  batch.

Spec and plan: docs/planning/2026-11-09-outfit-design.md (PR D, task 19).
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Sequence
from datetime import date
from typing import Any

from closet import Flagged

MAX_OPINION = 200

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "opinions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "opinion": {"type": "string"},
                },
                "required": ["index", "opinion"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["opinions"],
    "additionalProperties": False,
}

INSTRUCTIONS = """\
You are helping one person decide what to stop keeping in their closet.
Below is a summary of the closet and how they dress, then the pieces the
data has already flagged, numbered, each with the reasons it was flagged.

For any flagged piece where you have a view, say in one short sentence
whether it still fits how they dress, and why: style, colour with their
colouring, how it sits beside what they actually wear. Skip a piece when
you have nothing to add to the data. Answer with the piece's number; use
only numbers from the list. Write in the second person, do not repeat the
data's reasons, and do not tell them what to do with it.
"""

_LABEL = re.compile(r"^\s*opinion\s*[:\-–—]\s*", re.IGNORECASE)


def build_prompt(
    cards: Sequence[Flagged],
    profile: dict[str, Any],
    active: Sequence[tuple[str, int]] = (),
) -> str:
    """The one prompt for one batch. `active` is every active garment as
    (category, wears in twelve months), summarised by category."""
    lines = [INSTRUCTIONS]
    for label, key in (
        ("Style", "style_words"),
        ("Avoid", "dislikes"),
        ("Colouring", "coloring"),
        ("Build and fit", "build_fit"),
    ):
        value = profile.get(key)
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value if v)
        elif isinstance(value, dict):
            value = ", ".join(f"{k}: {v}" for k, v in value.items() if v)
        if value:
            lines.append(f"{label}: {value}")
    if active:
        counts = Counter(category for category, _ in active)
        wears = Counter()
        for category, worn in active:
            wears[category] += worn
        lines.append(
            "Closet: "
            + "; ".join(
                f"{counts[c]} {c} worn {wears[c]} times in a year"
                for c in sorted(counts)
            )
            + "."
        )
    lines.append("Flagged pieces:")
    for index, card in enumerate(cards):
        held = card.held
        look = ", ".join(
            part
            for part in (
                held.category,
                held.primary_color,
                f"formality {held.formality}" if held.formality else None,
                f"worn {held.wears_12mo} times in a year",
            )
            if part
        )
        reasons = " ".join(flag.sentence for flag in card.flags)
        lines.append(f"{index}. {held.name} ({look}). {reasons}")
    return "\n".join(lines)


def _text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    text = _LABEL.sub("", " ".join(value.split()))
    if len(text) > MAX_OPINION:
        text = text[: MAX_OPINION - 1].rstrip() + "…"
    return text


def validate(payload: Any, cards: Sequence[Flagged]) -> dict[str, str]:
    """The opinions that hold up, by garment id: a number in range, with
    some text. A repeated number keeps its first entry."""
    entries = payload.get("opinions") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        return {}
    kept: dict[str, str] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        index = entry.get("index")
        if isinstance(index, bool) or not isinstance(index, int):
            continue
        if not 0 <= index < len(cards):
            continue
        garment = cards[index].held.id
        text = _text(entry.get("opinion"))
        if text and garment not in kept:
            kept[garment] = text
    return kept


def batch(opinions: dict[str, str], on: date) -> dict[str, Any]:
    """The stored shape, under `closet_settings` key `opinion.batch`."""
    return {"batch_on": on.isoformat(), "opinions": opinions}
