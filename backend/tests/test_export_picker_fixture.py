"""The collection export keeps the engine's inputs and nothing that names a game."""

import importlib.util
import json
from datetime import date, timedelta
from pathlib import Path

import pytest

import playthroughs as pt
from models import Item, ItemStatus, ItemType, OwnedFormat, PlaySession

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "export_picker_fixture.py"
spec = importlib.util.spec_from_file_location("export_picker_fixture", SCRIPT)
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)

TODAY = date(2026, 11, 9)
SECRET_WORDS = (
    "Hades",
    "Saga",
    "Dune",
    "secret note",
    "cover.jpg",
    "Switch",
    "greek mythology",
    "Space opera",
)
KEY = b"k" * 32


async def _seed(session):
    hades = Item(
        type=ItemType.GAME,
        title="Hades II",
        status=ItemStatus.BACKLOG,
        rating=9,
        favorite=True,
        notes="secret note",
        cover_url="https://img/cover.jpg",
        platform_id=130,
        platform="Nintendo Switch",
        external_source="igdb",
        external_id="111",
        is_public=False,
        acquired_at=TODAY - timedelta(40),
        source_metadata={
            "genres": ["Roguelike"],
            "keywords": ["greek mythology", "roguelite"],
            "similar_games": ["222", "999"],
            "time_to_beat": {"normally": 22.5},
            "community_score": 91.2,
        },
    )
    celeste = Item(
        type=ItemType.GAME,
        title="Celeste",
        status=ItemStatus.BACKLOG,
        external_source="igdb",
        external_id="222",
        source_metadata={"genres": ["Platform"]},
    )
    saga = Item(
        type=ItemType.COMIC,
        title="Saga",
        status=ItemStatus.ACTIVE,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1-6",
        read_to=4,
        source_metadata={"concepts": ["Space opera"]},
    )
    session.add_all([hades, celeste, saga])
    await session.flush()
    await pt.apply_status(session, hades, ItemStatus.ACTIVE, TODAY - timedelta(30))
    session.add(
        PlaySession(item_id=hades.id, played_on=TODAY - timedelta(29), minutes=90)
    )
    await session.flush()
    await pt.apply_status(session, hades, ItemStatus.FINISHED, TODAY - timedelta(10))
    await session.commit()


@pytest.mark.asyncio
async def test_the_export_keeps_tags_and_play_and_drops_what_names_a_game(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        await _seed(session)
        rows, runs = await script.load(session)
    body = script.anonymise(rows, runs, TODAY, key=KEY)
    text = json.dumps(body)
    for word in SECRET_WORDS:
        assert word not in text
    for key in ("title", "id", "notes", "cover_url", "platform", "is_public"):
        assert f'"{key}"' not in text

    items = {item["key"]: item for item in body["items"]}
    assert {key.split("-")[0] for key in items} == {"game", "comic"}
    hades = next(item for item in items.values() if item.get("rating") == 9)
    celeste_key = next(
        key for key, item in items.items() if item["tags"] == {"genres": ["Platform"]}
    )
    assert hades["similar"] == [celeste_key]  # 999 is not in the collection
    pseudonym = script.pseudonymise(KEY, "igdb", "keywords", "greek mythology")
    assert hades["tags"]["keywords"] == [pseudonym, "roguelite"]
    assert hades["acquired_days_ago"] == 40
    assert hades["time_to_beat_hours"] == 22.5
    assert hades["runs"] == [
        {
            "outcome": "finished",
            "started_days_ago": 30,
            "finished_days_ago": 10,
            "journal_days": 1,
            "journal_minutes": 90,
        }
    ]
    comic = next(item for item in items.values() if item["type"] == "comic")
    assert (comic["issues_owned"], comic["issues_read"]) == (6, 4)


@pytest.mark.asyncio
async def test_public_only_leaves_private_rows_out(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        await _seed(session)
        rows, _runs = await script.load(session, public_only=True)
    assert all(row["rating"] != 9 for row in rows)


def test_the_export_is_deterministic():
    rows = [
        {"id": "b", "type": "game", "status": "backlog", "owned": True},
        {"id": "a", "type": "game", "status": "finished", "owned": True},
    ]
    first = script.anonymise(rows, {}, TODAY)
    assert first == script.anonymise(list(reversed(rows)), {}, TODAY)
    assert [item["status"] for item in first["items"]] == ["finished", "backlog"]


def test_summary_counts_types_tags_and_runs():
    body = {
        "items": [
            {"type": "game", "tags": {"genres": ["x"]}, "runs": [{}]},
            {"type": "comic", "tags": {}},
        ]
    }
    assert script.summary(body) == "exported 1 comic, 1 game; 1 tagged, 1 runs"


def _row(id: str, **snapshot):
    return {
        "id": id,
        "type": "game",
        "status": "backlog",
        "owned": True,
        "external_source": "igdb",
        "source_metadata": snapshot,
    }


def test_free_text_tags_are_keyed_pseudonyms_and_the_vocabularies_stay():
    rows = [
        _row(
            "a",
            genres=["Platform"],
            themes=["Action"],
            keywords=["mario", "robots", "steam trading cards", "mario"],
        ),
        _row("b", keywords=["mario"], characters=["Luigi"]),
    ]
    first, second = script.anonymise(rows, {}, TODAY, key=KEY)["items"]
    mario = script.pseudonymise(KEY, "igdb", "keywords", "mario")

    assert mario.startswith(script.PSEUDONYM_PREFIX) and "mario" not in mario
    # Fixed vocabularies and mapped tags as written; noise dropped; repeats once.
    assert first["tags"] == {
        "genres": ["Platform"],
        "themes": ["Action"],
        "keywords": [mario, "robots"],
    }
    # Two items sharing a tag still share it, so they still share a facet.
    assert second["tags"]["keywords"] == [mario]
    assert second["tags"]["characters"][0].startswith(script.PSEUDONYM_PREFIX)


def test_each_export_draws_its_own_key_and_none_keeps_tags_readable():
    rows = [_row("a", keywords=["mario"])]
    one = script.anonymise(rows, {}, TODAY)["items"][0]["tags"]["keywords"]
    two = script.anonymise(rows, {}, TODAY)["items"][0]["tags"]["keywords"]
    clear = script.anonymise(rows, {}, TODAY, key=None)["items"][0]["tags"]

    assert one != two
    assert clear == {"keywords": ["mario"]}
