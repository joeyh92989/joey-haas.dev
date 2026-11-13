"""GET /api/public/pick-for-me (Pick for me spec, task 2).

The body is the whole table, so what it may carry is the point: public games
only, nothing pinned, nothing the owner refused before today, and none of
What's next's private keys. The ranking itself is pinned in
test_picker_public_table.py.
"""

from datetime import UTC, datetime, timedelta

import pytest

from models import ItemStatus, OwnedFormat, PickAction, PickEvent
from picker import combo_keys
from public_pick_for_me import (
    PublicPickCard,
    PublicPickForMeOut,
    PublicPickScore,
    load_pick_for_me,
)
from tests.test_public_outputs import (
    FORBIDDEN,
    MIDNIGHT,
    NOW,
    _add,
    _game,
    _keys,
    _with_ids,
    client_for,
    clock,  # noqa: F401 -- the autouse frozen clock
)

pytestmark = pytest.mark.asyncio

# Pick for me publishes its own score and the four terms behind it: the card
# shows the arithmetic (spec, "Show the working"). Every other private key
# is as forbidden here as on What's next.
PICK_FORBIDDEN = FORBIDDEN - {"score"}


async def _pick(factory) -> dict:
    async with client_for(factory) as client:
        response = await client.get("/api/public/pick-for-me")
    assert response.status_code == 200
    return response.json()


def _never(item, at: datetime) -> PickEvent:
    return PickEvent(item_id=item.id, action=PickAction.NEVER, created_at=at)


async def test_the_models_publish_exactly_these_fields():
    assert set(PublicPickForMeOut.model_fields) == {
        "generated_on", "weights", "games", "combos",
    }  # fmt: skip
    assert set(PublicPickCard.model_fields) == {
        "item_id", "title", "cover_url", "platform", "time_to_beat_hours",
        "igdb_url", "reasons",
    }  # fmt: skip
    assert set(PublicPickScore.model_fields) == {"item_id", "score", "terms"}


async def test_every_combination_is_present_and_names_a_listed_game(
    sessionmaker_for_test,
):
    await _add(sessionmaker_for_test, *_with_ids(_game("Alpha"), _game("Beta")))
    body = await _pick(sessionmaker_for_test)

    assert len(body["combos"]) == len(combo_keys()) == 88
    assert body["generated_on"] == NOW.date().isoformat()
    assert body["weights"] == {
        "affinity": 35, "similarity": 20, "quality": 15, "length_fit": 15,
    }  # fmt: skip
    listed = {pick["item_id"] for picks in body["combos"].values() for pick in picks}
    assert listed == set(body["games"])
    assert {game["title"] for game in body["games"].values()} == {"Alpha", "Beta"}
    for picks in body["combos"].values():
        assert len(picks) <= 4
        for pick in picks:
            assert set(pick["terms"]) == set(body["weights"])


async def test_a_combination_publishes_four_picks(sessionmaker_for_test):
    names = ("Alpha", "Beta", "Gamma", "Delta", "Epsilon")
    await _add(sessionmaker_for_test, *_with_ids(*(_game(name) for name in names)))
    body = await _pick(sessionmaker_for_test)

    assert len(body["combos"]["any|"]) == 4
    assert max(len(picks) for picks in body["combos"].values()) == 4


async def test_only_public_owned_unpinned_pickable_games_are_picked(
    sessionmaker_for_test,
):
    rows = _with_ids(
        _game("Public"),
        _game("Private", is_public=False),
        _game("Pinned", pinned_at=NOW - timedelta(days=1)),
        _game("Wanted", owned_format=OwnedFormat.NONE),
        _game("Finished", status=ItemStatus.FINISHED),
        _game("Paused", status=ItemStatus.PAUSED),
    )
    await _add(sessionmaker_for_test, *rows)
    body = await _pick(sessionmaker_for_test)

    titles = {game["title"] for game in body["games"].values()}
    assert titles == {"Public", "Paused"}
    assert "Private" not in str(body)


async def test_a_never_counts_once_it_is_dated_before_midnight(
    sessionmaker_for_test,
    clock,  # noqa: F811
):
    refused, today, kept = _with_ids(_game("Refused"), _game("Today"), _game("Kept"))
    await _add(
        sessionmaker_for_test,
        refused,
        today,
        kept,
        _never(refused, MIDNIGHT - timedelta(hours=2)),
        _never(today, MIDNIGHT + timedelta(hours=1)),
    )
    body = await _pick(sessionmaker_for_test)
    assert {game["title"] for game in body["games"].values()} == {"Today", "Kept"}

    clock(NOW + timedelta(days=1))
    body = await _pick(sessionmaker_for_test)
    assert {game["title"] for game in body["games"].values()} == {"Kept"}


async def test_no_private_key_appears_anywhere(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        *_with_ids(
            _game("Rated", rating=9, status=ItemStatus.FINISHED),
            _game("Picked", acquired_at=datetime(2025, 1, 1, tzinfo=UTC).date()),
        ),
    )
    body = await _pick(sessionmaker_for_test)
    assert PICK_FORBIDDEN.isdisjoint(set(_keys(body)))


async def test_an_empty_shelf_still_answers_every_combination(sessionmaker_for_test):
    body = await _pick(sessionmaker_for_test)
    assert body["games"] == {}
    assert all(picks == [] for picks in body["combos"].values())
    assert len(body["combos"]) == 88


async def test_the_table_is_cached_until_an_item_changes(
    sessionmaker_for_test, monkeypatch
):
    """One build serves repeat reads; an items write rebuilds. The route
    reads the module global at call time, so patching it counts the builds."""
    import public
    from models import Item

    calls = 0

    async def counting(session, now):
        nonlocal calls
        calls += 1
        return await load_pick_for_me(session, now)

    monkeypatch.setattr(public, "load_pick_for_me", counting)
    game = _game("Celeste")
    await _add(sessionmaker_for_test, game)
    async with client_for(sessionmaker_for_test) as client:
        assert (await client.get("/api/public/pick-for-me")).status_code == 200
        assert (await client.get("/api/public/pick-for-me")).status_code == 200
        assert calls == 1
        async with sessionmaker_for_test() as session:
            row = await session.get(Item, game.id)
            row.title = "Celeste Classic"
            await session.commit()
        body = (await client.get("/api/public/pick-for-me")).json()
    assert calls == 2
    assert [card["title"] for card in body["games"].values()] == ["Celeste Classic"]
