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

A new value on an existing enum (0011's `paused` on `item_status`) is
`ALTER TYPE ... ADD VALUE IF NOT EXISTS` inside
`op.get_context().autocommit_block()`: Postgres cannot use a value added in
the same transaction. A downgrade cannot remove the value (there is no DROP
VALUE), so it moves any rows using it back to a value the old code knows, and
IF NOT EXISTS keeps the next upgrade from failing on the leftover label.

## Applying it

```bash
./.venv/bin/alembic upgrade head
```

`env.py` reads `DATABASE_URL_DIRECT` only: Neon's direct endpoint, not the
pooled one. `backend/.env` supplies it locally.

From a worktree, which has no `backend/.env`, use
`scripts/migrate_neon.py` (see `scripts/README.md`): it takes the URL from
the main checkout's `.env` and runs that worktree's migrations.

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

1. `alembic upgrade head` against Neon (`scripts/migrate_neon.py upgrade`
   from the PR's worktree).
2. Merge; Render deploys.
3. Smoke: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`.

## Restore

A downgrade is not an undo: most `downgrade()` functions drop what their
`upgrade()` added, and the rows with it (`0011` drops `playthroughs`). To
get data back, use Neon's own restore instead.

- Before a risky migration or a downgrade, note the time (UTC) or create a
  branch from the production branch in the Neon console, so there is a
  known-good point to return to.
- To recover, restore the production branch to that point from the Neon
  console. How far back you can go is the project's history retention
  window, which depends on the Neon plan; check it in the project settings
  before relying on it.
- After a restore, check `scripts/migrate_neon.py current` matches the code
  that is deployed: the restored database carries the revision it had at
  that moment.
