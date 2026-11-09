"""Pick for me's pure ranking: picker.public_pick_table and its keys."""

from datetime import date

from picker import (
    MOOD_BUCKETS,
    PUBLIC_TERMS,
    combo_key,
    combo_keys,
    public_pick_table,
)
from tests.test_picker import item

TODAY = date(2026, 11, 8)


def test_eighty_eight_combinations_one_key_each():
    keys = [combo_key(size, moods) for size, moods in combo_keys()]
    assert len(keys) == 4 * (1 + len(MOOD_BUCKETS) + 15) == 88
    assert len(set(keys)) == 88
    assert "any|" in keys
    assert combo_key("short", ("story", "cozy")) == "short|cozy+story"


def test_every_combination_is_in_the_table_even_when_empty():
    table = public_pick_table([], [], TODAY)
    assert len(table.combos) == 88
    assert all(picks == () for picks in table.combos.values())
    assert table.reasons == {}


def test_moods_are_hard_filters_and_size_is_a_term():
    cozy = item("cozy", genres=("Simulator",), time_to_beat_hours=40)
    brawl = item("brawl", genres=("Fighting",), time_to_beat_hours=3)
    table = public_pick_table([], [cozy, brawl], TODAY)
    assert [p.item_id for p in table.combos["any|cozy"]] == ["cozy"]
    # Short does not drop the long game; it ranks it lower.
    assert [p.item_id for p in table.combos["short|"]] == ["brawl", "cozy"]
    assert table.combos["short|"][1].terms["length_fit"] == 0.0


def test_ties_break_on_title_then_id_and_the_order_is_stable():
    games = [item(name) for name in ("delta", "alpha", "charlie", "bravo")]
    first = public_pick_table([], games, TODAY)
    again = public_pick_table([], list(reversed(games)), TODAY)
    assert [p.item_id for p in first.combos["any|"]] == ["alpha", "bravo", "charlie"]
    assert first == again


def test_only_public_terms_are_scored():
    table = public_pick_table([], [item("solo")], TODAY)
    (pick,) = table.combos["any|"]
    assert set(pick.terms) == set(PUBLIC_TERMS)
    # Neutral affinity and quality, no similarity, full fit: (35*50+15*50+15*100)/85
    assert pick.score == round((35 * 50 + 15 * 50 + 15 * 100) / 85, 1)


def test_the_profile_moves_scores_and_names_reasons():
    loved = item("loved", favorite=True, rating=10, genres=("Puzzle",))
    puzzle = item("puzzle", genres=("Puzzle",))
    other = item("other", genres=("Racing",))
    table = public_pick_table([loved, puzzle, other], [puzzle, other], TODAY)
    assert table.combos["any|"][0].item_id == "puzzle"
    assert table.reasons["puzzle"]
    assert all("Loved" in r or "Puzzle" in r for r in table.reasons["puzzle"])


def test_the_pool_keeps_candidates_rules():
    pool = [
        item("pinned", pinned=True),
        item("done", status="finished"),
        item("wish", owned=False),
        item("book", type="book"),
        item("ok"),
    ]
    table = public_pick_table([], pool, TODAY)
    assert [p.item_id for p in table.combos["any|"]] == ["ok"]


def test_the_band_reads_the_same_keys():
    """frontend/src/lib/pick-for-me-keys.json is what pickForMe.test.js checks
    the band's own keys against; regenerate it when combo_keys changes."""
    import json
    from pathlib import Path

    path = Path(__file__).parents[2] / "frontend/src/lib/pick-for-me-keys.json"
    expected = [combo_key(size, moods) for size, moods in combo_keys()]
    assert json.loads(path.read_text()) == expected
