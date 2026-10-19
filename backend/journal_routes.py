"""The play journal's admin routes: log, list and delete play sessions.

One session is one day a game was played (models.PlaySession, migration
0007). Minutes and a note are optional, and the note never leaves the admin:
the public diary in public.py carries the date, the game and the minutes.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from items import require_admin
from models import Item, PlaySession

# A day has 1,440 minutes; more is a typo, not a session.
MAX_MINUTES = 1440
MAX_NOTE = 2000


class SessionIn(BaseModel):
    """A session to log. The date defaults to today (UTC) when omitted."""

    played_on: date | None = None
    minutes: int | None = Field(default=None, ge=1, le=MAX_MINUTES)
    note: str | None = Field(default=None, max_length=MAX_NOTE)


class SessionOut(BaseModel):
    """A logged session, note included: admin only."""

    id: uuid.UUID
    item_id: uuid.UUID
    played_on: date
    minutes: int | None
    note: str | None


def _out(row: PlaySession) -> SessionOut:
    return SessionOut(
        id=row.id,
        item_id=row.item_id,
        played_on=row.played_on,
        minutes=row.minutes,
        note=row.note,
    )


def create_journal_router(factory: async_sessionmaker[AsyncSession]) -> APIRouter:
    """Builds the journal routes; admin only."""
    router = APIRouter(
        prefix="/api/items",
        tags=["journal"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def _item(session: AsyncSession, item_id: uuid.UUID) -> Item:
        item = await session.get(Item, item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Item not found")
        return item

    @router.get("/{item_id}/sessions", response_model=list[SessionOut])
    async def list_sessions(
        item_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> list[SessionOut]:
        """The item's sessions, most recent first."""
        await _item(session, item_id)
        rows = await session.scalars(
            select(PlaySession)
            .where(PlaySession.item_id == item_id)
            .order_by(PlaySession.played_on.desc(), PlaySession.created_at.desc())
        )
        return [_out(row) for row in rows]

    @router.post("/{item_id}/sessions", response_model=SessionOut, status_code=201)
    async def log_session(
        item_id: uuid.UUID,
        payload: SessionIn,
        session: AsyncSession = Depends(get_session),
    ) -> SessionOut:
        """Logs a day of play. A future date is refused: a journal records what
        happened. "Future" allows one day past UTC's today, because the page
        sends the owner's local date, which runs ahead of UTC east of it."""
        await _item(session, item_id)
        today = datetime.now(UTC).date()
        played_on = payload.played_on or today
        if played_on > today + timedelta(days=1):
            raise HTTPException(
                status_code=422, detail="A session cannot be in the future"
            )
        note = (payload.note or "").strip() or None
        row = PlaySession(
            item_id=item_id, played_on=played_on, minutes=payload.minutes, note=note
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _out(row)

    @router.delete("/{item_id}/sessions/{session_id}", status_code=204)
    async def delete_session(
        item_id: uuid.UUID,
        session_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> None:
        """Removes a session logged by mistake."""
        row = await session.get(PlaySession, session_id)
        if row is None or row.item_id != item_id:
            raise HTTPException(status_code=404, detail="Session not found")
        await session.delete(row)
        await session.commit()

    return router
