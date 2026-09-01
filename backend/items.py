"""CRUD for the media collection. Every route requires the admin session."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models import Item, ItemStatus, ItemType


class ItemIn(BaseModel):
    """Fields accepted when creating an item."""

    type: ItemType
    title: str = Field(min_length=1, max_length=500)
    status: ItemStatus
    rating: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = None
    is_public: bool = False


class ItemPatch(BaseModel):
    """Every field optional: most edits change exactly one thing."""

    type: ItemType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=500)
    status: ItemStatus | None = None
    rating: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = None
    is_public: bool | None = None


class ItemOut(BaseModel):
    """An item as returned by the API."""

    id: uuid.UUID
    type: ItemType
    title: str
    status: ItemStatus
    rating: int | None
    notes: str | None
    is_public: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def require_admin(request: Request) -> None:
    """Rejects anyone without the admin session.

    Declared as a router-level dependency rather than called inside each route.
    FastAPI solves dependencies before validating path, query, and body
    parameters, so an unauthenticated caller gets 401 and never 422 -- it cannot
    probe the request schema, and cannot learn whether an id exists by comparing
    a 401 against a 404.
    """
    if not request.session.get("user"):
        raise HTTPException(status_code=401, detail="Not authenticated")


def create_items_router(factory: async_sessionmaker[AsyncSession]) -> APIRouter:
    """Builds the collection routes bound to this session factory."""
    router = APIRouter(
        prefix="/api/items",
        tags=["items"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def _load(session: AsyncSession, item_id: uuid.UUID) -> Item:
        item = await session.get(Item, item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Not found")
        return item

    @router.get("", response_model=list[ItemOut])
    async def list_items(
        session: AsyncSession = Depends(get_session),
        type: ItemType | None = Query(default=None),
        status: ItemStatus | None = Query(default=None),
    ) -> list[Item]:
        """Every item, newest first, optionally filtered by type and status."""
        statement = select(Item).order_by(Item.created_at.desc())
        if type is not None:
            statement = statement.where(Item.type == type)
        if status is not None:
            statement = statement.where(Item.status == status)
        result = await session.execute(statement)
        return list(result.scalars())

    @router.post("", response_model=ItemOut, status_code=201)
    async def create_item(
        payload: ItemIn,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Adds one item and returns it, including its generated id."""
        item = Item(**payload.model_dump())
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return item

    @router.get("/{item_id}", response_model=ItemOut)
    async def get_item(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """One item, or 404."""
        return await _load(session, item_id)

    @router.patch("/{item_id}", response_model=ItemOut)
    async def update_item(
        item_id: uuid.UUID,
        payload: ItemPatch,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Partial update. Fields absent from the body are left alone."""
        item = await _load(session, item_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(item, field, value)
        await session.commit()
        await session.refresh(item)
        return item

    @router.delete("/{item_id}", status_code=204)
    async def delete_item(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """Removes one item, or 404 if it never existed."""
        item = await _load(session, item_id)
        await session.delete(item)
        await session.commit()
        return Response(status_code=204)

    return router
