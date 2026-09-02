"""Database models for the media collection tracker."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Index,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
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


class OwnedFormat(str, enum.Enum):
    """How a copy is held, orthogonal to progress status.

    NONE is the want list: tracked but not owned. Keeping this separate from
    ItemStatus is what lets the status enum go on meaning progress and nothing
    else -- the alternative, a `wishlist` status, would make every other status
    silently also mean "owned".
    """

    PHYSICAL = "physical"
    DIGITAL = "digital"
    SUBSCRIPTION = "subscription"
    BORROWED = "borrowed"
    NONE = "none"


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
        # Partial so that manually-entered rows -- which have NULL on both
        # columns -- stay out of the constraint entirely. Without the
        # predicate the second manual row would collide with the first.
        Index(
            "ux_items_external",
            "external_source",
            "external_id",
            unique=True,
            postgresql_where=text(
                "external_source IS NOT NULL AND external_id IS NOT NULL"
            ),
        ),
        Index("ix_items_finished_at", "finished_at"),
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
    year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # Denormalized on purpose: director, developer, writer, or designer
    # depending on type. A creators table would buy normalization nobody in
    # this application is asking for.
    creator: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # A full URL at the source's CDN. Covers are hotlinked, which is what TMDB
    # and IGDB document; Render's free disk is ephemeral, so a local cache
    # would be lost on every restart while still being a retention surface.
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    favorite: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    started_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    finished_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    times_completed: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    # Nullable with no server default, deliberately. The create form requires a
    # choice and the photo importer sets `physical` on the rows it commits, so
    # a want-list row means the owner said so -- it is never the residue of a
    # column default that happened to be wrong for most rows.
    owned_format: Mapped[OwnedFormat | None] = mapped_column(
        Enum(
            OwnedFormat,
            name="owned_format",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=True,
    )
    # Named source_metadata, never metadata: that attribute is reserved by
    # SQLAlchemy's declarative base and shadowing it breaks the mapper.
    source_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
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
