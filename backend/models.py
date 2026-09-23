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
    ForeignKey,
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


class PhysicalFormat(str, enum.Enum):
    """What a physical copy actually is.

    GAME_CARD is every full-game cartridge (Switch, Switch 2, N64). A Game-Key
    Card is a cartridge holding only a download key, and a code in a box is a
    printed code: neither holds the game, which is the whole reason this is
    recorded. NULL means unknown or not physical and is never defaulted.
    """

    GAME_CARD = "game_card"
    GAME_KEY_CARD = "game_key_card"
    CODE_IN_BOX = "code_in_box"
    DISC = "disc"


class FormatSource(str, enum.Enum):
    """How physical_format was decided; derived server-side, never accepted.

    The full set ships with migration 0003 so the physical catalogue (E7c)
    does not have to alter the type. E7b writes only CART_ID and MANUAL.
    """

    CART_ID = "cart_id"
    PHOTO = "photo"
    REGISTRY = "registry"
    STORE_TEXT = "store_text"
    STORE_POLICY = "store_policy"
    PLATFORM_POLICY = "platform_policy"
    MANUAL = "manual"


class Completeness(str, enum.Enum):
    """How complete a cartridge-era copy is: collector vocabulary, not price."""

    LOOSE = "loose"
    BOXED = "boxed"
    CIB = "cib"
    SEALED = "sealed"


def _enum_column(enum_class: type[enum.Enum], name: str):
    return mapped_column(
        Enum(enum_class, name=name, values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )


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
    # The copy on the shelf, as distinct from the game it is a copy of
    # (migration 0003). Written only through formats.apply_copy_fields.
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # The Play Next commitment; no writer until E8a.
    pinned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Backfilled from created_at by the migration: the collection was bulk
    # imported, so created_at says nothing about how long a game has waited.
    acquired_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    platform_id: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # Resolved from platform_id on the server; never taken from a request.
    platform: Mapped[str | None] = mapped_column(String(60), nullable=True)
    physical_format: Mapped[PhysicalFormat | None] = _enum_column(
        PhysicalFormat, "physical_format"
    )
    format_source: Mapped[FormatSource | None] = _enum_column(
        FormatSource, "format_source"
    )
    cart_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # NULL reads as the home region (formats.HOME_REGION).
    region: Mapped[str | None] = mapped_column(String(4), nullable=True)
    completeness: Mapped[Completeness | None] = _enum_column(
        Completeness, "completeness"
    )
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


class PickAction(str, enum.Enum):
    """What happened to a game in Play Next."""

    SHOWN = "shown"
    SKIPPED = "skipped"
    NEVER = "never"
    PINNED = "pinned"


class PickEvent(Base):
    """One thing Play Next did or was told about a game (migration 0004).

    `shown` feeds the staleness decay, `skipped` a seven-day exclusion,
    `never` a permanent one (undone by deleting the event), and `pinned`
    records what was committed to. Deleted with its item.
    """

    __tablename__ = "pick_events"
    __table_args__ = (
        Index("ix_pick_events_item_action_created", "item_id", "action", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[PickAction] = mapped_column(
        Enum(
            PickAction,
            name="pick_action",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
