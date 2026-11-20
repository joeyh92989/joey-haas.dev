---
status: planned
kind: migration (destructive in form; no rows in production)
mode: auto, at Joey's request
---

# Drop what the places and outings migrations added (PR 2 of 2)

PR 1 (`remove/places-outings-code`) removes the code. This PR adds the forward migration `0028` that removes what `0024` and `0025` put in the database. Alembic is at `0027` in production, so `0024`/`0025` stay as files and `0028` undoes them.

## What it drops

- `visits.title`, `visits.verdict`, `visits.kid_along`, `visits.precision` and the types `outing_verdict` and `outing_precision` (migration 0025).
- The `places` label of the Postgres enum `intake_area` (migration 0024). Postgres cannot drop one enum value, so the enum is rebuilt: delete any `places` sittings with their entries and photos (production holds 0), rename `intake_area` to `intake_area_old`, create `intake_area` as (`shelf`, `closet`), convert the columns that use it with `USING area::text::intake_area` (drop and restore a column default if there is one), drop the old type.

Production check (2026-11-20, read-only): `visits` 0 rows, `spots` 0, `intake_sittings` with area `places` 0, Neon project `damp-hall-89096472`, head `0027`. Nothing is lost. Joey approved removing the migrations.

## Downgrade

Re-adds the four `visits` columns and two types exactly as 0025 did (`precision` NOT NULL default `day`) and re-adds the `places` label with `ADD VALUE IF NOT EXISTS` inside an `autocommit_block`, as 0024 did. Dropped data is not restored (there is none).

## Tests

- `backend/tests/test_migrations.py`: head moves to `0028`; the upgrade, downgrade, upgrade cycle covers 0028; a test that after 0028 `visits` has no outing columns, no `outing_*` type exists and `intake_area` has exactly `shelf` and `closet`; a test that a `places` sitting row, if present when 0028 runs, is deleted with its entries and photos rather than failing the type change; the `_diff_against_models` carve-out for the four visits columns that PR 1 added is removed again (the models and the database now agree).
- `backend/tests/test_schema_check.py` head pin `0027` to `0028`.
- Any doc that names the head or lists migrations (`backend/migrations/README.md`, `backend/CLAUDE.md`) is updated.

## Ship notes

Destructive migration by form. CI's `neon-rehearsal` job applies it to a schema-only Neon branch of production and comments the schema diff on the PR; read it. Apply is automatic on merge as the first step of Deploy API. Rollback of the data: Neon point-in-time restore (history retention 6 h); rollback of the schema: `alembic downgrade 0027`. PR 1 must be merged and deployed first, so the running code never names the dropped columns.
