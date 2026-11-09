"""Database models for the media collection tracker."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Double,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
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
    # Set aside, intend to return (migration 0011). Not an opinion about the
    # game: Play Next gives it no taste weight either way.
    PAUSED = "paused"
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


class ComicShelfFormat(str, enum.Enum):
    """How a comic run sits on the shelf (migration 0010)."""

    SINGLES = "singles"
    TRADES = "trades"
    OMNIBUS = "omnibus"


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
    # Comics (migration 0010). Range text in comics.py's canonical form,
    # validated there on every write; editions are [{kind, label, from, to}].
    # Skipped issues stay gaps on the run and leave only the pull list.
    issues_owned: Mapped[str | None] = mapped_column(Text, nullable=True)
    issues_skipped: Mapped[str | None] = mapped_column(Text, nullable=True)
    editions: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    read_to: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    shelf_format: Mapped[ComicShelfFormat | None] = _enum_column(
        ComicShelfFormat, "comic_shelf_format"
    )
    # On the pull list. Separate from owning: a followed-only series is a
    # private want row (owned_format none, is_public false).
    following: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
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
    records what was committed to. `slot` (migration 0009) is the slot a
    `shown` game was offered in; null for older rows and other actions.
    Deleted with its item.
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
    slot: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PlaythroughOutcome(str, enum.Enum):
    """How a closed playthrough ended. An open one has no outcome."""

    FINISHED = "finished"
    ABANDONED = "abandoned"


class Playthrough(Base):
    """One run of a game, opened and closed by status changes (migration 0011,
    `note` from 0012).

    `playthroughs.py` is the only writer: the status route, create, bulk
    create and the pin route all go through it, and it keeps the item's
    `started_at` (first start), `finished_at` (last finish) and
    `times_completed` (finished runs) in step in the same transaction.
    `outcome` is null while the run is open, and an item has at most one
    open run. `paused_on` is set while the game is Paused. Numbers are
    history: deleting a run never renumbers the rest. Deleted with its item.
    """

    __tablename__ = "playthroughs"
    __table_args__ = (
        UniqueConstraint("item_id", "number", name="uq_playthroughs_item_number"),
        Index(
            "ux_playthroughs_one_open",
            "item_id",
            unique=True,
            postgresql_where=text("outcome IS NULL"),
        ),
        Index("ix_playthroughs_finished_on", "finished_on"),
        CheckConstraint("number > 0", name="playthroughs_number_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False
    )
    number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    finished_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    paused_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    outcome: Mapped[PlaythroughOutcome | None] = mapped_column(
        Enum(
            PlaythroughOutcome,
            name="playthrough_outcome",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=True,
    )
    # One line written as the run was closed or paused (migration 0012).
    # The owner's, like a journal day's note: never published.
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PlaySession(Base):
    """One day a game was played (migration 0007): the play journal.

    `minutes` is optional, and `note` is the owner's and never public: the
    public diary carries the date, the game and the minutes only. Deleted
    with its item.
    """

    __tablename__ = "play_sessions"
    __table_args__ = (
        CheckConstraint(
            "minutes IS NULL OR minutes > 0", name="play_sessions_minutes_positive"
        ),
        Index("ix_play_sessions_item_played", "item_id", "played_on"),
        Index("ix_play_sessions_played_on", "played_on"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False
    )
    played_on: Mapped[date] = mapped_column(Date, nullable=False)
    minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# --- Analytics (migration 0008) ----------------------------------------------
#
# First-party page views from the public beacon (analytics_routes.py). No row
# holds an IP address or a user agent: a visitor is a hash salted per UTC day,
# so the same person cannot be followed from one day to the next.


class PageView(Base):
    """One accepted beacon: a public page viewed. Kept 90 days, then deleted
    by the nightly rollup once `daily_stats` holds its day."""

    __tablename__ = "page_views"
    __table_args__ = (
        CheckConstraint(
            "device IN ('desktop', 'phone', 'tablet')", name="page_views_device_known"
        ),
        Index("ix_page_views_day", "day"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    path: Mapped[str] = mapped_column(Text, nullable=False)
    # A hostname only; NULL is a direct visit or a same-site navigation.
    referrer_host: Mapped[str | None] = mapped_column(Text, nullable=True)
    device: Mapped[str] = mapped_column(Text, nullable=False)
    visitor_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DailyStat(Base):
    """A finished day's counts for one value of one dimension.

    `dimension` is total, path, referrer or device; `value` is the path, the
    referrer host ('' for direct), the device, or '' for the total. Visitors
    are counted per row, because distinct visitors do not add up across rows:
    the total row is the only true count of a day's visitors.
    """

    __tablename__ = "daily_stats"
    __table_args__ = (
        CheckConstraint(
            "dimension IN ('total', 'path', 'referrer', 'device')",
            name="daily_stats_dimension_known",
        ),
    )

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    dimension: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[str] = mapped_column(Text, primary_key=True)
    views: Mapped[int] = mapped_column(Integer, nullable=False)
    visitors: Mapped[int] = mapped_column(Integer, nullable=False)


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


class RecommendationKind(str, enum.Enum):
    DISCOVER = "discover"
    RADAR = "radar"


class ReasonSource(str, enum.Enum):
    MODEL = "model"
    TEMPLATE = "template"


class RecommendationStatus(str, enum.Enum):
    PENDING = "pending"
    WANTED = "wanted"
    DISMISSED = "dismissed"
    OWNED = "owned"
    SKIPPED = "skipped"


class Recommendation(Base):
    """A suggestion from Radar (E8c) or Discover (E8b), and what the owner
    decided about it. Dismissed, wanted and owned exclude the game from both
    kinds; skipped never does."""

    __tablename__ = "recommendations"
    __table_args__ = (
        UniqueConstraint(
            "kind",
            "external_source",
            "external_id",
            "platform_id",
            name="ux_recommendations_game",
        ),
        Index("ix_recommendations_kind_status", "kind", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    kind: Mapped[RecommendationKind] = _enum_column(
        RecommendationKind, "recommendation_kind", nullable=False
    )
    type: Mapped[ItemType] = mapped_column(
        Enum(
            ItemType, name="item_type", values_callable=lambda e: [m.value for m in e]
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    year: Mapped[int | None] = mapped_column(SmallInteger)
    release_date: Mapped[date | None] = mapped_column(Date)
    external_source: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(50), nullable=False)
    cover_url: Mapped[str | None] = mapped_column(Text)
    # The reasons, one per line.
    reason: Mapped[str | None] = mapped_column(Text)
    reason_source: Mapped[ReasonSource] = _enum_column(
        ReasonSource, "reason_source", nullable=False
    )
    # The owner's item ids behind the reasons.
    based_on: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    generated_at: Mapped[datetime] = _now_column()
    status: Mapped[RecommendationStatus] = _enum_column(
        RecommendationStatus, "recommendation_status", nullable=False
    )
    platform_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    platform: Mapped[str | None] = mapped_column(String(60))
    physical_format: Mapped[PhysicalFormat | None] = _enum_column(
        PhysicalFormat, "physical_format"
    )
    format_source: Mapped[FormatSource | None] = _enum_column(
        FormatSource, "format_source"
    )
    format_note: Mapped[str | None] = mapped_column(Text)
    listing_ids: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    # Radar: lane, section, release precision, hype, store lines (admin only).
    source_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )


# --- Denver spots (migration 0013) -------------------------------------------
#
# docs/planning/2026-11-08-denver-spots-design.md. Tags, slugs and coordinates
# are decided in `spots.py`; every write goes through `spots_routes.py`.


class CandidateSource(str, enum.Enum):
    OSM = "osm"
    # Kept in the type although nothing writes it (the plan dropped Foursquare).
    FOURSQUARE = "foursquare"


class Spot(Base):
    """A place the owner keeps (migration 0013), written by `spots_routes.py`.

    Private until published, as items are. An `anchor` (home, work) is never
    public even when `is_public` is set: the public read filters it out.
    `blurb` is the public line; it is not called `note` because that key is
    banned from every public body (tests/test_public_outputs.py, FORBIDDEN).
    """

    __tablename__ = "spots"
    __table_args__ = (UniqueConstraint("slug", name="ux_spots_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    lat: Mapped[float] = mapped_column(Double, nullable=False)
    lng: Mapped[float] = mapped_column(Double, nullable=False)
    neighbourhood: Mapped[str | None] = mapped_column(String(100))
    blurb: Mapped[str | None] = mapped_column(Text)
    # Canonical tags from spots.TAGS, in vocabulary order.
    tags: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    anchor: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    city: Mapped[str] = mapped_column(
        String(40), nullable=False, default="denver", server_default="denver"
    )
    # Set when the spot was accepted from a candidate; NULL when added by hand.
    source: Mapped[CandidateSource | None] = _enum_column(
        CandidateSource, "candidate_source"
    )
    source_id: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = _now_column()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Visit(Base):
    """One day a spot was visited (migration 0013), written by
    `spots_routes.py` (Log a visit, and the planner's Been). Private: no
    public body carries a visit. Deleted with its spot."""

    __tablename__ = "visits"
    __table_args__ = (Index("ix_visits_spot_visited", "spot_id", "visited_on"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    spot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("spots.id", ondelete="CASCADE"), nullable=False
    )
    visited_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _now_column()


class Candidate(Base):
    """A place the weekly finder turned up and the owner has not answered
    (migration 0013). Written by the candidates job (`candidates.py`, PR 3),
    which replaces the rows each run; Accept and Dismiss delete one."""

    __tablename__ = "candidates"
    __table_args__ = (
        UniqueConstraint("source", "source_id", name="ux_candidates_source"),
        CheckConstraint(
            "fit IS NULL OR fit BETWEEN 0 AND 100", name="candidates_fit_range"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source: Mapped[CandidateSource] = _enum_column(
        CandidateSource, "candidate_source", nullable=False
    )
    source_id: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(60))
    lat: Mapped[float] = mapped_column(Double, nullable=False)
    lng: Mapped[float] = mapped_column(Double, nullable=False)
    distance_m: Mapped[int | None] = mapped_column(Integer)
    nearest_anchor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("spots.id", ondelete="SET NULL")
    )
    # NULL with reason "not scored" when the model could not answer.
    fit: Mapped[int | None] = mapped_column(SmallInteger)
    reason: Mapped[str | None] = mapped_column(Text)
    suggested_tags: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    fetched_at: Mapped[datetime] = _now_column()


class Dismissal(Base):
    """A candidate turned down for good (migration 0013): the finder never
    offers this `(source, source_id)` again. Written by Dismiss and read by
    the candidates job (`candidates.py`, PR 3)."""

    __tablename__ = "dismissals"

    source: Mapped[CandidateSource] = mapped_column(
        Enum(
            CandidateSource,
            name="candidate_source",
            values_callable=lambda e: [m.value for m in e],
        ),
        primary_key=True,
    )
    source_id: Mapped[str] = mapped_column(String(60), primary_key=True)
    dismissed_at: Mapped[datetime] = _now_column()


class WeatherHour(Base):
    """One forecast hour for a gridpoint (migration 0013), written only by
    the weather job (`weather.py`, PR 4); the weekend planner reads nothing
    else for weather. `precip_pct` is NULL when the forecast gives no
    probability."""

    __tablename__ = "weather_hours"
    __table_args__ = (
        UniqueConstraint("gridpoint", "starts_at", name="ux_weather_hours_slot"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    gridpoint: Mapped[str] = mapped_column(String(40), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    temp_f: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    precip_pct: Mapped[int | None] = mapped_column(SmallInteger)
    wind_mph: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    short: Mapped[str] = mapped_column(String(120), nullable=False)
    fetched_at: Mapped[datetime] = _now_column()


class SpotSetting(Base):
    """One key/value blob for Denver spots (migration 0013), written whole:
    the jobs' run summaries (`candidates.last_run` by the candidates job,
    PR 3; `weather.last_run` by the weather job, PR 4), which
    `GET /api/spots/status` reads, and later the planner's settings."""

    __tablename__ = "spot_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


# --- Closet (migration 0014, docs/planning/2026-11-09-outfit-design.md). ---


class GarmentCategory(str, enum.Enum):
    """The slot a garment fills in an outfit. Fixed in code, as the spec says."""

    OUTER = "outer"
    MID = "mid"
    TOP = "top"
    BOTTOM = "bottom"
    SHOES = "shoes"
    ACCESSORY = "accessory"


class GarmentStatus(str, enum.Enum):
    """Where a garment is. `untagged` until its details are set, by the model
    or by hand; `packed` is out of season with a `back_on` month."""

    UNTAGGED = "untagged"
    ACTIVE = "active"
    PACKED = "packed"
    LISTED = "listed"
    GONE = "gone"


class OutfitSource(str, enum.Enum):
    """How a worn outfit was chosen: the plan's lead, a swap, an alternative,
    or the owner's own."""

    PLANNED = "planned"
    SWAPPED = "swapped"
    ALTERNATIVE = "alternative"
    OWN = "own"


class GarmentTagSource(str, enum.Enum):
    """Who set a garment's details. NULL until either has: the tag queue takes
    only NULL, so a garment edited by hand is never retagged."""

    MODEL = "model"
    MANUAL = "manual"


class GarmentOutcome(str, enum.Enum):
    """A Review decision (PR D)."""

    KEPT = "kept"
    PACKED = "packed"
    LISTED = "listed"
    SOLD = "sold"
    DONATED = "donated"


def _garment_fk(**kwargs):
    return mapped_column(
        UUID(as_uuid=True),
        ForeignKey("garments.id", ondelete="CASCADE"),
        nullable=False,
        **kwargs,
    )


def _updated_column():
    return mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Garment(Base):
    """One piece of clothing (migration 0014), written by `closet_routes.py`
    and the tag job (`closet_tag.py`).

    Every attribute is nullable because an upload creates the row before
    anything is known about it; `status` stays `untagged` until a hand save
    or the model fills the details. `seasons` is a list of month numbers
    (1-12) the garment is in season. The photo lives in `garment_images`, so
    no query here ever loads its bytes.
    """

    __tablename__ = "garments"
    __table_args__ = (
        CheckConstraint(
            "warmth IS NULL OR warmth BETWEEN 1 AND 5", name="garments_warmth_range"
        ),
        CheckConstraint(
            "formality IS NULL OR formality BETWEEN 1 AND 5",
            name="garments_formality_range",
        ),
        Index("ix_garments_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str | None] = mapped_column(String(120))
    category: Mapped[GarmentCategory | None] = _enum_column(
        GarmentCategory, "garment_category"
    )
    subtype: Mapped[str | None] = mapped_column(String(60))
    brand: Mapped[str | None] = mapped_column(String(80))
    primary_color: Mapped[str | None] = mapped_column(String(40))
    primary_hex: Mapped[str | None] = mapped_column(String(7))
    secondary_color: Mapped[str | None] = mapped_column(String(40))
    secondary_hex: Mapped[str | None] = mapped_column(String(7))
    pattern: Mapped[str | None] = mapped_column(String(40))
    material: Mapped[str | None] = mapped_column(String(60))
    warmth: Mapped[int | None] = mapped_column(SmallInteger)
    formality: Mapped[int | None] = mapped_column(SmallInteger)
    seasons: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    acquired_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[GarmentStatus] = mapped_column(
        Enum(
            GarmentStatus,
            name="garment_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=GarmentStatus.UNTAGGED,
        server_default=text("'untagged'"),
    )
    # The first of the month a packed garment comes back.
    back_on: Mapped[date | None] = mapped_column(Date)
    tag_source: Mapped[GarmentTagSource | None] = _enum_column(
        GarmentTagSource, "garment_tag_source"
    )
    # Failed tag batches this garment was in; the queue stops at three.
    tag_attempts: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = _now_column()
    updated_at: Mapped[datetime] = _updated_column()


class GarmentImage(Base):
    """A garment's photo as a WebP, long edge at most 400px (migration 0014,
    `closet_images.py`). The original is never kept."""

    __tablename__ = "garment_images"

    garment_id: Mapped[uuid.UUID] = _garment_fk(primary_key=True)
    webp: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    width: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    height: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = _now_column()


class Outfit(Base):
    """One outfit worn on a day (migration 0014; written from PR C's Wore
    this). `occasion` is a slug from the closet's occasion list; `not_this`
    is the reason a plan was turned down, kept as feedback."""

    __tablename__ = "outfits"
    __table_args__ = (Index("ix_outfits_worn_on", "worn_on"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    worn_on: Mapped[date] = mapped_column(Date, nullable=False)
    occasion: Mapped[str] = mapped_column(String(20), nullable=False)
    bike: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    source: Mapped[OutfitSource] = _enum_column(
        OutfitSource, "outfit_source", nullable=False
    )
    not_this: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = _now_column()


class OutfitGarment(Base):
    """A garment in an outfit, in the slot it filled (migration 0014)."""

    __tablename__ = "outfit_garments"

    outfit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outfits.id", ondelete="CASCADE"),
        primary_key=True,
    )
    garment_id: Mapped[uuid.UUID] = _garment_fk(primary_key=True)
    slot: Mapped[GarmentCategory] = _enum_column(
        GarmentCategory, "garment_category", nullable=False
    )


class Wear(Base):
    """A garment worn on a day (migration 0014): one row per garment per
    day, whatever the outfit. The repeat rules and the cull read these."""

    __tablename__ = "wears"
    __table_args__ = (
        UniqueConstraint("garment_id", "worn_on", name="ux_wears_garment_day"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    garment_id: Mapped[uuid.UUID] = _garment_fk()
    worn_on: Mapped[date] = mapped_column(Date, nullable=False)
    outfit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("outfits.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = _now_column()


class OutfitPlan(Base):
    """A stored day plan (migration 0014; written from PR C), one per day x
    occasion x bike, overwritten by a re-plan. `body` holds the lead, the
    alternatives, the reasons, `ranked_by`, `model_note` and `planned_at`."""

    __tablename__ = "outfit_plans"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    occasion: Mapped[str] = mapped_column(String(20), primary_key=True)
    bike: Mapped[bool] = mapped_column(Boolean, primary_key=True)
    body: Mapped[dict] = mapped_column(JSONB, nullable=False)
    planned_at: Mapped[datetime] = _now_column()


class ClosetProfile(Base):
    """The owner's closet profile (migration 0014): one row, `id = 1`.

    Nothing here is dated. `weekly_occasions` and `weekly_bike` are seven
    entries, Monday first; the turn dates are `MM-DD`. `tag_budget` is the
    tag job's model calls per night.
    """

    __tablename__ = "closet_profile"
    __table_args__ = (CheckConstraint("id = 1", name="closet_profile_single_row"),)

    id: Mapped[int] = mapped_column(
        SmallInteger, primary_key=True, autoincrement=False, default=1
    )
    sizes: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    coloring: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    build_fit: Mapped[str | None] = mapped_column(Text)
    style_words: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    dislikes: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    weekly_occasions: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    weekly_bike: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    spring_turn: Mapped[str] = mapped_column(
        String(5), nullable=False, default="04-25", server_default=text("'04-25'")
    )
    autumn_turn: Mapped[str] = mapped_column(
        String(5), nullable=False, default="10-25", server_default=text("'10-25'")
    )
    repeat_top_days: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=5, server_default="5"
    )
    repeat_outfit_weeks: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=3, server_default="3"
    )
    tag_budget: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=5, server_default="5"
    )
    updated_at: Mapped[datetime] = _updated_column()


class GarmentDecision(Base):
    """A Review outcome for a garment (migration 0014; written from PR D)."""

    __tablename__ = "garment_decisions"
    __table_args__ = (
        Index("ix_garment_decisions_garment", "garment_id", "decided_on"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    garment_id: Mapped[uuid.UUID] = _garment_fk()
    outcome: Mapped[GarmentOutcome] = _enum_column(
        GarmentOutcome, "garment_outcome", nullable=False
    )
    decided_on: Mapped[date] = mapped_column(Date, nullable=False)
    back_on: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _now_column()


class ClosetSetting(Base):
    """One key/value blob for the closet's jobs (migration 0014), the
    `spot_settings` shape: `tag.last_run`, `plan.last_run` and
    `opinion.last_run`, each `{at, state, note?}`, read by
    `GET /api/closet/status`."""

    __tablename__ = "closet_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = _updated_column()
