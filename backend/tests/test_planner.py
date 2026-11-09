"""planner.py: the weekend's three suggestions, over built spots and hours.

Today is a Wednesday unless a test says otherwise, so the weekend ahead is
Saturday 14 and Sunday 15 November 2026.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from planner import PLANNER, Constraints, PlanSpot, plan, weekend_of
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
