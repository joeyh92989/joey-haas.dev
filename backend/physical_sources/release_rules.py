"""When a release counts as out, upcoming, or open for pre-order. Pure.

A month, quarter or year release is stored as the period's first day
(parse.py), so comparing that date with today calls a "Q4 2026" game out on
1 October. Every caller asks here instead: a game is upcoming until its whole
period has ended. Radar, Discover, What's next and the collapse rule each had
their own copy of these rules, and the copies disagreed.
"""

from __future__ import annotations

import calendar
from datetime import date

# Finest first: a tie between two dates ending the same day keeps the finer one.
PRECISION_RANK = {"day": 0, "month": 1, "quarter": 2, "year": 3}


def period_end(released: date, precision: str | None) -> date:
    """The last day of a release's period. No precision means a day."""
    if precision == "month":
        return released.replace(
            day=calendar.monthrange(released.year, released.month)[1]
        )
    if precision == "quarter":
        month = ((released.month - 1) // 3 + 1) * 3
        return date(released.year, month, calendar.monthrange(released.year, month)[1])
    if precision == "year":
        return date(released.year, 12, 31)
    return released


def is_upcoming(when: date | None, precision: str | None, today: date) -> bool:
    """Dated, and its period has not ended by today."""
    return when is not None and period_end(when, precision) > today


def is_out(when: date | None, precision: str | None, today: date) -> bool:
    """Dated, and its whole period has ended by today. Undated is neither."""
    return when is not None and period_end(when, precision) <= today


def preorder_open(
    availability: str,
    closes_at: date | None,
    release_date: date | None,
    precision: str | None,
    today: date,
) -> bool:
    """A pre-order still taking orders: its window has not closed, or, with
    no window stated, the game is not out yet (undated counts as not out). A
    listing a store still marks as pre-order after either is stale."""
    if availability != "preorder":
        return False
    if closes_at is not None:
        return closes_at >= today
    return release_date is None or is_upcoming(release_date, precision, today)


def listing_date(
    line_date: date | None,
    line_precision: str | None,
    game_date: date | None,
    game_precision: str | None,
) -> tuple[date | None, str | None]:
    """The date a listing's pre-order is judged by: its own, else the game's.

    Radar and Discover both ask with this, so an undated, windowless
    pre-order on a game already out is stale on both pages.
    """
    if line_date is not None:
        return line_date, line_precision
    return game_date, game_precision


def sharpest_first(release_date: date, precision: str | None) -> tuple:
    """Sort key for picking one date from several: the period that ends
    soonest, the finer precision on a tie. "2026" (ends 31 Dec) loses to
    "14 Nov 2026", where a plain earliest-start rule picked "2026"."""
    return (
        period_end(release_date, precision),
        PRECISION_RANK.get(precision or "day", 0),
        release_date,
    )
