---
status: planned
---

# V1 review fixes — spec and plan

## Problem

A max-level review of `main` (7789691, 2026-11-07) reported 15 verified
findings. Fixing them is the last step before calling the site V1. One
(TIL notes missing from ⌘K search) was already fixed by #94 and is out of
scope here.

## Scope

**In:** the 14 open findings, grouped below.
**Out:** the ComicVine key rotation (needs their support), BGG (needs a
registered app), the 0011 backfill question (needs a Neon count Joey runs;
see Open questions), a full Content-Security-Policy, and the
`date.today()` defaults on item create (minor, not in the reported 15).

## Proposed solution

### A. Privacy and analytics

1. **Beacon allowlist** (`backend/analytics.py`). Add `/stats`,
   `/shelf/comics`, `/til` and `/til/<slug>` to `_EXACT_PATHS` /
   `_PATTERNS`. Root cause fix: a new test parses the `<Route path=…>`
   lines of `frontend/src/App.jsx` (public routes only: not `admin`,
   `spine*`, `collection*` or `*`), fills each `:param` with a sample
   value, and asserts the beacon accepts it. A route added to the app
   without an allowlist entry then fails CI.
2. **Private-title scan** (`backend/next_list.py`). `_normalise` folds
   `&` and `+` to the word `and`; `_title_keys` also emits each key without
   a leading `the` when two or more words remain. Tests cover
   "Ratchet and Clank" vs "Ratchet & Clank" and "Legend of Zelda" vs
   "The Legend of Zelda".
3. **Public referrers** (`backend/analytics.py`, `analytics_routes.py`).
   The fold threshold counts visitor hashes, and a caller can vary the user
   agent to mint hashes, so no threshold on that data is safe. Recommended:
   publicly, a host is named only when it is in a short allowlist of known
   referrers (search engines, GitHub, Hacker News, Reddit, LinkedIn,
   Bluesky; Mastodon instances cannot be listed, so they fold) **and**
   clears the existing 5-visitor fold; everything else is summed into
   `referrers_other`. `/admin/analytics` is unchanged and still names every
   host. (Alternative in Open questions.)
4. **Public top pages** (`analytics_routes.py`). Before the public list is
   cut to ten, a `/shelf/<uuid>` path is kept only when that item is
   currently public. `summarise` takes an optional `keep_path` predicate;
   the public route builds it from one `SELECT id FROM items WHERE
   is_public`. The admin read is unfiltered.
5. **Changelog file links** (`frontend/src/content/changelog.js`). A
   root-relative href with a file extension (`/resume.pdf`,
   `/shelf/feed.xml`) renders as a plain `<a>`; only extensionless paths
   become router `Link`s.

### B. Backend 500s and the picker

6. **Source JSON** (`backend/sources/base.py`). A `read_json(response,
   source)` helper raises `SourceError` on a body that is not JSON; IGDB
   (token and query), TMDB and Comic Vine use it, as `llm.py` already
   guards Gemini.
7. **PATCH nulls** (`backend/items.py`). An `ItemPatch` validator refuses
   an explicit `null` for `type`, `title`, `is_public`, `favorite` and
   `following` with a 422. `times_completed` gets `le=999` on `ItemIn`
   (PATCH already refuses it).
8. **Duplicate external pair** (`backend/items.py`). Create and PATCH catch
   `IntegrityError` on `ux_items_external` and answer 409 "Already on your
   shelf", the comics and recommendations routes' wording; any other
   integrity error re-raises.
9. **Comics `_state`** (`backend/comics_routes.py`). `owned_format` is
   reported as `None` when the column is null instead of dereferencing it.
10. **Picker replays** (`backend/picker.py`). The waiting term and the
    stalled sort use `item.run_started_on or item.started_at`, as
    `_is_stalled` and the reason text already do.

### C. Frontend

11. **Beacon during the session check**
    (`frontend/src/lib/useAnalyticsBeacon.js`). Views made while
    `signedIn` is `null` are queued (path, ref, device as they were) and
    sent in order once it turns `false`; dropped if it turns `true`. The
    first view keeps its own referrer. Accepted limit: a visitor who leaves
    before the check answers is still not counted, because sending without
    a session answer would count the owner's own visits.
12. **"Finished this year"**. The backend (`public.py`) takes the year in
    the owner's zone (`America/Denver`, one constant) instead of UTC;
    the frontend takes the local year. `AdminCollection`'s hero figure uses
    the dashboard's playthrough count (exported from `lib/dashboard.js`),
    so the admin shelf, dashboard and `/shelf` agree on replays.

### D. Docs and ops

13. **Rollback doc** (`CLAUDE.md`). Replace the nonexistent
    `migrate_neon.py downgrade 0010` with the real by-hand step (`alembic
    downgrade 0010` from `backend/` with `DATABASE_URL_DIRECT` set), and add
    a short "Restore" section to `backend/migrations/README.md`: Neon's
    point-in-time restore, with retention to be checked in the console.
14. **Drift**. README routes table (`/now`, `/colophon`, `/stats`,
    `/shelf/how`, year and journal routes), the public diary and status
    endpoints, the migration range (0001–0011), the job-token route count
    (11); CLAUDE.md's CORS line (exact allowlist in `config.py`);
    changelog entries for search (#92), TIL (#93) and TIL search (#94).
15. **Render and dependencies** (carve-out, Milestone 2).
    - `render.yaml`: `GOOGLE_SHEETS_API_KEY`, `ANTHROPIC_API_KEY` and
      `BGG_TOKEN` as `sync: false` (existing values are kept); static-site
      headers `X-Frame-Options: DENY`, `Content-Security-Policy:
      frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`.
    - `backend/constraints.txt`: exact pins from the tested venv;
      `requirements.txt` keeps its floors; Render's build, CI's install and
      `pip-audit` read both, so the nightly redeploy installs what CI
      tested. README says how to refresh it.
16. **Resume PDF title**: see Open questions.

## Key decisions and tradeoffs

- **Referrer allowlist over a better count.** Counting distinct IPs per
  referrer would need a new column (a migration, plus storing an IP-derived
  hash), and a determined caller with several IPs would still get through.
  An allowlist closes the hole completely, at the cost of naming only
  well-known referrers publicly.
- **Constraints file over `==` in requirements.** Floors stay readable as
  "what the code needs"; the constraints file is "what was tested". One
  `pip freeze` refreshes it.
- **Queue, not send-on-unload, for the beacon.** Keeps the owner's own
  traffic out, which the hook's doc says is deliberate.

## Docs alignment

Follows CLAUDE.md on the changelog ("A shipped feature adds its entry"),
`/stats` privacy (no host under five visitors named), and route lists kept
in step by tests (as `prerender-lib.test.mjs` does for rewrites).

## Open questions

1. **Referrers:** allowlist (recommended), or keep naming any host and
   raise the fold to visitors on at least three distinct days (smaller
   change, still gameable over time)?
2. **Resume PDF:** re-export it yourself with a clean title (recommended,
   it stays your document), or let me rewrite only the PDF's `/Title`
   metadata to "Joey Haas — Resume" in place?
3. **0011 backfill:** the count query from the review, run on Neon. If it
   is not zero, a follow-up fixes those rows; not part of this PR.

## Smoke test strategy

After deploy: `./scripts/smoke.sh https://joey-haas.dev
https://api.joey-haas.dev`; then in the browser, visit `/stats` and a TIL
note and confirm the rollup counts them the next day; check
`curl -I https://joey-haas.dev/` shows the three headers; click the resume
link in the changelog.

## Plan

| # | Task | Files | Tests | Parallel-safe |
|---|---|---|---|---|
| 1 | Beacon allowlist + route-parity test | `analytics.py`, `tests/test_analytics.py` | parity test fails before, passes after | no (shares analytics.py with 3, 4) |
| 2 | Title scan `&`/`the` | `next_list.py`, `tests/test_next_list.py` | the two leak cases | yes |
| 3 | Public referrer allowlist | `analytics.py`, `analytics_routes.py`, tests | arbitrary host folds publicly, still named in admin | no |
| 4 | Public top pages filter | `analytics.py`, `analytics_routes.py`, tests | private uuid dropped publicly | no |
| 5 | Source JSON helper | `sources/base.py`, `igdb.py`, `tmdb.py`, `comicvine.py`, tests | HTML 200 raises SourceError | yes |
| 6 | PATCH nulls, times_completed cap, 409 on duplicate | `items.py`, `tests/test_items.py` | 422s and 409 | no (items.py) |
| 7 | Comics `_state` null | `comics_routes.py`, test | got on null format returns 200 | yes |
| 8 | Picker replay start | `picker.py`, `tests/test_picker.py` | replay scored from its run | yes |
| 9 | Changelog file links | `content/changelog.js`, test | `/resume.pdf` is an `<a>` | yes |
| 10 | Beacon queue | `lib/useAnalyticsBeacon.js`, test | queued views flush on false, drop on true | yes |
| 11 | Finished-this-year year and count | `public.py`, `Collection.jsx`, `Admin.jsx`, `AdminCollection.jsx`, `lib/dashboard.js`, tests | Denver year; replay counts 2 | no |
| 12 | Docs drift, rollback, restore, changelog | `CLAUDE.md`, `README.md`, `backend/migrations/README.md`, `frontend/changelog.md` | build parses changelog | yes |
| 13 | render.yaml env + headers | `render.yaml` | prerender-lib test still green | carve-out |
| 14 | Constraints file | `backend/constraints.txt`, `render.yaml`, `ci.yml`, `backend/README.md` | CI install + pip-audit | carve-out |

Each task is its own conventional commit with the relevant suite green.

## Milestones

```
Milestone 1 (auto): tasks 1–12
STOP — carve-out review (render.yaml, CI, deploy build command)
Milestone 2 (auto): tasks 13–14
Finish gate → PR
```

## Environment tests

Backend: `cd backend && ./.venv/bin/pytest` (one run at a time).
Frontend: `cd frontend && npm test && npm run build`.
Local run of `/stats` with the worktree API on the dev database, per the
worktree verification notes.
