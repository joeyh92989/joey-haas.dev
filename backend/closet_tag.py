"""Garment tagging: the prompt, the schema and the answer's validation.

Pure: no FastAPI or database. The routes (`closet_routes.py`) own the
queue, the budget and the writes; this module owns what one model call
says and whether its answer can be used.

- **Many garments per call.** Up to `BATCH_SIZE` thumbnails go in one
  request, numbered in order; at ~400px each that is a small fraction of
  `llm.py`'s 20 MB inline ceiling. Three hundred garments is thirty calls.
- **Indices, checked whole.** The answer is `{items: [{index, attributes}]}`.
  A batch whose indices are not exactly `0..n-1` (a gap, a repeat, one too
  many) is rejected whole, so a dropped image can never shift every later
  answer onto the wrong garment. A rejected batch's garments stay queued
  and the route counts the failure against each (three strikes and out).
- **No candidate list.** The model describes what it sees, as the importer
  does; it is not offered the owner's closet or profile.
- **Every value is checked again here.** The schema is enforced
  provider-side, but a hex that is not a hex, a warmth of 7 or a month of
  13 is dropped to null rather than written; a missing or unknown category
  rejects the batch, because a garment without its slot cannot be planned.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

BATCH_SIZE = 10
MAX_ATTEMPTS = 3
CATEGORIES = ("outer", "mid", "top", "bottom", "shoes", "accessory")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

# Column widths in `garments` (migration 0014): a longer answer is cut.
TEXT_LIMITS = {
    "name": 120,
    "subtype": 60,
    "brand": 80,
    "primary_color": 40,
    "secondary_color": 40,
    "pattern": 40,
    "material": 60,
}

ATTRIBUTES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "category": {"type": "string", "enum": list(CATEGORIES)},
        "subtype": {"type": "string"},
        "brand": {"type": "string"},
        "primary_color": {"type": "string"},
        "primary_hex": {"type": "string"},
        "secondary_color": {"type": "string"},
        "secondary_hex": {"type": "string"},
        "pattern": {"type": "string"},
        "material": {"type": "string"},
        "warmth": {"type": "integer", "minimum": 1, "maximum": 5},
        "formality": {"type": "integer", "minimum": 1, "maximum": 5},
        "seasons": {
            "type": "array",
            "items": {"type": "integer", "minimum": 1, "maximum": 12},
        },
    },
    "required": ["name", "category", "primary_color", "warmth", "formality"],
    "additionalProperties": False,
}

TAG_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "maxItems": BATCH_SIZE,
            "items": {
                "type": "object",
                "properties": {
                    "index": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": BATCH_SIZE - 1,
                    },
                    "attributes": ATTRIBUTES_SCHEMA,
                },
                "required": ["index", "attributes"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

INSTRUCTIONS = """\
Each photograph shows one piece of clothing, shoes or an accessory from one
person's wardrobe, numbered in the order given, starting at 0. Describe
every photograph, one entry each, with its index.

For each give:
- name: a short plain name a person would use ("navy oxford shirt",
  "brown suede chukkas"), lower case, no brand.
- category, exactly one of: outer (coats, jackets, shells), mid (sweaters,
  cardigans, overshirts, fleeces worn over a top), top (t-shirts, shirts,
  polos), bottom (trousers, jeans, shorts), shoes, accessory (hats, belts,
  scarves, bags).
- subtype: one or two words ("tee", "oxford", "chinos", "sneaker", "boot").
- brand, only when a label or logo is legible; otherwise leave it out.
- primary_color and secondary_color as plain colour names, with
  primary_hex and secondary_hex as "#rrggbb" for each; leave the secondary
  out for a single colour.
- pattern ("solid", "stripe", "check", "print"...) and material when it can
  be told from the photo ("cotton", "wool", "denim", "leather").
- warmth from 1 (a linen tee) to 5 (a down parka).
- formality from 1 (lounge) to 5 (business).
- seasons: the months, 1 to 12, someone in Denver would wear it.

Describe only what is in the photographs. Never invent a garment, never
skip one, and never use an index that was not given.
"""


class TagBatchError(ValueError):
    """An answer that cannot be used; the whole batch stays queued."""


@dataclass(frozen=True)
class Tagged:
    """One garment's attributes, in the batch's order, ready to write."""

    attributes: dict[str, Any]


def build_prompt(count: int) -> str:
    """The instructions with the number of photographs this call carries."""
    if count < 1 or count > BATCH_SIZE:
        raise ValueError(f"a batch is 1 to {BATCH_SIZE} photographs")
    last = count - 1
    return (
        f"{INSTRUCTIONS}\nThere are {count} photographs, indices 0 to {last}."
        if count > 1
        else f"{INSTRUCTIONS}\nThere is 1 photograph, index 0."
    )


def _text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned[:limit] or None


def _hex(value: Any) -> str | None:
    if isinstance(value, str) and HEX.match(value.strip()):
        return value.strip().lower()
    return None


def _scale(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if 1 <= value <= 5 else None


def _seasons(value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    return sorted(
        {
            month
            for month in value
            if isinstance(month, int)
            and not isinstance(month, bool)
            and 1 <= month <= 12
        }
    )


def clean_attributes(raw: Any) -> dict[str, Any]:
    """One answer's attributes as garment columns; raises on no category."""
    if not isinstance(raw, dict):
        raise TagBatchError("an entry had no attributes")
    category = raw.get("category")
    if category not in CATEGORIES:
        raise TagBatchError(f"an entry had no usable category ({category!r})")
    attributes: dict[str, Any] = {
        name: _text(raw.get(name), limit) for name, limit in TEXT_LIMITS.items()
    }
    attributes["category"] = category
    attributes["primary_hex"] = _hex(raw.get("primary_hex"))
    attributes["secondary_hex"] = _hex(raw.get("secondary_hex"))
    attributes["warmth"] = _scale(raw.get("warmth"))
    attributes["formality"] = _scale(raw.get("formality"))
    attributes["seasons"] = _seasons(raw.get("seasons"))
    return attributes


def validate(payload: Any, count: int) -> list[Tagged]:
    """The answer as one `Tagged` per photograph, in order.

    Raises `TagBatchError` unless the indices are exactly `0..count-1`."""
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise TagBatchError("the answer had no items")
    indices = [item.get("index") if isinstance(item, dict) else None for item in items]
    if sorted(i for i in indices if isinstance(i, int)) != list(range(count)) or (
        len(indices) != count
    ):
        raise TagBatchError(
            f"the answer's indices were {indices}, not 0 to {count - 1}"
        )
    by_index = {item["index"]: item for item in items}
    return [
        Tagged(clean_attributes(by_index[index].get("attributes")))
        for index in range(count)
    ]
