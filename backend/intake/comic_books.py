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

from comics import MAX_ISSUE, RangeError, parse_ranges

FORMATS = ("single", "collected", "unknown")
EDITION_KINDS = ("trade", "omnibus", "hardcover")
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


def edit_book(old: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    """`new` payload with its book fields checked, and `number_source`
    decided here: a changed number is `typed` (none when cleared), an
    unchanged one keeps how it was learned. Raises BookEditError.

    Fields the payload does not carry are left alone: a payload that is not
    a book's (a typed-in comic) is returned as it came.
    """
    old = old or {}
    out = dict(new)
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
            "An edition is a trade, omnibus or hardcover.", "edition_kind"
        )
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
