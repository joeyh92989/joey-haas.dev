"""comics.shown_status: the status a comic page shows, from the marks (#277)."""

import pytest

from comics import shown_status


def shown(stored="backlog", owned=5, read=5, released=5, ongoing=False, missing=0):
    return shown_status(
        stored,
        owned=owned,
        read=read,
        released=released,
        ongoing=ongoing,
        missing=missing,
    )


def test_all_read_complete_run_is_finished():
    assert shown() == ("finished", False)


def test_no_owned_issues_stays_backlog():
    assert shown(owned=0, read=0, released=0) == ("backlog", False)


def test_partial_reads_stay_backlog():
    assert shown(read=3) == ("backlog", False)


def test_all_read_on_an_ongoing_series_is_caught_up():
    assert shown(ongoing=True) == ("backlog", True)


def test_all_read_with_gaps_is_caught_up():
    assert shown(owned=4, read=4, missing=1) == ("backlog", True)


def test_all_read_with_unknown_issue_count_is_caught_up():
    assert shown(released=None) == ("backlog", True)


def test_extra_reads_never_beat_owned():
    assert shown(owned=2, read=9, released=2) == ("finished", False)


@pytest.mark.parametrize("stored", ["active", "paused", "abandoned", "finished"])
def test_a_hand_set_status_wins(stored):
    assert shown(stored=stored) == (stored, False)
