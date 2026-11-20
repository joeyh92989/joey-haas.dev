---
status: planned
kind: refactor (removal)
mode: auto, at Joey's request
---

# Remove the places and outings code from main

Epic #339 (stories #340 to #351) is parked. Joey wants the code out of `main`, because its current shape would steer decisions about a future rebuilt around international trips. The restore point is the git tag `places-outings-2026-11-20` (main at f0f23ace); the learnings live in `docs/planning/2026-11-20-places-outings-retrospective.md` and the per-story plan docs, which **stay**.

## Scope

In: undo the twelve squash commits of the epic, newest first: f0f23ace (#351), b6d404c3 (#350), 49fe1855 (#349), 2cccd342 (#348), 188c77e0 (#347), 2207d515 (#346), f27fae72 (#345), 55eb5c61 (#344), 5e118fcb (#343), 1865dd94 (#342), 36a116bf (#341), f0b37195 (#340), while keeping every later unrelated change on `main` (walkthrough fixes #508 to #511, the account menu #516, the More nav group #518, Jobs Run now #517, and the rest). The pre-epic Denver spots, weekend planner, finder, candidates, Log visit and `/denver` page come back as they were, with their later unrelated fixes.

Out: the migrations. Production is at 0027 and holds 0 spots, 0 visits and 0 places sittings. Files `0024` and `0025` stay; a second PR adds a forward migration `0028` that drops what they added (outing columns and types, and rebuilds `intake_area` without `places`). Two PRs, as with the `items.editions` retire (#454 unmapped, #453 dropped), so the running code never names a column that is gone.

Also out: `docs/planning/**` (all plan docs, the brief, the retrospective) and `docs/learnings.md` are kept untouched; a revert that deletes any of them is undone for those paths.

## Approach

1. `git revert --no-commit <the twelve, newest first>`; resolve conflicts keeping non-epic changes (common conflict files: `frontend/src/index.css`, `CLAUDE.md` files, `frontend/src/App.jsx`, `docs/design-system.md`, `backend/CLAUDE.md`).
2. Restore `docs/planning/**` and `docs/learnings.md` from `origin/main`.
3. Grep for orphans a revert leaves because of later commits: `outing`, `Outing`, `place_paste`, `place_kind`, `nominatim`, `IntakeArea.PLACES`, `places` area, `History`, `DidYouGo`, `historyFilters`, `OutingDate`, `PastePlaces`, `PlaceFields`, `SpotsAddBar`, `did_you_go`, `didnt`, `TAGS` growth, `city` on spots, `adminAreas` entries, route list pins, smoke checks, e2e specs, prerender lists, the root `CLAUDE.md` open-items line. Remove what only the epic used.
4. The ORM `Visit` loses `title`, `verdict`, `kid_along`, `precision` (the columns stay in the database until PR 2; `precision` has a server default, so inserts still work). `IntakeArea` loses `PLACES` in Python only; the Postgres enum keeps the label until PR 2. Migration files 0024 and 0025 stay, and `backend/tests/test_migrations.py` / `test_schema_check.py` keep passing (head pin stays 0027; the schema check must tolerate the extra columns, or the removal PR 2 carries the pin change).
5. Route-count pin in `test_recs_response_models.py` returns to its pre-epic value (read it from the tag's parent). Smoke script and `backend/CLAUDE.md` / `frontend/CLAUDE.md` / root `CLAUDE.md` sections added by the epic go.

## Acceptance

- Full backend `pytest`, `ruff check` and `ruff format --check`; full frontend `npm test`, `format:check`, lint, `VITE_DAILY_SALT=local npm run build`; every pin test passes at its pre-epic values.
- `git diff f0b37195^ HEAD --stat -- . ':!docs'` for code paths shows only the unrelated later work; no epic file remains (list the exceptions).
- `/denver` and the Denver spots tests behave as before the epic (city-aware spots #343 undone); no public body changed except what the epic added.
- The remaining app boots against the migrated production schema (migrations untouched in this PR).

## Ship notes

PR 1 (this plan): no migration; deploy normal. PR 2 (separate plan): forward migration 0028, destructive in form but production holds no rows for it; Joey approved removing the migrations. A Neon restore point (history retention 6 h) is the rollback for the data; the code rollback is the tag.
