"""Tags: a curated vocabulary per type (shelf sweep item 7). Pure."""

import json
from pathlib import Path

import pytest

import tags
from facets import FACET_MAP

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _names(values):
    return [v["name"] for v in values or [] if isinstance(v, dict) and v.get("name")]


def _fixture_games():
    games = []
    for name in ("igdb_game", "igdb_games_e7b", "igdb_search"):
        body = json.loads((FIXTURES / f"{name}.json").read_text())
        for row in body if isinstance(body, list) else [body]:
            game = row.get("game") if isinstance(row.get("game"), dict) else row
            if isinstance(game, dict):
                games.append(game)
    return games


def _snapshot(game):
    return {
        "genres": _names(game.get("genres")),
        "themes": _names(game.get("themes")),
        "keywords": _names(game.get("keywords")),
    }


def test_every_group_and_tag_is_unique_per_type():
    for item_type, groups in tags.VOCABULARY.items():
        keys = [g for g, _ in groups]
        assert len(keys) == len(set(keys)), item_type
        words = [t for _, ts in groups for t in ts]
        assert len(words) == len(set(words)), item_type


def test_the_approved_vocabulary_is_exactly_this():
    assert tags.VOCABULARY["game"] == (
        (
            "play_style",
            (
                "shooter",
                "rpg",
                "platformer",
                "open-world",
                "puzzle",
                "strategy",
                "racing",
                "simulation",
                "survival",
                "party",
                "beat-em-up",
                "stealth",
                "fighting",
                "card-and-board",
                "sports",
                "story-led",
                "metroidvania",
                "roguelike",
                "soulslike",
            ),
        ),
        (
            "setting",
            ("sci-fi", "fantasy", "horror", "mystery", "war", "historical"),
        ),
        ("tone", ("comedy", "drama", "family")),
    )
    assert tags.VOCABULARY["comic"] == (
        (
            "genre",
            (
                "horror",
                "sci-fi",
                "fantasy",
                "crime",
                "action",
                "comedy",
                "superhero",
                "war",
                "western",
                "romance",
                "post-apocalyptic",
            ),
        ),
        ("based_on", ("movie", "tv", "game", "original")),
        ("form", ("anthology", "mini-series", "ongoing", "one-shot", "pin-up")),
    )


def test_a_game_gets_its_play_style_setting_and_tone_from_igdb():
    snapshot = {
        "genres": ["Shooter", "Adventure", "Indie", "Role-playing (RPG)"],
        "themes": ["Action", "Science fiction", "Horror", "Comedy", "Open world"],
        "keywords": ["roguelike", "luigi"],
    }
    assert tags.game_tags(snapshot) == [
        {"group": "play_style", "tag": "shooter"},
        {"group": "play_style", "tag": "rpg"},
        {"group": "play_style", "tag": "open-world"},
        {"group": "play_style", "tag": "roguelike"},
        {"group": "setting", "tag": "sci-fi"},
        {"group": "setting", "tag": "horror"},
        {"group": "tone", "tag": "comedy"},
    ]


def test_the_four_strategy_sources_make_one_tag():
    for genre in (
        "Strategy",
        "Tactical",
        "Turn-based strategy (TBS)",
        "Real Time Strategy (RTS)",
    ):
        assert tags.game_tags({"genres": [genre]}) == [
            {"group": "play_style", "tag": "strategy"}
        ]
    both = tags.game_tags({"genres": ["Strategy", "Tactical"]})
    assert len(both) == 1


def test_dropped_words_make_no_tag():
    snapshot = {
        "genres": ["Adventure", "Indie", "Arcade", "Quiz/Trivia"],
        "themes": ["Action", "Sandbox", "Erotic", "Business", "Thriller"],
    }
    assert tags.game_tags(snapshot) == []


def test_a_game_with_no_snapshot_has_no_tags():
    assert tags.game_tags(None) == []
    assert tags.game_tags({"genres": "Shooter"}) == []


def test_every_mapped_igdb_string_that_facets_knows_is_the_same_string():
    """The keyword and genre strings are the ones FACET_MAP holds, copied
    from source snapshots, never typed from memory."""
    for (kind, value), _ in tags.IGDB_GAME_MAP.items():
        if kind == "keywords":
            assert ("igdb", "keywords", value) in FACET_MAP, value


def test_the_recorded_igdb_fixtures_map_inside_the_vocabulary():
    allowed = {(g, t) for g, ts in tags.VOCABULARY["game"] for t in ts}
    seen = 0
    for game in _fixture_games():
        for tag in tags.game_tags(_snapshot(game)):
            assert (tag["group"], tag["tag"]) in allowed
            seen += 1
    assert seen > 0


def test_outer_wilds_fixture_reads_as_puzzle_and_simulation_and_not_adventure():
    outer = next(g for g in _fixture_games() if g.get("name") == "Outer Wilds")
    got = {t["tag"] for t in tags.game_tags(_snapshot(outer))}
    assert {"puzzle", "simulation"} <= got
    assert "adventure" not in got and "indie" not in got


def test_owner_tags_are_checked_against_the_types_vocabulary():
    assert tags.clean_tags(
        "game",
        [
            {"group": "tone", "tag": "comedy"},
            {"group": "play_style", "tag": "rpg"},
            {"group": "play_style", "tag": "rpg"},
        ],
    ) == [
        {"group": "play_style", "tag": "rpg"},
        {"group": "tone", "tag": "comedy"},
    ]
    with pytest.raises(ValueError):
        tags.clean_tags("game", [{"group": "genre", "tag": "horror"}])
    with pytest.raises(ValueError):
        tags.clean_tags("game", [{"group": "setting", "tag": "western"}])
    with pytest.raises(ValueError):
        tags.clean_tags("movie", [{"group": "tone", "tag": "comedy"}])
    assert tags.clean_tags("movie", []) == []


# --- The comic prompt and its answer ----------------------------------------


def test_the_comic_prompt_names_the_series_and_numbers_the_vocabulary():
    prompt = tags.comic_prompt(
        title="Hellboy",
        publisher="Dark Horse",
        start_year=1994,
        year_end=None,
        description=["A demon raised by the paranormal bureau."],
    )
    assert "Hellboy" in prompt and "Dark Horse" in prompt and "1994" in prompt
    assert "paranormal bureau" in prompt
    options = tags.comic_options()
    assert len(options) == 11 + 4 + 5
    assert f"{options.index(('genre', 'horror'))}: Genre / horror" in prompt


def test_the_comic_prompt_copes_with_no_description_and_clips_a_long_one():
    bare = tags.comic_prompt("Zed", None, None, None, [])
    assert "Zed" in bare
    long = tags.comic_prompt("Zed", None, None, None, ["x" * 5000])
    assert len(long) < 4000


def test_the_comic_schema_bounds_indices_to_the_vocabulary():
    items = tags.COMIC_SCHEMA["properties"]["tags"]["items"]
    assert items["minimum"] == 0
    assert items["maximum"] == len(tags.comic_options()) - 1


def test_a_good_answer_becomes_tags_in_vocabulary_order():
    options = tags.comic_options()
    horror = options.index(("genre", "horror"))
    ongoing = options.index(("form", "ongoing"))
    original = options.index(("based_on", "original"))
    assert tags.comic_tags_from({"tags": [ongoing, original, horror, horror]}) == [
        {"group": "genre", "tag": "horror"},
        {"group": "based_on", "tag": "original"},
        {"group": "form", "tag": "ongoing"},
    ]


@pytest.mark.parametrize(
    "payload",
    [
        None,
        [],
        {},
        {"tags": "horror"},
        {"tags": []},
        {"tags": [99]},
        {"tags": [-1]},
        {"tags": [True]},
        {"tags": ["horror"]},
    ],
)
def test_an_unusable_answer_is_none(payload):
    assert tags.comic_tags_from(payload) is None


def test_an_out_of_range_index_is_dropped_but_the_rest_kept():
    options = tags.comic_options()
    horror = options.index(("genre", "horror"))
    assert tags.comic_tags_from({"tags": [horror, 99]}) == [
        {"group": "genre", "tag": "horror"}
    ]


def test_original_never_sits_with_a_based_on_source_and_one_run_form_wins():
    options = tags.comic_options()
    pick = lambda g, t: options.index((g, t))  # noqa: E731
    got = tags.comic_tags_from(
        {
            "tags": [
                pick("based_on", "original"),
                pick("based_on", "movie"),
                pick("form", "ongoing"),
                pick("form", "mini-series"),
                pick("form", "anthology"),
            ]
        }
    )
    assert got == [
        {"group": "based_on", "tag": "movie"},
        {"group": "form", "tag": "anthology"},
        {"group": "form", "tag": "mini-series"},
    ]
