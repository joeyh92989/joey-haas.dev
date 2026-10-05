"""What's next sectioning (Spine Next spec, B6). Pure: no database.

The rules were AdminStoreList.jsx's radarSection/buildList/periodEnd; their
cases moved here when the page started reading the server's sections.
"""

from datetime import date, timedelta

from next_list import (
    LATER_CAP,
    MAX_PUBLIC_REASONS,
    NOT_ON_CARTRIDGE_CAP,
    NextCandidate,
    catalogue_item,
    period_end,
    public_reasons_for,
    public_taste,
    sections,
)
from picker import PickerItem

TODAY = date(2026, 10, 4)


def cand(n, **fields) -> NextCandidate:
    base = dict(
        kind="radar",
        igdb_id=str(n),
        platform_id=508,
        platform="Nintendo Switch 2",
        title=f"Game {n}",
        physical_format="game_card",
        lane="dated",
        release_date=date(2026, 9, 1),
        release_precision="day",
        release_source="registry",
        score=50,
    )
    return NextCandidate(**{**base, **fields})


def titles(entries):
    return [entry.candidate.title for entry in entries]


def test_period_end_covers_month_quarter_year_and_day():
    assert period_end(date(2026, 2, 1), "month") == date(2026, 2, 28)
    assert period_end(date(2026, 4, 1), "quarter") == date(2026, 6, 30)
    assert period_end(date(2026, 1, 1), "year") == date(2026, 12, 31)
    assert period_end(date(2026, 3, 9), None) == date(2026, 3, 9)


def test_a_released_cartridge_is_buy_now_and_a_discover_pick_is_a_top_pick():
    out = sections(
        [cand(1), cand(2, kind="discover", lane=None, rank=0)], TODAY, public=False
    )
    assert titles(out["buy_now"]) == ["Game 2", "Game 1"]
    assert [entry.top_pick for entry in out["buy_now"]] == [True, False]


def test_a_month_dated_cartridge_is_not_out_until_the_month_ends():
    month = cand(1, release_date=date(2026, 10, 1), release_precision="month")
    out = sections([month], TODAY, public=False)
    assert titles(out["preorders"]) == ["Game 1"]


def test_preorders_are_within_ninety_days_soonest_first():
    near = cand(1, release_date=TODAY + timedelta(days=60))
    nearer = cand(2, release_date=TODAY + timedelta(days=10))
    far = cand(3, release_date=TODAY + timedelta(days=120))
    quarter = cand(4, release_date=date(2026, 10, 1), release_precision="quarter")
    out = sections([near, nearer, far, quarter], TODAY, public=False)
    assert titles(out["preorders"]) == ["Game 2", "Game 1"]
    assert titles(out["later"]) == ["Game 4", "Game 3"]


def test_digital_and_key_cards_are_not_on_cartridge():
    out = sections(
        [
            cand(1, lane="digital", physical_format=None),
            cand(2, physical_format="game_key_card"),
            cand(3, physical_format="code_in_box"),
        ],
        TODAY,
        public=False,
    )
    assert sorted(titles(out["not_on_cartridge"])) == ["Game 1", "Game 2", "Game 3"]


def test_later_and_not_on_cartridge_are_capped():
    far = [cand(n, release_date=TODAY + timedelta(days=200 + n)) for n in range(20)]
    digital = [cand(100 + n, lane="digital", physical_format=None) for n in range(20)]
    out = sections(far + digital, TODAY, public=False)
    assert len(out["later"]) == LATER_CAP
    assert len(out["not_on_cartridge"]) == NOT_ON_CARTRIDGE_CAP


def test_dedupe_is_by_game_and_platform_not_title():
    same_title = [cand(1, title="Twin"), cand(2, title="Twin")]
    both_lists = [cand(3, kind="discover", lane=None), cand(3)]
    other_platform = [cand(4), cand(4, platform_id=130, platform="Nintendo Switch")]
    out = sections(same_title + both_lists + other_platform, TODAY, public=False)
    keys = [(e.candidate.igdb_id, e.candidate.platform_id) for e in out["buy_now"]]
    assert sorted(keys) == sorted(
        [("1", 508), ("2", 508), ("3", 508), ("4", 508), ("4", 130)]
    )
    assert next(e for e in out["buy_now"] if e.candidate.igdb_id == "3").top_pick


def test_an_unreleased_discover_pick_is_dropped():
    out = sections(
        [cand(1, kind="discover", lane=None, release_date=TODAY + timedelta(days=5))],
        TODAY,
        public=False,
    )
    assert all(not entries for entries in out.values())


def test_new_is_a_cartridge_released_in_the_last_thirty_days():
    fresh = cand(1, release_date=TODAY - timedelta(days=30))
    old = cand(2, release_date=TODAY - timedelta(days=31))
    out = sections([fresh, old], TODAY, public=False)
    assert {e.candidate.title: e.new for e in out["buy_now"]} == {
        "Game 1": True,
        "Game 2": False,
    }


def test_public_mode_uses_registry_dates_only():
    store_soon = cand(
        1, release_source="store", release_date=TODAY + timedelta(days=20)
    )
    store_out = cand(2, release_source="store")
    registry_soon = cand(3, release_date=TODAY + timedelta(days=30))
    far = cand(4, release_date=TODAY + timedelta(days=200))
    admin = sections([store_soon, store_out, registry_soon, far], TODAY, public=False)
    public = sections([store_soon, store_out, registry_soon, far], TODAY, public=True)
    assert titles(admin["preorders"]) == ["Game 1", "Game 3"]
    assert titles(public["preorders"]) == ["Game 3"]
    # Store-only dates count as undated: after the dated rows in Later (soonest
    # first), then best first, with no date shown.
    assert titles(public["later"]) == ["Game 4", "Game 1", "Game 2"]
    assert [e.date_shown for e in public["later"]][1:] == [None, None]


def test_public_buy_now_shows_registry_dates_and_never_a_discover_date():
    out = sections([cand(1), cand(2, kind="discover", lane=None)], TODAY, public=True)
    shown = {e.candidate.title: e.date_shown for e in out["buy_now"]}
    assert shown == {"Game 1": date(2026, 9, 1), "Game 2": None}


def test_a_cartridge_with_no_date_goes_last_in_later():
    out = sections(
        [cand(1, release_date=None), cand(2, release_date=TODAY + timedelta(days=200))],
        TODAY,
        public=False,
    )
    assert titles(out["later"]) == ["Game 2", "Game 1"]


def test_an_unknown_format_is_left_out():
    out = sections([cand(1, physical_format=None, lane="dated")], TODAY, public=False)
    assert all(not entries for entries in out.values())


def owned(item_id, title, **fields) -> PickerItem:
    base = dict(
        id=item_id,
        title=title,
        type="game",
        status="finished",
        owned=True,
        rating=9,
        favorite=False,
        pinned=False,
        external_id=None,
        year=2020,
        cover_url=None,
        platform_id=130,
        platform="Nintendo Switch",
        creator=None,
        genres=("Adventure",),
        themes=("Mystery",),
        keywords=("detective",),
        game_modes=(),
        player_perspectives=(),
        similar_games=(),
        community_score=None,
        time_to_beat_hours=None,
        release_date=None,
        acquired_at=None,
        started_at=None,
    )
    return PickerItem(**{**base, **fields})


SNAPSHOT = {"genres": ["Adventure"], "themes": ["Mystery"], "keywords": ["detective"]}


def test_model_text_survives_only_when_it_cites_public_games():
    taste = public_taste([owned("pub", "Public Game")], ["Secret Game"])
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    kept = public_reasons_for(
        "discover", ["Like Public Game, I'd enjoy this"], True, ["pub"], item, taste
    )
    assert kept[0] == "Like Public Game, I'd enjoy this"
    assert len(kept) <= MAX_PUBLIC_REASONS
    dropped = public_reasons_for(
        "discover", ["Like Secret Game"], True, ["priv"], item, taste
    )
    assert dropped != ["Like Secret Game"]


def test_model_text_naming_an_uncited_private_game_is_replaced():
    taste = public_taste([owned("pub", "Public Game")], ["Secret Game"])
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    reasons = public_reasons_for(
        "discover", ["Pairs with Secret Game nicely"], True, ["pub"], item, taste
    )
    assert all("Secret Game" not in reason for reason in reasons)


def test_radar_text_is_never_read_and_never_leaks_a_store():
    taste = public_taste([owned("pub", "Public Game")], [])
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    stored = [
        "Pre-orders close Nov 8 at Limited Run Games · $59.99",
        "which you rated 10",
    ]
    reasons = public_reasons_for("radar", stored, False, ["pub"], item, taste)
    joined = " ".join(reasons)
    assert "Pre-orders close" not in joined and "$" not in joined
    assert "you" not in joined.lower().split()


def test_no_surviving_reason_falls_back_to_a_genre_line_from_the_shelf():
    taste = public_taste(
        [owned("pub", "Public Game", rating=None, status="backlog")], []
    )
    item = catalogue_item("9", "New", {"genres": ["Adventure", "Puzzle"]}, 508, None)
    assert public_reasons_for("radar", [], False, [], item, taste) == [
        "Shares Adventure with games on my shelf"
    ]


def test_no_genre_on_the_shelf_means_no_reason():
    taste = public_taste([], [])
    item = catalogue_item("9", "New", {"genres": ["Racing"]}, 508, None)
    assert public_reasons_for("radar", [], False, [], item, taste) == []


def test_public_reasons_are_capped_and_first_person():
    taste = public_taste([owned("pub", "Public Game")], [])
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    reasons = public_reasons_for(
        "discover", ["Your kind of game", "x"], True, ["pub"], item, taste
    )
    assert len(reasons) <= MAX_PUBLIC_REASONS
    assert all("your" not in reason.lower().split() for reason in reasons)


def _discover(sentence_lines, based_on, private, public=("pub", "Public Game")):
    taste = public_taste([owned(*public)], private)
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    return public_reasons_for("discover", sentence_lines, True, based_on, item, taste)


def test_only_the_model_sentence_is_published_never_store_or_price_lines():
    stored = [
        "Like Public Game, I'd enjoy this",
        "Pre-orders close Nov 8 at Limited Run Games \u00b7 $59.99",
        "Full game on cartridge",
    ]
    reasons = _discover(stored, ["pub"], [])
    assert reasons[0] == "Like Public Game, I'd enjoy this"
    joined = " ".join(reasons)
    assert "Pre-orders" not in joined and "$" not in joined
    assert "Full game" not in joined
    assert len(reasons) <= MAX_PUBLIC_REASONS


def test_a_subtitle_alone_still_names_the_private_game():
    reasons = _discover(
        ["Like Tears of the Kingdom, I'd enjoy this"],
        ["pub"],
        ["The Legend of Zelda: Tears of the Kingdom"],
    )
    assert all("Tears of the Kingdom" not in reason for reason in reasons)


def test_accents_and_punctuation_do_not_hide_a_private_game():
    reasons = _discover(
        ["Feels like Pokemon Legends Z-A, which I love"],
        ["pub"],
        ["Pok\u00e9mon Legends: Z-A"],
    )
    assert all("Legends" not in reason for reason in reasons)


def test_a_curly_apostrophe_does_not_hide_a_private_game():
    reasons = _discover(
        ["Like Luigi\u2019s Mansion 3, I'd enjoy this"],
        ["pub"],
        ["Luigi's Mansion 3"],
    )
    assert all("Mansion" not in reason for reason in reasons)


def test_model_text_that_cites_nothing_is_rebuilt():
    reasons = _discover(["Great pick, I'd say"], [], [])
    assert "Great pick, I'd say" not in reasons


def test_more_second_person_forms_are_refused():
    for text in ("Treat yourself to this", "ya gotta play it", "u will like it"):
        assert text not in _discover([text], ["pub"], [])


def test_blank_stored_lines_fall_through_to_the_genre_line():
    taste = public_taste(
        [owned("pub", "Public Game", rating=None, status="backlog")], []
    )
    item = catalogue_item("9", "New", {"genres": ["Adventure"]}, 508, None)
    assert public_reasons_for("discover", ["", "  "], True, ["pub"], item, taste) == [
        "Shares Adventure with games on my shelf"
    ]


def test_a_blank_first_line_never_promotes_the_store_line_to_the_sentence():
    stored = [
        "",
        "Pre-orders close Nov 8 at Limited Run Games \u00b7 $59.99",
        "Full game on cartridge",
    ]
    joined = " ".join(_discover(stored, ["pub"], []))
    assert "Pre-orders" not in joined and "$" not in joined
    assert "Full game" not in joined


def test_roman_and_arabic_numerals_are_interchangeable_in_titles():
    reasons = _discover(["Like Hades 2, I'd enjoy this"], ["pub"], ["Hades II"])
    assert all("Hades" not in reason for reason in reasons)
    reasons = _discover(["Like Persona V, I'd enjoy this"], ["pub"], ["Persona 5"])
    assert all("Persona" not in reason for reason in reasons)


def test_a_trailing_edition_word_does_not_hide_a_private_game():
    reasons = _discover(
        ["Like Mario Kart 8, I'd enjoy this"], ["pub"], ["Mario Kart 8 Deluxe"]
    )
    assert all("Mario Kart" not in reason for reason in reasons)


def test_a_non_latin_private_title_is_matched_literally():
    reasons = _discover(["Feels like \u5927\u795e to me"], ["pub"], ["\u5927\u795e"])
    assert all("\u5927\u795e" not in reason for reason in reasons)


def test_top_up_does_not_repeat_a_case_only_duplicate():
    taste = public_taste([owned("pub", "Public Game")], [])
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    rebuilt = public_reasons_for("radar", [], False, [], item, taste)[0]
    out = public_reasons_for("discover", [rebuilt.upper()], True, ["pub"], item, taste)
    assert len({reason.casefold() for reason in out}) == len(out)


def test_curly_and_contracted_second_person_forms_are_refused():
    for text in (
        "Y\u2019all will love it",
        "youll love it",
        "yer gonna like it",
        "you\u2019re set",
    ):
        assert text not in _discover([text], ["pub"], [])
