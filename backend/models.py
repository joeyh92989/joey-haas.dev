"""Database models for the media collection tracker."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
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


def _enum_column(enum_class: type[enum.Enum], name: str, nullable: bool = True):
    return mapped_column(
        Enum(enum_class, name=name, values_callable=lambda e: [m.value for m in e]),
        nullable=nullable,
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


# --- The physical catalogue (migration 0005) --------------------------------
#
# What exists physically, and as what, for games the owner does not own. Rows
# are written by physical_sources; nothing here is ever public.


class ReleasePrecision(str, enum.Enum):
    """How much of a release date is known: "Q4 2026" is not October 1st."""

    DAY = "day"
    MONTH = "month"
    QUARTER = "quarter"
    YEAR = "year"


class ListingAvailability(str, enum.Enum):
    """Whether a store listing can be bought now, later, or not at all.

    ARCHIVED is a listing a successful refresh no longer saw; it is kept, never
    deleted, so its match and format survive a store re-listing it.
    """

    PREORDER = "preorder"
    IN_STOCK = "in_stock"
    SOLD_OUT = "sold_out"
    ARCHIVED = "archived"


class MatchConfidence(str, enum.Enum):
    """How a catalogue title was matched to an IGDB game."""

    EXACT = "exact"
    PROBABLE = "probable"
    UNCERTAIN = "uncertain"
    MANUAL = "manual"


class MatchDecision(str, enum.Enum):
    """Who decided a catalogue match; PENDING rows are the Needs match queue."""

    AUTO = "auto"
    MANUAL = "manual"
    IGNORED = "ignored"
    PENDING = "pending"


def _now_column():
    return mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CatalogueGame(Base):
    """One IGDB game the catalogue knows: the only place its IGDB data lives.

    Stored once per game rather than copied onto every edition and listing,
    because Discover scores per game.
    """

    __tablename__ = "catalogue_games"

    igdb_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    hypes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # The E7b snapshot, as sources.igdb.fetch_many returns it.
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    fetched_at: Mapped[datetime] = _now_column()


class PhysicalEdition(Base):
    """One registry edition, or one platform-policy game. Stores never write it.

    Keyed by (source, source_ref); see physical_sources for how each source
    builds its ref. Absent from a successful, non-short run for its source it
    gets retired_at, and reappearing clears it; rows are never deleted.
    """

    __tablename__ = "physical_editions"
    __table_args__ = (
        UniqueConstraint("source", "source_ref", name="ux_physical_editions_source"),
        Index("ix_physical_editions_igdb_platform", "igdb_id", "platform_id"),
        Index(
            "ix_physical_editions_live_platform_region",
            "platform_id",
            "region",
            postgresql_where=text("retired_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    source_ref: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    title_normalized: Mapped[str] = mapped_column(String(500), nullable=False)
    platform_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    platform: Mapped[str] = mapped_column(String(60), nullable=False)
    region: Mapped[str] = mapped_column(String(4), nullable=False)
    # NULL is "announced, card type not listed yet" and is never defaulted:
    # every pool filters IS DISTINCT FROM false.
    is_physical: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    physical_format: Mapped[PhysicalFormat | None] = _enum_column(
        PhysicalFormat, "physical_format"
    )
    format_source: Mapped[FormatSource | None] = _enum_column(
        FormatSource, "format_source"
    )
    cart_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    publisher: Mapped[str | None] = mapped_column(Text, nullable=True)
    editions: Mapped[str | None] = mapped_column(Text, nullable=True)
    ns1_compatible: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    release_precision: Mapped[ReleasePrecision | None] = _enum_column(
        ReleasePrecision, "release_precision"
    )
    igdb_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("catalogue_games.igdb_id", ondelete="SET NULL"),
        nullable=True,
    )
    first_seen_at: Mapped[datetime] = _now_column()
    last_seen_at: Mapped[datetime] = _now_column()
    retired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class StoreListing(Base):
    """One platform variant of one product on one store.

    Keyed on the variant, never the handle (Premium Edition reuses handles).
    Unseen in a successful, non-short run for its store it becomes ARCHIVED;
    rows are never deleted.
    """

    __tablename__ = "store_listings"
    __table_args__ = (
        UniqueConstraint("store", "variant_id", name="ux_store_listings_variant"),
        Index("ix_store_listings_igdb_platform", "igdb_id", "platform_id"),
        Index("ix_store_listings_store_availability", "store", "availability"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    store: Mapped[str] = mapped_column(String(40), nullable=False)
    store_product_id: Mapped[str] = mapped_column(String(40), nullable=False)
    variant_id: Mapped[str] = mapped_column(String(40), nullable=False)
    handle: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str] = mapped_column(String(4), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    title_normalized: Mapped[str] = mapped_column(String(500), nullable=False)
    edition_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # NULL means the platform could not be read: the row goes to Needs match.
    platform_id: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    platform: Mapped[str | None] = mapped_column(String(60), nullable=True)
    is_game: Mapped[bool] = mapped_column(Boolean, nullable=False)
    collections_seen: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    price: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    availability: Mapped[ListingAvailability] = _enum_column(
        ListingAvailability, "listing_availability", nullable=False
    )
    preorder_closes_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    release_precision: Mapped[ReleasePrecision | None] = _enum_column(
        ReleasePrecision, "release_precision"
    )
    release_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    format_hint: Mapped[PhysicalFormat | None] = _enum_column(
        PhysicalFormat, "physical_format"
    )
    format_tier: Mapped[FormatSource | None] = _enum_column(
        FormatSource, "format_source"
    )
    format_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    igdb_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("catalogue_games.igdb_id", ondelete="SET NULL"),
        nullable=True,
    )
    # Enough to re-classify without refetching: product_type, tags, options,
    # this variant's fields, a body excerpt, html_checked_at.
    raw: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    first_seen_at: Mapped[datetime] = _now_column()
    last_seen_at: Mapped[datetime] = _now_column()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class CatalogueMatch(Base):
    """The title-to-game decision, shared by every row with the same key.

    platform_id is 0 for rows with no platform, so the key is total. A manual
    link or an ignore survives the store re-listing the product.
    """

    __tablename__ = "catalogue_matches"

    title_normalized: Mapped[str] = mapped_column(String(500), primary_key=True)
    platform_id: Mapped[int] = mapped_column(
        SmallInteger, primary_key=True, autoincrement=False
    )
    # No foreign key: an auto match is decided before its game row is fetched.
    igdb_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    match_confidence: Mapped[MatchConfidence | None] = _enum_column(
        MatchConfidence, "match_confidence"
    )
    decided_by: Mapped[MatchDecision] = _enum_column(
        MatchDecision, "match_decision", nullable=False
    )
    # The top three SourceResults of the last search, so Needs match
    # pre-selects without a new IGDB call.
    candidates: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    decided_at: Mapped[datetime] = _now_column()


class CatalogueRun(Base):
    """One refresh of one source, or one resolve batch: what the status page reads."""

    __tablename__ = "catalogue_runs"
    __table_args__ = (
        Index("ix_catalogue_runs_source_started", "source", text("started_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    started_at: Mapped[datetime] = _now_column()
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # NULL while the run is in progress.
    ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    rows_seen: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    rows_changed: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    rows_retired: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    items_synced: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    unresolved_remaining: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    short_run: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # A list of {code, detail}: robots_disallowed, empty_collection, ...
    errors: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
