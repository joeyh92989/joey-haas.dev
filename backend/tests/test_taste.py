"""The engine's taste: weights (AC 7, AC 8), the facet profile and affinity (AC 6)."""

from datetime import date, timedelta

import pytest

import picker
from picker import PickerItem, PlayRecord
from taste import (
    BOUNCE_PENALTY,
    ENGAGEMENT_BONUS,
    NEUTRAL,
    RECENCY_CAP,
    affinity,
    engagement,
    facet_profile,
    is_reference,
    leading_facet,
    taste_weights,
)

TODAY = date(2026, 11, 9)


def item(id: str, *, tags: dict[str, list[str]] | None = None, **fields):
    """A PickerItem whose old tag fields and new `tags` agree, so the old and
    new affinity read the same game."""
    tags = tags or {}
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
        genres=tuple(tags.get("genres", ())),
        themes=tuple(tags.get("themes", ())),
        keywords=tuple(tags.get("keywords", ())),
        game_modes=tuple(tags.get("game_modes", ())),
        player_perspectives=(),
        similar_games=(),
        community_score=None,
        time_to_beat_hours=None,
        release_date=None,
        acquired_at=None,
        started_at=None,
        source="igdb",
        tags=tuple((kind, value) for kind, values in tags.items() for value in values),
    )
    return PickerItem(**{**base, **fields})


# --- AC 7: recency is capped below a favorite ---------------------------------


def test_a_game_finished_today_weighs_no_more_than_finished_plus_the_cap():
    weights = taste_weights([item("a", status="finished", finished_at=TODAY)], TODAY)
    assert weights["a"] == pytest.approx(0.3 + RECENCY_CAP) == pytest.approx(0.45)


def test_the_recency_bonus_halves_every_two_weeks_and_is_off_without_today():
    done = item("a", status="finished", finished_at=TODAY - timedelta(14))
    assert taste_weights([done], TODAY)["a"] == pytest.approx(0.3 + RECENCY_CAP / 2)
    assert taste_weights([done], None)["a"] == pytest.approx(0.3)


def test_a_finished_ten_never_outweighs_a_favorite_unless_it_is_one():
    played = PlayRecord(hours=30, sessions=12, finished_runs=1, runs=1)
    rated = [
        item(f"r{n}", status="finished", rating=6, finished_at=TODAY) for n in range(4)
    ]
    ten = item(
        "ten",
        status="finished",
        rating=10,
        finished_at=TODAY,
        time_to_beat_hours=20,
        play=played,
    )
    fav = item("fav", favorite=True)
    fav_ten = item("fav10", favorite=True, status="finished", rating=10)
    weights = taste_weights([*rated, ten, fav, fav_ten], TODAY)
    assert weights["ten"] <= weights["fav"] == 1.0
    assert weights["fav10"] > 1.0


# --- AC 8: the play record ------------------------------------------------------


def test_an_engaged_game_in_progress_is_a_reference_even_unrated():
    engaged = item(
        "engaged",
        status="active",
        time_to_beat_hours=10,
        play=PlayRecord(hours=6, sessions=5, runs=1),
    )
    dabbled = item(
        "dabbled",
        status="active",
        time_to_beat_hours=10,
        play=PlayRecord(hours=2, sessions=2, runs=1),
    )
    weights = taste_weights([engaged, dabbled], TODAY)
    assert weights == {"engaged": pytest.approx(0.3)}
    assert is_reference(engaged) and not is_reference(dabbled)


def test_sessions_stand_in_when_the_length_is_unknown():
    paused = item("p", status="paused", play=PlayRecord(sessions=4, runs=1))
    assert engagement(paused) == pytest.approx(0.5)
    assert is_reference(paused)


def test_a_one_session_bounce_lowers_the_weight():
    quit_ = item("quit", status="abandoned")
    bounced = item(
        "bounced", status="abandoned", play=PlayRecord(sessions=1, runs=1, bounced=True)
    )
    shelved = item(
        "shelved", status="paused", play=PlayRecord(sessions=1, runs=1, bounced=True)
    )
    weights = taste_weights([quit_, bounced, shelved], TODAY)
    assert weights["bounced"] == pytest.approx(weights["quit"] - BOUNCE_PENALTY)
    assert weights["shelved"] == pytest.approx(-BOUNCE_PENALTY)


def test_engagement_adds_up_to_the_bonus_to_a_finish():
    def finished(hours):
        return item(
            "a",
            status="finished",
            time_to_beat_hours=10,
            play=PlayRecord(hours=hours, sessions=3, finished_runs=1, runs=1),
        )

    assert engagement(finished(30)) == 1.5
    assert taste_weights([finished(30)], None)["a"] == pytest.approx(
        0.3 + ENGAGEMENT_BONUS
    )
    assert taste_weights([finished(5)], None)["a"] == pytest.approx(
        0.3 + ENGAGEMENT_BONUS / 3
    )


def test_a_comic_read_to_its_end_is_a_finish_and_a_watched_movie_is_engaged():
    comic = item(
        "comic", type="comic", status="active", issues_owned_count=6, issues_read=6
    )
    halfway = item(
        "half", type="comic", status="active", issues_owned_count=6, issues_read=3
    )
    movie = item("movie", type="movie", status="finished")
    weights = taste_weights([comic, halfway, movie], None)
    assert weights["comic"] == pytest.approx(0.3 + ENGAGEMENT_BONUS / 1.5)
    assert weights["movie"] == weights["comic"]
    assert weights["half"] == pytest.approx(0.3)  # engaged in progress


def test_the_rating_mean_is_taken_per_type():
    games = [item(f"g{n}", status="finished", rating=9) for n in range(3)]
    comic = item("c", type="comic", status="finished", rating=5)
    other = item("c2", type="comic", status="finished", rating=5)
    weights = taste_weights([*games, comic, other], None)
    # A 5 on a comic scale that averages 5 is neutral, not a pan.
    assert weights["c"] == pytest.approx(0.3)


# --- Affinity: specificity, seen facets only, coverage --------------------------


def test_an_item_with_no_seen_facet_is_neutral():
    fav = item("fav", favorite=True, tags={"themes": ["Horror"]})
    profile = facet_profile([fav], taste_weights([fav], None))
    assert affinity(item("x", tags={"keywords": ["luigi"]}), profile) == NEUTRAL
    assert affinity(item("y"), profile) == NEUTRAL


def test_unseen_facets_do_not_vote_and_few_seen_facets_are_shrunk():
    fav = item("fav", favorite=True, tags={"themes": ["Horror"]})
    profile = facet_profile([fav], taste_weights([fav], None))
    one = item("one", tags={"themes": ["Horror"]})
    diluted = item("diluted", tags={"themes": ["Horror"], "keywords": ["a", "b", "c"]})
    assert affinity(one, profile) == pytest.approx(NEUTRAL + NEUTRAL / 3)
    assert affinity(diluted, profile) == affinity(one, profile)


def test_a_disliked_facet_pulls_below_neutral():
    quit_ = item("quit", status="abandoned", tags={"themes": ["Horror", "Warfare"]})
    other = item("other", status="abandoned", tags={"keywords": ["survival horror"]})
    profile = facet_profile([quit_, other], taste_weights([quit_, other], None))
    assert affinity(item("x", tags={"themes": ["Horror", "Warfare"]}), profile) < 50


def _audit_collection():
    """The AC 6 shape: broad, common tags carried by many references, and a
    few specific ones carried by two loved games."""
    broad = {"genres": ["Adventure"], "themes": ["Action"], "game_modes": ["Single"]}
    specific = ["post-apocalyptic", "dystopian", "space"]
    refs = [
        item(f"a{n}", status="finished", rating=7, tags=broad) for n in range(4)
    ] + [
        item("fav", favorite=True, tags=broad),
        *(
            item(
                f"r{n}",
                status="finished",
                rating=9,
                tags={"genres": ["Adventure"], "keywords": specific},
            )
            for n in range(2)
        ),
    ]
    two_tag = item("two_tag", tags=broad)
    shares_three = item(
        "shares_three",
        tags={"keywords": [*specific, "luigi", "kart", "rain", "boats", "trains"]},
    )
    return refs, two_tag, shares_three


def test_ac6_a_two_tag_game_scores_below_one_sharing_three_specific_facets():
    refs, two_tag, shares_three = _audit_collection()
    everything = [*refs, two_tag, shares_three]
    profile = facet_profile(everything, taste_weights(everything, TODAY))
    assert affinity(shares_three, profile) > affinity(two_tag, profile)

    # The old affinity, which Radar and Discover still use, had them the
    # other way round: every unseen keyword voted 0.
    old_weights = picker.reference_weights(everything)
    table = picker.attribute_table(everything, old_weights)
    assert picker.affinity(two_tag, table) > picker.affinity(shares_three, table)


def test_the_leading_facet_is_the_strongest_specific_seen_facet():
    refs, two_tag, shares_three = _audit_collection()
    everything = [*refs, two_tag, shares_three]
    profile = facet_profile(everything, taste_weights(everything, TODAY))
    assert leading_facet(shares_three, profile) in {
        "post-apocalyptic",
        "dystopia",
        "space",
    }
    assert leading_facet(item("none"), profile) is None
