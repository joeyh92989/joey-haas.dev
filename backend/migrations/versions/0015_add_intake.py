"""add intake

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-10

Intake (docs/planning/2026-11-10-intake-design.md): one way in for the shelf
and the closet. A sitting (`intake_sittings`) holds the photos taken in one
go (`intake_photos`, a reading copy that is dropped once read plus a small
thumbnail) and the entries read from them or typed in (`intake_entries`).
Garment entries point at the untagged garment their upload created, and go
with it. `llm_usage` counts model calls per Pacific day so the reader knows
what is left of the free allowance. `items.disc_format` records a movie's
best disc.

`kind` is text, not an enum: kinds live in the server's registry
(`backend/intake/kinds.py`), so adding one needs no migration.

Additive: four new tables, four new types and one nullable column. Nothing
existing is altered, renamed or dropped, so the code before this revision
boots against it and the deploy order (migrate, then merge) holds.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: created and dropped explicitly below, as in 0005 and 0014.
movie_disc_format = postgresql.ENUM(
    "dvd", "bluray", "uhd", name="movie_disc_format", create_type=False
)
intake_area = postgresql.ENUM("shelf", "closet", name="intake_area", create_type=False)
intake_photo_state = postgresql.ENUM(
    "uploaded",
    "reading",
    "read",
    "empty",
    "failed",
    name="intake_photo_state",
    create_type=False,
)
intake_entry_state = postgresql.ENUM(
    "reading",
    "exact",
    "probable",
    "check",
    "owned",
    "ready",
    "ignored",
    "typed",
    name="intake_entry_state",
    create_type=False,
)
TYPES = (movie_disc_format, intake_area, intake_photo_state, intake_entry_state)


def _uuid_pk() -> sa.Column:
    return sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True)


def _now(name: str) -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )


def _sitting_fk() -> sa.Column:
    return sa.Column(
        "sitting_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("intake_sittings.id", ondelete="CASCADE"),
        nullable=False,
    )


def upgrade() -> None:
    for enum_type in TYPES:
        enum_type.create(op.get_bind(), checkfirst=True)

    op.add_column("items", sa.Column("disc_format", movie_disc_format, nullable=True))

    op.create_table(
        "intake_sittings",
        _uuid_pk(),
        sa.Column("area", intake_area, nullable=False),
        sa.Column("kind", sa.String(40), nullable=True),
        sa.Column("label", sa.String(120), nullable=True),
        sa.Column("step", sa.String(20), nullable=False, server_default="shoot"),
        _now("created_at"),
        _now("updated_at"),
    )
    op.create_index(
        "ix_intake_sittings_area_updated", "intake_sittings", ["area", "updated_at"]
    )

    op.create_table(
        "intake_photos",
        _uuid_pk(),
        _sitting_fk(),
        sa.Column(
            "state",
            intake_photo_state,
            nullable=False,
            server_default=sa.text("'uploaded'"),
        ),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("filename", sa.String(255), nullable=True),
        sa.Column("reading_jpeg", sa.LargeBinary(), nullable=True),
        sa.Column("thumb_webp", sa.LargeBinary(), nullable=False),
        sa.Column("width", sa.SmallInteger(), nullable=False),
        sa.Column("height", sa.SmallInteger(), nullable=False),
        _now("created_at"),
        _now("updated_at"),
    )
    op.create_index(
        "ix_intake_photos_sitting_state", "intake_photos", ["sitting_id", "state"]
    )

    op.create_table(
        "intake_entries",
        _uuid_pk(),
        _sitting_fk(),
        sa.Column(
            "photo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("intake_photos.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column(
            "state",
            intake_entry_state,
            nullable=False,
            server_default=sa.text("'typed'"),
        ),
        sa.Column(
            "payload",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "candidates",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("chosen", postgresql.JSONB(), nullable=True),
        sa.Column(
            "garment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("garments.id", ondelete="CASCADE"),
            nullable=True,
        ),
        _now("created_at"),
        _now("updated_at"),
    )
    op.create_index("ix_intake_entries_sitting", "intake_entries", ["sitting_id"])

    op.create_table(
        "llm_usage",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("model", sa.String(80), primary_key=True),
        sa.Column("calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("exhausted", sa.Boolean(), nullable=False, server_default=sa.false()),
        _now("updated_at"),
    )


def downgrade() -> None:
    op.drop_table("llm_usage")
    op.drop_index("ix_intake_entries_sitting", table_name="intake_entries")
    op.drop_table("intake_entries")
    op.drop_index("ix_intake_photos_sitting_state", table_name="intake_photos")
    op.drop_table("intake_photos")
    op.drop_index("ix_intake_sittings_area_updated", table_name="intake_sittings")
    op.drop_table("intake_sittings")
    op.drop_column("items", "disc_format")
    for enum_type in reversed(TYPES):
        enum_type.drop(op.get_bind(), checkfirst=True)
