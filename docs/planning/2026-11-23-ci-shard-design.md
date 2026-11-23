---
status: planned
kind: chore (CI speed)
mode: auto
issue: "#598 (part 2 of 2)"
---

# Shard the browser-test CI jobs

## Problem
`e2e` and `e2e-admin` each take about 21 to 25 minutes, and every PR waits on them (this migration merged about ten PRs: roughly four hours of pure waiting). The jobs run Playwright single-worker. Goal: cut the wall-clock time of each to about 10 minutes without losing coverage or making the checks flaky.

## Scope
In: `.github/workflows/ci.yml`, `.github/workflows/README.md`, root `CLAUDE.md` Ship/CI-jobs wording, `frontend/playwright*.config.js` only if needed, the visual-snapshot step, report merging.
Out: test content, the Deploy API workflow's wait (`scripts/wait-for-ci.sh` waits for `backend` and `frontend` only: check it still does and name any change), branch protection settings (required checks are `backend` and `frontend`; do NOT change required checks or any repository setting or secret: that is an always-stop for the main agent).

## My calls
- Use Playwright's built-in `--shard=i/N` in a job matrix (start with N=3 for `e2e` and N=3 for `e2e-admin`, measure, tune). Read the current jobs first (`ci.yml` lines about 209 to 340): they build the site once, copy the snapshot fixtures, run `npm run e2e`, then `npm run e2e:visual`, and the admin job starts a Postgres 18 service plus a real backend and creates `joeyhaas_e2e` (`scripts/e2e-admin-db.mjs`).
- The job NAMES `e2e` and `e2e-admin` must keep working as a single check each, since people (and `gh pr checks`) read them: add a tiny aggregate job per suite named exactly `e2e` and `e2e-admin` that `needs:` the matrix jobs and passes only when all shards pass (as `backend` aggregates `backend-tests` and `backend-migrations`; the matrix jobs get different names, for example `e2e-shard` and `e2e-admin-shard`).
- Each admin shard needs its OWN database or its own runner (matrix jobs are separate runners with their own Postgres service, so this is automatic: check the e2e-admin globalSetup does not assume a shared state). Check tests that depend on order or on a shared fixture, and any spec that is one huge file (`admin-denver-site.spec.js` was 12.6 minutes alone in one run, `admin-data.spec.js` 7.5): Playwright shards by test file unless `fullyParallel`, so a 12-minute file caps the speed-up. Look at the slow files and, if sensible, split the file or enable `fullyParallel` for it ONLY if the tests are independent (verify, do not assume).
- Visual snapshots: the visual step (`npm run e2e:visual`) compares against committed baselines; shard it too or keep it in one shard, but make sure failure artifacts (the playwright report) upload per shard with distinct names, and the `update-visual-baselines.yml` workflow (which regenerates baselines) still works: read it and keep it unsharded if simpler.
- Cost: more runner minutes; say the before and after total minutes in the PR.

## Proof
- Push the branch and open the PR; read the REAL run: per-shard times, the aggregate job's result, that all tests ran (sum of passed + skipped across shards equals the unsharded counts: e2e 844 passed / 690 skipped locally, e2e-admin 308 passed / 52 skipped locally; CI's counts: read a recent main run's log for the exact numbers) and that a deliberately failing test (try it once on a throwaway commit on the branch, then remove it) turns the aggregate job red.
- Run the sharded workflow at least 3 times (re-run) to check flakiness; report each time. If a shard flakes, find out why (shared state, port collisions, ordering) before tuning N.
- `.github/workflows/README.md` documents the matrix, how to rerun one shard, and how to read the aggregate.

## Ship notes
CI-only change. No migration, secrets or render.yaml change. If anything needs a repository setting or secret change, STOP and report: do not change it. The PR's own CI run is the first test; `e2e`/`e2e-admin` are not required checks, `backend` and `frontend` are.
