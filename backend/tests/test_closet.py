"""closet.py: the day's read, the filter and the outfit without a model."""

from datetime import date, datetime, timedelta

import pytest

import closet
from closet import Piece, Request
from weather import DENVER_TZ, Hour

DAY = date(2026, 11, 10)  # a Tuesday


def hour(at: int, temp: int, precip: int = 0, short: str = "Sunny") -> Hour:
    return Hour(
        datetime(DAY.year, DAY.month, DAY.day, at, tzinfo=DENVER_TZ),
        temp,
        precip,
        5,
        short,
    )


def day_of(temps: dict[int, int], **kw) -> list[Hour]:
    return [hour(at, temp, **kw) for at, temp in temps.items()]


def piece(id: str, category: str, **kw) -> Piece:
    kw.setdefault("name", f"{category} {id}")
    kw.setdefault("warmth", 3)
    kw.setdefault("formality", 2)
    return Piece(id=id, category=category, **kw)


def read(low: int, high: int, **kw) -> closet.WeatherRead:
    kw.setdefault("wet", False)
    kw.setdefault("snow", False)
    kw.setdefault("forecast", True)
    return closet.WeatherRead(low, high, **kw)


# --- the day ----------------------------------------------------------------


def test_the_morning_low_and_afternoon_high_come_from_their_windows():
    hours = day_of({3: 20, 7: 31, 9: 38, 11: 45, 13: 54, 15: 56, 18: 49, 22: 70})
    got = closet.read_weather(hours, DAY)
    assert (got.low, got.high, got.swing) == (31, 56, 25)
    assert got.forecast
    assert got.hours == (
        ("7a", 31),
        ("9a", 38),
        ("11a", 45),
        ("1p", 54),
        ("3p", 56),
        ("6p", 49),
    )


def test_another_days_hours_are_ignored_and_normals_stand_in():
    other = [
        Hour(datetime(2026, 11, 11, 9, tzinfo=DENVER_TZ), 70, 0, 5, "Sunny"),
    ]
    got = closet.read_weather(other, DAY)
    assert not got.forecast
    assert (got.low, got.high) == closet.NORMALS[11]
    assert got.hours == ()


@pytest.mark.parametrize(
    "hours, wet, snow",
    [
        (day_of({9: 40, 14: 50}), False, False),
        (day_of({9: 40, 14: 50}, precip=60), True, False),
        (day_of({9: 30, 14: 34}, precip=70, short="Light Snow"), True, True),
        # Rain at 3 am is not the day's.
        ([hour(3, 40, precip=90), hour(9, 45), hour(14, 55)], False, False),
    ],
)
def test_wet_and_snow_are_read_over_the_waking_day(hours, wet, snow):
    got = closet.read_weather(hours, DAY)
    assert (got.wet, got.snow) == (wet, snow)


@pytest.mark.parametrize(
    "low, high, bike, kw, sentence",
    [
        (33, 56, True, {}, "Cold ride in, cool ride home — layer for a 23° swing."),
        (58, 70, False, {}, "Cool morning, mild afternoon."),
        (
            28,
            33,
            False,
            {"snow": True},
            "Freezing morning, cold afternoon; snow in the forecast.",
        ),
        (50, 58, False, {"wet": True}, "Cool morning, cool afternoon; rain likely."),
    ],
)
def test_the_read_sentence(low, high, bike, kw, sentence):
    assert closet.read_sentence(read(low, high, **kw), bike) == sentence


def test_the_sentence_without_a_forecast_says_so():
    got = closet.read_sentence(read(25, 52, forecast=False), False, "November")
    assert got == "No forecast yet; dressed for a typical November day."


@pytest.mark.parametrize(
    "temp, warmth",
    [
        (90, 1),
        (80, 1),
        (79, 2),
        (68, 2),
        (60, 3),
        (55, 3),
        (45, 4),
        (40, 4),
        (39, 5),
        (-5, 5),
    ],
)
def test_warmth_for(temp, warmth):
    assert closet.warmth_for(temp) == warmth


@pytest.mark.parametrize(
    "low, high, bike, layers",
    [
        (30, 50, False, ("outer", "mid")),
        (40, 50, False, ("outer",)),
        (38, 50, True, ("outer", "mid")),  # 33 on the bike
        (55, 65, False, ("mid",)),
        (58, 65, True, ("mid",)),  # 53 on the bike is still above 50
        (65, 90, False, ("mid",)),  # a 25° swing
        (65, 80, False, ()),
    ],
)
def test_layer_slots(low, high, bike, layers):
    assert closet.layer_slots(read(low, high), bike) == layers


def test_targets_dress_layers_for_the_morning_and_the_top_for_the_afternoon():
    got = closet.targets(read(31, 56), bike=False)
    assert got["outer"] == 5  # 31
    assert got["mid"] == 4  # 41 under a coat
    assert got["top"] == 3  # 56
    assert got["bottom"] == 4  # 43.5
    assert got["shoes"] == 5


def test_the_bike_makes_the_morning_colder():
    assert closet.targets(read(42, 60), bike=True)["outer"] == 5  # 37
    assert closet.targets(read(42, 60), bike=False)["outer"] == 4


# --- the filter ---------------------------------------------------------------


@pytest.mark.parametrize(
    "p, occasion, ok",
    [
        (piece("a", "top", formality=4), "office", True),
        (piece("a", "top", formality=1), "office", False),
        (piece("a", "top", formality=5), "weekend", False),
        (piece("a", "top", formality=None), "event", True),
        (piece("a", "top", formality=3), "date", True),
    ],
)
def test_fits_occasion(p, occasion, ok):
    assert closet.fits_occasion(p, occasion) is ok


@pytest.mark.parametrize(
    "p, ok",
    [
        (piece("a", "shoes", name="white sneaker", formality=2), True),
        (piece("a", "shoes", name="brown shoe", subtype="oxford", formality=3), False),
        (piece("a", "shoes", name="black shoe", formality=4), False),
        (piece("a", "shoes", name="penny loafer", formality=3), False),
        (piece("a", "bottom", name="wide-leg trousers"), False),
        (piece("a", "bottom", name="slim chinos"), True),
        (piece("a", "outer", name="camel overcoat"), False),
        (piece("a", "outer", name="rain shell"), True),
        (piece("a", "top", name="wide stripe tee"), True),  # tops have no rule
    ],
)
def test_bike_ok(p, ok):
    assert closet.bike_ok(p) is ok


@pytest.mark.parametrize(
    "seasons, month, ok",
    [((), 7, True), ((11, 12, 1), 11, True), ((6, 7, 8), 11, False)],
)
def test_in_season(seasons, month, ok):
    assert closet.in_season(piece("a", "top", seasons=seasons), month) is ok


@pytest.mark.parametrize(
    "days_ago, n, recent",
    [(0, 5, True), (1, 5, True), (5, 5, True), (6, 5, False), (3, 2, False)],
)
def test_a_top_worn_within_n_days_is_recent(days_ago, n, recent):
    p = piece("a", "top", last_worn=DAY - timedelta(days=days_ago))
    assert closet.worn_recently(p, DAY, n) is recent


def test_only_tops_have_the_repeat_rule():
    p = piece("a", "bottom", last_worn=DAY - timedelta(days=1))
    assert not closet.worn_recently(p, DAY, 5)


def wardrobe() -> list[Piece]:
    return [
        piece("t1", "top", name="grey tee", warmth=3),
        piece("t2", "top", name="navy oxford", warmth=3, formality=3),
        piece("t3", "top", name="linen shirt", warmth=1, seasons=(6, 7, 8)),
        piece("t4", "top", name="blue tee", last_worn=DAY - timedelta(days=2)),
        piece("b1", "bottom", name="jeans", warmth=4),
        piece("b2", "bottom", name="chinos", warmth=3),
        piece("s1", "shoes", name="sneakers", warmth=3),
        piece("s2", "shoes", name="boots", warmth=5),
        piece("o1", "outer", name="parka", warmth=5),
        piece("o2", "outer", name="denim jacket", warmth=3),
        piece("m1", "mid", name="sweater", warmth=4),
    ]


def test_candidates_filter_rank_and_count():
    found = closet.candidates(wardrobe(), Request(DAY, "weekend"), read(31, 56))
    assert found.slots == ("outer", "mid", "top", "bottom", "shoes")
    assert [s.piece.id for s in found.by_slot["outer"]] == ["o1", "o2"]
    assert [s.piece.id for s in found.by_slot["shoes"]] == ["s2", "s1"]
    # Linen is out of season, the blue tee worn two days ago.
    assert {s.piece.id for s in found.by_slot["top"]} == {"t1", "t2"}
    assert (found.active, found.fit, found.skipped_recent) == (11, 9, 1)


def test_a_warm_day_has_no_layers_and_drops_their_slots():
    found = closet.candidates(wardrobe(), Request(DAY, "weekend"), read(66, 78))
    assert found.slots == ("top", "bottom", "shoes")


def test_rest_breaks_a_tie_and_never_worn_ranks_first():
    pieces = [
        piece("x", "top", name="a tee", last_worn=DAY - timedelta(days=7)),
        piece("y", "top", name="b tee", last_worn=DAY - timedelta(days=21)),
        piece("z", "top", name="c tee"),
    ]
    request = Request(DAY, "weekend", repeat_top_days=0)
    found = closet.candidates(pieces, request, read(55, 58))
    assert [s.piece.id for s in found.by_slot["top"]] == ["z", "y", "x"]


def test_ties_break_by_name_then_id():
    pieces = [
        piece("2", "top", name="Tee"),
        piece("1", "top", name="tee"),
        piece("3", "top", name="a"),
    ]
    found = closet.candidates(pieces, Request(DAY, "weekend"), read(55, 58))
    assert [s.piece.id for s in found.by_slot["top"]] == ["3", "1", "2"]


def test_wears_this_month_count_against():
    pieces = [
        piece("a", "top", wears_30=0),
        piece("b", "top", name="a top", wears_30=6),
    ]
    found = closet.candidates(pieces, Request(DAY, "weekend"), read(55, 58))
    assert [s.piece.id for s in found.by_slot["top"]] == ["a", "b"]


def test_snow_favours_boots():
    pieces = [
        piece("a", "shoes", name="a sneaker", warmth=5),
        piece("b", "shoes", name="winter boot", warmth=4),
    ]
    snowy = closet.candidates(pieces, Request(DAY, "weekend"), read(28, 33, snow=True))
    dry = closet.candidates(pieces, Request(DAY, "weekend"), read(28, 33))
    assert snowy.by_slot["shoes"][0].piece.id == "b"
    assert dry.by_slot["shoes"][0].piece.id == "a"


def test_candidates_are_capped_per_slot():
    pieces = [piece(f"t{i:02}", "top") for i in range(20)]
    found = closet.candidates(pieces, Request(DAY, "weekend"), read(66, 78))
    assert len(found.by_slot["top"]) == closet.CANDIDATES_PER_SLOT


def test_the_bike_filters_and_formality_holds():
    pieces = wardrobe() + [
        piece("s3", "shoes", name="oxfords", formality=3),
        piece("b3", "bottom", name="wide trousers", formality=3),
    ]
    found = closet.candidates(pieces, Request(DAY, "office", bike=True), read(55, 60))
    assert [s.piece.id for s in found.by_slot["top"]] == ["t2"]
    assert found.by_slot["shoes"] == []
    assert found.by_slot["bottom"] == []


def test_a_lock_passes_every_rule_and_adds_its_slot():
    pieces = wardrobe() + [piece("h1", "accessory", name="wool hat", seasons=(1,))]
    request = Request(DAY, "weekend", lock="t4")  # worn two days ago
    found = closet.candidates(pieces, request, read(66, 78))
    assert found.fixed is not None and found.fixed.id == "t4"
    assert "t4" not in {s.piece.id for s in found.by_slot["top"]}
    locked_hat = closet.candidates(
        pieces, Request(DAY, "weekend", lock="h1"), read(66, 78)
    )
    assert locked_hat.slots == ("top", "bottom", "shoes", "accessory")


def test_a_transient_garment_is_fixed_and_not_counted_as_active():
    shirt = Piece(id="photo", name="green shirt", category="top", transient=True)
    found = closet.candidates(
        wardrobe(), Request(DAY, "weekend", extra=shirt), read(66, 78)
    )
    assert found.fixed == shirt
    assert found.active == 11


# --- the outfit ---------------------------------------------------------------


def test_the_template_lead_is_every_slots_best():
    found = closet.candidates(wardrobe(), Request(DAY, "weekend"), read(31, 56))
    outfits = closet.template(found)
    lead = outfits[0]
    assert lead.ranked_by == "template" and lead.reason is None
    assert [slot for slot, _ in lead.pieces] == [
        "outer",
        "mid",
        "top",
        "bottom",
        "shoes",
    ]
    assert {p.id for _, p in lead.pieces} == {"o1", "m1", "t1", "b1", "s2"}
    assert len(outfits) == 2  # two tops, two bottoms: depth two
    assert outfits[1].key != lead.key


def test_the_template_skips_a_recent_outfit():
    found = closet.candidates(wardrobe(), Request(DAY, "weekend"), read(31, 56))
    first = closet.template(found)[0]
    again = closet.template(found, recent={first.key})
    assert again[0].key != first.key


def test_every_outfit_recent_still_gives_a_lead():
    found = closet.candidates(wardrobe(), Request(DAY, "weekend"), read(31, 56))
    keys = {o.key for o in closet.template(found)}
    assert len(closet.template(found, recent=keys)) == 1


def test_the_template_puts_the_lock_in_and_says_so():
    request = Request(DAY, "weekend", lock="t2")
    found = closet.candidates(wardrobe(), request, read(31, 56))
    for outfit in closet.template(found):
        assert dict(outfit.pieces)["top"].id == "t2"
        assert outfit.reason == "You locked the navy oxford."


def test_a_fixed_piece_alone_still_makes_an_outfit():
    shirt = Piece(id="photo", name="green shirt", category="top", transient=True)
    found = closet.candidates([], Request(DAY, "weekend", extra=shirt), read(66, 78))
    outfits = closet.template(found)
    assert [p.id for _, p in outfits[0].pieces] == ["photo"]
    assert outfits[0].reason == "Built around the green shirt from your photo."


def test_an_empty_closet_has_no_outfit():
    assert (
        closet.template(closet.candidates([], Request(DAY, "office"), read(50, 60)))
        == []
    )


def test_recent_keys_reads_the_window():
    request = Request(DAY, "weekend", repeat_outfit_weeks=3)
    outfits = [
        (
            DAY - timedelta(days=20),
            [("top", "t1"), ("bottom", "b1"), ("shoes", "s1"), ("outer", "o1")],
        ),
        (DAY - timedelta(days=22), [("top", "t2"), ("bottom", "b1"), ("shoes", "s1")]),
        (DAY, [("top", "t3"), ("bottom", "b1"), ("shoes", "s1")]),
    ]
    assert closet.recent_keys(outfits, request) == {frozenset({"t1", "b1", "s1"})}


@pytest.mark.parametrize(
    "p, slot, bike, text",
    [
        (
            Piece(id="x", name="x", category="top", transient=True),
            "top",
            False,
            "not owned",
        ),
        (piece("a", "shoes"), "shoes", True, "bike-safe"),
        (piece("a", "outer", warmth=4), "outer", False, "warmth 4"),
        (piece("a", "top"), "top", False, "not worn yet"),
        (
            piece("a", "top", last_worn=DAY - timedelta(days=1)),
            "top",
            False,
            "worn yesterday",
        ),
        (piece("a", "top", last_worn=date(2026, 10, 3)), "top", False, "worn 3 Oct"),
    ],
)
def test_qualifier(p, slot, bike, text):
    assert closet.qualifier(p, slot, DAY, bike) == text
