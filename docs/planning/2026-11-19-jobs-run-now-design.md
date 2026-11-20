---
status: planned
kind: UI/UX (small, existing row pattern; no mockup)
mode: auto
---

# Jobs: real "Run now" on the safe, quick rows (#487)

## Problem
PR #511 relabeled every Jobs/Home "Run now" that only navigated to "Open <Thing>". The second half of #487's acceptance is still open: "Run now" should start a job and show started, done or failed. Today the Jobs page cannot start any job.

## Scope
In: a real Run now button on four rows: **Weekend forecast**, **Radar**, **Comic refresh** (followed series) and **Comic issues** (capped). Nothing else changes.
Out, and why (research, 2026-11-19):
- Spot finder, Closet opinions, Outfit plans, Discover: model calls (free chain; paid fallback off by default). Spot finder keeps its existing button on /admin/spots; the rest stay "Open ...".
- Intake nightly: its first step deletes sittings untouched for 30 days.
- Sources refresh: a full run from Render walks Shopify, which rate-limits Render's IP (the nightly sends only WooCommerce keys to Render). The per-source buttons on /admin/catalogue stay.
- Closet tags, Comic tags: spend free-quota strikes.
No backend change: an admin session already passes `require_admin` on all `JOB_ROUTES` (backend/items.py, pinned by tests/test_job_token.py). Every job route is synchronous and returns 409 while its lock is held.

## Endpoints (POST, `credentials: include` via `apiFetch`)
- Weekend forecast: `/api/spots/weather/refresh`
- Radar: `/api/recommendations/generate` body `{"kind":"radar"}`
- Comic refresh: `/api/comics/refresh`
- Comic issues: `/api/comics/issues/sync?budget=10`

## Behavior
- The row shows a button "Run now" (the existing `.job-run` styling and 24px floor) in place of the "Open ..." link for these four; the "Open ..." link stays reachable as a second link. Model: SpotFinder.jsx `runNow` (busy disables the button; errors go to a `role="alert"` line; a 409 reads "Already running"). Wording from `content/` per the adminCopyScan ratchet and docs/voice.md.
- States on the row: idle, "Running…" (button disabled, `aria-busy`), then "Done" with the finished time, or "Failed" with the error. After a run the page re-reads the job status so the row's last-run line is current. Sync calls may take minutes (comic issues): keep the state in the row, survive the user navigating within Jobs, and never fire twice.
- Each result is announced (`role="status"` / `role="alert"`).

## Tasks (tests first, vitest; targeted runs only)
1. Test and implement a `useJobRun` helper (lib) that POSTs, tracks idle/running/done/failed, maps 409 and network errors, and calls a refetch callback.
2. `JobStatusRow.jsx` accepts an optional `run` action (endpoint, body, label); AdminJobs.jsx and Admin.jsx JobsList pass it for the four rows (config in `lib/nightly.js` next to `runNow`).
3. Copy in `content/adminCopy.js`; CSS reuses `.job-run`, spaceScale/typeScale stay green.
4. Changelog bullet; update the admin e2e only if it clicks these rows.
5. Check in a real browser (local recipe: scratch DB, test-login): Weekend forecast and Radar can be pressed against a local backend with no keys only if their sources are mocked; otherwise verify the Running and Failed states against the real (failing, keyless) response and the 409 path by pressing twice.

Model: Sonnet. Ship notes: no migration. Smoke check after deploy: open /admin/jobs, press Run now on Weekend forecast (free NWS call, safe), confirm Done and an updated last-run line.
