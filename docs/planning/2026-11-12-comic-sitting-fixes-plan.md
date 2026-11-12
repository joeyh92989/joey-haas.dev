---
status: planned
kind: fix
mode: auto
---

# Comic sitting fixes (plan)

Spec: `2026-11-12-comic-sitting-fixes-design.md`.

Each task: TDD, `cd frontend && npm test` / `cd backend && ./.venv/bin/pytest` (one backend
run at a time), lint, then commit.

1. **Probable is asked (#153).** Files: `backend/intake/commit.py`, `backend/intake/README.md`,
   `frontend/src/lib/intake.js`, `components/intake/SkimGrid.jsx`, `CheckStep.jsx`,
   `CheckOne.jsx`. Accept: a probable entry is not in the skim grid, is asked one at a time
   with its badge and candidate preselected, is not written by a commit until confirmed;
   meter counts it as to check. Tests: commit test (probable not written), CheckStep test.
2. **Shelf format on a matched series (#155).** Files: `backend/intake/commit.py` and/or
   `backend/items.py`, `backend/tests/test_intake_commit.py`. Accept: failing test first; a
   source-matched comic row (new and already-existing series) gets the Details shelf_format.
3. **Remove a title or photo (#157).** Files: `backend/intake/routes.py` (+ tests),
   `ShootStep.jsx`, `PhotoTile.jsx`, `ShootSearch.jsx` list, `CheckStep.jsx`/`CheckOne.jsx`,
   `DetailsStep.jsx`, `GarmentCheck.jsx`. Accept: every title or photo in an unfinished sitting
   has a named Remove control; removed items are never written; committed sitting → 409.
4. **Sitting names (#158).** Files: `lib/intake.js` (`sittingLabel`), `UnfinishedList.jsx`,
   the Collection banner. Accept: two same-day sittings read differently in both places.
5. **Counts and Check grid (#159, #165 garment count).** Files: `ShootStep.jsx`,
   `SkimGrid.jsx`, `CheckStep.jsx`. Accept: Shoot parts sum to the total; search-added titles
   appear on Check; grid sentence only with a grid; garment sitting says pieces.
6. **Radio names and Added (#170, #172).** Files: `CheckOne.jsx`, `ShootSearch.jsx`/
   `AddResults.jsx`. Accept: `getByRole('radio', {name: /Paper Girls.*2015/})`; an added result
   shows Added, not Add.

Ship notes: no migration (photo delete reuses existing tables). New route only.
