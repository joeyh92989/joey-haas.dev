---
status: planned
kind: feature
mode: gated
---

# Merge train

## Problem

Branch protection on `main` requires `backend`, `frontend` and an up-to-date
branch (`strict`), so every merge puts the other open PRs behind `main`: each
needs `gh pr update-branch` and a 5 to 7 minute CI run. Epic #392 (seven PRs,
80 minutes) merged one PR per CI cycle, with 6 of 7 PRs re-run by an update and
idle gaps as long as the re-runs (#404 about 22 minutes behind `main`; #410
8 minutes waiting for #409 to merge, then 9 minutes green before a merge).
Measured from `gh run view` and `gh pr view` on 2026-11-16; the PR #411
learnings entry's "about 10 minutes" per run is 5 to 7.

## Scope

In: `scripts/merge-train.sh` (update, wait for required checks, squash-merge a
list of PRs in order, stop on any failure), its test against a fake `gh`,
`scripts/README.md`, the Ship and CI-jobs wording in `CLAUDE.md`.
Out: turning `strict` off, a merge queue (likely unavailable on a user-owned
repo, unverified), shortening CI (separate profile task), stacked PRs.

## Decisions

- A script, not auto-merge: `gh pr merge --auto` does not update a behind
  branch (believed, untested), so it would stall under `strict`.
- Behind-ness comes from the compare API's `behind_by`, not `mergeStateStatus`
  (a behind PR waiting on checks reads BLOCKED).
- No retries: a failed required check stops the train (CLAUDE.md: one rerun of
  a named flake by hand).
- The script checks required status checks only; finish review and migration
  gates stay with `sdlc-ship`.

## Tasks

1. Script, test, README. Acceptance: `./scripts/merge-train.test.sh` passes;
   `--dry-run` reads real PRs.
2. `CLAUDE.md` Ship line and CI-jobs bullet.
3. First real use on two low-risk PRs, watched.

Ship notes: no migration. Smoke: `./scripts/merge-train.sh --dry-run <open PRs>`.
Rollback: revert the PR; nothing else depends on the script.
