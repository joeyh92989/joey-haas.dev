# Discover follow-ups — Plan

Spec: `docs/planning/2026-09-28-discover-followups-design.md`. Branch
`fix-discover-dupes` from `8733c4e`. No migration.

## Tasks

### Task 1: One pick per game
**Files:** `backend/discover.py`, `backend/tests/test_discover.py`.
- `prescore` keeps the best-scoring candidate per `igdb_id`; ties go to the
  platform latest in `radar_load.DISCOVER_PLATFORMS`' reverse order
  (508 > 130 > 4), then the existing ordering.
- Tests: the same game on 130 and 508 yields one candidate, the higher
  score; a tie keeps 508; different games unaffected; `fallback` over a
  duplicated pool returns no title twice.
- Commit: `fix(tracker): suggest each game once in Discover`.

### Task 2: The overload note
**Files:** `backend/recommendations_routes.py`,
`backend/tests/test_discover_routes.py`.
- `_failure_note`: "overloaded" → "Gemini is overloaded; try again in a
  few minutes"; "error code: 529" → "The model is overloaded; try again in
  a few minutes". Checked before the generic "did not answer".
- Tests: two new parametrised cases, using `llm.py`'s overload wording.
- Commit: `fix(tracker): say when the model is overloaded`.

### Task 3: Rate a few as a table
**Files:** `frontend/src/components/RateAFew.jsx`, `RateAFew.test.jsx`,
`frontend/src/index.css`.
- Table: caption-less `<table>` with header row Game / Rating / (score);
  title plus " · platform" when set; QuickRate labelled
  `Rating for <title>` via a wrapping group; score cell "—" or
  "N/10 saved".
- State: `shown` ids fixed on first render (first six unrated, finished
  games); `scores` map for this session. A rating PATCHes and records the
  score; a clear PATCHes `{rating: null}` and removes it. `onRated` still
  fires after each save. **Next few** appears when every shown row is
  rated and unrated games remain beyond them; it shows the next six.
- CSS: max-width 36rem, striped rows via `--surface`/`--surface-raised`,
  highlighted row on `:hover` and `:focus-within`, tokens only.
- Tests: rows are table rows with the title and platform; rating shows
  "8/10 saved" and the row stays; re-rate PATCHes the new value; clear
  PATCHes null and shows "—"; Next few; Not now still persists; a failed
  save shows the error and no score. Existing tests adjusted to the
  table.
- Commit: `feat(tracker): lay out Rate a few as a table`.

## Commit boundaries

| # | Commit | Files |
|---|---|---|
| 1 | one per game | 2 |
| 2 | overload note | 2 |
| 3 | table | 3 |
| 4 | these docs | 2 (committed before Task 1) |

Tasks 1–3 are parallel-safe (no shared files); run sequentially anyway.

## Zones

```
Zone 1 (auto): tasks 1–3
CHECKPOINT — finish gate (7 files changed, so an ultra review: parallel
reviewers per dimension, each finding verified) + PR draft
```

## Automated environment tests

- Before merge: backend suite, frontend suite, ruff, prettier, eslint,
  build.
- After deploy: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`;
  owner generates once; I read the list (GET) and confirm no title twice
  and the ranking note; Render logs clean (`&q=Traceback`, `&q=ERROR`).
