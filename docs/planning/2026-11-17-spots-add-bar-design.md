---
status: planned
kind: ui
mode: auto
---

# Add bar on /admin/spots (#341)

Story 2 of epic #339 (places and outings). Brief: `docs/planning/2026-11-15-places-outings-brief.md`,
section 1. Builds on #340 (`docs/planning/2026-11-17-place-kind-intake-design.md`).

## Problem

`/admin/spots` adds a place through a form with a coordinates field. #340 added a full page,
`/admin/places/add`, but the Spots page itself still opens `SpotForm` ("Add by hand"). The owner
wants to type a name, pick the match and be done, from a phone, on the page where spots live.

## Scope

In:

- An add bar on `/admin/spots`: submit a name, see the matches, add one, and the spot appears in
  the table. Several or no matches show the choices before anything is saved.
- City (default Denver), the six existing tags, blurb and the public flag are set at the same
  step; a new place is private unless marked public (Denver only, as #340 decided).
- The coordinates form stays reachable ("Add by hand").
- Component tests for ready, several, none and error; an admin browser test for add by name with
  the search answer stubbed.

Out: paste (#342), city column and filter (#343), history, the Log an outing sheet, any backend
change (the single-call path `POST /api/intake/add` already writes a place; see Decisions).

## Solution

```mermaid
sequenceDiagram
    participant O as Owner (/admin/spots)
    participant B as SpotsAddBar
    participant S as GET /api/intake/search?area=places
    participant A as POST /api/intake/add
    participant T as spots table (GET /api/spots)
    O->>B: Search "Red Rocks" (Enter or button; typing sends nothing)
    B->>S: one request
    S-->>B: rows (title, address, category, map_url, owned_spot_id, ...)
    B-->>O: one row open with fields, or a list of rows with Add
    O->>B: Save place (city, tags, blurb, public)
    B->>A: {kind: "place", chosen, payload: {...}}
    A-->>B: 201 {spots_new: [{id, name}]} (or 200 already owned, 422 refused)
    B->>T: re-read the spots
    B-->>O: "Saved <name>"; the table row is marked New
```

Design: **direction A, panel above**, chosen by the designer in auto mode.
Mockup: `docs/planning/mockups/2026-11-17-spots-add-bar/a-panel-above.html` (out of git).
Rejected: **B, in the table toolbar** (two search boxes in one row that behave differently, a
half-width column for the fields on desktop, and on a phone the bar sits under the finder queue).
The bar is a full-width panel between the page header and the finder/table columns, with the
results and the open row inside it. Behaviours the mockup draws: eight states (empty, searching,
one result open, several, none, already saved, failed, saved with the new row in the table),
dark and light, 1100 and 400 px; "Add by hand" is a plain `.btn` in the header; the bar has its
own `role="status"` line and a failure `.admin-error` with `role="alert"`; the saved line has a
"Show in table" link that clears a filter hiding the row, scrolls to it and focuses it.

## Decisions (my call, auto mode)

1. **No sitting, one call.** `POST /api/intake/add` (`AddIn`: `{kind: "place", chosen?, payload,
   today?}`) runs `commit_one` with its place branch: the same validators, advisory lock, owned
   check and Denver-only public rule as the sitting commit. The bar therefore has none of the
   sitting lifecycle of `/admin/places/add` (no `ensureSitting`, `parkEntry`, `retryGone`), which
   removes the whole class of stale-id bugs #340 hit. The answer carries only `{id, name}`, so the
   page re-reads `/api/spots` to show the new row (as `rereadSpots` already does).
2. **Reuse, do not copy.** `components/places/PlaceFields.jsx` (`emptyFields`, `fieldsPayload`,
   `effectiveCity`) and `PlaceResultRow.jsx`, and the words in `content/placesAdd.js`. The new
   component is `components/places/SpotsAddBar.jsx`; `components/intake/AddBar.jsx` is not reused
   (it always draws Photos and a disabled barcode button and is built for sittings).
3. **The mark on the new row is client state only**: a "New" pill and tint until the next search or
   the next save. No backend field, no timer.
4. **"Already saved" is a text mark plus "Show in table"** (the designer's call), not a link that is
   the whole mark as in #340. When the row is hidden by the table filter, the link clears the filter.
5. **Add by hand carries the typed name** into the `SpotForm` Name field (the designer's
   suggestion; one prop on `SpotForm`, the coordinates path is otherwise untouched).
6. **New words** are added to `content/placesAdd.js` (the repo keeps admin copy in `content/`):
   "Add a place by name", "Add by hand" (for "Type it by hand" in this panel), "Show in table",
   and a shorter hint. They follow `~/.claude/references/writing-rules.md`.
7. **Tags and city rules are #340's:** the existing six tags; city select defaults to Denver; the
   public toggle is disabled with a hint unless the city is Denver; the server enforces it (422).
8. **The table has no city column** (that is #343); a place saved under another city looks like any
   other row until then. Recorded, not fixed here.
9. **The browser test stubs the search answer, not Nominatim.** `page.route` on
   `GET /api/intake/search?area=places*` in `frontend/e2e/admin.spec.js`; the add call is real
   against the e2e backend and database. No new env var, no backend seam, no production setting.
10. **Changelog:** no entry, as for #340 (owner-only page); the owner's open call on admin-only
    entries is unchanged.

## Sources

`frontend/src/pages/AdminSpots.jsx` (Add button, `SpotForm`, table, `rereadSpots`, `act`),
`frontend/src/components/SpotForm.jsx`, `frontend/src/components/places/*`,
`frontend/src/content/placesAdd.js`, `backend/intake/routes.py` (`/add`, `AddIn`),
`backend/intake/commit.py` (`commit_one`, `write_places`, `spot_answer`),
`frontend/playwright.admin.config.js`, `frontend/e2e/admin.spec.js`, `docs/design-system.md`,
`docs/planning/2026-11-17-place-kind-intake-design.md`.

## Open questions

- Does `GET /api/intake/search` need anything beyond the admin session? (The bar sends the same
  request `/admin/places/add` does, so no.)
- The "Show in table" scroll and focus on a row inside a horizontally scrolling table panel at
  1100: verify by test and by screenshot.

## Smoke check

After deploy: `/admin/spots` deep-links with a 200 (it already does); Joey opens it, searches one
real place, adds it, and sees the row marked New in the table, private.

## Plan

All tasks are Sonnet. One implementer at a time. No backend change, no migration.

1. **SpotsAddBar component.** `components/places/SpotsAddBar.jsx` (+ test), words in
   `content/placesAdd.js`, a `spots-addbar-*` block in `index.css` (tokens only). All eight states
   of the mockup, the single-call save through `POST /api/intake/add`, 409/422/network messages,
   in-flight guard, the status and alert lines, focus moves as in `/admin/places/add`. *Accept:*
   matches `a-panel-above.html` at 1100 and 400, dark and light; tests for ready, several, none,
   failed, already saved, saved (answer 201 and 200), a 422 refusal showing `refused[0].message`;
   typing alone makes no request; two synchronous presses make one request; a non-Denver city
   disables the public toggle; the fake API is faithful to `/add` (201, 200 owned, 422 refused).
2. **Wire it into AdminSpots.** Render the bar between the header and the finder/table columns,
   re-read spots after a save, mark the new row, "Show in table" (clear a hiding filter, scroll,
   focus), "Add by hand" keeps opening `SpotForm` and carries the typed name. *Accept:* the
   existing `AdminSpots.test.jsx` tests pass untouched; new tests for the new-row mark, Show in
   table with a filter active, and Add by hand carrying the name; no horizontal scroll of the page
   at 400.
3. **Admin browser test and docs.** An `admin.spec.js` case: search by name (stubbed answer), add,
   the row appears in the table of the real e2e backend; `frontend/CLAUDE.md` (the bar and its
   single-call path), `docs/design-system.md` if it lists page parts. *Accept:* `npm run e2e:admin`
   case passes locally (needs local Postgres and ports 8000/4173) or is run by the `e2e-admin` CI
   job; docs match the code.

Ship notes: no migration, no env var, no `render.yaml`. CI gates in each brief: `npm run lint`,
`npx prettier --check .`, `npm test`, `VITE_DAILY_SALT=local npm run build`,
`npm audit --omit=dev --audit-level=high`; the `e2e-admin` job.
