"""Reading the date of a pasted past outing (story #350). Pure: no I/O, no clock.

`read_date(text, today)` turns what was typed after a place ("June 14, 2024",
"2023-06", "2021") into the start of that period and how exact it was, the
same start `spots_routes._period_start` stores. `split_outing_line` cuts a
pasted line into the place and the date. Both take `today` as an argument so
a test freezes the clock.

What reads: ISO `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, and English month names (full
or three letters, optional trailing dot) as "June 14, 2024", "14 June 2024",
"Jun 14 2024", "June 2024". Everything else is unread, on purpose: `6/7/24`
is June 7 in the US and 6 July elsewhere, and "last summer" has no day. A day
more than one day after `today` (the bound `build_visit` applies) and a year
before 1950 are unread too.
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date, timedelta

MIN_YEAR = 1950
MAX_DATE_CHARS = 40  # longer text cannot be a date; it is not even tried

_MONTHS: dict[str, int] = {}
for _number in range(1, 13):
    _full = calendar.month_name[_number].lower()
    _MONTHS[_full] = _number
    _MONTHS[_full[:3]] = _number

_ISO_DAY = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_ISO_MONTH = re.compile(r"(\d{4})-(\d{2})")
_YEAR = re.compile(r"\d{4}")
_MONTH_DAY_YEAR = re.compile(r"([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})")
_DAY_MONTH_YEAR = re.compile(r"(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})")
_MONTH_YEAR = re.compile(r"([a-z]+)\.?,?\s+(\d{4})")


@dataclass(frozen=True)
class DateRead:
    """A date as read: the period's start, how exact it was, and its words."""

    visited_on: date
    precision: str  # "day", "month" or "year"
    label: str  # "June 14, 2024", "June 2024" or "2024"


def label_for(visited_on: date, precision: str) -> str:
    """The words for a stored period: by `precision`, never the bare start day."""
    month = calendar.month_name[visited_on.month]
    if precision == "year":
        return str(visited_on.year)
    if precision == "month":
        return f"{month} {visited_on.year}"
    return f"{month} {visited_on.day}, {visited_on.year}"


def _month(word: str) -> int | None:
    return _MONTHS.get(word)


def _make(
    year: int, month: int, day: int | None, precision: str, today: date
) -> DateRead | None:
    if year < MIN_YEAR:
        return None
    try:
        start = date(year, month, day or 1)
    except ValueError:  # month 13, 31 April, 29 February of a common year
        return None
    if precision == "year":
        start = date(year, 1, 1)
    if start > today + timedelta(days=1):
        return None
    return DateRead(start, precision, label_for(start, precision))


def read_date(text: object, today: date) -> DateRead | None:
    """The date `text` says, or None when it does not read as one."""
    if not isinstance(text, str):
        return None
    words = " ".join(text.split()).lower()
    if not words or len(words) > MAX_DATE_CHARS:
        return None
    if found := _ISO_DAY.fullmatch(words):
        year, month, day = (int(part) for part in found.groups())
        return _make(year, month, day, "day", today)
    if found := _ISO_MONTH.fullmatch(words):
        return _make(int(found[1]), int(found[2]), None, "month", today)
    if _YEAR.fullmatch(words):
        return _make(int(words), 1, None, "year", today)
    if found := _MONTH_DAY_YEAR.fullmatch(words):
        month = _month(found[1])
        if month is not None:
            return _make(int(found[3]), month, int(found[2]), "day", today)
    if found := _DAY_MONTH_YEAR.fullmatch(words):
        month = _month(found[2])
        if month is not None:
            return _make(int(found[3]), month, int(found[1]), "day", today)
    if found := _MONTH_YEAR.fullmatch(words):
        month = _month(found[1])
        if month is not None:
            return _make(int(found[2]), month, None, "month", today)
    return None


def split_outing_line(
    line: str, today: date
) -> tuple[str, str | None, DateRead | None]:
    """`(place text, date text, date read)` of one pasted line.

    The date is what follows the LEFTMOST comma whose remainder reads as a
    date, so "Coors Field, June 14, 2024" and "Smith, Jones Park, 2023" both
    split where a person would. With no such comma the place is the text
    before the last comma (or the whole line) and the date is unread: the
    words after that comma are kept as the date text so Check can show them,
    and None when there are none (or no comma at all).
    """
    line = line.strip()
    commas = [at for at, char in enumerate(line) if char == ","]
    for at in commas:
        place = line[:at].strip()
        rest = line[at + 1 :].strip()
        read = read_date(rest, today)
        if place and read is not None:
            return place, rest, read
    if commas:
        at = commas[-1]
        place = line[:at].strip()
        rest = line[at + 1 :].strip()
        if place:
            return place, rest or None, None
    return line, None, None
