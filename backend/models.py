"""Database models for the media collection tracker."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Index,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all models."""


class ItemType(str, enum.Enum):
    """What kind of thing an item is."""

    GAME = "game"
    MOVIE = "movie"
    COMIC = "comic"
    BOARDGAME = "boardgame"


class ItemStatus(str, enum.Enum):
    """Where the owner is with an item.

    There is deliberately no wishlist state: ownership is implied by the row
    existing. Adding one later means adding an explicit `owned` column, which is
    a clean migration rather than a reinterpretation of every existing row.
    """

    BACKLOG = "backlog"
    ACTIVE = "active"
    FINISHED = "finished"
    ABANDONED = "abandoned"


class Item(Base):
    """One thing in the collection, of any media type.

    Games, films, comics, and board games share a table because they differ in
    their metadata but not in what is done with them: own it, track progress,
    rate it. Per-source metadata arrives in a later sub-project.
    """

    __tablename__ = "items"
    __table_args__ = (
        CheckConstraint(
            "rating IS NULL OR (rating >= 1 AND rating <= 10)",
            name="items_rating_range",
        ),
        Index("ix_items_type", "type"),
        Index("ix_items_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    type: Mapped[ItemType] = mapped_column(
        Enum(
            ItemType, name="item_type", values_callable=lambda e: [m.value for m in e]
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[ItemStatus] = mapped_column(
        Enum(
            ItemStatus,
            name="item_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
