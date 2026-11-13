"""The kind registry and GET /api/intake/kinds (spec D11, AC 9 and 10)."""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

from intake import kinds
from intake.kinds import FieldSpec, Kind, kinds_for, register
from intake.routes import create_intake_router
from models import IntakeArea, ItemType
from sources.registry import build_registry
from tests.test_intake_budget import _config


@asynccontextmanager
async def client_for(factory, *, signed_in=True):
    app = FastAPI()
    app.include_router(
        create_intake_router(factory, build_registry(_config()), config=_config())
    )
    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


@pytest.fixture
def test_kind():
    """Registers a throwaway kind and removes it afterwards."""
    kind = Kind(
        key="vinyl",
        area=IntakeArea.SHELF,
        label="Record",
        ways_in=("type",),
        source=None,
        has_details=False,
        fields=(
            FieldSpec(
                key="speed", label="Speed", control="select", options=("33", "45")
            ),
        ),
        to_row=lambda entry: dict(entry),
    )
    register(kind)
    yield kind
    kinds.REGISTRY.pop("vinyl", None)


async def _kinds(factory) -> dict[str, dict]:
    async with client_for(factory) as client:
        response = await client.get("/api/intake/kinds")
    assert response.status_code == 200
    return {kind["key"]: kind for kind in response.json()}


@pytest.mark.asyncio
async def test_a_registered_kind_is_served_with_its_fields(
    sessionmaker_for_test, test_kind
):
    served = (await _kinds(sessionmaker_for_test))["vinyl"]
    assert served["area"] == "shelf"
    assert served["ways_in"] == ["type"]
    assert served["fields"] == [
        {
            "key": "speed",
            "label": "Speed",
            "control": "select",
            "options": ["33", "45"],
            "per_item": False,
            "required": False,
            "in_details": True,
        }
    ]


@pytest.mark.asyncio
async def test_a_field_added_to_a_kind_is_served(sessionmaker_for_test, test_kind):
    extra = FieldSpec(key="colour", label="Vinyl colour", control="text")
    register(Kind(**{**test_kind.__dict__, "fields": (*test_kind.fields, extra)}))
    served = (await _kinds(sessionmaker_for_test))["vinyl"]
    assert [field["key"] for field in served["fields"]] == ["speed", "colour"]


@pytest.mark.asyncio
async def test_the_built_in_kinds(sessionmaker_for_test):
    served = await _kinds(sessionmaker_for_test)
    assert {"game", "movie", "comic", "boardgame", "garment"} <= set(served)
    assert served["boardgame"]["ways_in"] == ["type"]
    assert (
        served["boardgame"]["source_state"]
        == "Needs a BoardGameGeek key; added by typing for now."
    )
    assert served["game"]["ways_in"] == ["photo", "search", "type"]
    assert served["garment"]["area"] == "closet"
    assert served["garment"]["has_details"] is False
    assert served["garment"]["ways_in"] == ["photo", "type"]
    movie_fields = {field["key"] for field in served["movie"]["fields"]}
    assert "disc_format" in movie_fields
    issues = next(f for f in served["comic"]["fields"] if f["key"] == "issues_owned")
    assert issues["per_item"] is True
    # Check types each book's number; Details no longer asks for the range.
    assert issues["in_details"] is False
    shelf_format = next(
        f for f in served["comic"]["fields"] if f["key"] == "shelf_format"
    )
    assert shelf_format["in_details"] is True


@pytest.mark.asyncio
async def test_kinds_needs_a_signed_in_admin(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.get("/api/intake/kinds")
    assert response.status_code == 401


def test_kinds_for_filters_by_area():
    assert {kind.key for kind in kinds_for(IntakeArea.CLOSET)} == {"garment"}
    assert "garment" not in {kind.key for kind in kinds_for(IntakeArea.SHELF)}


def test_shelf_to_row_builds_an_item():
    game = kinds.REGISTRY["game"]
    row = game.to_row(
        {
            "chosen": {
                "title": "Mario Kart World",
                "external_source": "igdb",
                "external_id": "1",
                "year": 2025,
                "cover_url": None,
            },
            "payload": {
                "platform_id": 508,
                "physical_format": "game_card",
                "status": "backlog",
                "acquired_at": "2026-11-01",
            },
        }
    )
    assert row["type"] == ItemType.GAME
    assert row["title"] == "Mario Kart World"
    assert row["platform_id"] == 508
    assert row["status"] == "backlog"
    assert row["owned_format"] == "physical"


def test_garment_to_row_keeps_only_garment_fields():
    row = kinds.REGISTRY["garment"].to_row(
        {
            "chosen": None,
            "payload": {
                "name": "Navy chore coat",
                "category": "outer",
                "warmth": 3,
                "stray": "x",
            },
        }
    )
    assert row == {"name": "Navy chore coat", "category": "outer", "warmth": 3}
