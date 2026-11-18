"""The title-sharing rule (#330): when a collected book joins a series' title.

One case on each side of every threshold. The rule and its numbers are in
`comics.shares_title`'s docstring and backend/CLAUDE.md.
"""

from __future__ import annotations

import pytest

from comics import SHARE_MIN_FRACTION, collect_issue_count, shares_title, title_core


def _from(series: str, text: str):
    return (series, text)


def test_the_threshold_is_sixty_percent():
    assert SHARE_MIN_FRACTION == 0.6


@pytest.mark.parametrize(
    ("book", "series", "shares"),
    [
        # (a) the title, once volume and format words are gone
        ("Saga", "Saga", True),
        ("saga", "SAGA", True),
        ("The Saga", "Saga", True),
        ("Saga Book Two", "Saga", True),
        ("Saga Book 2", "Saga", True),
        ("Saga Compendium", "Saga", True),
        ("Saga Compendium One", "Saga", True),
        ("Saga Deluxe Edition Book III", "Saga", True),
        ("Batman Vol. 3", "Batman", True),
        ("Batman, Vol. 3 (TPB)", "Batman", True),
        ("Batman Omnibus Volume 12", "Batman", True),
        ("Batman Hardcover", "Batman", True),
        ("Batman: Trade Paperback", "Batman", True),
        ("Batman 66 Vol. 2", "Batman 66", True),
        ("Hell's Angels", "Hells Angels", True),
        ("Batman: Year One", "Batman", False),
        ("Saga: The Complete Collection", "Saga", False),
        ("Batman and Robin", "Batman", False),
        ("Saga", "Sagas", False),
        ("Vol. 3", "Batman", False),
    ],
)
def test_the_title_decides_when_the_contents_are_unknown(book, series, shares):
    assert shares_title(book, series, None) is shares
    assert shares_title(book, series, []) is shares


def test_title_core_drops_format_words_and_trailing_numbers():
    assert title_core("Saga Book Two") == "saga"
    assert title_core("Batman Vol. 3") == "batman"
    assert title_core("Batman: Year One") == "batman year"
    assert title_core("The Saga Omnibus") == "saga"


def test_an_issue_count_is_the_length_of_its_ranges():
    assert collect_issue_count("#1-6") == 6
    assert collect_issue_count("#7") == 1
    assert collect_issue_count("#1-3, #5") == 4
    assert collect_issue_count("Annual 1") == 1  # a number counts as one
    assert collect_issue_count("the one-shot") == 1  # no number: one
    assert collect_issue_count("") == 1


@pytest.mark.parametrize(
    ("contents", "shares"),
    [
        # 5 of 8 issues is 62.5%: on the line
        ([("Saga", "#1-5"), ("Other", "#1-3")], True),
        # 4 of 8 is 50%: below it
        ([("Saga", "#1-4"), ("Other", "#1-4")], False),
        # exactly 60% (3 of 5) shares: the bound is inclusive
        ([("Saga", "#1-3"), ("Other", "#1-2")], True),
        # 59% does not (13 of 22)
        ([("Saga", "#1-13"), ("Other", "#1-9")], False),
        # all of it
        ([("Saga", "#1-6")], True),
        # none of it
        ([("Other", "#1-6")], False),
        # a name that normalises the same is the same series
        ([("The Saga", "#1-6"), ("Other", "#1")], True),
        # a text-only entry with no numbers counts as one issue
        ([("Saga", "#1"), ("Other", "one-shot")], False),
        ([("Saga", "#1-2"), ("Other", "one-shot")], True),
    ],
)
def test_the_contents_must_come_from_the_series(contents, shares):
    assert shares_title("Saga Book One", "Saga", contents) is shares


def test_a_title_mismatch_is_not_saved_by_the_contents():
    assert (
        shares_title("Saga: The Complete Collection", "Saga", [("Saga", "#1-54")])
        is False
    )


def test_contents_that_are_not_from_the_series_beat_a_matching_title():
    assert shares_title("Saga Vol. 1", "Saga", [("Other", "#1-6")]) is False
