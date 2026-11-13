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
# A comic's issues come from each book's own number at Check, so the Details
# step does not ask for them (`in_details=False`); the add bar still types them.
COMIC_FIELDS = (
    FieldSpec("issues_owned", "Issues owned", "text", per_item=True, in_details=False),
    FieldSpec("shelf_format", "Shelf format", "select", select(ComicShelfFormat)),
)

EDITION_SHELF_FORMAT = {
    "trade": ComicShelfFormat.TRADES,
    "hardcover": ComicShelfFormat.TRADES,
    "omnibus": ComicShelfFormat.OMNIBUS,
}


def _book_row(payload: dict[str, Any]) -> dict[str, Any]:
    """The row fields a comic book's own payload brings (intake/reader.py):
    a single issue's number as `issues_owned`; a collected edition as a
    shelf format and, when its range was read or typed, an `editions` row.
    A payload with `issues_owned` already (typed in the add bar) keeps it."""
    if payload.get("format") == "collected":
        kind = payload.get("edition_kind") or "trade"
        row: dict[str, Any] = {
            "shelf_format": EDITION_SHELF_FORMAT.get(
                kind, ComicShelfFormat.TRADES
            ).value
        }
        low, high = payload.get("collects_from"), payload.get("collects_to")
        if low is not None and high is not None:
            title = (payload.get("detected_title") or "").strip() or kind.title()
            row["editions"] = [
                {"kind": kind.title(), "label": title[:80], "from": low, "to": high}
            ]
        return row
    number = payload.get("issue_number")
    if number is not None and not payload.get("issues_owned"):
        return {"issues_owned": str(number)}
    return {}


def _shelf_row(item_type: T):
    def to_row(entry: dict[str, Any]) -> dict[str, Any]:
        chosen = dict(entry.get("chosen") or {})
        # The reader stores the importer's candidate, whose cover is
        # `thumbnail_url`; a search pick may already say `cover_url`.
        if chosen.get("cover_url") is None and chosen.get("thumbnail_url"):
            chosen["cover_url"] = chosen["thumbnail_url"]
        row = {key: chosen[key] for key in CHOSEN_FIELDS if key in chosen}
        payload = entry.get("payload") or {}
        row.update({k: v for k, v in payload.items() if k in ITEM_FIELDS})
        if item_type is T.COMIC:
            row.update(_book_row(payload))
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
