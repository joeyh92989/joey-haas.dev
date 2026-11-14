---
status: shipped
kind: feature
mode: auto
issue: 230
---

# Jobs rows for the comics refresh and comic tags

## Problem

Two nightly steps leave no trace on `/admin/jobs`: the followed comics
refresh (`POST /api/comics/refresh`, first in the nightly) and the comic
tags (`POST /api/comics/tags/generate`). A failed run shows only in the
GitHub Actions log. The comic issue sync got a row in #219; these two
should match it (learnings: a job a deploy relies on needs a Jobs row).

## Solution

Same pattern as the issue sync:

- Each run is a `catalogue_runs` row with its own source, `comic_refresh`
  and `comic_tags`. `catalogue_runs.source` is `String(40)`, not an enum,
  so there is **no migration**.
- The run row is committed at once, finished ok / partial / failed at the
  end, and failed (with the exception as an error) if the route raises,
  before the exception is re-raised, so the job still fails the way it
  does now.
- `GET /api/comics/status` returns `issues.last_run` (unchanged),
  `refresh.last_run` and `tags.last_run`.
- `lib/nightly.js` gets two `runRow`s, `lib/adminJobs.js` reads the new
  keys.

Run meaning:

| Job | ok | partial (`short_run`) | failed |
|---|---|---|---|
| refresh | no series errors | never | any series error, or an exception |
| tags | not stopped on `model error` / `no model` | stopped on `budget` / `time`, with series left | stopped on a model failure, no model configured, exception |

## Decisions (my call)

- No mockup: admin UI reusing the existing `runRow`.
- Admin only: no public changelog entry.
- Route responses and the job-token whitelist are unchanged; the summary
  bodies keep every existing key.
- Refresh counts: `rows_seen` = followed series, `rows_changed` =
  refreshed, errors `{code: source_error, detail, item_id}`.
- Tags counts: `rows_seen` = untagged queue, `rows_changed` = tagged,
  `unresolved_remaining` = waiting. An unusable single answer is an error
  entry but does not fail the run (it retries next night, as now).
- The "No model is configured" 503 is recorded as a failed run too.
- Jobs page stays "stale" after 36 hours like the other rows.

## Tasks

1. Backend: record runs in both routes; status returns three keys.
2. Backend tests: run rows (ok, failed, exception, partial), status read.
3. Frontend: `adminJobs.js` reads both keys; two `runRow`s; tests
   (`nightly.test.js`, `AdminJobs.test.jsx`, `Admin.test.jsx` count 11 to 13).
4. CLAUDE.md: the Comic issue pages and Tags paragraphs name the new rows.

## Smoke check

After deploy, run the nightly (or the two routes by hand); `/admin/jobs`
shows "Comic refresh" and "Comic tags" with a time instead of "No run
recorded".

## Ship notes

No migration. Merge, then wait for the nightly or run the two job routes.
