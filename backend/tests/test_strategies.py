"""One strategy per media type (recommendation engine spec, strategy table)."""

from models import ItemType
from picker_items import SIZE_BANDS, PickerItem
from strategies import ADMIN, PUBLIC, STRATEGIES, completeness, strategy_for


def item(id: str = "x", **fields) -> PickerItem:
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
    )
    return PickerItem(**{**base, **fields})


def test_every_item_type_has_a_strategy():
    assert set(STRATEGIES) == {kind.value for kind in ItemType}


def test_verbs():
    assert [strategy_for(t).verb for t in ("game", "comic", "movie")] == [
        "Play",
        "Read",
        "Watch",
    ]


# --- Game ---------------------------------------------------------------------


def test_game_pool_is_owned_unpinned_backlog_active_or_paused():
    game = strategy_for("game")
    for status in ("backlog", "active", "paused"):
        assert game.pool(item(status=status), ADMIN)
    assert not game.pool(item(status="finished"), ADMIN)
    assert not game.pool(item(status="abandoned"), ADMIN)
    assert not game.pool(item(owned=False), ADMIN)
    assert not game.pool(item(pinned=True), ADMIN)


def test_the_public_game_pool_leaves_out_what_is_in_hand():
    game = strategy_for("game")
    assert not game.pool(item(status="active"), PUBLIC)
    assert game.pool(item(status="paused"), PUBLIC)
    assert game.pool(item(status="backlog"), PUBLIC)


def test_game_bands_are_picker_size_bands():
    game = strategy_for("game")
    assert game.bands is SIZE_BANDS
    assert game.size(item(time_to_beat_hours=5)) == ("hours", 5.0)
    assert game.size(item()) is None
    assert game.band(item()) is None
    assert game.band(item(time_to_beat_hours=6)) == "short"
    assert game.band(item(time_to_beat_hours=6.5)) == "medium"
    assert game.band(item(time_to_beat_hours=40)) == "long"


def test_game_slots_public_and_admin():
    game = strategy_for("game")
    assert game.slots(PUBLIC) == ("best_fit", "change_of_pace", "overdue_classic")
    assert {"waited_longest", "pick_it_back_up"} <= set(game.slots(ADMIN))


# --- Comic --------------------------------------------------------------------


def comic(**fields) -> PickerItem:
    return item(type="comic", source="comicvine", **fields)


def test_a_comic_needs_an_owned_run_with_issues_left():
    strategy = strategy_for("comic")
    assert strategy.pool(comic(issues_owned_count=10, issues_read=3), ADMIN)
    assert not strategy.pool(comic(issues_owned_count=10, issues_read=10), ADMIN)
    assert not strategy.pool(comic(), ADMIN)
    assert not strategy.pool(
        comic(owned=False, issues_owned_count=10, issues_read=0), ADMIN
    )


def test_an_active_comic_is_admin_only():
    strategy = strategy_for("comic")
    reading = comic(status="active", issues_owned_count=10, issues_read=3)
    assert strategy.pool(reading, ADMIN)
    assert not strategy.pool(reading, PUBLIC)


def test_comic_bands_count_issues_left():
    strategy = strategy_for("comic")
    assert strategy.size(comic(issues_owned_count=10, issues_read=7)) == (
        "issues",
        3.0,
    )
    assert strategy.band(comic(issues_owned_count=10, issues_read=6)) == "short"
    assert strategy.band(comic(issues_owned_count=12, issues_read=0)) == "medium"
    assert strategy.band(comic(issues_owned_count=13, issues_read=0)) == "long"


def test_completeness_is_owned_over_the_span():
    assert completeness(comic(issues_owned_count=6, issues_span=12)) == 0.5
    assert completeness(comic(issues_owned_count=6, issues_span=6)) == 1.0
    assert completeness(comic(issues_owned_count=6)) == 1.0
    assert "completeness" in strategy_for("comic").extra_terms


def test_back_to_it_is_admin_only():
    strategy = strategy_for("comic")
    assert strategy.slots(PUBLIC) == ("best_fit",)
    assert "back_to_it" in strategy.slots(ADMIN)


# --- Movie --------------------------------------------------------------------


def movie(**fields) -> PickerItem:
    return item(type="movie", source="tmdb", **fields)


def test_a_movie_is_owned_and_unwatched():
    strategy = strategy_for("movie")
    assert strategy.pool(movie(status="backlog"), PUBLIC)
    assert strategy.pool(movie(status="paused"), PUBLIC)
    assert not strategy.pool(movie(status="finished"), ADMIN)
    assert not strategy.pool(movie(status="active"), PUBLIC)
    assert strategy.pool(movie(status="active"), ADMIN)


def test_movie_bands_are_100_and_140_minutes():
    strategy = strategy_for("movie")
    assert strategy.band(movie(runtime_minutes=100)) == "short"
    assert strategy.band(movie(runtime_minutes=101)) == "medium"
    assert strategy.band(movie(runtime_minutes=140)) == "medium"
    assert strategy.band(movie(runtime_minutes=155)) == "long"
    assert strategy.slots(PUBLIC) == ("best_fit",)


# --- Board game -----------------------------------------------------------------


def test_board_games_are_a_stub_with_an_empty_pool():
    strategy = strategy_for("boardgame")
    assert not strategy.pool(item(type="boardgame"), ADMIN)
    assert strategy.slots(ADMIN) == ()
