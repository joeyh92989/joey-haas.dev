---
status: planned
kind: fix
mode: auto
---

# Comic sitting fixes (plan)

Spec: `2026-11-12-comic-sitting-fixes-design.md`.

## Global Constraints

- Repo rules in `CLAUDE.md` apply (plain CSS with tokens, never raw hex; `react-router` imports;
  nothing hover-only; `role="img"` for named non-text marks).
- TDD: a failing test first, then the fix.
- Frontend: `cd frontend && npm test -- <files>` while working, full `npm test` and
  `npm run lint` before the commit. Backend: `cd backend && ./.venv/bin/pytest <files>`;
  **one backend pytest run at a time** (shared local test database).
- Intake's own 409 wording, never the catalogue-lock wording (`intake/commit.py` constants).
- No migration. Additive routes only.
- Conventional commit messages, one logical change per commit, ending with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01FurUAQooqsFBEgbmUaVzWS`.

### Task 1: A Probable match is asked one at a time (#153)

Problem: a Probable match shows ticked in the skim grid and a commit writes it unasked.

- Backend `backend/intake/commit.py`: move `S.PROBABLE` out of `WRITTEN` into `KEPT`, so a
  commit never writes an unconfirmed probable entry. Update `backend/intake/README.md`'s rule.
- Frontend `frontend/src/lib/intake.js`: drop `probable` from `WRITTEN_STATES` and
  `SKIM_STATES`; `meterCounts` counts probable under `check`.
- `components/intake/SkimGrid.jsx`: `inSkim` no longer includes `probable`; `ticked` is
  `exact` only (plus the states added in Task 5).
- `components/intake/CheckStep.jsx`: the one-at-a-time queue includes `probable` entries
  alongside `check`. `CheckOne.jsx` shows the Probable badge and preselects the probable
  candidate; confirming it moves the entry to the same state any confirmed check reaches
  (read how CheckOne confirms today and reuse it).
- Acceptance: a probable entry is absent from the skim grid; appears one at a time with its
  badge and its candidate preselected; is not written by a commit until confirmed; the
  Unfinished meter counts it under to check.
- Tests: `backend/tests/test_intake_commit.py` (update the existing case at ~line 233 that
  asserts probable is written: it must now be kept); a CheckStep/AdminSitting test that a
  probable entry is asked, not skimmed.

### Task 2: Shelf format saved on a source-matched series (#155)

Problem: Details' Set for all `shelf_format: singles` was saved on a typed comic row but read
`not recorded` on a row matched from a Comic Vine search result.

- Write the failing test first in `backend/tests/test_intake_commit.py`: a comic sitting with
  one source-matched entry (search-added, state `ready`, with source/external id) whose
  payload carries `shelf_format: "singles"` and `status: "backlog"` via the Details PATCH
  route; commit; assert the created item row has `shelf_format == "singles"`. Add a second
  case where the matched series already exists on the shelf (series merge / grow path).
- Find the root cause with systematic debugging (do not guess). Leads, unverified:
  `backend/intake/shelf_kinds.py` `CHOSEN_FIELDS` / `_shelf_row`; `commit.py` `shelf_row`,
  `_shelf_item`, the series merge (`_with_issues`, which rebuilds from
  `model_dump(exclude_unset=True)`); `items.commit_items`' `on_conflict_do_nothing`; and the
  frontend `DetailsStep.jsx` `apply`/`saveField` (a stale payload overwriting the field).
- Fix it at the cause. If the cause is in the frontend, add the frontend test as well.
- Acceptance: the shelf format applied in Details is saved on every row of the sitting, new or
  existing series, with tests covering a source-matched row.

### Task 3: Remove a title or photo from an unfinished sitting (#157)

- Backend `backend/intake/routes.py`:
  - Entries: if the entry PATCH route accepts `state`, removing is PATCH `state: "ignored"`
    with no `payload.unticked` (so it never shows and is never written). If it does not,
    add `DELETE /api/intake/sittings/{sitting_id}/entries/{entry_id}`.
  - Photos: add `DELETE /api/intake/sittings/{sitting_id}/photos/{photo_id}`: admin-only like
    its siblings; 409 with `SITTING_GONE` on a committed or discarded sitting; 404 for a photo
    not in that sitting; removes the photo and every entry read from it that is not yet
    written. Works for garment sittings too.
- Frontend: a Remove control (a real `<button>` with an accessible name like
  `Remove <title>` / `Remove this photo`) on: Shoot's search-added and typed titles
  (`ShootStep.jsx` / `ShootSearch.jsx` list), photo tiles (`PhotoTile.jsx`), Check rows
  (`CheckOne.jsx`, skim grid rows), Details rows (`DetailsStep.jsx`); garment photos at Shoot
  and in `GarmentCheck.jsx` for every photo, not only the one being asked about.
- Acceptance: any title or photo in an unfinished sitting can be removed before it is added;
  a removed one is never written; a committed sitting answers 409.
- Tests: `backend/tests/test_intake_routes.py` (photo delete: ok, 404, 409, entries dropped);
  frontend tests in `AdminSitting.test.jsx` / `GarmentCheck.test.jsx`.

### Task 4: Same-day sittings are distinguishable (#158)

- `frontend/src/lib/intake.js` `sittingLabel`: new labels add the Denver start time,
  e.g. `Comic · Nov 11, 7:42 PM` (use `America/Denver`).
- `components/intake/UnfinishedList.jsx`: each row also shows when it was started (from the
  sitting's created timestamp, Denver time), so labels made before this change still differ.
- The Collection banner that names one unfinished sitting (find it; `AddSection.jsx` or
  `AdminCollection.jsx`): with more than one unfinished sitting it gives the count and links
  to the list rather than naming one.
- Acceptance: two same-day sittings of one kind read differently in the list and the banner.
- Tests: a `sittingLabel` unit test; `UnfinishedList.test.jsx` for two same-label rows.

### Task 5: Shoot counts add up; Check shows every title (#159, #165 garment count)

- `components/intake/ShootStep.jsx` `runningLine`: every entry falls in exactly one part:
  ready (`exact`, `ready`, `typed`), to check (`check`, `probable`), reading (`reading`),
  already owned (`owned`); ignored entries are not counted in the total. Render
  `N titles so far · R ready · C to check · W reading · O on the shelf`, dropping zero parts
  after the total. For a closet (garment) sitting the noun is `piece`/`pieces`.
- `SkimGrid.jsx` / `CheckStep.jsx`: search-added and typed titles (`ready`, `typed`) appear in
  the skim grid ticked, so every title is visible on Check; unticking keeps the existing
  `ignored` + `unticked` + `was` behaviour and reticking restores the right state. The
  sentence `Only the uncertain ones are asked one at a time; exact matches are a grid to
  skim.` shows only when the grid has entries; otherwise drop it.
- Acceptance: Shoot's parts sum to the total; search-added titles are on Check; no grid
  sentence without a grid; a garment sitting counts pieces.
- Tests: `AdminSitting.test.jsx` (counts after search + typed + photo; the existing
  `1 title so far` assertions are updated to the new line), SkimGrid/CheckStep tests.

### Task 6: Candidate radios named by title; an added result says Added (#170, #172)

- `components/intake/CheckOne.jsx`: each candidate radio's accessible name is the series title
  and start year (e.g. `Paper Girls (2015)`), not the Comic Vine id. Find why the id wins
  (an `aria-label`, `id`/`htmlFor`, or `name` misuse) and fix it.
- `ShootSearch.jsx` / `AddResults.jsx`: a result already added to this sitting shows `Added`
  (disabled, not a button that adds twice) instead of `Add`, both right after adding and when
  the search is reopened while the entry exists.
- Acceptance: `getByRole('radio', { name: /Paper Girls.*2015/ })` finds the radio; an added
  result offers no second Add.
- Tests: CheckOne/AdminSitting tests for both.

## Ship notes

No migration. One new route (photo delete, perhaps entry delete). Changelog: none (admin-only
fixes).
