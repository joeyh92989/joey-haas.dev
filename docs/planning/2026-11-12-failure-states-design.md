---
status: done
kind: fix
mode: auto
---

# Failure states that say they failed (design and plan)

Issues: #181 (public), #202 (admin). Branch `fix/failure-states`. Backlog:
`2026-11-12-site-review-issues.md`.

## Problem

When the free-tier API is asleep or down, pages fail in different, misleading ways. Corrected by
reading the code (the issues were written from screenshots):

- `/shelf/comics` keeps its shelf header but loses its only `h1` (it sits in the ready branch,
  `Comics.jsx:375`); `ComicIssue` and `ComicEdition` lose the header and the `h1`.
- How it works shows a stop's empty copy ("Nothing on the shelf yet.") when the live read fails
  (`HowItWorks.jsx:79-82`): a failure reads as "you have nothing".
- No page offers a retry (#181 said Item and PlayNext do; they don't). Every public failure is
  `LOAD_ERROR` ("That didn't load. Try again in a minute.") with nothing to press.
- Waits disagree: 2 s or 3 s before WAKING, and no deadline on any public or admin read, so a hung
  request waits forever (CLAUDE.md says waits go through `withDeadline` and `useElapsed`).
- Admin Home: a failed read renders figures as "—" with no message and silently hides cards; no
  retry. Admin pages use bare or inconsistent loading words; `AdminCatalogue` can show a raw
  `error.message`; `SESSION_ENDED` is defined four times.

## Scope

In: the nine public pages named in #181 plus Item (same pattern, same file family), the admin
pages named in #202 and Admin Home. Out: write paths (sends, saves) and their errors; intake's
per-photo retry; PlayNext's actions.

## Solution and decisions (my call)

1. **One read pattern.** `useSnapshotThenLive` gains a deadline (`withDeadline`, a new
   `READ_DEADLINE_MS` in `lib/waits.js`, 60 s: a cold start is 30-60 s) and a `retry()` that
   re-runs the live read. Pages without a snapshot get the same through a small `useLiveRead`
   (same return shape: `{ data, live, failed, retry }`), so every page reads one way.
2. **One status component**, `components/LoadState.jsx`: while waiting it shows "Loading…" and,
   after `SLOW_LOAD_AFTER_S`, the WAKING line (through `useElapsed`); on failure it shows the
   failure line and a **Try again** button that calls `retry`, in a `role="alert"` region; once
   there is data it renders nothing. Words live in `content/status.js` (`TRY_AGAIN`, and one
   `SESSION_ENDED`). A snapshot that painted still wins over an error, as today, but a failed live
   refresh on a snapshot page shows a quiet "Showing the last saved copy. Try again" line instead
   of nothing.
3. **Headings never live inside a state branch.** Every page renders its header and `h1` whatever
   the state; where the title comes from the data (comic issue, edition), the `h1` falls back to
   what the route knows ("Issue #12", "Collected edition") with the breadcrumb back to the series.
4. **Failure is never empty.** How it works' stops show "Couldn't load this stop's live example."
   with Try again instead of their empty copy when the read failed (empty copy only for a real
   empty).
5. **Admin Home** says which reads failed in one line at the top ("Couldn't read: Shelf, Site.")
   with one Try again that re-runs them; a failed card shows "Couldn't read" instead of "—"
   figures; reads get the deadline. Admin pages named in #202 use `LoadState`; `AdminCatalogue`
   shows `LOAD_ERROR`, never a raw message; `SESSION_ENDED` comes from `content/status.js`.
6. The `/shelf/comics` expected failure in `e2e/smoke.spec.js` (#181 marker) is removed: every
   route must have its `h1` with the API down.

## Sources

Research report (this session): `lib/useSnapshotThenLive.js:19-59`, `lib/waits.js`,
`content/status.js:11-56`, `Comics.jsx:318-375`, `HowItWorks.jsx:79-82`, `ComicIssue.jsx:109-125`,
`ComicEdition.jsx:139-155`, `Admin.jsx:28-58,98,151`, `AdminCatalogue.jsx:256`, the
`SESSION_ENDED` copies (Admin.jsx:76, AdminClosetToday.jsx:37, AdminClosetReview.jsx:12,
AdminCloset.jsx:38), `e2e/smoke.spec.js:5-47`. Conventions: CLAUDE.md (waits; snapshot first).

## Smoke check

`npm run e2e` in CI mode (API absent: every route keeps its `h1`, comics included, no expected
failures left); unit tests for each page's failure state including Try again; post-deploy smoke.

## Plan

Preflight per task: `npm run format:check && npm run lint && npm test`; the last task also
`VITE_DAILY_SALT=local npm run build && npm run e2e` and the real-data a11y run
(learnings, 2026-11-12).

### Task 1 — Shared read and status pieces
Files: `lib/waits.js` (`READ_DEADLINE_MS`), `lib/useSnapshotThenLive.js` (deadline, `retry`),
new `lib/useLiveRead.js`, new `components/LoadState.jsx`, `content/status.js` (`TRY_AGAIN`,
`SESSION_ENDED`, the stale-copy line), tests for each. Acceptance: a hung read fails at the
deadline; `retry()` re-runs the read and clears the failure; `LoadState` shows loading, WAKING
after the threshold, failure with a working Try again, and nothing once data is there.

### Task 2 — Public pages
Files: `Comics.jsx`, `HowItWorks.jsx`, `Collection.jsx`, `Denver.jsx`, `Stats.jsx`,
`ComicIssue.jsx`, `ComicEdition.jsx`, `MonthInReview.jsx`, `YearInReview.jsx`, `Item.jsx`, their
tests, `e2e/smoke.spec.js`. Acceptance: each page keeps header and `h1` on failure, says it failed
(never empty), offers Try again (test per page clicks it and sees the data); the #181 smoke marker
is gone and e2e passes in CI mode.

### Task 3 — Admin
Files: `Admin.jsx`, `AdminAnalytics.jsx`, `AdminWeekend.jsx`, `AdminCatalogue.jsx`, `AdminRadar.jsx`,
`AdminDiscover.jsx`, `AdminSpots.jsx`, `AdminClosetToday.jsx`, `AdminClosetReview.jsx`,
`AdminCloset.jsx` (`SESSION_ENDED` only), tests; `frontend/changelog.md` (one bullet for the
public change). Acceptance: Admin Home names failed reads with one Try again; no admin page in
#202 shows a bare "Loading…" or a raw error; one `SESSION_ENDED`.

## Ship notes

Frontend only. No migration, no env var.
