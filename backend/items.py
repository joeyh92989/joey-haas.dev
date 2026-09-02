"""CRUD for the media collection. Every route requires the admin session."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models import Item, ItemStatus, ItemType, OwnedFormat
from sources.base import (
    SourceAdapter,
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
)
from sources.registry import adapter_for


class ItemIn(BaseModel):
    """Fields accepted when creating an item."""

    type: ItemType
    title: str = Field(min_length=1, max_length=500)
    status: ItemStatus
    rating: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = None
    is_public: bool = False
    year: int | None = Field(default=None, ge=1880, le=2100)
    creator: str | None = Field(default=None, max_length=300)
    cover_url: str | None = None
    external_source: str | None = Field(default=None, max_length=20)
    external_id: str | None = Field(default=None, max_length=50)
    favorite: bool = False
    started_at: date | None = None
    finished_at: date | None = None
    times_completed: int = Field(default=0, ge=0)
    owned_format: OwnedFormat | None = None
    source_metadata: dict | None = None


class ItemPatch(BaseModel):
    """Every field optional: most edits change exactly one thing."""

    type: ItemType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=500)
    status: ItemStatus | None = None
    rating: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = None
    is_public: bool | None = None
    year: int | None = Field(default=None, ge=1880, le=2100)
    creator: str | None = Field(default=None, max_length=300)
    cover_url: str | None = None
    external_source: str | None = Field(default=None, max_length=20)
    external_id: str | None = Field(default=None, max_length=50)
    favorite: bool | None = None
    started_at: date | None = None
    finished_at: date | None = None
    times_completed: int | None = Field(default=None, ge=0)
    owned_format: OwnedFormat | None = None
    source_metadata: dict | None = None


class ItemOut(BaseModel):
    """An item as returned by the API."""

    id: uuid.UUID
    type: ItemType
    title: str
    status: ItemStatus
    rating: int | None
    notes: str | None
    is_public: bool
    year: int | None
    creator: str | None
    cover_url: str | None
    external_source: str | None
    external_id: str | None
    favorite: bool
    started_at: date | None
    finished_at: date | None
    times_completed: int
    owned_format: OwnedFormat | None
    source_metadata: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CandidateOut(BaseModel):
    """One picker row: a search hit from an external source."""

    external_source: str
    external_id: str
    title: str
    year: int | None
    thumbnail_url: str | None


def _http_error_for(error: SourceError) -> HTTPException:
    """Maps a source failure onto the status code that actually describes it.

    503 rather than 500 for an unconfigured source: nothing is broken, the
    feature was never enabled on this deploy, and the detail names the variable
    to set.
    """
    if isinstance(error, SourceNotConfigured):
        return HTTPException(status_code=503, detail=str(error))
    if isinstance(error, SourceRateLimited):
        return HTTPException(status_code=429, detail=str(error))
    return HTTPException(status_code=502, detail=str(error))


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


def create_items_router(
    factory: async_sessionmaker[AsyncSession],
    registry: dict[ItemType, SourceAdapter] | None = None,
) -> APIRouter:
    """Builds the collection routes bound to this session factory.

    `registry` supplies the metadata sources. It defaults to empty so that a
    caller wanting only CRUD -- most of the existing tests -- need not build
    one; the lookup routes then answer 503, which is the truthful response for
    a deploy with no sources configured.
    """
    registry = {} if registry is None else registry
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

    # Declared before /{item_id}. FastAPI matches in declaration order and
    # {item_id} is typed uuid.UUID, so a later /search-metadata would be
    # swallowed by it and answered 422 instead of reaching the picker.
    @router.get("/search-metadata", response_model=list[CandidateOut])
    async def search_metadata(
        type: ItemType = Query(),
        query: str = Query(min_length=1, max_length=200),
        year: int | None = Query(default=None, ge=1880, le=2100),
    ) -> list[CandidateOut]:
        """Candidate external records for a title.

        A server-side proxy rather than a call from the browser: the source
        credentials live here and must stay here.
        """
        try:
            adapter = adapter_for(registry, type)
            results = await adapter.search(query, year)
        except SourceError as error:
            raise _http_error_for(error) from error

        return [
            CandidateOut(
                external_source=adapter.source_name,
                external_id=result.external_id,
                title=result.title,
                year=result.year,
                thumbnail_url=result.thumbnail_url,
            )
            for result in results
        ]

    @router.post("/{item_id}/refresh-metadata", response_model=ItemOut)
    async def refresh_metadata(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Re-fetches the linked source record for one item.

        The title is deliberately left alone. The picker prefills it and the
        owner may have edited it since, so overwriting on refresh would be
        data loss rather than a refresh.
        """
        item = await _load(session, item_id)
        if not item.external_source or not item.external_id:
            raise HTTPException(
                status_code=409, detail="This item is not linked to a source"
            )

        try:
            adapter = adapter_for(registry, item.type)
            detail = await adapter.fetch(item.external_id)
        except SourceError as error:
            raise _http_error_for(error) from error

        item.year = detail.year
        item.creator = detail.creator
        item.cover_url = detail.cover_url
        item.source_metadata = detail.source_metadata
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
