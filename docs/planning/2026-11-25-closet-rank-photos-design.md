---
status: planned
kind: feature (a setting control; small UI on existing pages)
mode: auto
---

# Closet picker: photo ranking on, an admin control, the result recorded (#555)

Story S11 of epic #539. Parent plan: `2026-11-20-closet-picker-week-design.md`.
The repo is public: no garment names here, in tests or in issues.

## Problem

Photo ranking is built (#401) and measured (#400) but sits behind
`closet_settings["rank.images"]`, which has no default and no admin control:
`rank_images_on` (`backend/closet_today_routes.py`) is true only for
`{"enabled": true}`, and the value has only ever been written by hand
(`backend/scripts/README.md`, the probe section). Nothing on Today says whether a
plan was ranked from photos.

Probe numbers (#400, https://github.com/joeyh92989/joey-haas.dev/issues/400):
text-only calls 1.3 to 9 s; with 10 to 16 thumbnails (86 to 134 KB) every call
succeeded in 24 to 40 s across four occasions and two rounds. Size is not the
limit; latency is.

## Scope

In: the switch on the Profile page with its current state; the profile GET and
PATCH carry it; the plan body records whether photos were sent, how many, and how
many shortlisted pieces had none; Today's footnote says so; the production flip
(Joey's step) recorded on the issue.

Out: the model order (S15), the week call (S12), any default change (the setting
stays off until Joey switches it).

## Solution

1. **Profile field, stored as the setting.** `GET /api/closet/profile` adds
   `rank_images: bool` from `rank_images_on`; `PATCH` accepts `rank_images: bool`
   (422 for anything else) and upserts `closet_settings["rank.images"] =
   {"enabled": <bool>}`. The setting stays where `rank_images_on` reads it, so
   nothing else moves; the profile is just its one editor.
2. **The control.** AdminClosetProfile gets a checkbox "Rank outfits from
   photos", built like the page's existing bike checkboxes, with help text: "Slower:
   about 25 to 40 seconds a plan instead of under 10." Saved with the page's one
   Save.
3. **The plan records it.** The plan body gains `photos: {"sent": n, "without":
   m} | null`: null when ranked from text (setting off, the template, or the
   text-only retry), else the number of shortlisted pieces whose photo was sent
   and the number shortlisted without one. Stored plans carry it; older plans
   without the key read as null.
4. **Today says so.** The footnote list (`AdminClosetToday.jsx`, beside
   `relaxedLines`) gains one line from a `photosLine(plan)` helper in
   `lib/closet.js`: "Ranked from photos: 14 pieces, 2 without one." or nothing when
   null. Copy in `content/adminCopy.js`.

## Decisions and tradeoffs

- **On the Profile page** (my call): it is the closet's one settings screen and
  already holds the nightly budget. No new page or route.
- **Keep the `closet_settings` row** rather than a profile column: no migration,
  and the probe script and README keep working.
- **No mockup** (my call): one checkbox and one footnote line in the existing
  patterns of those pages.
- **Joey flips production.** The story ships the control off; switching it on is a
  production setting change and is his.

## Smoke check

None: admin only.

## Plan

Model: Sonnet.

### Task 1: backend
- Files: `closet_routes.py` (profile GET/PATCH, `ProfileFields`, `profile_out`),
  `closet_today_routes.py` (plan body `photos`), `closet_schemas.py` if the
  profile or plan has a response model, tests in `test_closet_routes.py`,
  `test_closet_today.py`, `test_closet_response_models.py`.
- Tests: GET reports false with no row, true only for `{"enabled": true}` (not
  `1`, `"true"`, `{}`); PATCH true then GET true and `rank_images_on` true; PATCH
  false turns it off; PATCH `"yes"` is 422; PATCH without the key leaves it; a plan
  ranked with photos records sent and without counts; text-only, template and
  fallback record null.

### Task 2: frontend
- Files: `AdminClosetProfile.jsx`, `lib/closet.js` (`profileForm`, `profileBody`,
  `photosLine`), `AdminClosetToday.jsx`, `content/adminCopy.js`, tests
  (`AdminClosetProfile.test.jsx`, `closet.test.js`, `AdminClosetToday.test.jsx`).
- Tests: the checkbox shows the saved state and sends it; `photosLine` for null,
  counts, and zero without; Today shows the line.

### Task 3: docs
- `backend/scripts/README.md` probe section: the setting now has a control on the
  Profile page. `backend/CLAUDE.md` Closet line. Changelog "Behind the scenes"
  bullet under `## 2026-11-25`.

### Ship notes
No migration. After deploy, Joey turns it on from the Profile page; record on #555
the state before (read from the Profile page or the read-only query
`SELECT value, updated_at FROM closet_settings WHERE key = 'rank.images';`) and
after.
