---
status: planned
kind: fix
mode: auto
---

# Closet fixes (plan)

Spec: `2026-11-12-closet-walkthrough-design.md`.

## Global Constraints

- Repo rules in `CLAUDE.md` apply (Closet section; plain CSS with tokens, never raw hex).
- TDD: a failing test first, then the fix.
- Frontend: focused `npm test -- <files>` while working; full `npm test` and `npm run lint`
  before the commit. Backend: `./.venv/bin/pytest <files>`; **one backend pytest run at a
  time across all worktrees** (shared local DB) — check `pgrep -f pytest` first.
- No migration.
- Conventional commits ending with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01FurUAQooqsFBEgbmUaVzWS`.

### Task 1: Add-by-hand panel fields fit (#163)

- `frontend/src/index.css`: `.intake-field` inputs, selects and textareas fill their cell
  (`width: 100%; min-width: 0; box-sizing: border-box`), scoped so other forms are unchanged;
  `.intake-drawer-fields` drops to one column when the drawer is narrow (phone, and any width
  where a half cell is under ~9rem).
- Acceptance: at 1440px and 390px the Name, Category and Material fields sit inside the panel
  with no overlap. Verify by running the dev server (`npm run dev`) and checking in a browser
  or by reasoning from computed widths; say which in the report.
- Tests: none for layout; keep `AddSection.test.jsx` green.

### Task 2: Today re-plans when its plan names a garment no longer active (#164)

- `backend/closet_today_routes.py` `get_today`: before returning a stored plan, check that
  every garment id it names is still an active garment; if any is not (deleted, packed,
  listed, gone), make and store a fresh plan through the existing `make_plan`/`store` path and
  return that.
- Acceptance: deleting, or setting to packed/listed/gone, a garment in today's plan makes the
  next `GET /api/closet/today` return a plan that does not name it.
- Tests: `backend/tests/test_closet_today.py`: delete case and a status-change case.

### Task 3: Review's added date is the Denver date (#167)

- `frontend/src/components/ReviewDeck.jsx` `deckStat`: when falling back to `created_at`, use
  the `America/Denver` calendar date (e.g. `toLocaleDateString('en-CA', {timeZone:
  'America/Denver'})`), not `created_at.slice(0, 10)`.
- Acceptance: `created_at: '2026-11-12T02:40:00Z'` with no `acquired_on` reads `added Nov 11`.
- Tests: `AdminClosetReview.test.jsx` or a `deckStat` unit test.

### Task 4: Closet slips: Garment button name, add bar, untagged visible (#170, #172)

- `/admin/closet/add` Garment start button: add a test
  `getByRole('button', { name: /Garment/ })` in `AdminAdd.test.jsx` using the closet kind as
  the API serves it (`backend/intake/garment_kind.py`). If it fails, fix the cause in
  `KindTile.jsx`; if it passes, note in the report that the name is proven by test.
- `components/intake/AddSection.jsx` `add()`: clear the add bar's query after a successful add.
- `frontend/src/lib/closet.js`: the default filter (`DEFAULT_FILTER`, `status: 'active'`) also
  keeps `untagged` pieces; a status chip the owner presses still filters strictly. Update
  `AdminCloset.test.jsx`'s assertion (~line 223) that codified the hidden untagged piece.
- Acceptance: after an add the bar is empty; a fresh untagged upload shows in the default
  view; the Garment button is named.

## Ship notes

No migration. No new route. Changelog: none (admin-only fixes).
