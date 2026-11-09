"""The status route and playthrough edits: the one writer of play dates."""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

import playthroughs as pt
from models import Item, PlaySession
from tests.test_items_pin import client_for

pytestmark = pytest.mark.asyncio

TODAY = datetime.now(UTC).date()
D1 = date(2026, 3, 1)
D2 = date(2026, 6, 1)


async def _create(client, **fields) -> dict:
    body = {
        "type": "game",
        "title": "Hades II",
        "status": "backlog",
        "owned_format": "physical",
    }
    response = await client.post("/api/items", json=body | fields)
    assert response.status_code == 201, response.text
    return response.json()


async def _status(client, item_id, status, today=TODAY, **extra):
    return await client.post(
        f"/api/items/{item_id}/status",
        json={"status": status, "today": today.isoformat(), **extra},
    )


async def _assert_columns_follow_runs(factory, item_id) -> None:
    """The invariant: the cached columns are always derive() of the runs."""
    async with factory() as session:
        item = await session.get(Item, item_id)
        runs = [pt._as_run(row) for row in await pt.load_rows(session, item.id)]
        assert pt.derive(runs) == pt.Derived(
            item.started_at, item.finished_at, item.times_completed
        )


async def test_status_moves_write_runs_and_keep_the_columns_in_step(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client)
        for status in ["active", "paused", "active", "finished", "active"]:
            response = await _status(client, item["id"], status)
            assert response.status_code == 200, response.text
            assert response.json()["status"] == status
            await _assert_columns_follow_runs(sessionmaker_for_test, item["id"])
        body = response.json()
        assert [run["number"] for run in body["playthroughs"]] == [1, 2]
        assert body["playthroughs"][0]["outcome"] == "finished"
        assert body["playthroughs"][1]["outcome"] is None


async def test_pause_stamps_the_run_and_resume_clears_it(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client, status="active", started_at=D1.isoformat())
        paused = (await _status(client, item["id"], "paused")).json()
        assert paused["playthroughs"][-1]["paused_on"] == TODAY.isoformat()
        resumed = (await _status(client, item["id"], "active")).json()
        assert resumed["playthroughs"][-1]["paused_on"] is None
        assert resumed["started_at"] == D1.isoformat()


async def test_wrap_up_writes_the_date_and_the_note_on_the_run(
    sessionmaker_for_test,
):
    earlier = (TODAY - timedelta(days=3)).isoformat()
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client, status="active", started_at=D1.isoformat())
        response = await _status(
            client, item["id"], "finished", on=earlier, note="Better than the first."
        )
        assert response.status_code == 200, response.text
        body = response.json()
        run = body["playthroughs"][-1]
        assert (run["finished_on"], run["note"]) == (earlier, "Better than the first.")
        assert body["finished_at"] == earlier
        await _assert_columns_follow_runs(sessionmaker_for_test, item["id"])
        paused = await _status(client, item["id"], "active")  # a replay, dated today
        assert paused.status_code == 200
        paused = await _status(
            client, item["id"], "paused", on=TODAY.isoformat(), note="Back soon"
        )
        assert paused.status_code == 200, paused.text
        assert paused.json()["playthroughs"][-1]["note"] == "Back soon"


@pytest.mark.parametrize(
    ("status", "extra", "message"),
    [
        ("finished", {"on": (TODAY + timedelta(days=1)).isoformat()}, "not happened"),
        ("finished", {"on": (D1 - timedelta(days=1)).isoformat()}, "before it started"),
        ("active", {"note": "x"}, "Only Finished, Paused"),
        ("backlog", {"on": TODAY.isoformat()}, "Only Finished, Paused"),
    ],
)
async def test_a_bad_date_or_a_note_on_the_wrong_move_is_refused(
    sessionmaker_for_test, status, extra, message
):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client, status="paused", started_at=D1.isoformat())
        response = await _status(client, item["id"], status, **extra)
        assert response.status_code == 422, response.text
        assert message in response.json()["detail"]


async def test_a_note_over_the_limit_is_refused(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client, status="active")
        response = await _status(client, item["id"], "finished", note="x" * 501)
        assert response.status_code == 422
        ok = await _status(client, item["id"], "finished", note="x" * 500)
        assert ok.status_code == 200, ok.text


@pytest.mark.parametrize("offset", [2, -2])
async def test_a_today_too_far_from_the_server_is_refused(
    sessionmaker_for_test, offset
):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client)
        response = await _status(
            client, item["id"], "active", TODAY + timedelta(offset)
        )
        assert response.status_code == 422


async def test_a_today_one_day_off_is_a_time_zone(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client)
        response = await _status(client, item["id"], "active", TODAY - timedelta(1))
        assert response.status_code == 200
        assert response.json()["started_at"] == (TODAY - timedelta(1)).isoformat()


@pytest.mark.parametrize(
    "field",
    [
        {"status": "finished"},
        {"started_at": "2026-01-01"},
        {"finished_at": "2026-01-01"},
        {"times_completed": 2},
    ],
)
async def test_patch_refuses_the_status_fields(sessionmaker_for_test, field):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client)
        response = await client.patch(f"/api/items/{item['id']}", json=field)
        assert response.status_code == 422
        assert "/status" in response.json()["detail"]


async def test_create_seeds_runs_from_the_given_dates(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(
            client,
            status="finished",
            started_at=D1.isoformat(),
            finished_at=D2.isoformat(),
        )
        assert item["times_completed"] == 1
        assert [
            (run["started_on"], run["finished_on"], run["outcome"])
            for run in item["playthroughs"]
        ] == [(D1.isoformat(), D2.isoformat(), "finished")]
        await _assert_columns_follow_runs(sessionmaker_for_test, item["id"])


async def test_bulk_create_seeds_every_created_item(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk",
            json={
                "items": [
                    {"type": "game", "title": "Celeste", "status": "finished"},
                    {"type": "game", "title": "Tunic", "status": "backlog"},
                ]
            },
        )
        assert response.status_code == 201, response.text
    async with sessionmaker_for_test() as session:
        items = (await session.execute(select(Item))).scalars().all()
        by_title = {item.title: item for item in items}
        assert by_title["Celeste"].times_completed == 1
        assert len(await pt.load_rows(session, by_title["Celeste"].id)) == 1
        assert await pt.load_rows(session, by_title["Tunic"].id) == []


async def test_create_refuses_a_finish_before_the_start(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items",
            json={
                "type": "game",
                "title": "Backwards",
                "status": "finished",
                "owned_format": "physical",
                "started_at": D2.isoformat(),
                "finished_at": D1.isoformat(),
            },
        )
    assert response.status_code == 422
    assert "before it started" in response.text


async def test_pin_dates_the_run_with_the_local_today(sessionmaker_for_test):
    local = TODAY - timedelta(days=1)
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client)
        response = await client.post(
            f"/api/items/{item['id']}/pin", params={"today": local.isoformat()}
        )
        assert response.status_code == 200, response.text
        assert response.json()["playthroughs"][-1]["started_on"] == local.isoformat()
        far = await client.post(
            f"/api/items/{item['id']}/pin",
            params={"today": (TODAY + timedelta(days=3)).isoformat()},
        )
        assert far.status_code == 422


async def test_pin_resumes_a_paused_run(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client, status="active", started_at=D1.isoformat())
        await _status(client, item["id"], "paused")
        pinned = (await client.post(f"/api/items/{item['id']}/pin")).json()
        assert pinned["status"] == "active"
        assert len(pinned["playthroughs"]) == 1
        assert pinned["playthroughs"][0]["paused_on"] is None
        assert pinned["started_at"] == D1.isoformat()


async def test_pin_on_a_finished_game_opens_a_replay(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(
            client,
            status="finished",
            started_at=D1.isoformat(),
            finished_at=D2.isoformat(),
        )
        pinned = (await client.post(f"/api/items/{item['id']}/pin")).json()
        assert [run["number"] for run in pinned["playthroughs"]] == [1, 2]
        assert pinned["times_completed"] == 1
        await _assert_columns_follow_runs(sessionmaker_for_test, item["id"])


async def test_past_runs_are_added_edited_and_deleted(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client)
        item_id = item["id"]
        await _status(client, item_id, "active")
        added = await client.post(
            f"/api/items/{item_id}/playthroughs",
            json={"started_on": D1.isoformat(), "finished_on": D2.isoformat()},
        )
        assert added.status_code == 201, added.text
        assert [run["number"] for run in added.json()["playthroughs"]] == [1, 2]
        assert added.json()["times_completed"] == 1

        edited = await client.patch(
            f"/api/items/{item_id}/playthroughs/1",
            json={"finished_on": (D2 + timedelta(3)).isoformat()},
        )
        assert edited.status_code == 200
        assert edited.json()["finished_at"] == (D2 + timedelta(3)).isoformat()
        await _assert_columns_follow_runs(sessionmaker_for_test, item_id)

        backwards = await client.patch(
            f"/api/items/{item_id}/playthroughs/1",
            json={"finished_on": (D1 - timedelta(1)).isoformat()},
        )
        assert backwards.status_code == 422
        open_finish = await client.patch(
            f"/api/items/{item_id}/playthroughs/2",
            json={"finished_on": TODAY.isoformat()},
        )
        assert open_finish.status_code == 422
        empty = await client.patch(f"/api/items/{item_id}/playthroughs/1", json={})
        assert empty.status_code == 422
        missing = await client.patch(
            f"/api/items/{item_id}/playthroughs/9",
            json={"started_on": D1.isoformat()},
        )
        assert missing.status_code == 404

        assert (
            await client.delete(f"/api/items/{item_id}/playthroughs/2")
        ).status_code == 422
        assert (
            await client.delete(f"/api/items/{item_id}/playthroughs/9")
        ).status_code == 404
        deleted = await client.delete(f"/api/items/{item_id}/playthroughs/1")
        assert deleted.status_code == 200
        assert deleted.json()["times_completed"] == 0
        assert [run["number"] for run in deleted.json()["playthroughs"]] == [2]
        await _assert_columns_follow_runs(sessionmaker_for_test, item_id)


async def test_item_out_carries_journal_totals_per_run(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client)
        await _status(client, item["id"], "active")
        async with sessionmaker_for_test() as session:
            row = await session.get(Item, item["id"])
            session.add(PlaySession(item_id=row.id, played_on=TODAY, minutes=45))
            await session.commit()
        body = (await client.get(f"/api/items/{item['id']}")).json()
        [run] = body["playthroughs"]
        assert (run["journal_days"], run["journal_minutes"]) == (1, 45)


async def test_the_routes_need_a_session(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        item = await _create(client)
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        assert (await _status(client, item["id"], "active")).status_code == 401
        response = await client.post(
            f"/api/items/{item['id']}/playthroughs",
            json={"finished_on": D2.isoformat()},
        )
        assert response.status_code == 401
