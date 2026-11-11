"""The shelf's built-in kinds: game, movie, comic and board game.

Each writes an ordinary `items` row through the same path as `/bulk`
(intake/commit.py): the chosen match's metadata, the entry's own fields,
the item type, and a physical copy.
"""

from __future__ import annotations

from typing import Any

from formats import FORMAT_LABELS
from intake.kinds import FieldSpec, Kind, register, select
from items import ItemIn
from models import (
    ComicShelfFormat,
    IntakeArea,
    ItemStatus,
    MovieDiscFormat,
    OwnedFormat,
)
from models import ItemType as T
from sources.igdb import PLATFORM_NAMES

# What a chosen match carries onto the row.
CHOSEN_FIELDS = (
    "title",
    "external_source",
    "external_id",
    "year",
    "cover_url",
    "creator",
)
ITEM_FIELDS = frozenset(ItemIn.model_fields)

STATUS = FieldSpec("status", "Status", "select", select(ItemStatus))
ACQUIRED = FieldSpec("acquired_at", "Acquired", "date")

GAME_FIELDS = (
    FieldSpec("platform_id", "Platform", "select", select(PLATFORM_NAMES)),
    FieldSpec("physical_format", "Format", "select", select(FORMAT_LABELS)),
)
MOVIE_FIELDS = (FieldSpec("disc_format", "Disc", "select", select(MovieDiscFormat)),)
COMIC_FIELDS = (
    FieldSpec("issues_owned", "Issues owned", "text", per_item=True),
    FieldSpec("shelf_format", "Shelf format", "select", select(ComicShelfFormat)),
)


def _shelf_row(item_type: T):
    def to_row(entry: dict[str, Any]) -> dict[str, Any]:
        chosen = entry.get("chosen") or {}
        row = {key: chosen[key] for key in CHOSEN_FIELDS if key in chosen}
        payload = entry.get("payload") or {}
        row.update({k: v for k, v in payload.items() if k in ITEM_FIELDS})
        row["type"] = item_type
        row["owned_format"] = OwnedFormat.PHYSICAL.value
        return row

    return to_row


def _shelf_kind(key, label, item_type, fields, ways_in=("photo", "search", "type")):
    return register(
        Kind(
            key=key,
            area=IntakeArea.SHELF,
            label=label,
            ways_in=ways_in,
            source=item_type,
            has_details=True,
            fields=(*fields, STATUS, ACQUIRED),
            to_row=_shelf_row(item_type),
        )
    )


_shelf_kind("game", "Game", T.GAME, GAME_FIELDS)
_shelf_kind("movie", "Movie", T.MOVIE, MOVIE_FIELDS)
_shelf_kind("comic", "Comic", T.COMIC, COMIC_FIELDS)
# BGG answers nothing without a token, so board games are typed for now.
_shelf_kind("boardgame", "Board game", T.BOARDGAME, (), ways_in=("type",))
