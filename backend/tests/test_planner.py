"""planner.py: the weekend's three suggestions, over built spots and hours.

Today is a Wednesday unless a test says otherwise, so the weekend ahead is
Saturday 14 and Sunday 15 November 2026.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from planner import (
    PLANNER,
    SUNDAY_EVENING_HOUR,
    Constraints,
    PlanSpot,
    did_you_go,
    plan,
    weekend_of,
)
from weather import DENVER_TZ, Hour

WEDNESDAY = date(2026, 11, 11)
SATURDAY = date(2026, 11, 14)
SUNDAY = date(2026, 11, 15)

HOME = PlanSpot("home", "Home", 39.7392, -104.9903, anchor=True)


def _spot(id_, tags, north=0.0, name=None):
    # 0.01 degrees of latitude is about 0.69 miles.
    return PlanSpot(id_, name or id_.title(), 39.7392 + north, -104.9903, tuple(tags))


def _hours(day, dry=True, start=10, end=15):
    """A day's hours: rideable from `start` to `end` when dry, else snow."""
    out = []
    for at in range(0, 24):
        when = datetime(day.year, day.month, day.day, at, tzinfo=DENVER_TZ)
        if dry:
            ok = start <= at < end
            out.append(Hour(when, 58 if ok else 40, 0, 5, "Sunny"))
        else:
            out.append(Hour(when, 30, 80, 10, "Snow"))
    return out


def _weekend(saturday_dry=True, sunday_dry=True, **kw):
    return _hours(SATURDAY, saturday_dry, **kw) + _hours(SUNDAY, sunday_dry, **kw)


SPOTS = [
    HOME,
    _spot("park", ["park", "kid-ok", "bike-friendly"], 0.01, "City Park"),
    _spot("trail", ["park", "kid-ok"], 0.03, "Cherry Creek Trail"),
    _spot("library", ["rainy-day", "kid-ok"], 0.02, "Central Library"),
    _spot("museum", ["rainy-day", "kid-ok"], 0.05, "Museum of Nature"),
    _spot("cafe", ["coffee", "kid-ok"], 0.005, "Corner Cafe"),
    _spot("bar", ["food"], 0.01, "Late Bar"),
]


def _plan(visits=(), hours=None, constraints=None, today=WEDNESDAY, **kw):
    return plan(
        SPOTS,
        visits,
        _weekend() if hours is None else hours,
        constraints or Constraints(),
        today,
        **kw,
    )


def _slots(result):
    return {s.slot_key: s for s in result.suggestions}


# --- the weekend --------------------------------------------------------------


@pytest.mark.parametrize(
    ("today", "days"),
    [
        (WEDNESDAY, [SATURDAY, SUNDAY]),
        (date(2026, 11, 9), [SATURDAY, SUNDAY]),  # Monday
        (SATURDAY, [SATURDAY, SUNDAY]),
        (SUNDAY, [SUNDAY]),
    ],
)
def test_the_weekend_ahead(today, days):
    assert weekend_of(today) == days


def test_the_days_carry_the_weather_view():
    result = _plan()
    assert [d["date"] for d in result.days] == ["2026-11-14", "2026-11-15"]
    assert result.days[0]["verdict"]["text"] == "Ride window 10a–3p"


# --- a dry weekend ------------------------------------------------------------


def test_a_dry_weekend_fills_three_slots_with_different_spots():
    visits = [("trail", WEDNESDAY - timedelta(days=42))]
    result = _plan(visits)
    slots = _slots(result)
    assert list(slots) == ["best", "new", "while"]
    assert [s.slot for s in result.suggestions] == [
        "Best fit",
        "Try somewhere new",
        "Haven't been in a while",
    ]
    assert len({s.spot_id for s in result.suggestions}) == 3
    assert "home" not in {s.spot_id for s in result.suggestions}


def test_best_fit_is_outdoors_on_the_better_day():
    hours = _hours(SATURDAY, start=13, end=15) + _hours(SUNDAY, start=10, end=16)
    best = _slots(_plan(hours=hours))["best"]
    assert best.spot_id == "park"  # park, bike, near
    assert best.day == "2026-11-15"
    assert best.when == "Sunday late morning"
    assert best.reasons[0] == "Dry 10a–4p, 58° at 10a."
    assert best.reasons[1] == "Never logged."
    assert best.distance == "0.7 mi from Home · on foot"


def test_a_tie_goes_to_saturday():
    assert _slots(_plan())["best"].day == "2026-11-14"


def test_somewhere_new_is_never_visited():
    visits = [("park", WEDNESDAY - timedelta(days=3))]
    new = _slots(_plan(visits))["new"]
    assert new.spot_id != "park"
    assert new.reasons[0] == "Never logged."
    assert new.day == "2026-11-15"


def test_a_saved_new_card_logged_since_says_when():
    # Saved as somewhere new, then logged as Been: the card stays in its slot
    # but no longer claims the spot was never visited.
    visits = [("museum", WEDNESDAY - timedelta(days=2))]
    new = _slots(_plan(visits, pinned={"new": "museum"}))["new"]
    assert new.spot_id == "museum"
    assert new.reasons[0].startswith("Last there ")


def test_a_while_is_the_stalest_visited_spot():
    visits = [
        ("library", WEDNESDAY - timedelta(days=90)),
        ("cafe", WEDNESDAY - timedelta(days=42)),
        ("cafe", WEDNESDAY - timedelta(days=200)),
    ]
    stale = _slots(_plan(visits))["while"]
    assert stale.spot_id == "library"
    assert stale.when == "Either afternoon"
    assert stale.day is None
    assert stale.reasons == ("Last there 3 months ago.",)


def test_no_visits_leaves_out_the_while_slot():
    assert "while" not in _slots(_plan())


def test_a_visit_after_today_does_not_count():
    visits = [("library", WEDNESDAY + timedelta(days=2))]
    assert "while" not in _slots(_plan(visits))


@pytest.mark.parametrize(
    ("days", "line"),
    [(1, "yesterday"), (5, "5 days ago"), (21, "3 weeks ago"), (75, "2 months ago")],
)
def test_the_visit_age_line(days, line):
    visits = [("library", WEDNESDAY - timedelta(days=days))]
    assert _slots(_plan(visits))["while"].reasons == (f"Last there {line}.",)


def test_a_recent_visit_pushes_a_spot_down():
    assert _slots(_plan())["best"].spot_id == "park"
    visits = [("park", WEDNESDAY - timedelta(days=2))]
    assert _slots(_plan(visits))["best"].spot_id != "park"


# --- a snowy day --------------------------------------------------------------


def test_a_snowy_sunday_hands_saturday_the_outdoor_plan():
    visits = [("library", WEDNESDAY - timedelta(days=42))]
    result = _plan(visits, hours=_weekend(sunday_dry=False))
    slots = _slots(result)
    best = slots["best"]
    assert best.day == "2026-11-14"
    assert best.reasons[0] == (
        "Dry 10a–3p, 58° at 10a; Sunday is a write-off, so Saturday carries "
        "the outdoor plan."
    )
    assert slots["new"].slot == "Snow day"
    assert slots["new"].when == "Sunday"
    assert "rainy-day" in slots["new"].tags
    assert slots["new"].reasons[0] == "Sunday: snow from 8a, so indoors."
    assert slots["while"].slot == "Snow day, quieter"
    assert slots["while"].when == "Sunday afternoon"
    assert "rainy-day" in slots["while"].tags
    assert slots["new"].spot_id != slots["while"].spot_id


def test_a_snowed_out_weekend_is_all_indoors():
    slots = _slots(_plan(hours=_weekend(False, False)))
    assert slots["best"].slot == "Snow day"
    assert {s.slot for s in slots.values()} <= {"Snow day", "Snow day, quieter"}
    assert all("rainy-day" in s.tags for s in slots.values())


def test_no_forecast_reads_as_indoors_not_an_error():
    slots = _slots(_plan(hours=[]))
    assert slots["best"].reasons[0] == (
        "Saturday: No forecast for this day yet, so indoors."
    )


def test_on_sunday_only_sunday_is_planned():
    result = _plan(today=SUNDAY)
    assert [d["date"] for d in result.days] == ["2026-11-15"]
    assert {s.day for s in result.suggestions} <= {"2026-11-15"}
    assert _slots(result)["best"].when == "Sunday late morning"


# --- constraints --------------------------------------------------------------


def test_kid_along_keeps_to_kid_ok_spots():
    result = _plan(constraints=Constraints(kid_along=True))
    assert all("kid-ok" in s.tags for s in result.suggestions)


def test_kid_along_falls_back_when_nothing_fits():
    spots = [HOME, _spot("bar", ["food", "park"], 0.01)]
    result = plan(spots, [], _weekend(), Constraints(kid_along=True), WEDNESDAY)
    assert _slots(result)["best"].spot_id == "bar"


def test_max_miles_drops_farther_spots():
    result = _plan(constraints=Constraints(max_miles=1.0))
    assert {s.spot_id for s in result.suggestions} <= {"park", "cafe", "bar"}


def test_home_by_names_the_return():
    best = _slots(_plan(constraints=Constraints(home_by=13)))["best"]
    assert best.reasons[0] == "Dry 10a–3p, 58° at 10a; go at 10a, home by 1p."


def test_constraints_from_a_stored_blob():
    assert Constraints.from_blob(None) == Constraints()
    blob = {"kid_along": False, "bike_if_dry": False, "max_miles": 2, "home_by": 13}
    assert Constraints.from_blob(blob) == Constraints(False, False, 2.0, 13)
    assert Constraints.from_blob({"max_miles": "far", "home_by": 30}) == Constraints()


# --- skips, pins and reroll ---------------------------------------------------


def test_a_skipped_spot_is_left_out():
    result = _plan(skips=["park"])
    assert "park" not in {s.spot_id for s in result.suggestions}


def test_a_pinned_spot_keeps_its_slot_whatever_the_seed():
    for seed in range(4):
        slots = _slots(_plan(pinned={"best": "trail"}, seed=seed))
        assert slots["best"].spot_id == "trail"
        assert slots["best"].saved
        assert slots["new"].spot_id != "trail"
        assert not slots["new"].saved


def test_a_pin_to_a_missing_spot_is_ignored():
    slots = _slots(_plan(pinned={"best": "gone"}))
    assert not slots["best"].saved


def test_reroll_steps_through_the_best_few():
    picks = {_slots(_plan(seed=seed))["best"].spot_id for seed in range(10)}
    assert 1 < len(picks) <= PLANNER["reroll_depth"]
    assert _slots(_plan(seed=0))["best"].spot_id == "park"


def test_the_same_seed_gives_the_same_plan():
    assert _plan(seed=2) == _plan(seed=2)


def test_no_spots_is_no_suggestions():
    result = plan([HOME], [], _weekend(), Constraints(), WEDNESDAY)
    assert result.suggestions == []
    assert len(result.days) == 2


# --- did_you_go: the saved slots whose day has passed ------------------------


def _at(day, hour=12, minute=0):
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=DENVER_TZ)


def _week(key="2026-W46", saved=None, days=None, didnt=None):
    return {
        "week_key": key,
        "saved": {"best": "park"} if saved is None else saved,
        "days": {"best": SATURDAY.isoformat()} if days is None else days,
        "didnt": didnt or [],
    }


def _asks(weeks, now, visited=()):
    return did_you_go(weeks, set(visited), now)


def test_the_evening_hour_is_six():
    assert SUNDAY_EVENING_HOUR == 18


def test_a_saturday_slot_is_not_due_on_saturday():
    assert _asks([_week()], _at(SATURDAY, 10)) == []


def test_a_saturday_slot_is_due_on_sunday_morning():
    (ask,) = _asks([_week()], _at(SUNDAY, 9))
    assert (ask.week, ask.slot, ask.spot_id, ask.day) == (
        "2026-W46",
        "best",
        "park",
        SATURDAY,
    )


def test_a_sunday_slot_waits_for_six_in_the_evening():
    week = _week(days={"best": SUNDAY.isoformat()})
    assert _asks([week], _at(SUNDAY, 17, 59)) == []
    assert len(_asks([week], _at(SUNDAY, 18, 0))) == 1


def test_a_sunday_slot_is_due_from_monday_on():
    week = _week(days={"best": SUNDAY.isoformat()})
    for extra in (1, 2, 20):
        assert len(_asks([week], _at(SUNDAY + timedelta(days=extra), 8))) == 1


def test_a_saturday_slot_is_due_from_the_first_minute_of_sunday():
    # Only today's own day waits for the evening; Saturday is past on Sunday.
    assert len(_asks([_week()], _at(SUNDAY, 0, 1))) == 1


def test_a_slot_whose_day_has_not_passed_is_never_asked():
    week = _week(days={"best": SUNDAY.isoformat()})
    for now in (_at(WEDNESDAY), _at(SATURDAY, 23, 59), _at(SATURDAY, 8)):
        assert _asks([week], now) == []


def test_a_logged_slot_is_not_asked():
    assert _asks([_week()], _at(SUNDAY, 9), visited=[("park", SATURDAY)]) == []


def test_a_visit_to_another_spot_or_day_does_not_log_it():
    visited = [("other", SATURDAY), ("park", SUNDAY)]
    assert len(_asks([_week()], _at(SUNDAY, 9), visited=visited)) == 1


def test_a_slot_in_didnt_is_not_asked():
    assert _asks([_week(didnt=["best"])], _at(SUNDAY, 9)) == []


def test_didnt_answers_only_its_own_slot():
    week = _week(
        saved={"best": "park", "new": "trail"},
        days={"best": SATURDAY.isoformat(), "new": SUNDAY.isoformat()},
        didnt=["best"],
    )
    (ask,) = _asks([week], _at(SUNDAY + timedelta(days=1)))
    assert ask.slot == "new"


def test_a_slot_with_no_day_is_due_as_sunday():
    week = _week(days={})
    assert _asks([week], _at(SATURDAY, 20)) == []
    assert _asks([week], _at(SUNDAY, 17, 59)) == []
    (ask,) = _asks([week], _at(SUNDAY, 18))
    assert ask.day == SUNDAY


def test_a_bad_stored_day_is_read_as_sunday():
    week = _week(days={"best": "not a date"})
    (ask,) = _asks([week], _at(SUNDAY + timedelta(days=1)))
    assert ask.day == SUNDAY


def test_a_logged_no_day_slot_is_logged_for_sunday():
    week = _week(days={})
    assert _asks([week], _at(SUNDAY, 19), visited=[("park", SUNDAY)]) == []


def test_the_look_back_is_four_weekends():
    # On Monday 16 November (W47) the plan rows are W47 back to W44.
    now = _at(date(2026, 11, 16))
    keys = {"2026-W44": 1, "2026-W43": 0}
    for key, asked in keys.items():
        week = _week(key=key, days={})
        assert len(_asks([week], now)) == asked, key


def test_a_week_with_no_saved_slot_is_not_asked():
    assert _asks([_week(saved={}, days={})], _at(SUNDAY, 9)) == []


def test_a_week_key_with_the_row_prefix_is_read():
    (ask,) = _asks([_week(key="plan:2026-W46")], _at(SUNDAY, 9))
    assert ask.week == "2026-W46"


def test_a_malformed_week_row_is_skipped():
    weeks = [_week(key="garbage"), _week(key="2026-W99"), _week()]
    assert len(_asks(weeks, _at(SUNDAY, 9))) == 1


def test_asks_come_oldest_first_then_in_slot_order():
    earlier = _week(
        key="2026-W45",
        saved={"while": "a", "best": "b"},
        days={"while": "2026-11-08", "best": "2026-11-07"},
    )
    later = _week(
        saved={"new": "c", "best": "d"},
        days={"new": SATURDAY.isoformat(), "best": SATURDAY.isoformat()},
    )
    got = _asks([later, earlier], _at(date(2026, 11, 17)))
    assert [(a.spot_id) for a in got] == ["b", "a", "d", "c"]


def test_a_no_day_slot_is_logged_by_a_visit_on_either_weekend_day():
    week = _week(days={})
    now = _at(date(2026, 11, 17))
    assert _asks([week], now, visited=[("park", SATURDAY)]) == []
    assert _asks([week], now, visited=[("park", SUNDAY)]) == []
    assert len(_asks([week], now, visited=[("park", date(2026, 11, 13))])) == 1
    assert len(_asks([week], now, visited=[("other", SATURDAY)])) == 1


def test_a_slot_with_a_day_matches_that_day_only():
    week = _week(days={"best": SUNDAY.isoformat()})
    now = _at(date(2026, 11, 17))
    assert len(_asks([week], now, visited=[("park", SATURDAY)])) == 1
    assert _asks([week], now, visited=[("park", SUNDAY)]) == []


def test_a_malformed_saved_entry_is_skipped_not_raised():
    week = {
        "week_key": "2026-W46",
        "saved": {"best": 7, "new": ["x"], 3: "park", "while": "park"},
        "days": {"while": 5},
        "didnt": "best",
    }
    got = _asks([week], _at(date(2026, 11, 17)))
    assert [(a.slot, a.day) for a in got] == [("while", SUNDAY)]
    assert _asks([{"week_key": "2026-W46", "saved": ["x"]}], _at(SUNDAY, 20)) == []


def test_the_iso_year_end_week_is_read():
    # 2 January 2027 is a Saturday in ISO week 53 of 2026.
    week = _week(key="2026-W53", days={"best": "2027-01-02"})
    monday = date(2027, 1, 4)
    (ask,) = _asks([week], _at(monday))
    assert (ask.week, ask.day) == ("2026-W53", date(2027, 1, 2))
    assert _asks([week], _at(date(2027, 1, 2), 10)) == []


def test_the_evening_boundary_holds_on_the_fall_back_sunday():
    # 1 November 2026: clocks go back at 2 am, the wall clock still reads 18:00.
    day = date(2026, 11, 1)
    week = _week(key="2026-W44", days={"best": day.isoformat()})
    assert _asks([week], _at(day, 17, 59)) == []
    assert len(_asks([week], _at(day, 18, 0))) == 1
