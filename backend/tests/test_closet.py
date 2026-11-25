"""closet.py: the day's read, the filter and the outfit without a model."""

from dataclasses import replace
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
        (piece("a", "top", formality=2), "office", True),
        (piece("a", "top", formality=1), "office", False),
        (piece("a", "top", formality=5), "office", False),
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


def test_a_season_miss_costs_the_season_weight():
    args = (3, "weekend", DAY, False)
    ins = closet.score(piece("a", "top", seasons=(11,)), *args)
    out = closet.score(piece("a", "top", seasons=(6, 7, 8)), *args)
    all_year = closet.score(piece("a", "top", seasons=()), *args)
    assert ins == all_year
    assert round(ins - out, 3) == closet.WEIGHTS["season"]


def test_a_graphic_top_costs_the_graphic_weight_for_the_office_only():
    office = (3, "office", DAY, False)
    weekend = (3, "weekend", DAY, False)
    plain = piece("a", "top", graphic=False)
    graphic = piece("a", "top", graphic=True)
    assert (
        round(closet.score(plain, *office) - closet.score(graphic, *office), 3)
        == (closet.WEIGHTS["graphic"])
    )
    assert closet.score(plain, *weekend) == closet.score(graphic, *weekend)


def test_a_graphic_top_ranks_below_a_plain_one_of_equal_fit_for_the_office():
    pieces = [piece("g", "top", graphic=True), piece("p", "top", graphic=False)]
    office = closet.candidates(pieces, Request(DAY, "office"), read(66, 78))
    assert [s.piece.id for s in office.by_slot["top"]][0] == "p"


def test_a_graphic_top_scores_the_same_as_a_plain_one_for_the_weekend():
    args = (3, "weekend", DAY, False)
    assert closet.score(piece("g", "top", graphic=True), *args) == closet.score(
        piece("p", "top", graphic=False), *args
    )


def test_an_unknown_graphic_scores_as_plain():
    args = (3, "office", DAY, False)
    assert closet.score(piece("a", "top", graphic=None), *args) == closet.score(
        piece("a", "top", graphic=False), *args
    )


def test_a_graphic_mid_is_not_penalised():
    args = (3, "office", DAY, False)
    assert closet.score(piece("a", "mid", graphic=True), *args) == closet.score(
        piece("a", "mid", graphic=False), *args
    )


@pytest.mark.parametrize("low, cut", [(49, True), (50, False)])
@pytest.mark.parametrize(
    "category, kw",
    [
        ("top", {"name": "camp shorts"}),
        ("bottom", {"name": "walk shorts"}),
        ("top", {"name": "tee", "subtype": "shorts set"}),
        ("top", {"name": "tee", "material": "Linen"}),
        ("bottom", {"name": "trousers", "material": "linen blend"}),
        ("top", {"name": "linen shirt"}),
        ("bottom", {"name": "linen pants"}),
    ],
)
def test_shorts_and_linen_are_cut_below_fifty(category, kw, low, cut):
    p = piece("a", category, **kw)
    assert closet.clearly_out_of_season(p, read(low, 70)) is cut


def test_wool_and_ordinary_pieces_are_never_cut():
    p = piece("a", "top", name="wool sweater", material="wool")
    assert not closet.clearly_out_of_season(p, read(10, 30))


def test_a_cut_piece_is_out_of_candidates_and_the_swap_fallback():
    # Three other tops keep the pool at MIN_POOL, so the cut holds.
    pieces = [
        piece("t1", "top", name="linen shirt"),
        piece("t2", "top"),
        piece("t3", "top"),
        piece("t4", "top"),
    ]
    cold = read(45, 60)
    got = closet.candidates(pieces, Request(DAY, "weekend"), cold)
    assert {s.piece.id for s in got.by_slot["top"]} == {"t2", "t3", "t4"}
    assert "top" not in got.relaxed
    found = closet.slot_fallback(pieces, "top", Request(DAY, "weekend"), cold)
    assert {s.piece.id for s in found} == {"t2", "t3", "t4"}


def test_a_cold_november_office_day_keeps_its_tops_warmest_first():
    """The 2026-11-20 shape: 37 to 61 F, thirteen summer-tagged tops."""
    summer = [
        piece(
            f"s{i}",
            "top",
            name=f"summer top {i}",
            warmth=2 + i % 2,
            formality=3,
            seasons=(6, 7, 8),
        )
        for i in range(13)
    ]
    autumn = [
        piece(
            f"a{i}",
            "top",
            name=f"autumn top {i}",
            warmth=4,
            formality=3,
            seasons=(9, 10),
        )
        for i in range(3)
    ]
    other = [
        piece(f"o{i}", "top", name=f"plain top {i}", warmth=3, formality=3)
        for i in range(3)
    ]
    cold = read(37, 61)
    got = closet.candidates(summer + autumn + other, Request(DAY, "office"), cold)
    tops = got.by_slot["top"]
    assert len(tops) >= 3
    assert got.fit == 19
    warmth = [s.piece.warmth for s in tops]
    target = got.targets["top"]
    gaps = [abs(w - target) for w in warmth]
    assert gaps == sorted(gaps)


@pytest.mark.parametrize(
    "seasons, month, ok",
    [((), 7, True), ((11, 12, 1), 11, True), ((6, 7, 8), 11, False)],
)
def test_in_season(seasons, month, ok):
    assert closet.in_season(piece("a", "top", seasons=seasons), month) is ok


@pytest.mark.parametrize(
    "days_ago, n, recent",
    [(0, 5, False), (1, 5, True), (5, 5, True), (6, 5, False), (3, 2, False)],
)
def test_a_top_worn_within_n_days_is_recent(days_ago, n, recent):
    p = piece("a", "top", last_worn=DAY - timedelta(days=days_ago))
    assert closet.worn_recently(p, DAY, n) is recent


def test_the_swap_fallback_keeps_the_repeat_rule():
    mild = read(50, 60)
    pieces = [
        piece("t1", "top", name="worn tee", last_worn=DAY - timedelta(days=2)),
        piece("t2", "top", name="rested tee", last_worn=DAY - timedelta(days=9)),
        piece("t3", "top", name="summer tee", seasons=(6, 7, 8)),
    ]
    found = closet.slot_fallback(pieces, "top", Request(DAY, "weekend"), mild)
    assert sorted(s.piece.id for s in found) == ["t2", "t3"]  # season is a score


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
    # The blue tee was worn two days ago; two tops are short of MIN_POOL, so
    # the linen shirt (cut under 50 F) comes back and the plan says so.
    assert {s.piece.id for s in found.by_slot["top"]} == {"t1", "t2", "t3"}
    assert found.relaxed["top"] == ("season",)
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


def test_is_tagged_needs_warmth_and_formality_not_seasons():
    assert closet.is_tagged(piece("a", "top", seasons=()))
    assert not closet.is_tagged(piece("b", "top", warmth=None))
    assert not closet.is_tagged(piece("c", "top", formality=None))


def test_a_tagged_piece_beats_an_untagged_one_in_its_slot():
    # The 2026-11-20 shape on an office day: many tagged tops, one untagged.
    pieces = [piece(f"t{i}", "top", formality=3) for i in range(6)]
    pieces.append(piece("u", "top", name="mystery top", warmth=None, formality=None))
    found = closet.candidates(pieces, Request(DAY, "office"), read(66, 78))
    assert "u" not in {s.piece.id for s in found.by_slot["top"]}
    assert len(found.by_slot["top"]) == 6
    assert "top" not in found.relaxed


def test_a_slot_with_only_untagged_pieces_fills_and_records_it():
    pieces = [
        piece("t1", "top", warmth=None),
        piece("b1", "bottom"),
        piece("s1", "shoes"),
    ]
    found = closet.candidates(pieces, Request(DAY, "weekend"), read(66, 78))
    assert [s.piece.id for s in found.by_slot["top"]] == ["t1"]
    # Superseded: untagged is the last step, not a rule of its own.
    assert found.relaxed["top"] == ("untagged",)


def test_the_swap_fallback_prefers_tagged_pieces():
    pieces = [piece(f"t{i}", "top", name=f"tagged {i}") for i in range(3)]
    pieces.append(piece("u", "top", name="untagged", formality=None))
    found = closet.slot_fallback(pieces, "top", Request(DAY, "weekend"), read(50, 60))
    assert sorted(s.piece.id for s in found) == ["t0", "t1", "t2"]
    only = closet.slot_fallback(
        pieces[3:], "top", Request(DAY, "weekend"), read(50, 60)
    )
    assert [s.piece.id for s in only] == ["u"]


def test_candidates_are_capped_per_slot():
    pieces = [piece(f"t{i:02}", "top") for i in range(20)]
    found = closet.candidates(pieces, Request(DAY, "weekend"), read(66, 78))
    assert len(found.by_slot["top"]) == closet.CANDIDATES_PER_SLOT


def test_the_bike_filters_and_formality_holds():
    # Office is 2 to 4: the tops other than the oxford drop to lounge (1), so
    # the pool starts short and the widened band is what brings them back.
    pieces = [
        replace(p, formality=1) if p.category == "top" and p.id != "t2" else p
        for p in wardrobe()
    ] + [
        piece("s3", "shoes", name="oxfords", formality=3),
        piece("b3", "bottom", name="wide trousers", formality=3),
    ]
    found = closet.candidates(pieces, Request(DAY, "office", bike=True), read(55, 60))
    # The bike rule is never relaxed; the tops are, and the plan says so.
    assert found.by_slot["top"][0].piece.id == "t2"
    assert found.relaxed["top"] == ("formality",)
    # Oxfords and wide trousers never come back, whatever the pool.
    assert {s.piece.id for s in found.by_slot["shoes"]} == {"s1", "s2"}
    assert {s.piece.id for s in found.by_slot["bottom"]} == {"b1", "b2"}


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
    assert len(outfits) == 3  # three tops (one relaxed in), three outfits
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


# --- the minimum pool ---------------------------------------------------------

WARM = read(66, 78)


def tops(n: int, **kw) -> list[Piece]:
    return [piece(f"t{i}", "top", name=f"plain top {i}", **kw) for i in range(n)]


def test_the_constants():
    assert closet.MIN_POOL == 3
    assert closet.RELAX_STEPS == ("formality", "season", "untagged")


def test_a_full_pool_relaxes_nothing():
    found = closet.candidates(tops(3), Request(DAY, "weekend"), WARM)
    assert len(found.by_slot["top"]) == 3
    assert "top" not in found.relaxed


def test_season_is_the_first_step():
    pieces = tops(2) + [piece("l", "top", name="linen shirt")]
    cold = read(40, 60)
    found = closet.candidates(pieces, Request(DAY, "weekend"), cold)
    assert {s.piece.id for s in found.by_slot["top"]} == {"t0", "t1", "l"}
    assert found.relaxed["top"] == ("season",)


def test_formality_widens_one_step_each_side_and_no_further():
    # Weekend is 1 to 3: formality 4 comes in, formality 5 stays out.
    pieces = tops(2, formality=3) + [
        piece("f4", "top", name="smart top", formality=4),
        piece("f5", "top", name="suit top", formality=5),
    ]
    found = closet.candidates(pieces, Request(DAY, "weekend"), WARM)
    assert {s.piece.id for s in found.by_slot["top"]} == {"t0", "t1", "f4"}
    # Season was tried and added nothing, so only formality is recorded.
    assert found.relaxed["top"] == ("formality",)


def test_formality_widening_is_clamped_to_the_scale():
    assert closet.fits_occasion(piece("a", "top", formality=5), "office", 1)
    assert closet.fits_occasion(piece("a", "top", formality=1), "office", 1)
    assert closet.fits_occasion(piece("a", "top", formality=1), "office", 9)
    assert not closet.fits_occasion(piece("a", "top", formality=5), "weekend", 1)
    assert closet.fits_occasion(piece("a", "top", formality=1), "wfh", 1)


def test_formality_widening_stops_at_one_on_the_low_side():
    assert not closet.fits_occasion(piece("a", "top", formality=1), "event", 1)
    assert closet.fits_occasion(piece("a", "top", formality=2), "event", 1)


def test_the_original_2026_11_20_shape_needs_no_relaxation_for_office():
    # Flannel-like tops tagged 2, as the unanchored prompt gave them: office
    # is 2 to 4 now, so they are in the pool without loosening anything.
    flannels = [
        piece(
            f"f{i}",
            "top",
            name=f"flannel {i}",
            warmth=4,
            formality=2,
            seasons=(10, 11, 12),
        )
        for i in range(2)
    ]
    oxfords = [
        piece(
            f"x{i}",
            "top",
            name=f"oxford {i}",
            warmth=3,
            formality=3,
            seasons=(3, 4, 9, 10),
        )
        for i in range(2)
    ]
    pieces = (
        flannels
        + oxfords
        + [piece(f"b{i}", "bottom", name=f"pants {i}", formality=3) for i in range(4)]
        + [piece(f"h{i}", "shoes", name=f"shoes {i}", formality=3) for i in range(4)]
    )
    found = closet.candidates(pieces, Request(DAY, "office"), read(37, 61))
    assert "top" not in found.relaxed
    assert {"f0", "f1"} <= {s.piece.id for s in found.by_slot["top"]}


def test_untagged_is_the_last_step():
    pieces = tops(2) + [piece("u", "top", name="mystery top", warmth=None)]
    found = closet.candidates(pieces, Request(DAY, "weekend"), WARM)
    assert {s.piece.id for s in found.by_slot["top"]} == {"t0", "t1", "u"}
    assert found.relaxed["top"] == ("untagged",)


def test_a_slot_stops_relaxing_once_it_has_three():
    pieces = tops(1) + [
        piece("l", "top", name="linen shirt"),
        piece("l2", "top", name="linen tee"),
        piece("u", "top", name="mystery top", warmth=None),
    ]
    found = closet.candidates(pieces, Request(DAY, "weekend"), read(40, 60))
    assert found.relaxed["top"] == ("season",)
    assert "u" not in {s.piece.id for s in found.by_slot["top"]}


def test_the_one_candidate_pool_records_no_step_that_added_nothing():
    pieces = tops(1)
    found = closet.candidates(pieces, Request(DAY, "weekend"), WARM)
    assert [s.piece.id for s in found.by_slot["top"]] == ["t0"]
    assert "top" not in found.relaxed
    assert found.short["top"] == 1


def test_a_step_that_adds_nothing_is_not_recorded():
    # Only a linen piece to add: season counts, formality and untagged do not.
    pieces = tops(1) + [piece("l", "top", name="linen shirt")]
    found = closet.candidates(pieces, Request(DAY, "weekend"), read(40, 60))
    assert found.relaxed["top"] == ("season",)
    assert found.short["top"] == 2


def test_a_full_slot_and_a_fixed_slot_are_not_short():
    found = closet.candidates(tops(3), Request(DAY, "weekend"), WARM)
    assert "top" not in found.short
    locked = closet.candidates(tops(1), Request(DAY, "weekend", lock="t0"), WARM)
    assert "top" not in locked.short


def test_the_hard_rules_are_never_relaxed():
    request = Request(DAY, "weekend", bike=True)
    pieces = [
        piece("w", "bottom", name="wide trousers"),
        piece("t", "top", name="tee", last_worn=DAY - timedelta(days=1)),
    ]
    found = closet.candidates(pieces, request, WARM)
    assert found.by_slot["bottom"] == []  # the bike rule holds
    assert found.by_slot["top"] == []  # worn yesterday
    assert "bottom" not in found.relaxed
    assert found.short["bottom"] == 0


def test_a_fixed_slot_records_no_relaxation():
    found = closet.candidates(tops(1), Request(DAY, "weekend", lock="t0"), WARM)
    assert "top" not in found.relaxed


def test_the_swap_fallback_relaxes_like_the_plan():
    pieces = tops(2) + [piece("l", "top", name="linen shirt")]
    found = closet.slot_fallback(pieces, "top", Request(DAY, "weekend"), read(40, 60))
    assert {s.piece.id for s in found} == {"t0", "t1", "l"}


@pytest.mark.parametrize(
    "kw, cut",
    [
        ({"name": "shortsleeve tee"}, False),
        ({"name": "shortstop jersey"}, False),
        ({"name": "tee", "subtype": "short-sleeve"}, False),
        ({"name": "Cargo Shorts"}, True),
        ({"name": "Linen shirt"}, True),
        ({"name": "tee", "material": "linen blend"}, True),
        ({"name": "tee", "material": "cotton, linen"}, True),
    ],
)
def test_shorts_and_linen_match_whole_words(kw, cut):
    assert closet.clearly_out_of_season(piece("a", "top", **kw), read(40, 60)) is cut


def test_a_season_matching_top_outranks_a_season_missing_one_at_equal_warmth():
    # The 2026-11-20 replay: summer-tagged tops against an autumn one.
    pieces = [
        piece(f"s{i}", "top", name=f"summer top {i}", seasons=(6, 7, 8))
        for i in range(2)
    ] + [piece("a", "top", name="zzz autumn top", seasons=(10, 11))]
    found = closet.candidates(pieces, Request(DAY, "weekend"), read(37, 61))
    assert found.by_slot["top"][0].piece.id == "a"


# --- distinct tops ------------------------------------------------------------


def roomy(n_tops: int) -> list[Piece]:
    return (
        tops(n_tops)
        + [piece(f"b{i}", "bottom", name=f"pants {i}") for i in range(5)]
        + [piece(f"s{i}", "shoes", name=f"shoes {i}") for i in range(5)]
    )


def top_ids(outfits) -> list[str]:
    return [dict(o.pieces)["top"].id for o in outfits]


def test_the_template_gives_every_outfit_its_own_top():
    found = closet.candidates(roomy(3), Request(DAY, "weekend"), WARM)
    got = closet.template(found)
    assert len(got) == 3 and len(set(top_ids(got))) == 3


def test_distinct_tops_hold_when_a_recent_outfit_is_skipped():
    found = closet.candidates(roomy(4), Request(DAY, "weekend"), WARM)
    lead = closet.template(found)[0]
    got = closet.template(found, recent={lead.key})
    assert len(got) == 3 and len(set(top_ids(got))) == 3


def test_a_short_top_pool_shares_the_top():
    found = closet.candidates(roomy(1), Request(DAY, "weekend"), WARM)
    got = closet.template(found)
    assert len(got) == 3
    assert set(top_ids(got)) == {"t0"}
    assert closet.top_pool(found) == 1


def test_two_tops_are_used_before_one_repeats():
    found = closet.candidates(roomy(2), Request(DAY, "weekend"), WARM)
    got = closet.template(found)
    assert top_ids(got)[:2] == ["t0", "t1"]
    assert closet.top_pool(found) == 2


# --- fix round 2 ----------------------------------------------------------------


def test_untagged_fillers_rank_below_every_tagged_piece():
    # A short outer slot (target warmth 5): one good coat, a poor linen one
    # that only the season step brings back, and two untagged coats. Tagged
    # first, even the poor one; untagged only fill the count.
    pieces = [
        piece("o1", "outer", name="coat a", warmth=4),
        piece("o3", "outer", name="linen jacket", warmth=2),
        piece("u1", "outer", name="mystery coat 1", warmth=None, formality=None),
        piece("u2", "outer", name="mystery coat 2", warmth=None, formality=None),
    ]
    found = closet.candidates(pieces, Request(DAY, "weekend"), read(10, 30))
    ids = [s.piece.id for s in found.by_slot["outer"]]
    assert ids[:2] == ["o1", "o3"] and set(ids[2:]) == {"u1", "u2"}
    assert found.relaxed["outer"] == ("season", "untagged")


def test_formality_is_relaxed_before_season():
    # office, 37 to 61 F: a linen trouser must not beat a warm cord one.
    bottoms = [
        piece("wool", "bottom", name="wool trouser", warmth=4, formality=3),
        piece("jeans", "bottom", name="jeans", warmth=3, formality=3),
        piece("linen", "bottom", name="linen trouser", warmth=2, formality=3),
        piece("chino", "bottom", name="chino", warmth=3, formality=1),
        piece("cord", "bottom", name="cord", warmth=4, formality=1),
    ]
    found = closet.candidates(bottoms, Request(DAY, "office"), read(37, 61))
    ids = {s.piece.id for s in found.by_slot["bottom"]}
    assert found.relaxed["bottom"] == ("formality",)
    assert "linen" not in ids and {"wool", "jeans", "chino", "cord"} == ids


def test_the_2026_11_20_shape_end_to_end():
    summer = [
        piece(
            f"s{i}",
            "top",
            name=f"summer top {i}",
            warmth=2,
            formality=1,
            seasons=(6, 7, 8),
        )
        for i in range(13)
    ]
    oxfords = [
        piece(
            f"x{i}",
            "top",
            name=f"oxford {i}",
            warmth=3,
            formality=3,
            seasons=(3, 4, 9, 10),
        )
        for i in range(2)
    ]
    flannels = [
        piece(
            f"f{i}",
            "top",
            name=f"flannel {i}",
            warmth=4,
            formality=1,
            seasons=(10, 11, 12),
        )
        for i in range(2)
    ]
    tee = piece("u", "top", name="mystery tee", warmth=None, formality=None)
    other = piece("o", "top", name="plain knit", warmth=3, formality=1)
    pieces = (
        summer
        + oxfords
        + flannels
        + [tee, other]
        + [piece(f"b{i}", "bottom", name=f"pants {i}", formality=3) for i in range(4)]
        + [piece(f"h{i}", "shoes", name=f"shoes {i}", formality=3) for i in range(4)]
    )
    assert len([p for p in pieces if p.category == "top"]) == 19
    found = closet.candidates(pieces, Request(DAY, "office"), read(37, 61))
    assert found.relaxed["top"] == ("formality",)
    assert "u" not in {s.piece.id for s in found.by_slot["top"]}
    got = closet.template(found)
    assert len(got) == 3 and len(set(top_ids(got))) == 3


# --- turned-down pieces (#551) --------------------------------------------------


def test_an_excluded_top_never_appears_even_when_the_slot_relaxes():
    # Two tops plus a linen one the season rule would only admit by relaxing.
    pieces = tops(2) + [piece("l", "top", name="linen shirt")]
    request = Request(DAY, "weekend", excluded=frozenset({"t0", "l"}))
    found = closet.candidates(pieces, request, read(40, 60))
    assert [s.piece.id for s in found.by_slot["top"]] == ["t1"]
    assert found.short["top"] == 1
    # The footnote does not count it as fitting (t0 only; linen is cut anyway).
    assert found.fit == 1


def test_the_swap_fallback_drops_an_excluded_piece_too():
    pieces = tops(2) + [piece("l", "top", name="linen shirt")]
    request = Request(DAY, "weekend", excluded=frozenset({"l"}))
    found = closet.slot_fallback(pieces, "top", request, read(40, 60))
    assert {s.piece.id for s in found} == {"t0", "t1"}


def test_a_lock_on_an_excluded_piece_keeps_it():
    request = Request(DAY, "weekend", lock="t0", excluded=frozenset({"t0"}))
    found = closet.candidates(tops(3), request, WARM)
    assert found.fixed is not None and found.fixed.id == "t0"
