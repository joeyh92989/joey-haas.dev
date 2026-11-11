"""The kind registry: what intake can take in, and how (spec D11).

A kind is data. It names its area, the ways in it offers (photo, search,
type), the metadata source it resolves against, the fields its rows carry
and how an entry becomes a row to write. Registering a kind is all a new
one needs: `GET /api/intake/kinds` serves the registry as it stands, and
`kind` is text in the database, so no migration follows.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from models import IntakeArea, ItemType


@dataclass(frozen=True)
class FieldSpec:
    """One field a kind's entries carry, as the review screen draws it.

    `control` is "select", "text", "number" or "date". `per_item` marks a
    field that differs for every entry of a sitting (a comic's issues), so
    the page never offers to apply it to all of them.
    """

    key: str
    label: str
    control: str
    options: tuple[str, ...] = ()
    per_item: bool = False
    required: bool = False


@dataclass(frozen=True)
class Kind:
    """One kind of thing intake takes in. `to_row` turns an entry
    (`{"chosen": ..., "payload": ...}`) into the fields of the row it writes."""

    key: str
    area: IntakeArea
    label: str
    ways_in: tuple[str, ...]
    source: ItemType | None
    has_details: bool
    fields: tuple[FieldSpec, ...]
    to_row: Callable[[dict[str, Any]], dict[str, Any]]


REGISTRY: dict[str, Kind] = {}


def register(kind: Kind) -> Kind:
    """Adds `kind`, replacing one registered under the same key."""
    REGISTRY[kind.key] = kind
    return kind


def kinds_for(area: IntakeArea) -> list[Kind]:
    """The registered kinds of one area, in registration order."""
    return [kind for kind in REGISTRY.values() if kind.area == area]


def select(options: Iterable[Any]) -> tuple[str, ...]:
    """Option values for a select field, as strings."""
    return tuple(str(getattr(option, "value", option)) for option in options)


def _source_state(kind: Kind, registry: dict) -> str | None:
    if kind.source is None:
        return None
    adapter = registry.get(kind.source)
    if adapter is not None and adapter.configured():
        return "ready"
    if kind.source == ItemType.BOARDGAME:
        from sources.bgg import UNAVAILABLE

        return f"BGG unavailable: {UNAVAILABLE}"
    return f"{kind.source.value} source is not configured"


def describe(kind: Kind, registry: dict) -> dict[str, Any]:
    """The kind as `GET /api/intake/kinds` serves it.

    `source_state` is None for a kind with no source, "ready" when its
    source is configured, and otherwise the reason it is not.
    """
    return {
        "key": kind.key,
        "area": kind.area.value,
        "label": kind.label,
        "ways_in": list(kind.ways_in),
        "has_details": kind.has_details,
        "fields": [
            {
                "key": field.key,
                "label": field.label,
                "control": field.control,
                "options": list(field.options),
                "per_item": field.per_item,
                "required": field.required,
            }
            for field in kind.fields
        ],
        "source_state": _source_state(kind, registry),
    }
