"""Intake's admin routes, under /api/intake (spec D11)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import intake.garment_kind  # noqa: F401  (registers the closet's kind)
import intake.shelf_kinds  # noqa: F401  (registers the shelf's kinds)
from config import Config
from intake.kinds import REGISTRY, describe
from items import require_admin


def create_intake_router(
    session_factory: async_sessionmaker[AsyncSession],
    registry: dict,
    *,
    config: Config,
) -> APIRouter:
    """The intake router. Every route is admin only."""
    router = APIRouter(
        prefix="/api/intake",
        tags=["intake"],
        dependencies=[Depends(require_admin)],
    )

    @router.get("/kinds")
    async def list_kinds() -> list[dict[str, Any]]:
        """Every registered kind, with its fields and source state."""
        return [describe(kind, registry) for kind in REGISTRY.values()]

    return router
