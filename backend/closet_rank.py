"""Today's outfit with a model: the prompt, the schema and the validation.

Pure: no FastAPI or database (tests/test_physical_imports.py holds it to
that). Discover's pattern (`discover.py`), applied to clothes:

- **Indices, never names.** Every candidate `closet.candidates` kept is
  numbered once across the slots; the model answers with those numbers,
  so it can never name a garment the owner does not have. A number out of
  range, a second piece for a slot already filled, or a piece for the
  fixed slot is dropped.
- **The lock and the transient garment are constraints**, not candidates:
  they are described to the model as already chosen, their slot is not
  offered, and `validate` puts them into every outfit whatever the answer
  says. The reason then opens with "You locked the …" (or "Built around
  the … from your photo"), however the model began it.
- **Not-this reasons** are fed back summarised: the five most recent, as
  labels with a count (`summarise_not_this`).
- **A partial answer tops up.** A slot the model left empty takes that
  slot's best candidate; fewer than three good outfits are filled from
  `closet.template`. No good outfit at all is the template plan with a
  note (`outcome`), so Today never blocks on the model.

Spec and plan: docs/planning/2026-11-09-outfit-design.md (PR C, task 13).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import date
from typing import Any

import closet
from closet import Candidates, Outfit, Piece, Request, WeatherRead

MAX_REASON = 300
NOT_THIS_RECENT = 5

# Thumbnails sent with the text (decision D9): the top of each slot's
# shortlist, and a total kept well under llm.MAX_REQUEST_BYTES (20 MB of
# base64) so the prompt and the answer have room.
IMAGES_PER_SLOT = 4
IMAGE_BUDGET_BYTES = 16 * 1024 * 1024

NOT_THIS = {
    "too_warm": "too warm",
    "too_cold": "too cold",
    "too_formal": "too formal",
    "too_casual": "too casual",
    "not_together": "not those together",
    "tired": "tired of it",
    "other": "something else",
}

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "outfits": {
            "type": "array",
            "maxItems": closet.OUTFITS,
            "items": {
                "type": "object",
                "properties": {
                    "indices": {"type": "array", "items": {"type": "integer"}},
                    "reason": {"type": "string"},
                },
                "required": ["indices", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["outfits"],
    "additionalProperties": False,
}

INSTRUCTIONS = """\
You are dressing one person for today from their own closet. Below are the
day's weather, the occasion, what they told you about their style, what
they turned down lately, and the garments that fit the day, numbered.

Choose up to three outfits, best first. Each outfit is one garment for
every slot listed under "Slots to fill", given as the garments' numbers;
use only numbers from the list, and never two for one slot. Think about
colour (with their colouring), proportion (with their build), the
occasion, and the swing between the cold morning and the warmer
afternoon. Prefer pieces that have rested; avoid repeating what was just
turned down.

For each outfit write a reason of at most two short sentences in the
second person, about why these pieces work together today. Do not list
the garments again and do not mention numbers.

When at least three tops are listed, give each outfit a different top.
"""


def numbered(found: Candidates) -> list[tuple[str, Piece]]:
    """Every candidate once, slot by slot: the list the indices point into."""
    fixed_slot = found.fixed.category if found.fixed else None
    return [
        (slot, scored.piece)
        for slot in found.slots
        if slot != fixed_slot
        for scored in found.by_slot.get(slot, [])
    ]


def summarise_not_this(reasons: Iterable[str | None]) -> str | None:
    """The five most recent Not-this reasons (newest first in `reasons`),
    as labels with a count: "too warm (2), tired of it"."""
    recent = [r for r in reasons if r in NOT_THIS][:NOT_THIS_RECENT]
    if not recent:
        return None
    counts = Counter(recent)
    return ", ".join(
        NOT_THIS[r] + (f" ({counts[r]})" if counts[r] > 1 else "")
        for r in dict.fromkeys(recent)
    )


TURNED_DOWN_CAP = 8
_TURNED_DOWN_WHY = {
    "not_today": "not today",
    "too_cold": "too cold",
    "too_warm": "too warm",
}


def turned_down_line(entries: Iterable[tuple[str, str, str | None]]) -> str | None:
    """The prompt's line for pieces the owner turned down (#551): entries
    are `(kind, name, occasion)`, newest first. One entry per piece, its kinds
    joined ("name (too warm, not today)"), at most `TURNED_DOWN_CAP` pieces
    for the day and, separately, as many for `never for <occasion>`. The
    pieces are already out of the candidate list; the line says why, so "too
    warm" steers the rest cooler."""
    today: dict[str, list[str]] = {}
    never: dict[str, list[str]] = {}
    for kind, name, occasion in entries:
        if kind in _TURNED_DOWN_WHY:
            why = today.setdefault(name, [])
            if _TURNED_DOWN_WHY[kind] not in why:
                why.append(_TURNED_DOWN_WHY[kind])
        elif kind == "never_for_occasion" and occasion:
            names = never.setdefault(occasion, [])
            if name not in names:
                names.append(name)
    parts = []
    if today:
        shown = list(today.items())[:TURNED_DOWN_CAP]
        parts.append(
            "Turned down for this day: "
            + ", ".join(f"{name} ({', '.join(why)})" for name, why in shown)
        )
    flat = [(o, n) for o, names in never.items() for n in names][:TURNED_DOWN_CAP]
    grouped: dict[str, list[str]] = {}
    for occasion, name in flat:
        grouped.setdefault(occasion, []).append(name)
    parts.extend(f"never for {o}: " + ", ".join(n) for o, n in grouped.items())
    return "; ".join(parts) + "." if parts else None


def _describe(piece: Piece, day: date) -> str:
    colour = piece.color_name or piece.primary_color
    look = ", ".join(part for part in (colour, piece.pattern, piece.material) if part)
    bits = [piece.subtype or "", look]
    if piece.warmth is not None:
        bits.append(f"warmth {piece.warmth}")
    if piece.formality is not None:
        bits.append(f"formality {piece.formality}")
    if piece.transient:
        bits.append("not owned yet")
    elif piece.last_worn is None:
        bits.append("never worn")
    else:
        days = (day - piece.last_worn).days
        bits.append(f"worn {piece.wears_30}× in 30 days, last {days} days ago")
    detail = "; ".join(bit for bit in bits if bit)
    return f"{piece.name} ({detail})" if detail else piece.name


def image_window(found: Candidates, per_slot: int = IMAGES_PER_SLOT) -> list[int]:
    """The numbers (`numbered` order) `image_picks` considers: the top
    `per_slot` of each slot's shortlist, with or without a photo. A photo
    missing, unreadable or cut by the byte budget leaves its number out of
    the picks, not out of the window."""
    taken: Counter[str] = Counter()
    window = []
    for index, (slot, _) in enumerate(numbered(found)):
        taken[slot] += 1
        if taken[slot] <= per_slot:
            window.append(index)
    return window


def image_picks(
    found: Candidates, with_image: Iterable[str], per_slot: int = IMAGES_PER_SLOT
) -> list[int]:
    """The numbers (`numbered` order) whose photos go with the prompt: the
    top `per_slot` of each slot's shortlist, those that have a photo. A piece
    outside the top, or without a photo, is ranked from its text."""
    have = set(with_image)
    taken: Counter[str] = Counter()
    picks = []
    for index, (slot, piece) in enumerate(numbered(found)):
        taken[slot] += 1
        if taken[slot] <= per_slot and piece.id in have:
            picks.append(index)
    return picks


def within_budget(
    picks: Sequence[int],
    sizes: dict[int, int],
    budget: int = IMAGE_BUDGET_BYTES,
) -> list[int]:
    """`picks` cut from the end until their base64 size (4 bytes per 3) fits."""
    kept = list(picks)
    while kept and sum(-(-sizes[i] * 4 // 3) for i in kept) > budget:
        kept.pop()
    return kept


def build_prompt(
    found: Candidates,
    request: Request,
    read: WeatherRead,
    sentence: str,
    profile: dict[str, Any],
    not_this: Sequence[str | None] = (),
    images: Sequence[int] = (),
    turned_down: Sequence[tuple[str, str, str | None]] = (),
) -> str:
    """The one prompt for one plan.

    `turned_down` is the per-piece feedback in force (`turned_down_line`).

    `images` are the garment numbers whose photos are sent, in the order
    they are sent: the garment's line ends "[image k]" and a closing line
    lists "image k is garment n", so a photo is always named with its piece."""
    occasion = request.occasion + (", riding a bike there" if request.bike else "")
    lines = [
        INSTRUCTIONS,
        "Weather: "
        + (
            f"morning low {read.low}°F, afternoon high {read.high}°F. {sentence}"
            if read.forecast
            else f"no forecast; a typical day is {read.low}°F to {read.high}°F."
        ),
        f"Occasion: {occasion}.",
    ]
    about = {
        "Style": profile.get("style_words"),
        "Avoid": profile.get("dislikes"),
        "Colouring": profile.get("coloring"),
        "Build and fit": profile.get("build_fit"),
    }
    for label, value in about.items():
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value if v)
        elif isinstance(value, dict):
            value = ", ".join(f"{k}: {v}" for k, v in value.items() if v)
        if value:
            lines.append(f"{label}: {value}")
    summary = summarise_not_this(not_this)
    if summary:
        lines.append(f"Turned down lately: {summary}.")
    if found.fixed is not None:
        how = "from a photo" if found.fixed.transient else "they chose it"
        lines.append(
            f"Already chosen for {found.fixed.category} ({how}): "
            f"{_describe(found.fixed, request.day)}. Build around it."
        )
    feedback = turned_down_line(turned_down)
    if feedback:
        lines.append(feedback)
    open_slots = [s for s in found.slots if s != (found.fixed and found.fixed.category)]
    lines.append("Slots to fill: " + ", ".join(open_slots) + ".")
    position = {index: k for k, index in enumerate(images, start=1)}
    if position:
        lines.append(
            "Photos of some garments are attached, in order: "
            + "; ".join(f"image {k} is garment {i}" for i, k in position.items())
            + ". A garment with no image is described by its text alone. "
            "Answer with garment numbers, never image numbers."
        )
    lines.append("Garments:")
    for index, (slot, piece) in enumerate(numbered(found)):
        line = f"{index}. {slot}: {_describe(piece, request.day)}"
        if index in position:
            line += f" [image {position[index]}]"
        lines.append(line)
    return "\n".join(lines)


def _reason(text: Any, fixed: Piece | None) -> str:
    reason = " ".join(text.split()) if isinstance(text, str) else ""
    if not reason:
        return ""
    opening = closet.fixed_reason(fixed)
    if opening and not reason.startswith(opening[:-1]):
        reason = f"{opening} {reason}"
    return reason[:MAX_REASON]


def validate(
    payload: Any,
    found: Candidates,
    recent: set[frozenset[str]] = frozenset(),
) -> list[Outfit]:
    """The model's outfits that hold up, in its order.

    An outfit needs a reason and at least one number in range; foreign
    numbers and a second piece for a slot are dropped, an empty slot takes
    its best candidate, the fixed piece is always in, and an outfit worn
    within the repeat window, or given twice, is dropped; so is one whose
    top an earlier outfit already wears, while the top pool has at least
    `OUTFITS` pieces."""
    entries = payload.get("outfits") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        return []
    listed = numbered(found)
    outfits: list[Outfit] = []
    seen: set[frozenset[str]] = set()
    # A top repeats only when the pool is too small to give each outfit one.
    distinct = closet.top_pool(found) >= closet.OUTFITS
    tops: set[str] = set()
    for entry in entries:
        if len(outfits) == closet.OUTFITS:
            break
        if not isinstance(entry, dict):
            continue
        reason = _reason(entry.get("reason"), found.fixed)
        indices = entry.get("indices")
        if not reason or not isinstance(indices, list):
            continue
        chosen: dict[str, Piece] = {}
        for index in indices:
            if isinstance(index, bool) or not isinstance(index, int):
                continue
            if 0 <= index < len(listed):
                slot, piece = listed[index]
                chosen.setdefault(slot, piece)
        if not chosen:
            continue
        for slot in found.slots:
            if slot not in chosen and found.by_slot.get(slot):
                chosen[slot] = found.by_slot[slot][0].piece
        outfit = closet.assemble(chosen, found, reason, "model")
        if outfit.key in seen or outfit.key in recent:
            continue
        top = dict(outfit.pieces).get("top")
        if distinct and top is not None:
            if top.id in tops:
                continue
            tops.add(top.id)
        seen.add(outfit.key)
        outfits.append(outfit)
    return outfits


def top_up(
    outfits: list[Outfit],
    found: Candidates,
    recent: set[frozenset[str]] = frozenset(),
) -> list[Outfit]:
    """The model's outfits, filled to three from the template's."""
    keys = {outfit.key for outfit in outfits}
    filled = list(outfits)
    distinct = closet.top_pool(found) >= closet.OUTFITS
    tops = {p.id for o in outfits for slot, p in o.pieces if slot == "top"}
    for outfit in closet.template(found, recent, count=closet.OUTFITS * 2):
        if len(filled) >= closet.OUTFITS:
            break
        top = dict(outfit.pieces).get("top")
        if outfit.key in keys or (distinct and top is not None and top.id in tops):
            continue
        keys.add(outfit.key)
        if top is not None:
            tops.add(top.id)
        filled.append(outfit)
    return filled


def outcome(
    payload: Any,
    note: str | None,
    found: Candidates,
    recent: set[frozenset[str]] = frozenset(),
) -> tuple[list[Outfit], str | None]:
    """The plan's outfits and its `model_note` from one model call's result:
    `payload` None means the call failed and `note` says why (the route's
    `rank()`, which never raises)."""
    if payload is None:
        return closet.template(found, recent), note
    outfits = validate(payload, found, recent)
    kept = len(outfits)
    if not kept:
        return closet.template(found, recent), "The model's outfits did not hold up"
    outfits = top_up(outfits, found, recent)
    if len(outfits) > kept:
        note = f"it chose {kept}; the template filled the rest"
    return outfits, note
