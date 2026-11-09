"""The live public set (recommendation engine spec, "The public set is
live"). Pure: build_public_sets over picker items, no database. The HTTP
side is in test_public_outputs.py."""

from datetime import date

from picker import PickerItem
from public_picks import LANE_SIZES, build_public_sets

TODAY = date(2026, 11, 9)


def item(id: str, **fields) -> PickerItem:
    base = dict(
        id=id,
        title=id.title(),
        type="game",
        status="backlog",
        owned=True,
        rating=None,
        favorite=False,
        pinned=False,
        external_id=None,
        year=None,
        cover_url=None,
        platform_id=None,
        platform=None,
        creator=None,
        genres=(),
        themes=(),
        keywords=(),
        game_modes=(),
        player_perspectives=(),
        similar_games=(),
        community_score=None,
        time_to_beat_hours=None,
        release_date=None,
        acquired_at=None,
        started_at=None,
        finished_at=None,
    )
    merged = {**base, **fields}
    if "tags" not in fields:
        merged["tags"] = tuple(
            (kind, value)
            for kind in ("genres", "themes", "keywords")
            for value in merged[kind]
        )
        merged.setdefault("source", "igdb")
    return PickerItem(**merged)


def _finished(id: str, hours: float, **fields) -> PickerItem:
    return item(
        id,
        status="finished",
        finished_at=date(2026, 11, 1),
        time_to_beat_hours=hours,
        **fields,
    )


def test_each_lane_publishes_at_most_its_size_and_best_fit_leads():
    games = [item(f"game{n}") for n in range(6)]
    comics = [
        item(f"comic{n}", type="comic", issues_owned_count=10, issues_read=0)
        for n in range(4)
    ]
    movies = [item(f"movie{n}", type="movie", runtime_minutes=95) for n in range(4)]
    sets = build_public_sets(games + comics + movies, frozenset(), TODAY)

    for lane, size in LANE_SIZES.items():
        assert len(sets[lane]) == size
        assert sets[lane][0].slot == "best_fit"
        assert sets[lane][0].slot_label == "Best fit"


def test_an_empty_lane_is_an_empty_list():
    sets = build_public_sets([item("only")], frozenset(), TODAY)
    assert [pick.item.id for pick in sets["game"]] == ["only"]
    assert sets["comic"] == [] and sets["movie"] == []


def test_the_pool_leaves_out_the_game_in_hand_the_refused_and_the_unowned():
    sets = build_public_sets(
        [
            item("keep"),
            item("paused", status="paused"),
            item("playing", status="active"),
            item("refused"),
            item("wanted", owned=False),
            item("pinned", pinned=True),
            _finished("done", 10),
        ],
        frozenset({"refused"}),
        TODAY,
    )
    assert {pick.item.id for pick in sets["game"]} == {"keep", "paused"}


def test_a_comic_with_nothing_left_to_read_is_not_picked():
    sets = build_public_sets(
        [
            item("unread", type="comic", issues_owned_count=8, issues_read=2),
            item("caught_up", type="comic", issues_owned_count=8, issues_read=8),
        ],
        frozenset(),
        TODAY,
    )
    assert [pick.item.id for pick in sets["comic"]] == ["unread"]


def test_change_of_pace_leads_with_its_contrast_against_a_public_last_finish():
    # Both candidates differ from the long last finish in size band, so the
    # second pick has a contrast whichever of them ranks first.
    rows = [
        _finished("epic", 60.4),
        item("short", time_to_beat_hours=5),
        item("medium", time_to_beat_hours=10),
    ]
    (_lead, pace) = build_public_sets(rows, frozenset(), TODAY)["game"]

    assert pace.slot_label == "Change of pace"
    hours = round(pace.item.time_to_beat_hours)
    assert pace.reasons[0] == f"About {hours} h to finish, after 60 h of Epic"


def test_change_of_pace_is_unlabelled_when_the_last_finish_is_private():
    rows = [
        _finished("epic", 60),
        item("short", time_to_beat_hours=5),
        item("medium", time_to_beat_hours=10),
    ]
    picks = build_public_sets(rows, frozenset(), TODAY, pace_withheld=True)["game"]

    assert [pick.slot for pick in picks] == ["best_fit", None]
    assert not any("after" in reason for pick in picks for reason in pick.reasons)


def test_with_no_last_finish_the_second_pick_stands_unlabelled():
    rows = [item("a", time_to_beat_hours=5), item("b", time_to_beat_hours=50)]
    picks = build_public_sets(rows, frozenset(), TODAY)["game"]
    assert [pick.slot_label for pick in picks] == ["Best fit", None]


def test_overdue_classic_is_the_oldest_release_left_and_says_so():
    rows = [
        item("a", release_date=date(2001, 5, 1)),
        item("b", release_date=date(1999, 3, 1)),
        item("c", release_date=date(2010, 1, 1)),
        item("d", release_date=date(2015, 1, 1)),
    ]
    picks = build_public_sets(rows, frozenset(), TODAY)["game"]
    third = picks[2]
    taken = {pick.item.id for pick in picks[:2]}
    left = [row for row in rows if row.id not in taken]

    assert third.slot_label == "Overdue classic"
    assert third.item.release_date == min(row.release_date for row in left)
    assert third.reasons[0] == f"Out since {third.item.release_date.year}"


def test_no_label_but_best_fit_stands_without_its_reason():
    """AC 4: Change of pace and Overdue classic are published only with the
    reason that makes them true."""
    rows = [
        _finished("epic", 60),
        item("short", time_to_beat_hours=5, release_date=date(2003, 1, 1)),
        item("medium", time_to_beat_hours=10, release_date=date(2008, 1, 1)),
        item("long", time_to_beat_hours=70, release_date=date(1998, 1, 1)),
        item("unknown"),
    ]
    for withheld in (False, True):
        sets = build_public_sets(rows, frozenset(), TODAY, pace_withheld=withheld)
        for pick in sets["game"]:
            if pick.slot not in (None, "best_fit"):
                assert pick.reasons, pick


def test_the_set_is_a_pure_function_of_its_inputs():
    rows = [item(f"g{n}", time_to_beat_hours=n + 1) for n in range(8)]
    first = build_public_sets(rows, frozenset(), TODAY)
    again = build_public_sets(list(reversed(rows)), frozenset(), TODAY)
    assert [p.item.id for p in first["game"]] == [p.item.id for p in again["game"]]
