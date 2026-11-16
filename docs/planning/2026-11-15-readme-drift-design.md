---
status: planned
kind: docs
mode: auto
---
# README and docs drift (#281)

## Problem
README text drifted from the code (route table, script paths, undocumented scripts, unlinked docs). Issue body lists the original findings; an earlier triage found several already fixed (deploy wording, `/denver`, `/shelf/intake`, `/daily`, `e2e-admin-db` in frontend/scripts/README.md, doc links). Remaining work is verification and the gaps.

## Scope
In: `README.md`, `frontend/scripts/README.md` (and `backend/scripts/README.md` if a script is missing there). Out: any code.

## Solution
1. Diff every public route in `frontend/scripts/prerender-lib.mjs` (`publicRoutes`, `legacyRoutes`, plus App.jsx routes) against the README route table; add missing, fix wrong (comics edit is `/admin/shelf/comics/:id`; `/admin/collection/:id` is games only).
2. Every file in `frontend/scripts/` documented in `frontend/scripts/README.md`; fixture-snapshot test fixtures (`frontend/e2e/fixtures/`) documented.
3. Re-grep README for stale claims: "applied by hand", "Every push to main deploys both", path `scripts/e2e-admin-db.mjs`. Doc links to `docs/learnings.md`, `docs/planning/`, `docs/design-system.md` resolve.
4. Check every relative path/link in README resolves (script it, throwaway).

## Acceptance (from the issue)
Every public route in `prerender-lib.mjs` appears in the README; doc paths resolve; every `frontend/scripts/*` is documented.

## Ship notes
Docs only, no migration. Touch no file other than the READMEs and this plan.
