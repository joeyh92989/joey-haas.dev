"""#327: `POST /volumes/{id}/contents/parse`, and the rules-only parse the
Comic Vine link runs. The model is a stub; nothing here spends a call."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from comics_routes import create_comics_router
from llm import LLMError
from models import ComicVolume, ComicVolumeCollect, Item, ItemType
from tests.test_comic_issues_sync import PagingComicVine, _cv
from tests.test_comic_tags_job import StubProvider, _leave
from tests.test_comic_volume_admin import collects_of, get_volume
from tests.test_comic_volume_marks import add_volume, make, marks

pytestmark = pytest.mark.asyncio

BASE = "/api/comics"
DESCRIPTION = "A big story. Collects Saga #1-3 and Hellboy #4."


@asynccontextmanager
async def client_for(factory, provider=None, source=None):
    app = FastAPI()
    registry = {ItemType.COMIC: source or PagingComicVine()}
    app.include_router(
        create_comics_router(
            factory,
            registry,
            None,
            provider_factory=(lambda: provider) if provider else None,
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


async def volume_with(factory, description=DESCRIPTION, title="Saga", **fields):
    item_id = await make(factory, title=title, **fields)
    volume_id = await add_volume(factory, item_id, slug="vol-1", owned=True)
    async with factory() as session:
        row = await session.get(ComicVolume, volume_id)
        row.description = description
        await session.commit()
    return item_id, volume_id


async def add_collect(factory, volume_id, position, source, series, issues, **link):
    async with factory() as session:
        session.add(
            ComicVolumeCollect(
                id=uuid.uuid4(),
                volume_id=volume_id,
                position=position,
                series_name=series,
                issue_text=issues,
                source=source,
                **link,
            )
        )
        await session.commit()


def rows(collects):
    return [(c.series_name, c.issue_text, c.source) for c in collects]


def path(volume_id):
    return f"{BASE}/volumes/{volume_id}/contents/parse"


async def test_rules_fill_the_list_and_link_only_the_titles_own_series(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id, volume_id = await volume_with(factory)
    provider = StubProvider()
    async with client_for(factory, provider) as client:
        response = await client.post(path(volume_id), json={})
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["entries_added"], body["entries_replaced"]) == (2, 0)
    assert (body["used_model"], body["reason"]) == (False, None)
    assert provider.prompts == []  # the rules found it: no model call
    assert [
        (c["series_name"], c["issue_text"], c["source"]) for c in body["collects"]
    ] == [("Saga", "#1-3", "parsed"), ("Hellboy", "#4", "parsed")]
    saga, hellboy = body["collects"]
    assert saga["link"]["item_id"] == str(item_id)
    assert (saga["link"]["from_number"], saga["link"]["to_number"]) == (1, 3)
    assert hellboy["link"] is None  # another series is text only
    # The owned volume's linked range now marks the title's issues.
    assert set(await marks(factory, item_id)) == {1, 2, 3}
    assert (await get_volume(factory, volume_id)).edited is True


async def test_an_entry_with_no_series_takes_the_titles_name_and_links(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id, volume_id = await volume_with(factory, "Collects issues #1-5")
    async with client_for(factory, StubProvider()) as client:
        body = (await client.post(path(volume_id), json={})).json()
    (entry,) = body["collects"]
    assert (entry["series_name"], entry["issue_text"]) == ("Saga", "#1-5")
    assert entry["link"]["item_id"] == str(item_id)


async def test_a_non_plain_range_of_the_own_title_stays_text(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(
        factory, "Collects Saga #1-3, 5 and Saga Annual #1"
    )
    async with client_for(factory, StubProvider()) as client:
        body = (await client.post(path(volume_id), json={})).json()
    by_text = {c["issue_text"]: c["link"] for c in body["collects"]}
    assert by_text["#1-3"] is not None and by_text["#5"] is not None
    assert by_text["Annual #1"] is None


async def test_a_reparse_never_touches_typed_migrated_or_photo_entries(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id, volume_id = await volume_with(factory)
    await add_collect(factory, volume_id, 0, "typed", "Mine", "#9")
    await add_collect(factory, volume_id, 1, "migrated", "Saga", "#1-6")
    await add_collect(factory, volume_id, 2, "photo", "Photo Book", "#2")
    async with client_for(factory, StubProvider()) as client:
        first = (await client.post(path(volume_id), json={})).json()
        second = (await client.post(path(volume_id), json={})).json()
    assert first["entries_added"] == 2
    assert (second["entries_added"], second["entries_replaced"]) == (2, 2)
    stored = rows(await collects_of(factory, volume_id))
    assert stored[:3] == [
        ("Mine", "#9", "typed"),
        ("Saga", "#1-6", "migrated"),
        ("Photo Book", "#2", "photo"),
    ]
    assert len(stored) == 5  # idempotent: two parsed entries, not four
    assert sorted(stored[3:]) == [
        ("Hellboy", "#4", "parsed"),
        ("Saga", "#1-3", "parsed"),
    ]


async def test_an_entry_duplicating_a_kept_one_is_skipped(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory)
    await add_collect(factory, volume_id, 0, "typed", "  saga ", "#1-3")
    async with client_for(factory, StubProvider()) as client:
        body = (await client.post(path(volume_id), json={})).json()
    assert body["entries_added"] == 1
    assert rows(await collects_of(factory, volume_id)) == [
        ("  saga ", "#1-3", "typed"),
        ("Hellboy", "#4", "parsed"),
    ]


async def test_a_reparse_that_finds_nothing_keeps_the_old_parsed_entries(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory)
    provider = StubProvider({"entries": []})
    async with client_for(factory, provider) as client:
        await client.post(path(volume_id), json={})
        async with factory() as session:
            row = await session.get(ComicVolume, volume_id)
            row.description = "Nothing useful here."
            await session.commit()
        body = (await client.post(path(volume_id), json={})).json()
    assert (body["entries_added"], body["entries_replaced"]) == (0, 0)
    assert body["reason"] == "no_match"
    assert len(body["collects"]) == 2


async def test_no_description_and_no_note_is_no_text_and_writes_nothing(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, None)
    provider = StubProvider()
    async with client_for(factory, provider) as client:
        body = (await client.post(path(volume_id), json={})).json()
        blank = (await client.post(path(volume_id), json={"note": "  "})).json()
    assert body["reason"] == blank["reason"] == "no_text"
    assert body["collects"] == [] and provider.prompts == []
    assert (await get_volume(factory, volume_id)).edited is False


async def test_the_pasted_note_is_read_with_the_description(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, None)
    async with client_for(factory, StubProvider()) as client:
        body = (
            await client.post(path(volume_id), json={"note": "Collects Saga #1-6."})
        ).json()
        too_long = await client.post(path(volume_id), json={"note": "x" * 2001})
    assert [c["issue_text"] for c in body["collects"]] == ["#1-6"]
    assert too_long.status_code == 422


async def test_unknown_volume_is_404_and_a_game_less_route_needs_admin(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test, StubProvider()) as client:
        response = await client.post(path(uuid.uuid4()), json={})
    assert response.status_code == 404


# --- The model fallback --------------------------------------------------------

PROSE = "A trade of Saga issues 1 to 6, the whole first arc."


async def test_the_model_is_asked_only_when_the_rules_find_nothing(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, PROSE)
    provider = StubProvider(
        {"entries": [{"series_name": "Saga", "issue_text": "#1-6"}]}
    )
    async with client_for(factory, provider) as client:
        body = (await client.post(path(volume_id), json={})).json()
    assert len(provider.prompts) == 1
    assert provider.kwargs == {"budget_seconds": 40.0}
    assert (body["used_model"], body["reason"], body["entries_added"]) == (
        True,
        None,
        1,
    )
    assert rows(await collects_of(factory, volume_id)) == [("Saga", "#1-6", "parsed")]


async def test_a_hallucinated_answer_writes_nothing(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, PROSE)
    provider = StubProvider(
        {"entries": [{"series_name": "Batman", "issue_text": "#1-6"}]}
    )
    async with client_for(factory, provider) as client:
        body = (await client.post(path(volume_id), json={})).json()
    assert (body["used_model"], body["reason"]) == (True, "no_match")
    assert await collects_of(factory, volume_id) == []


async def test_a_model_error_is_a_reason_not_an_error_and_is_not_retried(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, PROSE)
    provider = StubProvider(LLMError("Gemini is down"))
    async with client_for(factory, provider) as client:
        response = await client.post(path(volume_id), json={})
    assert response.status_code == 200
    assert response.json()["reason"] == "model_error"
    assert len(provider.prompts) == 1


async def test_no_provider_is_a_model_error_reason(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, PROSE)
    async with client_for(factory, None) as client:
        body = (await client.post(path(volume_id), json={})).json()
    assert body["reason"] == "model_error" and body["used_model"] is False


async def test_a_spent_budget_never_calls_the_model(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, PROSE)
    await _leave(factory, 0)
    provider = StubProvider({"entries": [{"series_name": "", "issue_text": "#1"}]})
    async with client_for(factory, provider) as client:
        body = (await client.post(path(volume_id), json={})).json()
    assert body["reason"] == "budget" and body["used_model"] is False
    assert len(provider.prompts) == 0
    assert await collects_of(factory, volume_id) == []


async def test_a_budget_with_room_lets_one_call_through(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, PROSE)
    await _leave(factory, 1)
    provider = StubProvider({"entries": []})
    async with client_for(factory, provider) as client:
        await client.post(path(volume_id), json={})
    assert len(provider.prompts) == 1


async def test_rules_never_need_the_budget(sessionmaker_for_test):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory)
    await _leave(factory, 0)
    async with client_for(factory, StubProvider()) as client:
        body = (await client.post(path(volume_id), json={})).json()
    assert body["entries_added"] == 2 and body["reason"] is None


# --- The Comic Vine link --------------------------------------------------------


async def test_the_link_parses_the_description_by_rules_and_never_asks_a_model(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    item_id, volume_id = await volume_with(factory, None)
    source = PagingComicVine()
    issue = _cv(99, 1)
    source.linkable[99] = type(issue)(
        **{**issue.__dict__, "description": ["Collects Saga #1-3."]}
    )
    provider = StubProvider()
    async with client_for(factory, provider, source) as client:
        response = await client.put(
            f"{BASE}/volumes/{volume_id}/link", json={"cv_id": 99}
        )
    assert response.status_code == 200, response.text
    stored = await collects_of(factory, volume_id)
    assert rows(stored) == [("Saga", "#1-3", "parsed")]
    assert stored[0].item_id == item_id
    assert set(await marks(factory, item_id)) == {1, 2, 3}
    assert provider.prompts == []


async def test_the_link_never_calls_the_model_even_when_the_rules_find_nothing(
    sessionmaker_for_test,
):
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, None)
    source = PagingComicVine()
    source.linkable[99] = _cv(99, 1)  # description "Para."
    provider = StubProvider({"entries": [{"series_name": "", "issue_text": "#1"}]})
    async with client_for(factory, provider, source) as client:
        response = await client.put(
            f"{BASE}/volumes/{volume_id}/link", json={"cv_id": 99}
        )
    assert response.status_code == 200
    assert provider.prompts == []
    assert await collects_of(factory, volume_id) == []


async def test_a_parse_failure_does_not_fail_the_link(
    sessionmaker_for_test, monkeypatch
):
    import comics_routes

    def boom(text):
        raise RuntimeError("parser broke")

    monkeypatch.setattr(comics_routes.comic_contents, "parse_contents", boom)
    factory = sessionmaker_for_test
    _, volume_id = await volume_with(factory, None)
    source = PagingComicVine()
    source.linkable[99] = _cv(99, 1)
    async with client_for(factory, None, source) as client:
        response = await client.put(
            f"{BASE}/volumes/{volume_id}/link", json={"cv_id": 99}
        )
    assert response.status_code == 200
    assert (await get_volume(factory, volume_id)).cv_id == 99


async def test_the_route_is_admin_only(sessionmaker_for_test):
    app = FastAPI()
    app.include_router(create_comics_router(sessionmaker_for_test, {}))
    app.add_middleware(SessionMiddleware, secret_key="s", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.post(path(uuid.uuid4()), json={})
    assert response.status_code == 401
    _ = (select, Item)
