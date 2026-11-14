---
status: done
kind: chore
mode: auto
---

# Test flakes (#227, #212) and the sweep's lessons (#236)

## Problem

- #227: `test_items_status.py` reads `TODAY` once at import, the server reads
  its own clock per request. A run crossing 00:00 UTC puts them a day apart,
  which the one-day tolerance then turns into three failures.
- #212: `AdminCollection.test.jsx` "reloads after a change" counted every
  method-less GET. The page also fetches `/api/intake/kinds` and
  `/api/intake/sittings` on their own schedule, so a count taken when the grid
  appears races them ("expected 2, got 4" under load).
- #236: five shelf-sweep lessons are not in `docs/learnings.md`.

## Solution

- `playthroughs.server_today()` is the one server clock for the status and pin
  routes; the status test file freezes it to its own `TODAY` with an autouse
  fixture. Reproduced first: with the clock a day ahead, exactly the three
  reported tests fail.
- The #212 test counts only `GET /api/items`, so it no longer depends on when
  other panels fetch. No timeout changed.
- Five entries added to `docs/learnings.md`.

## Decisions (my call)

- Seam in `playthroughs` rather than a freezing library: none is installed and
  the two call sites are the only ones that compare against a client date.
- Other flakes mentioned in the #212 comments (AdminLayout focus, AdminGarment
  timeout, Comics axe) are not reproduced here; left open, noted in the PR.

## Tasks

1. Plan doc.
2. #227 fix and test fixture.
3. #212 test fix.
4. Learnings.

Smoke check: none. No migration. No changelog entry (nothing user-visible).
