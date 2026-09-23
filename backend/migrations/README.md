# backend/migrations

Alembic revisions for the Postgres schema. They are applied **by hand**
against Neon's direct URL, never at startup: Render's pre-deploy command is a
paid feature, and migrating at startup means a bad migration takes the API
down on every boot. `schema_check.py` makes forgetting loud: the API refuses to
start while the database is behind the code.

## Creating a revision

From `backend/`:

```bash
./.venv/bin/alembic revision -m "add something"
```

Name the file `NNNN_short_description.py` and set `revision` and
`down_revision` by hand to the next number, as the existing files do. Create
any enum type explicitly in `upgrade()` and drop it in `downgrade()`, because
`add_column` never creates one and Postgres keeps an enum after its last
column is gone. `tests/test_migrations.py` diffs the migrated schema against
`models.py` and runs a down/up cycle, so a mismatch or a leftover type fails
there.

## Applying it

```bash
./.venv/bin/alembic upgrade head
```

`env.py` reads `DATABASE_URL_DIRECT` only: Neon's direct endpoint, not the
pooled one. `backend/.env` supplies it locally.

## The rule: migrations are additive

A migration adds tables and columns. It never renames or drops one in the same
release as the code that stops using it.

**Why:** the deploy order is *apply the migration, then merge*. For the few
minutes until Render deploys the new code, the live code is older than the
schema, and a free-tier cold start in that window has to boot. `schema_check`
lets it, by treating a revision it has never seen as newer, with a warning in
the logs. That is only safe when the older code still works against the newer
schema. Additive changes guarantee that; a rename or a drop does not.

To remove something: stop using it in one release, and drop it in a later
migration once no deployed code reads it.

## Deploy order

1. `alembic upgrade head` against Neon.
2. Merge; Render deploys.
3. Smoke: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`.
