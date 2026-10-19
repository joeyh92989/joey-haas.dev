from datetime import date

import pytest

from physical_sources.release_rules import (
    is_out,
    is_upcoming,
    period_end,
    preorder_open,
    sharpest_first,
)

TODAY = date(2026, 10, 18)


@pytest.mark.parametrize(
    ("stored", "precision", "end"),
    [
        (date(2026, 10, 18), "day", date(2026, 10, 18)),
        (date(2026, 10, 18), None, date(2026, 10, 18)),
        (date(2026, 2, 1), "month", date(2026, 2, 28)),
        (date(2028, 2, 1), "month", date(2028, 2, 29)),
        (date(2026, 10, 1), "quarter", date(2026, 12, 31)),
        (date(2026, 4, 1), "quarter", date(2026, 6, 30)),
        (date(2026, 1, 1), "year", date(2026, 12, 31)),
    ],
)
def test_period_end(stored, precision, end):
    assert period_end(stored, precision) == end


def test_a_current_quarter_is_upcoming_not_out():
    q4 = date(2026, 10, 1)
    assert is_upcoming(q4, "quarter", TODAY)
    assert not is_out(q4, "quarter", TODAY)
    # The same stored date at day precision is already out.
    assert is_out(q4, "day", TODAY)
    assert not is_upcoming(q4, "day", TODAY)


def test_undated_is_neither_out_nor_upcoming():
    assert not is_upcoming(None, None, TODAY)
    assert not is_out(None, None, TODAY)


def test_the_last_day_of_a_period_is_out():
    assert is_out(date(2026, 10, 1), "month", date(2026, 10, 31))
    assert is_upcoming(date(2026, 10, 1), "month", date(2026, 10, 30))


@pytest.mark.parametrize(
    ("availability", "closes", "released", "precision", "is_open"),
    [
        ("in_stock", None, None, None, False),
        ("preorder", TODAY, date(2025, 1, 1), "day", True),
        ("preorder", date(2026, 10, 17), date(2027, 1, 1), "day", False),
        ("preorder", None, None, None, True),
        ("preorder", None, date(2026, 10, 1), "quarter", True),
        ("preorder", None, date(2026, 10, 1), "day", False),
        ("preorder", None, date(2026, 10, 19), "day", True),
    ],
)
def test_preorder_open(availability, closes, released, precision, is_open):
    assert preorder_open(availability, closes, released, precision, TODAY) is is_open


def test_sharpest_first_prefers_the_period_that_ends_first():
    year = (date(2026, 1, 1), "year")
    day = (date(2026, 11, 14), "day")
    month = (date(2026, 11, 1), "month")
    nov_30 = (date(2026, 11, 30), "day")
    assert min([year, day], key=lambda r: sharpest_first(*r)) == day
    # Same end day: the finer precision wins.
    assert min([month, nov_30], key=lambda r: sharpest_first(*r)) == nov_30
