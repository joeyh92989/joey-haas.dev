"""A comic entry's book fields: the issue number's mark and the rules for
editing them (5a of the comics item).

Pure, no database: `entry_json` and `patch_entry` call it.

The mark under the number field is decided here, never by the model. The
model only says whether it read a number off the cover; whether the number
is plausible is measured against the matched series' run, so a bagged
book's banner ("Zorro #0") cannot pass as a read it was not.
"""

from __future__ import annotations

from typing import Any

from comics import (
    EDITION_KIND_MAX,
    EDITION_LABEL_MAX,
    MAX_EDITIONS,
    MAX_ISSUE,
    RangeError,
    parse_ranges,
)
from importer import COMIC_EDITION_KINDS, MAX_REPRINT_NOTE

FORMATS = ("single", "collected", "unknown")
# The five kinds of volume (`comic_volumes.kind`).
EDITION_KINDS = COMIC_EDITION_KINDS
SOURCES = ("read", "typed", "none")

NUMBER_STATES = ("in_run", "out_of_run", "read", "typed", "none")


class BookEditError(ValueError):
    """An edit the entry refuses; the message is shown beside the field."""

    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.field = field


def _count(value: Any) -> int:
    return (
        value
        if isinstance(value, int) and not isinstance(value, bool) and value > 0
        else 0
    )


def run_size(
    chosen: dict[str, Any] | None, on_shelf: dict[str, Any] | None
) -> int | None:
    """How many issues the matched volume is known to have: the most any
    source says. Comic Vine's count on the candidate can be stale, so the
    series on the shelf counts too (its synced issue rows, its released
    count, and the highest issue already owned): a real issue is never
    marked out of the run because one count lags. None when nothing says."""
    shelf = on_shelf or {}
    owned = 0
    try:
        ranges = parse_ranges(shelf.get("owned_text"))
        owned = max((high for _, high in ranges), default=0)
    except RangeError:
        pass
    known = max(
        _count((chosen or {}).get("issue_count")),
        _count(shelf.get("issue_max")),
        _count(shelf.get("released")),
        owned,
    )
    return known or None


def number_check(
    payload: dict[str, Any] | None,
    chosen: dict[str, Any] | None,
    on_shelf: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The mark under an entry's number: `{"state", "run"}`.

    - `none`: no number.
    - `typed`: the owner typed it; it stands.
    - `in_run` / `out_of_run`: read from the cover, and within or beyond the
      matched volume's issues (`run` is that count).
    - `read`: read from the cover, but nothing says how long the run is.
    """
    payload = payload or {}
    number = payload.get("issue_number")
    run = run_size(chosen, on_shelf)
    if number is None:
        return {"state": "none", "run": run}
    if payload.get("number_source") == "typed":
        return {"state": "typed", "run": run}
    if run is None:
        return {"state": "read", "run": None}
    return {"state": "in_run" if number <= run else "out_of_run", "run": run}


def _whole(value: Any, field: str, label: str) -> int | None:
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None  # blank clears
        # ASCII digits only ("²" is a digit to str.isdigit but not to int),
        # and short enough that int() cannot refuse it.
        if value.isascii() and value.isdecimal() and len(value) <= 6:
            value = int(value)
        elif value.isascii() and value.isdecimal():
            raise BookEditError(f"{label} runs from 1 to {MAX_ISSUE}.", field)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise BookEditError(f"{label} is a whole number from 1 to {MAX_ISSUE}.", field)
    if not 1 <= value <= MAX_ISSUE:
        raise BookEditError(f"{label} runs from 1 to {MAX_ISSUE}.", field)
    return value


LEGACY_EDITIONS = (
    "Collected books are sent as `books`, not `editions`: intake writes them "
    "as volumes, never as items.editions"
)


def refuse_legacy_editions(payload: Any) -> Any:
    """Raises ValueError when a payload carries a non-empty `editions` (the
    retired key, see `typed_books`); the payload is returned otherwise. Used
    by the request schemas, so the refusal is a 422."""
    if isinstance(payload, dict) and payload.get("editions"):
        raise ValueError(LEGACY_EDITIONS)
    return payload


def legacy_editions_to_books(payload: Any) -> Any:
    """For PATCH only: a payload stored before `books` existed carries
    `editions`, and Check re-sends the whole stored payload on every edit, so
    refusing it there would lose the edit. A non-empty `editions` becomes
    `books` (same shape) and is dropped; when `books` is present it wins and
    `editions` is just dropped. POST create and /add keep the 422
    (`refuse_legacy_editions`): nothing legitimately sends it there."""
    if not isinstance(payload, dict) or "editions" not in payload:
        return payload
    rest = {k: v for k, v in payload.items() if k != "editions"}
    if payload["editions"] and "books" not in rest:
        rest["books"] = payload["editions"]
    return rest


def typed_books(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    """The collected books Details typed on a comic entry (`payload.books`,
    rows of kind, label, from, to), checked and trimmed; `[]` when none.
    Each becomes a volume at commit (`volume_plan.typed_plans`). Raises
    BookEditError (field `books`), as the old editions rules did."""
    payload = payload or {}
    # A sitting typed before `books` existed still carries `editions`: read
    # it the same, so nothing already typed is lost (new writes are refused).
    raw = payload.get("books")
    if raw is None:
        raw = payload.get("editions")
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise BookEditError("Collected books are a list.", "books")
    if len(raw) > MAX_EDITIONS:
        raise BookEditError(f"At most {MAX_EDITIONS} collected books.", "books")
    books: list[dict[str, Any]] = []
    for row in raw:
        if not isinstance(row, dict):
            raise BookEditError("Each book needs a kind, a label and a range.", "books")
        kind = str(row.get("kind") or "").strip()
        label = str(row.get("label") or "").strip()
        if not kind or len(kind) > EDITION_KIND_MAX:
            raise BookEditError(
                f"A book's kind is 1-{EDITION_KIND_MAX} characters.", "books"
            )
        if not label or len(label) > EDITION_LABEL_MAX:
            raise BookEditError(
                f"A book's label is 1-{EDITION_LABEL_MAX} characters.", "books"
            )
        low, high = row.get("from"), row.get("to")
        if not all(isinstance(n, int) and not isinstance(n, bool) for n in (low, high)):
            raise BookEditError(f"{label}: collects needs two issue numbers.", "books")
        if not (1 <= low <= MAX_ISSUE and 1 <= high <= MAX_ISSUE):
            raise BookEditError(
                f"{label}: issue numbers run 1 to {MAX_ISSUE}.", "books"
            )
        if low > high:
            raise BookEditError(
                f"{label}: collects #{low}-{high} runs backwards.", "books"
            )
        books.append({"kind": kind, "label": label, "from": low, "to": high})
    return books


def edit_book(old: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    """`new` payload with its book fields checked, and `number_source`
    decided here: a changed number is `typed` (none when cleared), an
    unchanged one keeps how it was learned. Raises BookEditError.

    Fields the payload does not carry are left alone: a payload that is not
    a book's (a typed-in comic) is returned as it came.
    """
    old = old or {}
    out = dict(new)
    if "books" in new:
        out["books"] = typed_books(new)
        if not out["books"]:
            del out["books"]
    if "issue_number" in new:
        number = _whole(new["issue_number"], "issue_number", "The issue number")
        out["issue_number"] = number
        if number == old.get("issue_number"):
            out["number_source"] = old.get(
                "number_source", "none" if number is None else "typed"
            )
        else:
            out["number_source"] = "typed" if number is not None else "none"
    elif "number_source" in out and out["number_source"] not in SOURCES:
        raise BookEditError("Unknown number source.", "number_source")
    if "format" in new and new["format"] not in FORMATS:
        raise BookEditError("A book is a single, collected or unknown.", "format")
    if "edition_kind" in new and new["edition_kind"] not in EDITION_KINDS:
        raise BookEditError(
            "A book is a trade, hardcover, omnibus, compendium or original "
            "graphic novel.",
            "edition_kind",
        )
    if "reprint_note" in new:
        # Read off the book by the server; an edit is checked, not trusted.
        note = new["reprint_note"]
        if note is None:
            note = ""
        if not isinstance(note, str) or len(note.strip()) > MAX_REPRINT_NOTE:
            raise BookEditError(
                f"The reprint note is at most {MAX_REPRINT_NOTE} characters.",
                "reprint_note",
            )
        out["reprint_note"] = note.strip()
    elif old.get("reprint_note"):
        out["reprint_note"] = old["reprint_note"]  # a payload sent without it
    if "line_number" in new:
        # The book's number in its line, typed at Check; blank clears.
        out["line_number"] = _whole(
            new["line_number"], "line_number", "The number in the line"
        )
    elif old.get("line_number") is not None:
        out["line_number"] = old["line_number"]  # a payload sent without it
    if "collects_from" in new or "collects_to" in new:
        low = _whole(new.get("collects_from"), "collects_from", "The first issue")
        high = _whole(new.get("collects_to"), "collects_to", "The last issue")
        if (low is None) != (high is None):
            raise BookEditError(
                "Give both the first and the last issue.", "collects_to"
            )
        if low is not None and high is not None and low > high:
            raise BookEditError("The range runs backwards.", "collects_to")
        out["collects_from"], out["collects_to"] = low, high
    return out
