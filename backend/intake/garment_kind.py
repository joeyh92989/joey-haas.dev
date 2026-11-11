"""The closet's one kind: a garment.

A garment has no source to match against, and its photo is the garment's
own picture, so there is no details step: the tag queue reads it later.
"""

from __future__ import annotations

from typing import Any

from closet_routes import GarmentFields
from intake.kinds import FieldSpec, Kind, register, select
from models import GarmentCategory, IntakeArea

GARMENT_KEYS = frozenset(GarmentFields.model_fields)
LEVELS = select(range(1, 6))


def to_row(entry: dict[str, Any]) -> dict[str, Any]:
    """The payload's garment fields; anything else is dropped."""
    payload = entry.get("payload") or {}
    return {key: value for key, value in payload.items() if key in GARMENT_KEYS}


register(
    Kind(
        key="garment",
        area=IntakeArea.CLOSET,
        label="Garment",
        ways_in=("photo", "type"),
        source=None,
        has_details=False,
        fields=(
            FieldSpec("name", "Name", "text"),
            FieldSpec("category", "Category", "select", select(GarmentCategory)),
            FieldSpec("primary_color", "Colour", "text"),
            FieldSpec("material", "Material", "text"),
            FieldSpec("warmth", "Warmth", "select", LEVELS),
            FieldSpec("formality", "Formality", "select", LEVELS),
        ),
        to_row=to_row,
    )
)
