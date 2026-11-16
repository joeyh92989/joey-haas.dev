---
status: planned
kind: fix
mode: auto
---
# Movie source disabled with a reason (#162)

## Problem
The Add page's Movie card reports "<source> source is not configured" (generic line from `backend/intake/kinds.py`, `_SHORT_REASONS` only knows BGG). Production has no visible `TMDB_API_TOKEN`, so Movie cannot work there. Joey's decision (2026-11-15): do not set the token now; disable Movie with a plain reason.

## Scope
In: `backend/intake/kinds.py` (add a TMDB entry to the short reasons so the reason names `TMDB_API_TOKEN` in plain words), the Add page's presentation of a not-configured source if it needs a change to show the reason and disable the card, and tests. Out: setting any env var (always-stop), the TMDB adapter, render.yaml.

## Decisions
My call: the reason text is owner-facing admin copy. Keep it short and plain, put it where other admin copy lives (see `frontend/src/content/adminCopy.js` and how BGG's reason surfaces), do not add inline JSX strings (issue #300 is moving them out).

## Acceptance
With no TMDB token, the source state for Movie reports not configured with a reason that names the missing token, and the Add page shows the Movie card disabled with that reason. With a token it behaves as before. Backend test for the reason; a frontend test for the disabled card if the card is frontend-rendered.

## Ship notes
No migration. No env change. After merge, Movie stays disabled in production until Joey sets `TMDB_API_TOKEN`.
