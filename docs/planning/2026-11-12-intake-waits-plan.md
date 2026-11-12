---
status: planned
kind: fix
mode: auto
---

# Waits that say what they wait on (plan)

Spec: `2026-11-12-intake-waits-design.md`.

## Global Constraints

- Repo rules in `CLAUDE.md` apply (plain CSS with tokens; `content/status.js` is the one place
  for the site's waiting/failure words).
- TDD: a failing test first, then the fix. Use fake timers for elapsed/threshold/deadline tests.
- Frontend gate: full `npm test`, `npm run lint`, `npx prettier --check .`.
- No backend change, no migration.
- Exact thresholds: still-working after 30 s (sitting, Tag now) and 20 s (Today); client
  deadline 165 s everywhere (`WAIT_DEADLINE_MS = 165_000`, one constant).
- Conventional commits ending with:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01FurUAQooqsFBEgbmUaVzWS`.

### Task 1: Elapsed helper, deadline and Today's wait

- New `frontend/src/lib/useElapsed.js`: `useElapsed(active)` returns whole seconds since
  `active` became true, ticking once a second, 0 when inactive. Unit test with fake timers.
- `lib/api.js` `apiFetch`: accept an optional `signal` and pass it to `fetch` (no behaviour
  change otherwise). Export `WAIT_DEADLINE_MS = 165_000` from one module (e.g. `lib/waits.js`)
  with a small `withDeadline(fn)` helper that aborts after the deadline and rejects with a
  recognisable timeout error.
- `content/status.js`: the words for Today: `Waking the server or planning the day`
  (replacing `WAKING_OR_PLANNING`'s text; keep the export name), a still-working line
  `Still working — planning asks the model and can take up to two minutes.`, and a deadline
  failure `Planning didn't answer in time. Try again.`
- `pages/AdminClosetToday.jsx` (~394, ~457-479, ~623): show the wait words with ` · N s` once
  past the existing 3 s `slow` point, the still-working line after 20 s, and on the deadline the
  failure line with the page's Retry. Tests: `AdminClosetToday.test.jsx` (~706-721 updated).

### Task 2: Tag now says what it waits on

- `pages/AdminCloset.jsx` `tagNow` (~118-131, ~161-162): while tagging show
  `Tagging N photos — one model call · N s` (N = the untagged count it sent, singular for one),
  after 30 s `Still working — this can take up to two minutes.`; wrap the POST in
  `withDeadline`; on the deadline show `Tagging didn't answer in time. It may still finish —
  reload to see.`; a thrown network error keeps its current words. Words in
  `content/status.js` or the closet copy module the page already uses (follow the existing
  pattern).
- Tests: `AdminCloset.test.jsx` (~177-221): the wait words, the still-working line at 30 s, the
  deadline failure.

### Task 3: Sitting photos say where they are in the queue

- `components/intake/PhotoTile.jsx` (~7-10): an `uploaded` photo reads
  `waiting to be read · N ahead` (`· next` when nothing is ahead; budget-spent wording
  unchanged); the photo being read reads `reading · N s`, and after 30 s adds
  `still reading — the model can take a minute or two`. Compute N from the sitting's photos
  in the reader's order (oldest first, as `read_next` claims them — check `useReadNext.js` and
  `backend/intake/reader.py`).
- `lib/useReadNext.js` (~69-118): wrap each `read-next` POST in `withDeadline`; on the deadline
  set the reader's error to `The reader didn't answer in time; try again.` and stop the loop
  (the photo stays `reading` on the server until its own timeout; Retry is the existing path).
- `components/intake/ShootStep.jsx` (~228): `Keep shooting: each photo is read as it lands.`
  becomes `Keep shooting: photos are read one at a time, in the order you took them.`
- Tests: PhotoTile tests for both states and the 30 s line; `AdminSitting.test.jsx` for the
  deadline; the tip text.

## Ship notes

No migration, no backend change. Changelog: none (admin-only).
