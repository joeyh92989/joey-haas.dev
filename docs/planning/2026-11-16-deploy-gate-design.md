---
status: planned
kind: architectural
mode: gated
---

# Deploy gate: no deploy of a commit whose CI is not green

## Problem
`deploy.yml` runs on every push to `main` and does not look at CI. Today
that is safe because branch protection requires each PR to be up to date with
`main` (`strict`) and green, so the merge commit is what CI already tested.
Dropping `strict` (the remaining lever on epic merge time: `update-branch`
re-ran 6 of 7 PRs in epic #392, and #418 needed two full CI cycles after
another PR merged under it) lets two PRs that pass alone land together
untested, and the API would deploy (and migrate Neon) before `main`'s own CI
reports (about 5 minutes against a 3-minute deploy).

## Scope
In: a `wait-for-ci` job in `deploy.yml` (push only) that waits for the commit's
`backend` and `frontend` jobs and fails the run if either fails or 30 minutes
pass; `scripts/wait-for-ci.sh` with a fake-`gh` test; a `ci.yml` concurrency
change so each main commit keeps its own run; docs.
Out: flipping `strict` (a settings change, Joey's call, separate); gating the
static site (Render deploys it on push by itself); a merge queue (likely
unavailable on a user-owned repo).

## Decisions and tradeoffs
- **Cost:** a push deploys about 5 minutes later (CI first). Accepted as the
  price of dropping `strict`; a manual Run workflow (also the rollback) skips
  the wait, so rollback speed is unchanged.
- **Fail closed:** red, cancelled, timed out or never-created CI all stop the
  deploy; the run is red on `main`, which is the signal. Fix with a PR; to
  deploy anyway, Run workflow.
- **`ci.yml` concurrency:** a push run is grouped by commit SHA and never
  cancelled. Before, the next merge cancelled the previous main run, which would
  leave the earlier deploy waiting on a cancelled run. PR runs are unchanged.
- **Only the two required jobs** gate (the names branch protection uses);
  `e2e`, `e2e-admin` and `neon-rehearsal` stay advisory, as today.
- **Permissions:** the gate job adds `actions: read` (to list and view runs) to
  the workflow's `contents: read`; no write permission and no secrets.
- A script, not inline YAML, so it is testable and the workflow stays thin.

## Tasks
1. `scripts/wait-for-ci.sh` and test. Acceptance: tests cover pass, wait,
   fail, cancelled, timeout, run not yet created, bad usage.
2. `deploy.yml` gate job and `deploy` `needs`/`if`; `ci.yml` concurrency; docs.
   Acceptance: YAML parses; on the first push after merge the Deploy API run
   shows `wait-for-ci` green, then `deploy`; a manual run skips the gate.
3. Reviews: `/code-review medium` and `/security-review` (touches deploy).

Ship notes: no migration. The gate only runs once merged, so its first real
proof is the merge's own deploy: watch it. Rollback: revert the PR (the deploy
goes back to starting at once); no setting changed.
