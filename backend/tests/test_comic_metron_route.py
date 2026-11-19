"""#337: `POST /volumes/{id}/contents/metron` proposes, and the owner's Accept
(`PUT /volumes/{id}` with source 'metron') is the only write.

The Metron client is a stub that serves the REAL recorded fixtures
(`tests/fixtures/metron_*.json`); failure statuses are FAKES.
"""

from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

import comic_metron
from comics_routes import create_comics_router
from models import ComicVolume, ItemType
from sources.base import SourceNotConfigured, SourceRateLimited
from sources.metron import (
    IssueRow,
    MetronIssue,
    MetronRateLimited,
    MetronUnauthorized,
)
from tests.test_comic_contents_route import add_collect, rows, volume_with
from tests.test_comic_issues_sync import PagingComicVine
from tests.test_comic_volume_admin import collects_of, put_body
from tests.test_comic_volume_marks import marks

pytestmark = pytest.mark.asyncio

FIXTURES = Path(__file__).parent / "fixtures"
BASE = "/api/comics"
SAGA_ISBN = "9781607066019"


def _fx(name):
    return json.loads((FIXTURES / name).read_text())


def _issue(payload) -> MetronIssue:
    series = payload["series"]
    return MetronIssue(
        id=payload["id"],
        series_name=series["name"],
        series_type=series["series_type"]["name"],
        title=payload["title"] or None,
        isbn=payload["isbn"] or None,
        pages=payload["page"],
        resource_url=payload["resource_url"],
        reprints=payload["reprints"],
    )


class StubMetron:
    """Serves the recorded Saga answers; `fail` raises it on the first call."""

    def __init__(self, configured=True, fail=None, trade=None):
        self._configured = configured
        self.fail = fail
        self.calls = []
        self.trade = trade or _issue(_fx("metron_saga_tpb_issue.json"))

    def configured(self):
        return self._configured

    async def search_issues(self, series_name, number=None):
        self.calls.append(("search", series_name, number))
        if self.fail:
            raise self.fail
        if series_name.startswith("Zzqx"):
            return []
        return [
            IssueRow(
                id=r["id"],
                series_name=r["series"]["name"],
                year=r["series"]["year_began"],
                number=r["number"],
                issue=r["issue"],
            )
            for r in _fx("metron_issue_list_saga.json")["results"]
        ]

    async def fetch_issue(self, issue_id):
        self.calls.append(("fetch", issue_id))
        if issue_id == 52773:
            return self.trade
        if issue_id == 7997:
            return _issue(_fx("metron_saga_single_issue.json"))
        return None


@asynccontextmanager
async def client_for(factory, metron):
    app = FastAPI()
    app.include_router(
        create_comics_router(
            factory, {ItemType.COMIC: PagingComicVine()}, None, metron=metron
        )
    )

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def path(volume_id):
    return f"{BASE}/volumes/{volume_id}/contents/metron"


async def saga_volume(factory, isbn=SAGA_ISBN, line=1):
    item_id, volume_id = await volume_with(factory, description="")
    async with factory() as session:
        row = await session.get(ComicVolume, volume_id)
        row.isbn, row.line_number = isbn, line
        await session.commit()
    return item_id, volume_id


async def propose(factory, volume_id, metron):
    async with client_for(factory, metron) as client:
        return await client.post(path(volume_id), json={})


async def test_an_isbn_match_is_a_strong_proposal_and_writes_nothing(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    _, volume_id = await saga_volume(factory)
    stub = StubMetron()
    response = await propose(factory, volume_id, stub)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "strong"
    (candidate,) = body["candidates"]  # the single issue is not a collected type
    assert candidate["strong"] is True
    assert candidate["isbn"] == SAGA_ISBN and candidate["pages"] == 160
    assert candidate["resource_url"] == "https://metron.cloud/issue/saga-2012-1/"
    assert candidate["entries"] == [{"series_name": "Saga", "issue_text": "#1-6"}]
    # The search used the title and the line number; nothing else was asked.
    assert stub.calls[0] == ("search", "Saga", 1)
    assert await collects_of(factory, volume_id) == []  # a proposal, no write


async def test_an_isbn_that_differs_is_possible_and_shows_the_isbn(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    _, volume_id = await saga_volume(factory, isbn="9781534300989")
    body = (await propose(factory, volume_id, StubMetron())).json()
    assert body["status"] == "possible"
    assert body["candidates"][0]["strong"] is False
    assert body["candidates"][0]["isbn"] == SAGA_ISBN


async def test_a_volume_with_no_isbn_is_possible(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await saga_volume(factory, isbn=None)
    assert (await propose(factory, volume_id, StubMetron())).json()["status"] == (
        "possible"
    )


async def test_no_candidate_is_not_found(sessionmaker_for_test):
    factory = sessionmaker_for_test
    item_id, volume_id = await volume_with(factory, title="Zzqx Nothing")
    body = (await propose(factory, volume_id, StubMetron())).json()
    assert (body["status"], body["candidates"]) == ("not_found", [])
    assert "no matching book" in body["message"]


async def test_only_the_exact_series_is_fetched_and_at_most_five(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    _, volume_id = await saga_volume(factory)
    stub = StubMetron()
    await propose(factory, volume_id, stub)
    # 34 rows came back; only the two named exactly "Saga" were fetched.
    assert [c[1] for c in stub.calls if c[0] == "fetch"] == [52773, 7997]


async def test_a_trade_with_no_reprints_is_not_proposed(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await saga_volume(factory)
    bare = _issue(_fx("metron_saga_tpb_issue.json"))
    bare = MetronIssue(**{**bare.__dict__, "reprints": []})
    body = (await propose(factory, volume_id, StubMetron(trade=bare))).json()
    assert body["status"] == "not_found"


async def test_no_client_and_no_token_say_not_configured(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await saga_volume(factory)
    for metron in (None, StubMetron(configured=False)):
        body = (await propose(factory, volume_id, metron)).json()
        assert body["status"] == "not_configured"
        assert "METRON_TOKEN" in body["message"]
        assert body["candidates"] == []


@pytest.mark.parametrize(
    "error, status",
    [
        (MetronUnauthorized("metron", "HTTP 401: token refused"), "unauthorized"),
        (MetronRateLimited("slow", retry_after=30), "rate_limited"),
        (SourceRateLimited("metron", "slow"), "rate_limited"),
        (SourceNotConfigured("metron", "no"), "not_configured"),
    ],
)
async def test_failures_are_a_status_never_a_500(sessionmaker_for_test, error, status):
    # FAKE failures: Metron cannot be made to refuse on demand.
    factory = sessionmaker_for_test
    _, volume_id = await saga_volume(factory)
    response = await propose(factory, volume_id, StubMetron(fail=error))
    assert response.status_code == 200
    assert response.json()["status"] == status


async def test_an_unknown_volume_is_404(sessionmaker_for_test):
    response = await propose(sessionmaker_for_test, uuid.uuid4(), StubMetron())
    assert response.status_code == 404


async def test_the_proposal_drops_entries_other_sources_already_hold(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    _, volume_id = await saga_volume(factory)
    await add_collect(factory, volume_id, 0, "typed", "The Saga", "#1-6")
    await add_collect(factory, volume_id, 1, "metron", "Saga", "#1-3")
    body = (await propose(factory, volume_id, StubMetron())).json()
    (candidate,) = body["candidates"]
    assert candidate["entries"] == []  # equal to the typed row, "the" aside
    assert candidate["skipped"] == 1
    assert body["replaces"] == 1  # the old metron row would be swapped out


async def test_accept_stores_metron_rows_and_keeps_every_other_source(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id, volume_id = await saga_volume(factory)
    await add_collect(factory, volume_id, 0, "typed", "Hellboy", "#4")
    await add_collect(factory, volume_id, 1, "photo", "Hellboy", "#5")
    await add_collect(factory, volume_id, 2, "parsed", "Hellboy", "#6")
    await add_collect(factory, volume_id, 3, "migrated", "Hellboy", "#7")
    await add_collect(factory, volume_id, 4, "metron", "Old", "#1")
    async with client_for(factory, StubMetron()) as client:
        view = (await client.get(f"{BASE}/volumes/{volume_id}")).json()
        keep = [
            {
                "id": c["id"],
                "series_name": c["series_name"],
                "issue_text": c["issue_text"],
                "link": None,
            }
            for c in view["collects"]
            if c["source"] != "metron"
        ]
        proposal = (await client.post(path(volume_id), json={})).json()
        entries = proposal["candidates"][0]["entries"]
        body = put_body(
            collects=keep + [{**e, "link": None, "source": "metron"} for e in entries],
            label=view["label"],
            kind=view["kind"],
        )
        response = await client.put(f"{BASE}/volumes/{volume_id}", json=body)
    assert response.status_code == 200, response.text
    assert rows(await collects_of(factory, volume_id)) == [
        ("Hellboy", "#4", "typed"),
        ("Hellboy", "#5", "photo"),
        ("Hellboy", "#6", "parsed"),
        ("Hellboy", "#7", "migrated"),
        ("Saga", "#1-6", "metron"),
    ]
    # Metron rows are text only: they mark nothing.
    assert set(await marks(factory, item_id)) == set()


async def test_only_a_new_entry_may_claim_metron(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await saga_volume(factory)
    await add_collect(factory, volume_id, 0, "typed", "Saga", "#1")
    (row,) = await collects_of(factory, volume_id)
    async with client_for(factory, StubMetron()) as client:
        body = put_body(
            collects=[
                {
                    "id": str(row.id),
                    "series_name": "Saga",
                    "issue_text": "#2",  # changed
                    "source": "metron",
                    "link": None,
                }
            ]
        )
        response = await client.put(f"{BASE}/volumes/{volume_id}", json=body)
    assert response.status_code == 422  # a changed entry is typed, not metron


async def test_find_contents_is_pure_about_ranking():
    rows_ = [
        IssueRow(1, "Saga", 2012, "1", "Saga (2012) #1"),
        IssueRow(2, "Saga", 2012, "1", "Saga TPB (2012) #1"),
        IssueRow(3, "Clone Saga", 1997, "1", "Clone Saga (1997) #1"),
    ]
    assert [r.id for r in comic_metron.pick_rows(rows_, "The Saga")] == [2, 1]
