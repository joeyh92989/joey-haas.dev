"""The budgeted issue sync, the create/refresh hooks and the edition link."""

from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import delete, func, select

import comics_routes
from comic_issues import sync_series
from comics_routes import ISSUE_SYNC_BUDGET, issues_run_summary
from models import CatalogueRun, ComicIssue, Item, ItemType
from sources.base import SourceError, SourceRateLimited
from sources.comicvine import CvIssue, CvIssueHit, IssuePage
from tests.test_comics_routes import (
    SAGA_ISSUES,
    VOLUME,
    FakeComicVine,
    _row,
    _seed,
    client_for,
)

pytestmark = pytest.mark.asyncio

TODAY = date(2026, 11, 6)


def _cv(cv_id: int, number: int | None = None) -> CvIssue:
    return CvIssue(
        cv_id=cv_id,
        number=number if number is not None else cv_id,
        name=f"Issue {cv_id}",
        store_date=date(2026, 1, 7),
        cover_date=None,
        cover_url=f"https://img/{cv_id}.jpg",
        large_url=f"https://img/{cv_id}-large.jpg",
        description=["Para."],
    )


class PagingComicVine(FakeComicVine):
    """FakeComicVine plus the issue-page, issue and search calls."""

    def __init__(self, totals: dict[str, int] | None = None, **kwargs):
        super().__init__(**kwargs)
        self.totals = totals or {}
        self.rate_limited: set[str] = set()
        self.linkable: dict[int, CvIssue] = {}

    async def fetch_issue_page(self, volume_id: str, offset: int) -> IssuePage:
        self.calls.append(("page", f"{volume_id}@{offset}"))
        if volume_id in self.rate_limited:
            raise SourceRateLimited(self.source_name, "slow down")
        if volume_id in self.fail:
            raise SourceError(self.source_name, "the /issues call failed")
        total = self.totals.get(volume_id, 0)
        count = max(0, min(100, total - offset))
        return IssuePage(
            issues=[_cv(offset + i + 1) for i in range(count)], total=total
        )

    async def fetch_issue(self, cv_id: int):
        self.calls.append(("issue", str(cv_id)))
        return self.linkable.get(cv_id)

    async def search_issues(self, query: str):
        self.calls.append(("isearch", query))
        return [CvIssueHit(7, "Saga", "1", None, "https://img/t.jpg", 2012)]


async def _count(factory, item_id=None) -> int:
    async with factory() as session:
        query = select(func.count()).select_from(ComicIssue)
        if item_id is not None:
            query = query.where(ComicIssue.item_id == item_id)
        return await session.scalar(query)


async def test_sync_pages_until_total(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test, is_public=True)
    source = PagingComicVine(totals={VOLUME: 250})
    async with sessionmaker_for_test() as session:
        item = await session.get(Item, item_id)
        result = await sync_series(session, source, item, 10, TODAY)

    assert (result.requests, result.written, result.complete) == (3, 250, True)
    assert [c[1] for c in source.calls if c[0] == "page"] == [
        f"{VOLUME}@0",
        f"{VOLUME}@100",
        f"{VOLUME}@200",
    ]
    assert (await _row(sessionmaker_for_test, item_id)).issues_synced_on == TODAY
    assert await _count(sessionmaker_for_test, item_id) == 250


async def test_sync_stops_at_budget_and_resumes_stalest_first(sessionmaker_for_test):
    first = await _seed(sessionmaker_for_test, is_public=True, title="A")
    second = await _seed(
        sessionmaker_for_test, is_public=True, title="B", external_id="77"
    )
    source = PagingComicVine(totals={VOLUME: 250, "77": 50})
    async with sessionmaker_for_test() as session:
        item = await session.get(Item, first)
        partial = await sync_series(session, source, item, 2, TODAY)
    assert (partial.requests, partial.complete) == (2, False)
    assert (await _row(sessionmaker_for_test, first)).issues_synced_on is None

    # "A" has no sync date and "B" none either; give A a date so B is stalest.
    async with sessionmaker_for_test() as session:
        row = await session.get(Item, first)
        row.issues_synced_on = date(2026, 11, 1)
        await session.commit()
    source.calls.clear()
    async with client_for(sessionmaker_for_test, source) as client:
        body = (await client.post("/api/comics/issues/sync?budget=1")).json()

    assert [s["id"] for s in body["series"]] == [str(second)]
    assert body["requests"] == 1
    assert body["series"][0]["complete"] is True
    assert source.calls == [("page", "77@0")]


async def test_sync_skips_unlinked_and_private_series(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, is_public=False, title="Private")
    await _seed(
        sessionmaker_for_test,
        is_public=True,
        title="Unlinked",
        external_source=None,
        external_id=None,
    )
    await _seed(
        sessionmaker_for_test,
        is_public=True,
        title="Game",
        type=ItemType.GAME,
        external_id="5",
    )
    source = PagingComicVine(totals={VOLUME: 5})
    async with client_for(sessionmaker_for_test, source) as client:
        body = (await client.post("/api/comics/issues/sync")).json()

    assert body == {"ok": True, "series": [], "requests": 0}
    assert source.calls == []


@pytest.mark.parametrize("budget", [0, 191])
async def test_sync_budget_is_bounded(sessionmaker_for_test, budget):
    async with client_for(sessionmaker_for_test, PagingComicVine()) as client:
        response = await client.post(f"/api/comics/issues/sync?budget={budget}")
    assert response.status_code == 422


async def test_sync_error_is_reported_per_series(sessionmaker_for_test):
    bad = await _seed(
        sessionmaker_for_test, is_public=True, title="A", external_id="77"
    )
    good = await _seed(sessionmaker_for_test, is_public=True, title="B")
    source = PagingComicVine(totals={VOLUME: 3, "77": 3})
    source.fail = {"77"}
    async with client_for(sessionmaker_for_test, source) as client:
        body = (await client.post("/api/comics/issues/sync")).json()

    assert body["ok"] is False
    by_id = {s["id"]: s for s in body["series"]}
    assert "error" in by_id[str(bad)] and by_id[str(bad)]["complete"] is False
    assert by_id[str(good)]["complete"] is True
    assert await _count(sessionmaker_for_test, good) == 3


async def test_a_rate_limit_stops_the_whole_run(sessionmaker_for_test):
    limited = await _seed(
        sessionmaker_for_test, is_public=True, title="A", external_id="77"
    )
    await _seed(
        sessionmaker_for_test,
        is_public=True,
        title="B",
        issues_synced_on=date(2026, 1, 1),
    )
    source = PagingComicVine(totals={VOLUME: 3, "77": 3})
    source.rate_limited = {"77"}
    async with client_for(sessionmaker_for_test, source) as client:
        body = (await client.post("/api/comics/issues/sync")).json()

    assert body["ok"] is False
    assert [s["id"] for s in body["series"]] == [str(limited)]
    assert "error" in body["series"][0]
    assert source.calls == [("page", "77@0")]


async def test_create_syncs_issues(sessionmaker_for_test):
    source = PagingComicVine(issues={VOLUME: SAGA_ISSUES}, totals={VOLUME: 150})
    async with client_for(sessionmaker_for_test, source) as client:
        response = await client.post("/api/comics/want", json={"external_id": VOLUME})
    assert response.status_code == 201
    async with sessionmaker_for_test() as session:
        count = await session.scalar(select(func.count()).select_from(ComicIssue))
    assert count == 100  # one page; the nightly finishes the rest


async def test_the_inline_sync_budget_is_one_request():
    assert ISSUE_SYNC_BUDGET == 1


async def test_a_series_deleted_mid_inline_sync_does_not_fail_the_write(
    sessionmaker_for_test,
):
    source = PagingComicVine(issues={VOLUME: SAGA_ISSUES}, totals={VOLUME: 50})
    original = source.fetch_issue_page

    async def deleting(volume_id, offset):
        async with sessionmaker_for_test() as other:
            await other.execute(delete(Item))
            await other.commit()
        return await original(volume_id, offset)

    source.fetch_issue_page = deleting
    async with client_for(sessionmaker_for_test, source) as client:
        response = await client.post("/api/comics/want", json={"external_id": VOLUME})
    assert response.status_code == 201, response.text


async def test_a_failed_sync_does_not_fail_create_or_refresh(sessionmaker_for_test):
    source = PagingComicVine(issues={VOLUME: SAGA_ISSUES})
    source.fail = {VOLUME}  # fetch_issues is fine; fetch_issue_page raises

    async def fetch_issues(external_id):
        return list(source.issues.get(external_id, []))

    source.fetch_issues = fetch_issues
    async with client_for(sessionmaker_for_test, source) as client:
        created = await client.post("/api/comics/want", json={"external_id": VOLUME})
        assert created.status_code == 201
        refreshed = await client.post(
            f"/api/comics/{created.json()['item_id']}/refresh"
        )
    assert refreshed.status_code == 200
    assert await _count(sessionmaker_for_test) == 0


async def _edition_item(factory, **edition):
    base = {"kind": "Trade", "label": "Vol. 1", "from": 1, "to": 6}
    return await _seed(factory, editions=[base | edition], is_public=True)


async def test_link_edition_stores_cover_and_description(sessionmaker_for_test):
    item_id = await _edition_item(sessionmaker_for_test)
    source = PagingComicVine()
    source.linkable[99] = _cv(99, 1)
    async with client_for(sessionmaker_for_test, source) as client:
        response = await client.put(
            f"/api/comics/{item_id}/editions/ed-1-6/link", json={"cv_id": 99}
        )
        assert response.status_code == 200
        stored = (await _row(sessionmaker_for_test, item_id)).editions[0]
        assert stored["cv_id"] == 99
        assert stored["cover_url"] == "https://img/99.jpg"
        assert stored["large_url"] == "https://img/99-large.jpg"
        assert stored["description"] == ["Para."]
        assert stored["label"] == "Vol. 1"

        missing = await client.put(
            f"/api/comics/{item_id}/editions/ed-1-6/link", json={"cv_id": 5}
        )
        assert missing.status_code == 422

        cleared = await client.put(
            f"/api/comics/{item_id}/editions/ed-1-6/link", json={"cv_id": None}
        )
        assert cleared.status_code == 200
    assert (await _row(sessionmaker_for_test, item_id)).editions == [
        {"kind": "Trade", "label": "Vol. 1", "from": 1, "to": 6}
    ]


async def test_link_unknown_slug_404(sessionmaker_for_test):
    item_id = await _edition_item(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, PagingComicVine()) as client:
        response = await client.put(
            f"/api/comics/{item_id}/editions/ed-9-9/link", json={"cv_id": 1}
        )
    assert response.status_code == 404


async def test_issue_search(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, PagingComicVine()) as client:
        response = await client.get("/api/comics/issues/search?q=saga")
    assert response.status_code == 200
    assert response.json()[0]["cv_id"] == 7
    assert asdict(CvIssueHit(7, "Saga", "1", None, "https://img/t.jpg", 2012))


async def test_resaving_an_edition_keeps_the_link(sessionmaker_for_test):
    item_id = await _edition_item(
        sessionmaker_for_test,
        cv_id=99,
        cover_url="https://img/99.jpg",
        large_url="https://img/99-large.jpg",
        description=["Para."],
    )
    source = PagingComicVine()
    async with client_for(sessionmaker_for_test, source) as client:
        response = await client.patch(
            f"/api/items/{item_id}",
            json={
                "editions": [{"kind": "Trade", "label": "Vol. 1", "from": 1, "to": 6}]
            },
        )
    assert response.status_code == 200, response.text
    stored = (await _row(sessionmaker_for_test, item_id)).editions[0]
    assert stored["label"] == "Vol. 1"
    assert stored["cv_id"] == 99
    assert stored["cover_url"] == "https://img/99.jpg"


async def test_a_series_deleted_mid_sync_does_not_stop_the_run(sessionmaker_for_test):
    doomed = await _seed(
        sessionmaker_for_test, is_public=True, title="A", external_id="77"
    )
    good = await _seed(
        sessionmaker_for_test,
        is_public=True,
        title="B",
        issues_synced_on=date(2026, 1, 1),
    )
    source = PagingComicVine(totals={VOLUME: 3, "77": 3})
    original = source.fetch_issue_page

    async def delete_then_page(volume_id, offset):
        page = await original(volume_id, offset)
        if volume_id == "77":
            async with sessionmaker_for_test() as session:
                await session.delete(await session.get(Item, doomed))
                await session.commit()
        return page

    source.fetch_issue_page = delete_then_page
    async with client_for(sessionmaker_for_test, source) as client:
        response = await client.post("/api/comics/issues/sync")

    assert response.status_code == 200
    by_id = {s["id"]: s for s in response.json()["series"]}
    assert by_id[str(doomed)]["complete"] is False
    assert by_id[str(good)]["complete"] is True
    assert await _count(sessionmaker_for_test, good) == 3


async def test_a_write_failure_is_reported_and_the_run_continues(
    sessionmaker_for_test, monkeypatch
):
    import comic_issues

    bad = await _seed(
        sessionmaker_for_test, is_public=True, title="A", external_id="77"
    )
    good = await _seed(
        sessionmaker_for_test,
        is_public=True,
        title="B",
        issues_synced_on=date(2026, 1, 1),
    )
    real = comic_issues.upsert_issues

    async def flaky(session, item_id, issues, today):
        if item_id == bad:
            raise RuntimeError("boom")
        return await real(session, item_id, issues, today)

    monkeypatch.setattr(comic_issues, "upsert_issues", flaky)
    source = PagingComicVine(totals={VOLUME: 3, "77": 3})
    async with client_for(sessionmaker_for_test, source) as client:
        body = (await client.post("/api/comics/issues/sync")).json()

    by_id = {s["id"]: s for s in body["series"]}
    assert body["ok"] is False
    assert by_id[str(bad)]["error"] == "boom"
    assert by_id[str(good)]["complete"] is True


async def test_a_crashing_sync_still_returns_create_and_refresh(
    sessionmaker_for_test, monkeypatch
):
    async def boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(comics_routes, "sync_series", boom)
    source = PagingComicVine(issues={VOLUME: SAGA_ISSUES})

    async def fetch_issues(external_id):
        return list(source.issues.get(external_id, []))

    source.fetch_issues = fetch_issues
    async with client_for(sessionmaker_for_test, source) as client:
        created = await client.post("/api/comics/want", json={"external_id": VOLUME})
        assert created.status_code == 201
        assert created.json()["title"]
        refreshed = await client.post(
            f"/api/comics/{created.json()['item_id']}/refresh"
        )
    assert refreshed.status_code == 200
    assert refreshed.json()["title"]


# --- The run record and /api/comics/status -----------------------------------


async def _runs(factory) -> list[CatalogueRun]:
    async with factory() as session:
        return list(
            await session.scalars(
                select(CatalogueRun).order_by(CatalogueRun.started_at)
            )
        )


async def test_status_is_null_before_any_run(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, PagingComicVine()) as client:
        response = await client.get("/api/comics/status")
    assert response.status_code == 200
    assert response.json() == {"issues.last_run": None}


async def test_status_is_admin_only(sessionmaker_for_test):
    from fastapi import FastAPI
    from httpx2 import ASGITransport, AsyncClient
    from starlette.middleware.sessions import SessionMiddleware

    from comics_routes import create_comics_router

    app = FastAPI()
    app.include_router(create_comics_router(sessionmaker_for_test, {}))
    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/comics/status")
    assert response.status_code == 401


async def test_a_clean_run_is_recorded_ok(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, is_public=True, title="A", external_id="77")
    await _seed(sessionmaker_for_test, is_public=True, title="B")
    source = PagingComicVine(totals={VOLUME: 3, "77": 5})
    async with client_for(sessionmaker_for_test, source) as client:
        body = (await client.post("/api/comics/issues/sync")).json()
        status = (await client.get("/api/comics/status")).json()

    (run,) = await _runs(sessionmaker_for_test)
    assert run.source == "comic_issues"
    assert run.ok is True and run.finished_at is not None
    assert (run.rows_seen, run.rows_changed, run.items_synced) == (2, 8, 2)
    assert run.short_run is False and run.errors == []
    assert body["ok"] is True
    summary = status["issues.last_run"]
    assert summary["state"] == "ok" and summary["ok"] is True
    assert "note" not in summary


async def test_a_source_error_is_recorded_with_its_series(sessionmaker_for_test):
    bad = await _seed(
        sessionmaker_for_test, is_public=True, title="A", external_id="77"
    )
    await _seed(sessionmaker_for_test, is_public=True, title="B")
    source = PagingComicVine(totals={VOLUME: 3, "77": 3})
    source.fail = {"77"}
    async with client_for(sessionmaker_for_test, source) as client:
        await client.post("/api/comics/issues/sync")
        status = (await client.get("/api/comics/status")).json()

    (run,) = await _runs(sessionmaker_for_test)
    assert run.ok is False
    assert (run.rows_seen, run.items_synced) == (2, 1)
    assert run.errors == [
        {
            "code": "source_error",
            "detail": run.errors[0]["detail"],
            "item_id": str(bad),
        }
    ]
    summary = status["issues.last_run"]
    assert summary["state"] == "failed" and summary["ok"] is False
    assert summary["note"] == f"1 of 2 series failed: {run.errors[0]['detail']}"


async def test_a_rate_limit_is_recorded_and_stops(sessionmaker_for_test):
    limited = await _seed(
        sessionmaker_for_test, is_public=True, title="A", external_id="77"
    )
    await _seed(
        sessionmaker_for_test,
        is_public=True,
        title="B",
        issues_synced_on=date(2026, 1, 1),
    )
    source = PagingComicVine(totals={VOLUME: 3, "77": 3})
    source.rate_limited = {"77"}
    async with client_for(sessionmaker_for_test, source) as client:
        await client.post("/api/comics/issues/sync")

    (run,) = await _runs(sessionmaker_for_test)
    assert run.ok is False and run.short_run is True
    assert run.rows_seen == 1 and run.unresolved_remaining == 2
    assert [(e["code"], e["item_id"]) for e in run.errors] == [
        ("rate_limited", str(limited))
    ]


async def test_the_budget_running_out_is_recorded_partial(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, is_public=True, title="A", external_id="77")
    await _seed(
        sessionmaker_for_test,
        is_public=True,
        title="B",
        issues_synced_on=date(2026, 1, 1),
    )
    source = PagingComicVine(totals={VOLUME: 3, "77": 3})
    async with client_for(sessionmaker_for_test, source) as client:
        await client.post("/api/comics/issues/sync?budget=1")
        status = (await client.get("/api/comics/status")).json()

    (run,) = await _runs(sessionmaker_for_test)
    assert run.ok is True and run.short_run is True
    assert (run.rows_seen, run.items_synced, run.unresolved_remaining) == (1, 1, 1)
    assert status["issues.last_run"]["state"] == "partial"
    assert status["issues.last_run"]["note"] == "Budget spent; 1 series waits"


async def test_an_unexpected_exception_fails_the_run_and_reraises(
    sessionmaker_for_test, monkeypatch
):
    await _seed(sessionmaker_for_test, is_public=True, title="A")

    async def boom(*args, **kwargs):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(comics_routes, "sync_series", boom)
    async with client_for(sessionmaker_for_test, PagingComicVine()) as client:
        with pytest.raises(RuntimeError, match="kaboom"):
            await client.post("/api/comics/issues/sync")

    (run,) = await _runs(sessionmaker_for_test)
    assert run.ok is False and run.finished_at is not None
    assert [(e["code"], e["detail"]) for e in run.errors] == [("exception", "kaboom")]


NOW = datetime(2026, 11, 13, 12, tzinfo=UTC)


def _run(**fields) -> CatalogueRun:
    base = {
        "source": "comic_issues",
        "started_at": NOW - timedelta(minutes=2),
        "finished_at": NOW - timedelta(minutes=1),
        "ok": True,
        "rows_seen": 4,
        "items_synced": 4,
        "unresolved_remaining": 0,
        "short_run": False,
        "errors": [],
    }
    return CatalogueRun(**(base | fields))


async def test_summary_of_no_run_is_none():
    assert issues_run_summary(None, NOW) is None


async def test_summary_ok_has_no_note():
    assert issues_run_summary(_run(), NOW) == {
        "at": (NOW - timedelta(minutes=1)).isoformat(),
        "state": "ok",
        "ok": True,
    }


async def test_summary_partial_counts_waiting_series():
    summary = issues_run_summary(
        _run(short_run=True, items_synced=1, unresolved_remaining=3), NOW
    )
    assert summary["state"] == "partial" and summary["ok"] is True
    assert summary["note"] == "Budget spent; 3 series wait"


async def test_summary_failed_names_the_first_error():
    errors = [
        {"code": "source_error", "detail": "HTTP 500", "item_id": "a"},
        {"code": "source_error", "detail": "timeout", "item_id": "b"},
    ]
    summary = issues_run_summary(_run(ok=False, errors=errors), NOW)
    assert summary["state"] == "failed" and summary["ok"] is False
    assert summary["note"] == "2 of 4 series failed: HTTP 500"


async def test_summary_of_a_run_left_open_is_failed():
    stale = _run(ok=None, finished_at=None, started_at=NOW - timedelta(hours=3))
    summary = issues_run_summary(stale, NOW)
    assert summary["state"] == "failed" and summary["ok"] is False
    assert summary["at"] == stale.started_at.isoformat()


async def test_summary_of_a_run_in_progress_is_ok():
    fresh = _run(ok=None, finished_at=None, started_at=NOW - timedelta(minutes=1))
    assert issues_run_summary(fresh, NOW)["state"] == "ok"
