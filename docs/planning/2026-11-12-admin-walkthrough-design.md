---
status: planned
kind: fix
mode: auto
---

# Admin and shelf fixes from the 11 Nov walkthrough (design)

Issues: #161, #168, #169, #171, #172 (non-closet, non-sitting bullets). Branch
`fix/admin-walkthrough`. Plan: `2026-11-12-admin-walkthrough-plan.md`. #162 and #14 are
excluded at Joey's request (they need a production env var and a BGG registration).

## Problem

- The disabled Board game card prints the raw BGG setup message, which runs past the card (#161).
- Copy says twelve stores; `STORES` has 11 (#168).
- Admin Home's Site card says "Spot finder unknown" while the row says "scheduled" (#169).
- `/admin/collection` offers two ways to add (#171).
- Deleting a shelf item uses a browser `confirm()`, while a garment confirms in the page; the
  Collection list's Delete has no confirm at all; `/shelf` What it does cards read 01-04, 07 (#172).

## Scope

In: the above. Out: #162 (TMDB token in production), #14 (BGG adapter), comic sitting, closet.

## Solution and decisions ("my call", auto mode)

1. **#161:** `backend/intake/kinds.py` words BGG's state for people: `Needs a BoardGameGeek
   key; added by typing for now.` (the long registration text stays in logs/README, not the
   card); `.intake-kind` text wraps (`overflow-wrap: anywhere`, `min-width: 0`) so no future
   message can overflow.
2. **#168:** the three sentences drop the number (no hard-coded count to go stale); the
   How it works stat fallback `12 watched` becomes `11 watched`, since live status replaces it
   once loaded and it only shows with no snapshot. The dated post `how-spine-works.md` keeps
   its number: it was true when published.
3. **#169:** `jobsSummary` uses the row's `stateWords` (falling back to `state`), and a job
   that is merely scheduled for its first run does not count as unknown in the summary.
4. **#171:** the add bar is the one add path; the old Look up and one-line form fold behind a
   named disclosure, `Add with the full form`, closed by default and opened automatically when
   the pull list's `Own…` arrives with a prefill (that flow depends on it).
5. **#172:** one in-page confirm component (`ConfirmDelete`: `Delete for good` / `Keep it`, as
   the garment form has it) replaces `window.confirm` on the item page and guards the
   Collection list's Delete. The What it does cards keep their stop numbers (each card links to
   its stop on How it works) and say so: `Stop 07`, not a bare `07`.

## Sources

Admin code map (researcher, 2026-11-12): `frontend/src/components/intake/KindTile.jsx:14-37`,
`backend/intake/kinds.py:70-80`, `frontend/src/index.css:2289-2300`,
`frontend/src/content/projects.js:27`, `content/spine.js:83,152,170`,
`frontend/src/lib/adminJobs.js:189-200`, `lib/nightly.js:118-129`,
`frontend/src/pages/AdminCollection.jsx:119-134,567-580,837-846,985-990`,
`frontend/src/pages/AdminPullList.jsx:18-40`, `frontend/src/pages/AdminItem.jsx:531-546`,
`frontend/src/components/GarmentForm.jsx:146,301-327`, `components/FeatureStrip.jsx:15-25`.

## Open questions

None.

## Smoke check

`./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`; `/shelf` shows no "twelve".
