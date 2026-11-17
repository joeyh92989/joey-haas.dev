---
status: planned
kind: feature
mode: gated
---

# Split the backend job

## Problem
`backend` is 328 s of a 6-minute required-check path (frontend is 2 to 3.5
minutes). A local `--durations=40` profile (3396 tests, 647 s on a loaded
machine) shows `tests/test_migrations.py` is 113 s of the top-40's 167 s
(45 tests, about 17 to 20% of the run); the other ~3,450 tests average about
0.14 s each with no single slow culprit.

## Scope
In: run `tests/test_migrations.py` in its own job in parallel, behind an
aggregate job still named `backend`. Out: xdist or sharding the rest (needs a
database per worker in `tests/testdb.py`; wait for a setup-versus-body profile).

## Decisions
- The aggregate job keeps the name `backend`, so branch protection (which
  requires `backend` and `frontend`) needs no change and cannot go green with
  a half skipped. `if: always()` and an explicit success test, because a
  skipped required check reads as passing.
- Nothing is removed from what is checked: collected tests 3450 + 45 = 3495,
  the same as before.
- Own Postgres service for the migration job: those tests rebuild the schema.

## Tasks
1. Edit `ci.yml`, `.github/workflows/README.md`, `CLAUDE.md`. Acceptance: the
   PR's own CI shows `backend` green, `backend-tests` shorter than the 328 s
   test step, and the aggregate fails if either half is red.
2. Prove the aggregate's test: run its shell line for each result pair
   (success, failure, cancelled, skipped) and see only success/success pass.

Expected saving: about 50 to 60 s of a 6 minute cycle (the aggregate adds a
few seconds). Measure on the PR, do not trust this.
Ship notes: no migration; no settings change. Rollback: revert the PR.
