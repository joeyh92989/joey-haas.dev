"""The cull: closet.py's Review flags, the deck, the season turn and due-back."""

from datetime import date

import pytest

import closet
from closet import Held

DAY = date(2026, 11, 10)
YEAR_AGO = date(2025, 11, 1)
SUMMER = (5, 6, 7, 8, 9)
WINTER = (11, 12, 1, 2, 3)


def held(key="piece", **fields) -> Held:
    values = {
        "id": key,
        "name": key,
        "category": "top",
        "status": "active",
        "owned_since": YEAR_AGO,
        "wears_12mo": 10,
    }
    values.update(fields)
    return Held(**values)


def kinds(pieces, day=DAY, turn_open=False) -> dict[str, list[str]]:
    flags = closet.flags_for(pieces, day, turn_open)
    return {key: [flag.kind for flag in found] for key, found in flags.items()}


# One row per flag: the pieces, the day, whether a turn is open, and the
# kinds expected for the piece named "x" (an empty list: no flag).
CASES = [
    (
        "unworn: a year owned, never worn",
        [held("x", wears_12mo=0)],
        DAY,
        False,
        ["unworn"],
    ),
    (
        "unworn: bought mid-season is not never worn",
        [held("x", wears_12mo=0, owned_since=date(2026, 10, 1))],
        DAY,
        False,
        [],
    ),
    (
        "unworn: owned all year but in season only in summer, worn 0",
        [held("x", wears_12mo=0, seasons=SUMMER)],
        date(2026, 9, 30),
        False,
        ["unworn"],
    ),
    (
        "unworn: bought in August, its winter season not yet seen",
        [held("x", wears_12mo=0, seasons=(12, 1, 2), owned_since=date(2026, 8, 1))],
        DAY,
        False,
        [],
    ),
    (
        "rare: twice against peers averaging ten",
        [held("x", wears_12mo=2), held("a"), held("b")],
        DAY,
        False,
        ["rare"],
    ),
    (
        "rare: peers averaging four is not many more",
        [held("x", wears_12mo=2), held("a", wears_12mo=4), held("b", wears_12mo=4)],
        DAY,
        False,
        [],
    ),
    (
        "rare: peers in another category do not count",
        [held("x", wears_12mo=1), held("a", category="shoes")],
        DAY,
        False,
        [],
    ),
    (
        "out of season: summer piece at the autumn turn",
        [held("x", seasons=SUMMER)],
        date(2026, 10, 25),
        True,
        ["out_of_season"],
    ),
    (
        "out of season: winter piece at the spring turn",
        [held("x", seasons=WINTER)],
        date(2026, 4, 25),
        True,
        ["out_of_season"],
    ),
    (
        "out of season: not flagged while no turn is open",
        [held("x", seasons=SUMMER)],
        date(2026, 11, 10),
        False,
        [],
    ),
    (
        "out of season: its window opens within three months",
        [held("x", seasons=(1, 2))],
        date(2026, 11, 10),
        True,
        [],
    ),
    (
        "condition: a note naming pilling",
        [held("x", notes="Pilled under the arms")],
        DAY,
        False,
        ["condition"],
    ),
    ("condition: a harmless note", [held("x", notes="Gift from Sam")], DAY, False, []),
    (
        "duplicate: four navy tops at 3, the least worn flagged",
        [
            held("keep", primary_color="Navy", formality=3, wears_12mo=20),
            held("b", primary_color="navy", formality=3, wears_12mo=9),
            held("c", primary_color="navy", formality=3, wears_12mo=8),
            held("x", primary_color="navy", formality=3, wears_12mo=7),
        ],
        DAY,
        False,
        ["duplicate"],
    ),
    (
        "duplicate: three alike is not a cluster",
        [
            held("a", primary_color="navy", formality=3),
            held("b", primary_color="navy", formality=3),
            held("x", primary_color="navy", formality=3),
        ],
        DAY,
        False,
        [],
    ),
    (
        "only active garments are flagged",
        [held("x", wears_12mo=0, status="packed")],
        DAY,
        False,
        [],
    ),
]


@pytest.mark.parametrize(
    "pieces,day,turn_open,expected",
    [case[1:] for case in CASES],
    ids=[case[0] for case in CASES],
)
def test_flags(pieces, day, turn_open, expected):
    assert kinds(pieces, day, turn_open).get("x", []) == expected


def test_the_most_worn_of_a_cluster_is_kept_and_named():
    pieces = [
        held(
            "keep", name="navy oxford", primary_color="navy", formality=3, wears_12mo=20
        ),
        *[
            held(n, primary_color="navy", formality=3, wears_12mo=5)
            for n in ("b", "c", "d")
        ],
    ]
    flags = closet.flags_for(pieces, DAY)
    assert "keep" not in flags
    assert flags["b"][0].sentence == (
        "One of 4 navy tops at formality 3; you wear the navy oxford most."
    )


def test_sentences_are_full_sentences():
    pieces = [
        held("x", wears_12mo=0, notes="stained cuff", seasons=SUMMER),
        held("r", wears_12mo=1),
        held("a"),
        held("b"),
    ]
    flags = closet.flags_for(pieces, date(2026, 10, 25), turn_open=True)
    sentences = [flag.sentence for flag in flags["x"]]
    assert sentences == [
        "Not worn in the last twelve months, though it was in season for "
        "21 weeks of them.",
        "Your note says “stained cuff”.",
        "Out of season until May: it is worn May to September.",
    ]
    assert flags["r"][0].sentence == (
        "Worn once in twelve months; your other tops averaged 7."
    )


def test_season_window_reads_across_the_new_year():
    assert closet.season_window(WINTER) == "November to March"
    assert closet.season_window(()) == "all year"
    assert closet.season_window((7,)) == "July"


@pytest.mark.parametrize(
    "flags,expected",
    [
        (["condition", "out_of_season"], "donate"),
        (["unworn", "duplicate"], "sell"),
        (["rare"], "donate"),
        (["duplicate"], "donate"),
        (["out_of_season"], "pack"),
    ],
)
def test_suggested_outcome(flags, expected):
    assert closet.suggest([closet.Flag(kind, "") for kind in flags]) == expected


def test_deck_orders_by_flag_count_then_strength_then_name():
    pieces = [
        held("b-rare", wears_12mo=1),
        held("a-unworn", wears_12mo=0),
        held("two", wears_12mo=0, notes="torn hem"),
        *[held(f"peer{n}", wears_12mo=20) for n in range(3)],
    ]
    cards = closet.deck(pieces, DAY)
    assert [card.held.id for card in cards] == ["two", "a-unworn", "b-rare"]


def test_deck_leaves_out_what_was_kept_since_the_turn():
    pieces = [held("x", wears_12mo=0)]
    assert closet.deck(pieces, DAY, kept_since={"x"}) == []


def test_deck_prefills_the_bring_back_month():
    card = closet.deck([held("x", seasons=SUMMER)], date(2026, 10, 25), True)[0]
    assert card.suggested == "pack"
    assert card.back_on == date(2027, 5, 1)


@pytest.mark.parametrize(
    "day,name,on",
    [
        (date(2026, 11, 10), "autumn", date(2026, 10, 25)),
        (date(2026, 4, 25), "spring", date(2026, 4, 25)),
        (date(2026, 4, 24), "autumn", date(2025, 10, 25)),
        (date(2026, 1, 3), "autumn", date(2025, 10, 25)),
    ],
)
def test_current_turn(day, name, on):
    assert closet.current_turn(day, "04-25", "10-25") == closet.Turn(name, on)


def test_next_turn_reads_roughly():
    turn = closet.next_turn(DAY, "04-25", "10-25")
    assert turn == closet.Turn("spring", date(2027, 4, 25))
    assert closet.roughly(turn.on) == "late April"
    assert closet.roughly(date(2026, 10, 5)) == "early October"


def test_turn_members_at_both_turns():
    pieces = [
        held("summer", seasons=SUMMER),
        held("winter", seasons=WINTER),
        held("always"),
        held("packed", seasons=SUMMER, status="packed"),
    ]
    autumn = closet.turn_members(pieces, date(2026, 10, 25))
    spring = closet.turn_members(pieces, date(2026, 4, 25))
    assert [h.id for h in autumn] == ["summer"]
    assert [h.id for h in spring] == ["winter"]


def test_due_back_is_packed_with_its_month_come():
    pieces = [
        held("due", status="packed", back_on=date(2026, 11, 1)),
        held("later", status="packed", back_on=date(2026, 12, 1)),
        held("active", back_on=None),
    ]
    assert [h.id for h in closet.due_back(pieces, DAY)] == ["due"]
