"""Comics on the public site: /api/public/comics, the comic block on the item
page, and What's next's Comics this week. Only public rows (spec, D5)."""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select

import public
from models import ComicShelfFormat, Item, ItemStatus, ItemType, OwnedFormat
from public import create_public_router
from public_comics import (
    PublicComicDetail,
    PublicComicIssue,
    PublicComicRow,
    PublicComicStats,
)
from public_issues import (
    PublicComicIndex,
    PublicComicIndexEdition,
    PublicComicIndexIssue,
    PublicEditionLink,
    PublicEditionNext,
    PublicEditionPage,
    PublicIssueEdition,
    PublicIssuePage,
    PublicNeighbour,
    PublicWall,
    PublicWallEdition,
    PublicWallIssue,
)

pytestmark = pytest.mark.asyncio

# A Friday; its week began on Wednesday 4 November.
NOW = datetime(2026, 11, 6, 15, 0, tzinfo=UTC)

# Keys no comics body may carry anywhere: the private columns, and anything
# about where to buy an issue.
COMIC_FORBIDDEN = {
    "issues_skipped", "skipped", "notes", "owned_format", "acquired_at",
    "source_metadata", "is_public", "price", "store", "url", "external_id",
}  # fmt: skip

ROW_FIELDS = {
    "item_id", "title", "publisher", "year", "cover_url", "ongoing",
    "following", "wanted", "shelf_format", "edition_labels", "owned",
    "released", "missing", "run_state", "segments", "status", "rating",
    "read_to", "read", "read_next", "next_issue", "created_at",
}  # fmt: skip
STATS_FIELDS = {
    "series", "issues_owned", "missing", "read_percent", "runs", "by_status",
    "publishers", "added_by_month",
}  # fmt: skip
ISSUE_FIELDS = {
    "item_id", "title", "publisher", "number", "store_date", "cover_url",
    "owned_text", "released",
}  # fmt: skip
DETAIL_FIELDS = {
    "publisher", "owned_text", "released", "ongoing", "run_state", "missing",
    "segments", "read_to", "read", "read_next", "editions", "next_issue",
    "following", "issue_count",
    "shelf_format", "as_of",
}  # fmt: skip


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW.astimezone(tz) if tz else NOW

    monkeypatch.setattr(public, "datetime", FrozenDatetime)


@asynccontextmanager
async def client_for(factory):
    app = FastAPI()
    app.include_router(create_public_router(factory))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def _issue(number: str, store_date: str | None) -> dict:
    return {
        "number": number,
        "name": None,
        "store_date": store_date,
        "cover_date": None,
        "cover_url": None,
    }


def _comic(title: str, **fields) -> Item:
    base = dict(
        id=uuid.uuid4(),
        type=ItemType.COMIC,
        title=title,
        status=ItemStatus.ACTIVE,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        created_at=datetime(2026, 10, 3, tzinfo=UTC),
    )
    return Item(**{**base, **fields})


def _saga(**fields) -> Item:
    """Ongoing, with a gap, a skipped issue, an edition and two issues ahead."""
    return _comic(
        "Saga",
        issues_owned="1–50, 52–54",
        issues_skipped="51",
        editions=[{"kind": "TPB", "label": "Vol. 10", "from": 55, "to": 60}],
        read_to=30,
        following=True,
        shelf_format=ComicShelfFormat.SINGLES,
        source_metadata={
            "publisher": "Image",
            "issues": [
                _issue("73", "2026-11-04"),
                _issue("74", "2026-11-18"),
            ],
            "released": 72,
            "issue_count": 75,
            "ongoing": True,
            "fetched_on": "2026-11-05",
        },
        **fields,
    )


def _shelf() -> list[Item]:
    return [
        _saga(),
        _comic(
            "Monstress",
            issues_owned="1–10",
            source_metadata={"publisher": "Image", "released": 10, "ongoing": False},
            created_at=datetime(2026, 6, 1, tzinfo=UTC),
        ),
        _comic(
            "Absolute Batman",
            owned_format=OwnedFormat.NONE,
            status=ItemStatus.BACKLOG,
            shelf_format=ComicShelfFormat.OMNIBUS,
            source_metadata={"publisher": "DC", "released": 12, "ongoing": True},
        ),
        # Followed and nothing else: private (spec, D5), with an issue out
        # this week so the strip has it to leak.
        _comic(
            "Secret Follow",
            is_public=False,
            owned_format=OwnedFormat.NONE,
            following=True,
            source_metadata={
                "publisher": "Boom",
                "issues": [_issue("3", "2026-11-04")],
                "released": 2,
            },
        ),
    ]


async def _add(factory, *rows):
    async with factory() as session:
        session.add_all(rows)
        await session.commit()


def _keys(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from _keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _keys(inner)


async def test_the_comic_models_publish_exactly_these_fields():
    assert set(PublicComicRow.model_fields) == ROW_FIELDS
    assert set(PublicComicStats.model_fields) == STATS_FIELDS
    assert set(PublicComicIssue.model_fields) == ISSUE_FIELDS
    assert set(PublicComicDetail.model_fields) == DETAIL_FIELDS


async def test_the_issue_page_models_publish_exactly_these_fields():
    """The issue and edition pages: no skip, price, store link or private id.
    COMIC_FORBIDDEN holds for every field name, nested models included."""
    assert set(PublicWall.model_fields) == {
        "series_title", "publisher", "issues", "editions",
    }  # fmt: skip
    assert set(PublicWallIssue.model_fields) == {
        "number", "owned", "read", "name", "store_date", "cover_url",
    }  # fmt: skip
    assert set(PublicWallEdition.model_fields) == {
        "slug", "kind", "label", "from_issue", "to_issue", "cover_url",
    }  # fmt: skip
    assert set(PublicNeighbour.model_fields) == {"number", "cover_url", "state"}
    assert set(PublicIssueEdition.model_fields) == {"slug", "label", "kind"}
    assert set(PublicIssuePage.model_fields) == {
        "series_id", "series_title", "publisher", "number", "name",
        "store_date", "cover_date", "cover_url", "large_url", "description",
        "state", "owned", "read", "held_as", "edition", "released", "ongoing",
        "neighbours", "source_url",
    }  # fmt: skip
    assert set(PublicEditionLink.model_fields) == {"slug", "label"}
    assert set(PublicEditionNext.model_fields) == {"slug", "label", "number"}
    assert set(PublicEditionPage.model_fields) == {
        "series_id", "series_title", "publisher", "slug", "kind", "label",
        "from_issue", "to_issue", "cover_url", "large_url", "description",
        "state", "read", "read_to", "inside", "prev", "next", "source_url",
    }  # fmt: skip
    assert set(PublicComicIndex.model_fields) == {
        "item_id", "series_title", "issues", "editions",
    }  # fmt: skip
    assert set(PublicComicIndexIssue.model_fields) == {"number", "name", "cover_url"}
    assert set(PublicComicIndexEdition.model_fields) == {"slug", "label", "cover_url"}
    for model in (
        PublicComicIndex, PublicComicIndexIssue, PublicComicIndexEdition,
        PublicWall, PublicWallIssue, PublicWallEdition, PublicNeighbour,
        PublicIssueEdition, PublicIssuePage, PublicEditionLink,
        PublicEditionNext, PublicEditionPage,
    ):  # fmt: skip
        assert COMIC_FORBIDDEN.isdisjoint(set(model.model_fields)), model


async def test_the_hero_numbers_and_cards_agree_with_the_rows(sessionmaker_for_test):
    """Spec AC2: Saga owns 59 of 72 (51 and 61-72 missing; a skip is still a
    gap) and reads to 30; Monstress owns all 10, unread."""
    await _add(sessionmaker_for_test, *_shelf())
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/comics")).json()
    stats = body["stats"]
    assert (stats["series"], stats["issues_owned"], stats["missing"]) == (2, 69, 13)
    assert stats["read_percent"] == 43
    assert stats["runs"] == {"complete": 1, "up_to_date": 0, "gaps": 1, "wanted": 1}
    assert stats["publishers"] == [{"publisher": "Image", "count": 2}]
    assert stats["by_status"] == {"active": 2}
    months = stats["added_by_month"]
    assert len(months) == 12
    assert months[-1] == {"month": "2026-11-01", "count": 0}
    assert {"month": "2026-10-01", "count": 2} in months
    assert {"month": "2026-06-01", "count": 1} in months


async def test_rows_carry_the_run_and_a_want_carries_none(sessionmaker_for_test):
    await _add(sessionmaker_for_test, *_shelf())
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/comics")).json()
    rows = {row["title"]: row for row in body["series"]}
    assert set(rows) == {"Saga", "Monstress", "Absolute Batman"}
    # Next issue first: Saga's #74 is dated, the rest by title.
    assert [row["title"] for row in body["series"]] == [
        "Saga",
        "Absolute Batman",
        "Monstress",
    ]
    saga = rows["Saga"]
    assert set(saga) == ROW_FIELDS
    assert (saga["owned"], saga["released"], saga["missing"]) == (59, 72, 13)
    assert saga["run_state"] == "gaps"
    assert sum(s["length"] for s in saga["segments"]) == 72 + 6  # the tail
    assert saga["edition_labels"] == ["Vol. 10"]
    assert saga["next_issue"] == {"number": "74", "store_date": "2026-11-18"}
    assert saga["read"] == 30
    want = rows["Absolute Batman"]
    assert want["wanted"] is True
    assert want["segments"] == []
    assert want["run_state"] is None
    assert want["shelf_format"] == "omnibus"


async def test_the_weeks_list_public_followed_series_only(sessionmaker_for_test):
    await _add(sessionmaker_for_test, *_shelf())
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/comics")).json()
    weeks = body["this_week"]["weeks"]
    assert [w["start"] for w in weeks][:2] == ["2026-11-04", "2026-11-11"]
    assert [[r["number"] for r in w["rows"]] for w in weeks] == [["73"], [], ["74"], []]
    row = weeks[0]["rows"][0]
    assert set(row) == ISSUE_FIELDS
    assert row["owned_text"] == "1–50, 52–60"
    assert row["released"] == 72


async def test_comics_this_week_on_whats_next(sessionmaker_for_test):
    await _add(sessionmaker_for_test, *_shelf())
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/next")).json()
    assert [(r["title"], r["number"]) for r in body["comics_this_week"]] == [
        ("Saga", "73")
    ]
    wants = [r for r in body["wanted"] if r["type"] == "comic"]
    assert [(r["title"], r["shelf_format"]) for r in wants] == [
        ("Absolute Batman", "omnibus")
    ]


async def test_comics_this_week_is_empty_with_nothing_dated_this_week(
    sessionmaker_for_test,
):
    """Spec AC6: the section shows only when an issue is out this week."""
    saga = _saga()
    saga.source_metadata = {
        **saga.source_metadata,
        "issues": [_issue("74", "2026-11-18")],
    }
    await _add(sessionmaker_for_test, saga)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/next")).json()
    assert body["comics_this_week"] == []


async def test_the_item_page_carries_the_comic_block(sessionmaker_for_test):
    game = Item(
        id=uuid.uuid4(),
        type=ItemType.GAME,
        title="A Game",
        status=ItemStatus.BACKLOG,
        is_public=True,
    )
    saga = _saga()
    await _add(sessionmaker_for_test, saga, game)
    async with client_for(sessionmaker_for_test) as client:
        comic = (await client.get(f"/api/public/items/{saga.id}")).json()["comic"]
        other = (await client.get(f"/api/public/items/{game.id}")).json()["comic"]
    assert other is None
    assert set(comic) == DETAIL_FIELDS
    assert comic["owned_text"] == "1–50, 52–60"
    assert comic["editions"] == [
        {"kind": "TPB", "label": "Vol. 10", "from_issue": 55, "to_issue": 60}
    ]
    assert comic["as_of"] == "2026-11-05"
    assert comic["issue_count"] == 75
    assert comic["read_to"] == 30
    assert comic["read_next"] == 31
    assert comic["shelf_format"] == saga.shelf_format.value


@pytest.mark.parametrize(
    ("fields", "expected"),
    [
        # Past the singles, into the edition (55–60); 51 is skipped, so
        # missing, and never next.
        ({"read_to": 54}, 55),
        # A gap: read to 50, 51 is not held, so 52.
        ({"read_to": 50}, 52),
        # Everything held is read.
        ({"read_to": 60}, None),
        ({"read_to": 72}, None),
        # Not started: the first held issue.
        ({"read_to": None}, 1),
        ({"read_to": None, "issues_owned": "3–5", "editions": None}, 3),
    ],
)
async def test_read_next_is_the_first_held_issue_past_read_to(
    sessionmaker_for_test, fields, expected
):
    saga = _saga()
    for field, value in fields.items():
        setattr(saga, field, value)
    await _add(sessionmaker_for_test, saga)
    async with client_for(sessionmaker_for_test) as client:
        row = (await client.get("/api/public/comics")).json()["series"][0]
        comic = (await client.get(f"/api/public/items/{saga.id}")).json()["comic"]
    assert row["read_next"] == comic["read_next"] == expected


async def test_a_private_followed_series_appears_in_no_public_body(
    sessionmaker_for_test,
):
    await _add(sessionmaker_for_test, *_shelf())
    async with client_for(sessionmaker_for_test) as client:
        responses = [
            await client.get(path)
            for path in (
                "/api/public/comics",
                "/api/public/next",
                "/api/public/items",
                "/api/public/stats",
            )
        ]
    # Positive control: Saga's issue out the same week is published.
    assert "Saga" in responses[1].text
    for response in responses:
        assert response.status_code == 200
        assert "Secret Follow" not in response.text
        assert "Boom" not in response.text
    for response in responses[:2]:
        assert COMIC_FORBIDDEN.isdisjoint(set(_keys(response.json())))


async def test_a_skip_changes_no_public_body(sessionmaker_for_test):
    """Skip is a private pull-list answer: skipping #73 leaves the strip, the
    run and the figures as they were."""
    await _add(sessionmaker_for_test, _saga())
    async with client_for(sessionmaker_for_test) as client:
        before = [
            (await client.get(p)).json()
            for p in ("/api/public/comics", "/api/public/next")
        ]
    async with sessionmaker_for_test() as session:
        item = (await session.execute(select(Item))).scalar_one()
        item.issues_skipped = "51, 73"
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        after = [
            (await client.get(p)).json()
            for p in ("/api/public/comics", "/api/public/next")
        ]
    assert before[0] == after[0]
    assert before[1]["comics_this_week"] == after[1]["comics_this_week"]


async def test_an_empty_shelf_is_zeroes_not_an_error(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/comics")
    assert response.status_code == 200
    body = response.json()
    assert body["series"] == []
    assert body["stats"]["read_percent"] is None
    assert body["this_week"]["later"] == []
    # Sanity: the clock is frozen, so the weeks start on 4 November.
    assert body["this_week"]["weeks"][0]["start"] == date(2026, 11, 4).isoformat()


async def test_the_series_read_count_follows_the_marks(sessionmaker_for_test):
    """Read is per book (5c): a book read out of order counts, though read_to
    (the unbroken run from #1) says none."""
    from models import ComicIssue

    comic = _comic("Waterworld", issues_owned="1–4", read_to=None)
    await _add(sessionmaker_for_test, comic)
    async with sessionmaker_for_test() as session:
        session.add(ComicIssue(item_id=comic.id, number=3, owned=True, read=True))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get(f"/api/public/items/{comic.id}")).json()["comic"]
    assert body["read"] == 1 and body["read_to"] is None


async def test_the_shelf_card_counts_read_marks_like_the_series_page(
    sessionmaker_for_test,
):
    from models import ComicIssue

    comic = _comic("Waterworld", issues_owned="1–4", read_to=None)
    await _add(sessionmaker_for_test, comic)
    async with sessionmaker_for_test() as session:
        session.add(ComicIssue(item_id=comic.id, number=3, owned=True, read=True))
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        row = next(
            r
            for r in (await client.get("/api/public/comics")).json()["series"]
            if r["title"] == "Waterworld"
        )
        detail = (await client.get(f"/api/public/items/{comic.id}")).json()["comic"]
    assert row["read"] == detail["read"] == 1
