---
status: planned
kind: fix
mode: auto
---

# Admin and shelf fixes (plan)

Spec: `2026-11-12-admin-walkthrough-design.md`.

## Global Constraints

- Repo rules in `CLAUDE.md` apply (plain CSS with tokens; nothing hover-only).
- TDD: a failing test first, then the fix.
- Frontend: focused `npm test -- <files>` while working; full `npm test` and `npm run lint`
  before the commit. Backend: `./.venv/bin/pytest <files>`; **one backend pytest run at a
  time across all worktrees** (shared local DB) — check `pgrep -f pytest` first.
- No migration. Do not touch the movie/TMDB source wording (#162 is excluded).
- Conventional commits ending with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01FurUAQooqsFBEgbmUaVzWS`.

### Task 1: Board game card reason fits (#161)

- `backend/intake/kinds.py` (~76-79): the BGG state reads exactly
  `Needs a BoardGameGeek key; added by typing for now.` Do not change `sources/bgg.py`'s
  `UNAVAILABLE` constant (logs and README keep the long text).
- `frontend/src/index.css` `.intake-kind` (~2289-2300) and its text spans: `min-width: 0` and
  `overflow-wrap: anywhere`, so no message runs past the card.
- Acceptance: the card shows the short reason; a long unbroken token wraps inside the card.
- Tests: update `backend/tests/test_intake_kinds.py` (~100) and `test_intake_add.py` (~152)
  assertions on the BGG prefix; `KindTile.test.jsx` asserts the short text.

### Task 2: Store count copy (#168)

- `frontend/src/content/projects.js:27` →
  `'A physical catalog: a community registry and a watch list of boutique stores, collapsed to one honest format per game, full cartridge or Game-Key Card.'`
- `frontend/src/content/spine.js:83` →
  `'Cartridge or Game-Key Card, pulled from a registry and the stores I watch.'`
- `frontend/src/content/spine.js:152` →
  `'A Switch 2 box can hold the full game or only a key to download it. My Shelf reads the r/NSCollectors registry, the Switch 1 release sheet, and the boutique stores on its watch list, and collapses them to one honest format per game.'`
- `frontend/src/content/spine.js:170` fallback `['Stores', '12 watched']` →
  `['Stores', '11 watched']`.
- Do not edit `frontend/posts/how-spine-works.md`.
- `frontend/changelog.md`: add one bullet under a `## 2026-11-12` heading (create it at the top if absent): `Fixed the store count in the shelf copy, and the What it does cards now name the stop they link to.`
- Acceptance: `grep -rn "twelve" frontend/src` finds nothing about stores; tests green.

### Task 3: Site card summary uses the row's words (#169)

- `frontend/src/lib/adminJobs.js` `jobsSummary` (~189-200): name the first problem job with
  its `stateWords ?? state`; a job whose row says `scheduled` (no run yet, a first run due) is
  not a problem and is left out of the summary's problem part.
- Acceptance: with the Spot finder scheduled and nothing else wrong, the Site card reads
  `N of M jobs ok` with no "unknown"; a genuinely unknown job still shows.
- Tests: a `jobsSummary` unit test (new `adminJobs.test.js` cases).

### Task 4: One add path on /admin/collection (#171)

- `frontend/src/pages/AdminCollection.jsx` (~837-846): keep `AddSection` as the page's add
  path; put the old `MetadataPicker` Look up and `ItemForm` inside a `<details>` whose summary
  is `Add with the full form`, closed by default, open when the page arrives with
  `location.state.prefill` (the pull list's `Own…`, `AdminPullList.jsx:18-40`).
- Acceptance: the page shows one add bar; the full form is one click away; the pull list's
  Own… still lands in the open, prefilled form.
- Tests: `AdminCollection.test.jsx` (prefill case at ~104 still passes with the form open;
  a case that the form is closed by default).

### Task 5: In-page delete confirm; stop numbers named (#172)

- New `frontend/src/components/ConfirmDelete.jsx`: a Delete button that, when pressed, shows
  `Delete for good` / `Keep it` in place (the pattern in `GarmentForm.jsx:301-327`), calling
  `onConfirm` only on Delete for good. Use it in `AdminItem.jsx` (~531-546, 872-875) in place of
  `window.confirm`, and on the Collection list view's Delete (`AdminCollection.jsx` ~567-580,
  985-990), which has no confirm today. Leave `GarmentForm` as it is.
- `frontend/src/components/FeatureStrip.jsx`: the number reads `Stop 01`, `Stop 07` (still the
  stop number, still aria-hidden).
- Acceptance: no `window.confirm` in AdminItem; the list Delete asks first; cards say Stop.
- Tests: `ConfirmDelete.test.jsx`; update `AdminItem.test.jsx:200-225`; a list-delete case in
  `AdminCollection.test.jsx`; `FeatureStrip.test.jsx`.

## Ship notes

No migration. No new route. Changelog: one bullet, the public copy fix (store count and the
stop labels on /shelf).
