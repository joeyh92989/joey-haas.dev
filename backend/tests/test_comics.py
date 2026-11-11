"""comics.py: ranges, runs, reading, hero figures, sort and the pull list."""

from datetime import date

import pytest

from comics import (
    ComicSeries,
    Issue,
    RangeError,
    apply_comic_fields,
    canonical,
    comic_snapshot,
    format_ranges,
    issue_number,
    next_issue,
    owned_set,
    parse_ranges,
    pull_weeks,
    read_next,
    read_state,
    row_run,
    run_summary,
    shelf_figures,
    snapshot_issues,
    sort_series,
    tail_length,
    union,
    validate_editions,
    week_of,
)

# A Friday.
TODAY = date(2026, 11, 6)


# --- Ranges -----------------------------------------------------------------


def test_the_specs_accepted_string_round_trips():
    assert parse_ranges("1–54, 60, 62–64") == [(1, 54), (60, 60), (62, 64)]
    assert format_ranges(parse_ranges("1–54, 60, 62–64")) == "1–54, 60, 62–64"


def test_a_hyphen_is_accepted_and_written_back_as_an_en_dash():
    assert canonical("1-3,5") == "1–3, 5"


def test_overlaps_and_neighbours_merge():
    assert canonical("5-8, 1-3, 4, 7-10") == "1–10"


def test_blank_is_no_issues():
    assert parse_ranges(None) == []
    assert parse_ranges("  ") == []
    assert canonical("") is None


@pytest.mark.parametrize(
    "text",
    ["1-3-5", "10–2", "0", "-3", "1, -3", "10000", "1-10000", "abc", "1,,2", "1.5"],
)
def test_malformed_ranges_are_refused(text):
    with pytest.raises(RangeError):
        parse_ranges(text)


def test_format_takes_issue_numbers_too():
    assert format_ranges({3, 1, 2, 7}) == "1–3, 7"
    assert format_ranges(set()) == ""


def test_union_joins_range_texts_canonically():
    assert union("1", "2", "3", "4") == "1–4"
    assert union("1–2", "3-4, 7", None, " ") == "1–4, 7"
    assert union("1–4", "2") == "1–4"
    assert union(None, "") is None
    assert union() is None


def test_union_refuses_a_bad_range():
    with pytest.raises(RangeError):
        union("1", "one to five")


@pytest.mark.parametrize(
    ("text", "expected"),
    [("1", 1), (" 12 ", 12), ("½", None), ("1.MU", None), ("0", None), (None, None)],
)
def test_only_whole_issue_numbers_count(text, expected):
    assert issue_number(text) == expected


# --- Editions ---------------------------------------------------------------


def test_editions_are_cleaned_and_kept():
    raw = [{"kind": " TPB ", "label": "Vol. 1", "from": 1, "to": 6}]
    assert validate_editions(raw) == [
        {"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}
    ]
    assert validate_editions(None) == []


@pytest.mark.parametrize(
    "entry",
    [
        {"kind": "", "label": "Vol. 1", "from": 1, "to": 6},
        {"kind": "TPB", "label": "", "from": 1, "to": 6},
        {"kind": "TPB", "label": "Vol. 1", "from": 6, "to": 1},
        {"kind": "TPB", "label": "Vol. 1", "from": 0, "to": 6},
        {"kind": "TPB", "label": "Vol. 1", "from": "1", "to": 6},
        {"kind": "TPB", "label": "Vol. 1", "from": True, "to": 6},
        "Vol. 1",
    ],
)
def test_bad_editions_are_refused(entry):
    with pytest.raises(RangeError):
        validate_editions([entry])


def test_editions_mark_the_issues_they_collect_as_owned():
    editions = [{"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}]
    assert owned_set("10-11", editions) == {1, 2, 3, 4, 5, 6, 10, 11}


# --- Writes -----------------------------------------------------------------


def test_a_write_stores_canonical_ranges_and_cleaned_editions():
    changes = {
        "title": "Saga",
        "issues_owned": "1-54,60",
        "issues_skipped": " ",
        "editions": [{"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}],
    }
    assert apply_comic_fields(changes, is_comic=True) == {
        "title": "Saga",
        "issues_owned": "1–54, 60",
        "issues_skipped": None,
        "editions": [{"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}],
    }
    assert apply_comic_fields({"editions": []}, is_comic=True) == {"editions": None}


def test_a_refusal_names_the_field():
    with pytest.raises(RangeError, match="^Issues skipped: '3-1' runs backwards$"):
        apply_comic_fields({"issues_skipped": "3-1"}, is_comic=True)
    with pytest.raises(RangeError, match="Read to"):
        apply_comic_fields({"read_to": 0}, is_comic=True)


def test_comic_fields_are_refused_on_other_types_unless_empty():
    with pytest.raises(RangeError, match="comics only"):
        apply_comic_fields({"issues_owned": "1"}, is_comic=False)
    with pytest.raises(RangeError, match="comics only"):
        apply_comic_fields({"following": True}, is_comic=False)
    quiet = {"following": False, "issues_owned": None, "title": "Hades"}
    assert apply_comic_fields(quiet, is_comic=False) == quiet


def test_the_admin_run_counts_editions_and_reads_the_snapshot():
    editions = [{"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}]
    run = row_run("7-10", "11", editions, 8, {"released": 12, "ongoing": True})
    assert run["owned_text"] == "1–10"
    assert (run["owned"], run["released"], run["missing"]) == (10, 12, 2)
    assert run["state"] == "gaps"
    assert run["segments"][-1] == {"kind": "upcoming", "length": 3}
    assert (run["read"], run["unread"], run["read_next"]) == (8, 2, 9)


def test_an_unfetched_run_falls_back_to_the_volume_count():
    assert row_run("1-3", None, None, None, {"issue_count": 5})["released"] == 5
    assert row_run("1-3", None, None, None, None)["released"] == 3


# --- Runs and reading -------------------------------------------------------


def test_an_ended_run_with_everything_is_complete():
    run = run_summary(set(range(1, 61)), set(), 60, ongoing=False)
    assert (run.state, run.missing, run.segments) == ("complete", 0, [("owned", 60)])


def test_an_ongoing_run_with_everything_is_up_to_date_with_a_tail():
    run = run_summary(set(range(1, 73)), set(), 72, ongoing=True)
    assert run.state == "up_to_date"
    assert run.segments == [("owned", 72), ("upcoming", 6)]


def test_gaps_are_segments_and_a_skip_is_still_a_gap():
    run = run_summary({1, 2, 3, 6}, {4}, 7, ongoing=False)
    assert run.state == "gaps"
    assert run.missing == 3
    assert run.segments == [("owned", 3), ("missing", 2), ("owned", 1), ("missing", 1)]
    assert sum(length for _, length in run.segments) == 7


def test_the_tail_is_never_shorter_than_three():
    assert tail_length(10) == 3
    assert tail_length(100) == 8


def test_an_unfetched_series_runs_to_its_highest_owned_issue():
    run = run_summary({1, 2, 5}, set(), None, ongoing=False)
    assert (run.released, run.missing) == (5, 2)


def test_read_counts_owned_issues_up_to_the_marker():
    state = read_state(11, {1, 2, 3, 10, 11, 12, 14})
    assert (state.read, state.unread) == (5, 2)
    assert read_state(None, {1, 2}).read == 0


def test_read_next_is_the_first_held_issue_past_the_marker():
    held = {1, 2, 3, 10, 11, 12, 14}
    assert read_next(None, held) == 1
    assert read_next(3, held) == 10  # over the gap
    assert read_next(12, held) == 14
    assert read_next(14, held) is None
    assert read_next(None, set()) is None


def test_a_skip_on_a_held_issue_is_refused():
    editions = [{"kind": "TPB", "label": "Vol. 1", "from": 1, "to": 6}]
    with pytest.raises(RangeError, match="#9 is owned, so it can't be skipped"):
        apply_comic_fields({"issues_skipped": "9"}, True, {"issues_owned": "7-10"})
    with pytest.raises(RangeError, match="#4 is owned"):
        apply_comic_fields({"issues_skipped": "4"}, True, {"editions": editions})
    # Owning and unskipping in one write passes; a write that leaves all
    # three alone is not checked.
    both = {"issues_owned": "1-9", "issues_skipped": None}
    assert apply_comic_fields(both, True, {"issues_skipped": "9"})["issues_owned"]
    assert apply_comic_fields({"read_to": 3}, True, {"issues_skipped": "1-3"})


# --- Hero figures (spec AC2) ------------------------------------------------


def _series(id_, title, **kwargs):
    return ComicSeries(id=id_, title=title, **kwargs)


FIXTURE = [
    # Saga: 1–54 of 72 released, ongoing, read to 54.
    _series(
        1,
        "Saga",
        publisher="Image",
        owned=frozenset(range(1, 55)),
        released=72,
        ongoing=True,
        read_to=54,
        following=True,
    ),
    # Y: complete, 60 of 60, read to 30.
    _series(
        2,
        "Y: The Last Man",
        publisher="Vertigo",
        owned=frozenset(range(1, 61)),
        released=60,
        read_to=30,
    ),
    # Paper Girls: 1–10 and 15 of 30, unread.
    _series(
        3,
        "Paper Girls",
        publisher="Image",
        owned=frozenset([*range(1, 11), 15]),
        released=30,
    ),
    # A want: not on the shelf, so in none of the figures.
    _series(4, "Monstress", publisher="Image", released=50, on_shelf=False),
]


def test_the_hero_figures_agree_with_the_rows():
    figures = shelf_figures(FIXTURE)
    assert figures.series == 3
    assert figures.issues_owned == 54 + 60 + 11
    assert figures.missing == 18 + 0 + 19
    assert figures.read_percent == round(100 * (54 + 30) / 125)


def test_nothing_owned_reads_as_no_percent():
    assert shelf_figures([]).read_percent is None


# --- Sort -------------------------------------------------------------------


def test_next_issue_puts_dated_series_first_in_date_order_then_titles():
    later = _series(
        5, "Absolute Batman", issues=(Issue("14", store_date=date(2026, 11, 18)),)
    )
    sooner = _series(6, "Zatanna", issues=(Issue("3", store_date=date(2026, 11, 11)),))
    past = _series(7, "Batman", issues=(Issue("1", store_date=date(2026, 10, 1)),))
    order = sort_series([later, past, *FIXTURE[:2], sooner], "next", TODAY)
    assert [s.title for s in order] == [
        "Zatanna",
        "Absolute Batman",
        "Batman",
        "Saga",
        "Y: The Last Man",
    ]


def test_the_other_sorts():
    assert [s.id for s in sort_series(FIXTURE, "title", TODAY)] == [4, 3, 1, 2]
    no_publisher = _series(9, "Aardvark")
    by_publisher = sort_series([*FIXTURE, no_publisher], "publisher", TODAY)
    assert [s.id for s in by_publisher] == [4, 3, 1, 2, 9]
    assert [s.id for s in sort_series(FIXTURE, "missing", TODAY)][:2] == [4, 3]
    with pytest.raises(ValueError):
        sort_series(FIXTURE, "rating", TODAY)


def test_next_issue_ignores_uncounted_numbers():
    s = _series(
        1,
        "Saga",
        issues=(
            Issue("½", store_date=date(2026, 11, 7)),
            Issue("73", store_date=date(2026, 11, 25)),
        ),
    )
    assert next_issue(s, TODAY).number == "73"


# --- Pull list --------------------------------------------------------------


@pytest.mark.parametrize(
    ("day", "wednesday"),
    [
        (date(2026, 11, 4), date(2026, 11, 4)),  # Wednesday
        (date(2026, 11, 6), date(2026, 11, 4)),  # Friday
        (date(2026, 11, 10), date(2026, 11, 4)),  # Tuesday
        (date(2026, 11, 3), date(2026, 10, 28)),  # the Tuesday before
    ],
)
def test_a_week_starts_on_wednesday(day, wednesday):
    assert week_of(day) == wednesday


def _followed(**kwargs):
    defaults = {
        "id": 1,
        "title": "Saga",
        "publisher": "Image",
        "owned": frozenset(range(1, 72)),
        "released": 72,
        "following": True,
    }
    return ComicSeries(**{**defaults, **kwargs})


def test_four_weeks_from_this_wednesday_with_this_week_marked():
    pull = pull_weeks([], TODAY)
    assert [w.start for w in pull.weeks] == [
        date(2026, 11, 4),
        date(2026, 11, 11),
        date(2026, 11, 18),
        date(2026, 11, 25),
    ]
    assert [w.this_week for w in pull.weeks] == [True, False, False, False]


def test_issues_land_in_their_week_and_this_weeks_earlier_days_count():
    saga = _followed(
        issues=(
            Issue("72", store_date=date(2026, 11, 4)),  # this week, already out
            Issue("73", store_date=date(2026, 11, 25)),  # fourth week
            Issue("74", store_date=date(2026, 12, 2)),  # past the window
            Issue("70", store_date=date(2026, 10, 1)),  # owned anyway
        )
    )
    pull = pull_weeks([saga], TODAY)
    assert [[r.issue.number for r in w.rows] for w in pull.weeks] == [
        ["72"],
        [],
        [],
        ["73"],
    ]
    assert pull.weeks[0].rows[0].owned_text == "1–71"


def test_owned_skipped_unfollowed_and_uncounted_issues_stay_off():
    saga = _followed(
        skipped=frozenset({73}),
        issues=(
            Issue("71", store_date=date(2026, 11, 4)),
            Issue("73", store_date=date(2026, 11, 11)),
            Issue("73.MU", store_date=date(2026, 11, 11)),
        ),
    )
    unfollowed = _followed(
        id=2, following=False, issues=(Issue("72", store_date=date(2026, 11, 11)),)
    )
    pull = pull_weeks([saga, unfollowed], TODAY)
    assert all(not w.rows for w in pull.weeks)


def test_public_lists_owned_and_skipped_issues_so_a_private_answer_shows_nothing():
    saga = _followed(
        skipped=frozenset({73}),
        issues=(
            Issue("71", store_date=date(2026, 11, 4)),
            Issue("73", store_date=date(2026, 11, 11)),
        ),
    )
    pull = pull_weeks([saga], TODAY, public=True)
    assert [[r.issue.number for r in w.rows] for w in pull.weeks] == [
        ["71"],
        ["73"],
        [],
        [],
    ]


def test_a_month_without_a_date_is_listed_as_undated():
    saga = _followed(issues=(Issue("73", cover_date=date(2026, 12, 1)),))
    dated = _followed(
        id=2,
        title="Monstress",
        issues=(
            Issue("50", cover_date=date(2026, 12, 1)),
            Issue("49", store_date=date(2026, 11, 18)),
        ),
    )
    pull = pull_weeks([saga, dated], TODAY)
    assert [s.title for s in pull.undated] == ["Saga"]


# --- The issue snapshot ------------------------------------------------------


def _entry(number: str, store_date: str | None) -> dict:
    return {
        "number": number,
        "name": None,
        "store_date": store_date,
        "cover_date": None,
        "cover_url": None,
    }


def test_released_leaves_out_issues_not_yet_in_stores():
    issues = [
        _entry("68", "2026-12-02"),
        _entry("67", "2026-11-04"),
        _entry("66", "2026-10-07"),
    ]

    snap = comic_snapshot(68, issues, TODAY)

    assert snap["released"] == 67
    assert snap["ongoing"] is True
    assert snap["fetched_on"] == "2026-11-06"
    assert snap["issues"] == issues


def test_released_is_never_below_the_highest_issue_already_out():
    # ComicVine's count can lag a numbering that skipped ahead (a #0, a gap).
    snap = comic_snapshot(40, [_entry("50", "2026-10-07")], TODAY)

    assert snap["released"] == 50


def test_a_run_quiet_for_more_than_120_days_has_ended():
    snap = comic_snapshot(60, [_entry("60", "2008-01-01")], TODAY)

    assert snap["ongoing"] is False
    assert snap["released"] == 60


def test_non_integer_issues_are_listed_but_count_for_nothing():
    issues = [_entry("1.MU", "2026-12-02"), _entry("½", "2026-11-04")]

    snap = comic_snapshot(None, issues, TODAY)

    assert snap["released"] is None
    assert len(snap["issues"]) == 2


def test_snapshot_issues_tolerate_bad_dates_and_junk_entries():
    meta = {"issues": [_entry("3", "not a date"), "junk", _entry("4", "2026-11-04")]}

    issues = snapshot_issues(meta)

    assert [i.number for i in issues] == ["3", "4"]
    assert issues[0].store_date is None
    assert issues[1].store_date == date(2026, 11, 4)
    assert snapshot_issues(None) == ()


# --- Review regressions -----------------------------------------------------


def test_a_number_zero_or_fraction_out_is_not_counted_as_released():
    # ComicVine's count includes #0 and #½; neither is a place in the run.
    issues = [
        _entry("3", "2026-10-07"),
        _entry("2", "2026-09-02"),
        _entry("1", "2026-08-05"),
        _entry("0", "2026-07-01"),
        _entry("½", "2026-07-15"),
    ]

    snap = comic_snapshot(5, issues, TODAY)

    assert snap["released"] == 3


def test_an_issue_owned_before_its_store_date_stretches_the_run():
    run = run_summary({1, 2, 3, 55}, set(), 54, ongoing=True)

    assert sum(length for kind, length in run.segments if kind != "upcoming") >= 55
    assert run.segments[-2] == ("owned", 1)


def test_non_ascii_digits_are_refused_not_crashed_on():
    with pytest.raises(RangeError):
        canonical("²")
    assert issue_number("١٢") is None
