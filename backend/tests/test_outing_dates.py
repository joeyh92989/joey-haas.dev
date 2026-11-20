"""Reading the date of a pasted past outing (story #350). Pure; `today` frozen."""

from __future__ import annotations

from datetime import date

import pytest

from intake.outing_dates import label_for, read_date, split_outing_line

TODAY = date(2026, 11, 19)


@pytest.mark.parametrize(
    ("text", "start", "precision", "label"),
    [
        ("2024-06-14", date(2024, 6, 14), "day", "June 14, 2024"),
        ("2024-06", date(2024, 6, 1), "month", "June 2024"),
        ("2023", date(2023, 1, 1), "year", "2023"),
        ("June 14, 2024", date(2024, 6, 14), "day", "June 14, 2024"),
        ("14 June 2024", date(2024, 6, 14), "day", "June 14, 2024"),
        ("Jun 14 2024", date(2024, 6, 14), "day", "June 14, 2024"),
        ("jun. 14, 2024", date(2024, 6, 14), "day", "June 14, 2024"),
        (
            "14th June 2024",
            date(2024, 6, 14),
            "day",
            "June 14, 2024",
        ),
        ("June 2024", date(2024, 6, 1), "month", "June 2024"),
        ("Sep 2019", date(2019, 9, 1), "month", "September 2019"),
        ("  june   2024 ", date(2024, 6, 1), "month", "June 2024"),
        ("2024-02-29", date(2024, 2, 29), "day", "February 29, 2024"),
        # The current period and tomorrow pass, as `build_visit` allows.
        ("2026-11", date(2026, 11, 1), "month", "November 2026"),
        ("2026", date(2026, 1, 1), "year", "2026"),
        ("2026-11-20", date(2026, 11, 20), "day", "November 20, 2026"),
    ],
)
def test_forms_that_read(text, start, precision, label):
    read = read_date(text, TODAY)
    assert read is not None
    assert (read.visited_on, read.precision, read.label) == (start, precision, label)


@pytest.mark.parametrize(
    "text",
    [
        "6/7/24",  # US or EU: not guessed
        "last summer",
        "",
        "   ",
        "June",
        "2026-11-21",  # two days ahead
        "2026-12",  # next month
        "2027",
        "1949",
        "1949-06-01",
        "2024-13",  # month 13
        "2024-13-01",
        "2024-04-31",  # 31 April
        "2023-02-29",  # leap day, common year
        "February 29, 2023",
        "Smarch 3, 2020",
        "2024-6-1",  # ISO needs two digits
        "June 14, 2024 and more words after it",
        "x" * 80,
    ],
)
def test_forms_that_do_not_read(text):
    assert read_date(text, TODAY) is None


def test_a_leap_day_reads_on_a_leap_year_only():
    assert read_date("February 29, 2024", TODAY) is not None
    assert read_date("February 29, 2023", TODAY) is None


def test_not_text_is_unread():
    assert read_date(None, TODAY) is None
    assert read_date(2024, TODAY) is None


def test_the_bound_follows_today():
    assert read_date("2026-11-20", date(2026, 11, 19)) is not None
    assert read_date("2026-11-20", date(2026, 11, 18)) is None


def test_label_is_by_precision_never_the_bare_start_day():
    assert label_for(date(2024, 6, 1), "month") == "June 2024"
    assert label_for(date(2024, 1, 1), "year") == "2024"
    assert label_for(date(2024, 6, 1), "day") == "June 1, 2024"


def test_split_cuts_at_the_leftmost_comma_that_leaves_a_date():
    place, text, read = split_outing_line("Coors Field, June 14, 2024", TODAY)
    assert (place, text) == ("Coors Field", "June 14, 2024")
    assert read.visited_on == date(2024, 6, 14)


def test_split_keeps_a_comma_inside_the_place_name():
    place, text, read = split_outing_line("Smith, Jones Park, 2023", TODAY)
    assert (place, text) == ("Smith, Jones Park", "2023")
    assert read.precision == "year"


def test_split_with_no_date_keeps_the_whole_line():
    assert split_outing_line("Union Station", TODAY) == ("Union Station", None, None)


def test_split_with_an_unread_date_keeps_its_words():
    assert split_outing_line("Red Rocks, last summer", TODAY) == (
        "Red Rocks",
        "last summer",
        None,
    )


def test_split_with_a_trailing_comma():
    assert split_outing_line("Union Station,", TODAY) == ("Union Station", None, None)
    assert split_outing_line("Union Station, ", TODAY) == ("Union Station", None, None)


def test_split_does_not_take_an_empty_place():
    assert split_outing_line(", 2023", TODAY) == (", 2023", None, None)


def test_split_a_future_date_is_unread_not_split_off_as_a_date():
    place, text, read = split_outing_line("Coors Field, 2027", TODAY)
    assert (place, text, read) == ("Coors Field", "2027", None)


@pytest.mark.parametrize(
    ("line", "place", "text"),
    [
        ("Coors Field, Sept 14, 2024", "Coors Field", "Sept 14, 2024"),
        ("Coors Field, Sept. 14, 2024", "Coors Field", "Sept. 14, 2024"),
        ("Coors Field, June 14, 2024,", "Coors Field", "June 14, 2024"),
        ("Coors Field, 2023,", "Coors Field", "2023"),
        ("Coors Field, 2023, ,", "Coors Field", "2023"),
    ],
)
def test_split_reads_a_comma_inside_a_day_and_drops_trailing_commas(line, place, text):
    got_place, got_text, read = split_outing_line(line, TODAY)
    assert (got_place, got_text) == (place, text)
    assert read is not None


@pytest.mark.parametrize(
    "line",
    ["Coors Field, Juen 14, 2024", "Coors Field, 6/14, 2024", "Coors Field, 6/7/24"],
)
def test_split_never_reads_the_year_of_a_broken_day_as_a_year_outing(line):
    place, text, read = split_outing_line(line, TODAY)
    assert (place, read) == ("Coors Field", None)  # the place is not polluted
    assert text and text[0] in "J6"  # the words are kept, unread


@pytest.mark.parametrize(
    "line",
    [
        "https://maps.google.com/?q=39.7392,-104.9903",
        "https://www.google.com/maps/place/Red+Rocks/@39.756,-104.994,15z",
        "https://www.openstreetmap.org/?mlat=39.7392&mlon=-104.9849#map=17/39.7392/-104.9849",
        "Denver Botanic Gardens, Denver",
        "39.7392, -104.9903",
    ],
)
def test_split_keeps_links_coordinates_and_plain_commas_whole(line):
    assert split_outing_line(line, TODAY) == (line, None, None)
