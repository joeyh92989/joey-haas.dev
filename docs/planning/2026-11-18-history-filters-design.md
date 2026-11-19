---
status: planned
kind: ui + feature
mode: auto
---

# History filters and place links (#348)

Story 9 of epic #339. Builds on the History page (#347, `docs/planning/2026-11-18-history-page-design.md`).

## Problem

`/admin/history` lists every outing with no way to narrow it. Joey wants to ask "what did we love in Boulder with the kid?" and "every outing at this place", and to reopen a filtered view from a link.

## Scope

In: filters for city, tag, verdict and kid-along (combined with AND); header counts that follow the filter; a "History" link on each spots-table row; filter state in the URL; an empty state; tag and city choices listing only values that exist in the outings.
Out: new history columns, export, text search, pagination, new routes.

## Mockup

Folder `docs/planning/mockups/2026-11-18-history-filters/` (gitignored). **Chosen: `b-filters-sheet.html`** at 400px and 1280px, light and dark. Rejected: `a-chip-rows.html` (always visible, but about 440px of chips before the first outing on a phone, and it grows with every tag and city) and `c-selects-row.html` (compact, but hides choices, uses a text glyph for the verdict shape, and departs from the design-system rule that a filter row is `FilterChips`). Pick made by the designer; reason: the page is mostly read and only sometimes filtered, so the list should stay at the top of a phone, and the Place filter from a spot link is just one more active-filter chip. A is the better call only if History is used mostly on desktop.

Acceptance: the built UI matches `b-filters-sheet.html` at 400px and 1280px in both themes.

## Solution

- **Backend (no new route).** `HistoryOutingOut` gains `tags: list[str]` taken from `Spot.tags` in canonical order (`spots.canonical_tags`). The route count pin (`seen == 34`) does not change. `OutingsOut.year` counts stay as the unfiltered server counts.
- **Filtering is client-side** over the already-loaded rows (the page has no pagination).
- **URL state** with `useSearchParams` (copy the pattern in `Denver.jsx`: copy params, set or delete, `setSearchParams(params, { replace: true })`): `city` (a city key), `tag`, `verdict` (`loved|fine|not-again`, check the real verdict values in `content/outings.js` and the backend enum), `kid=1`, `spot=<id>`. A value that matches no existing option is ignored (treated as unset) and not written back.
- **Choices come from the rows.** Cities: `spotCity(row)` keys that occur, Denver first then A to Z (reuse `cityCounts`-style ordering), labelled with `cityLabel`. Tags: tags that occur, in `TAGS` order, labelled from `content/denver.js`. Verdicts: Loved, Fine, Not again only (no "No verdict" choice). Counts per option come from the unfiltered rows.
- **UI (direction B).** A "Filters" button (44px) with an active count, the active filters beside it as removable chips (including "Place: <name>"), and the `Sheet` holding labelled `FilterChips` rows for City, Tag, Verdict. Kid-along is its own labelled row using a second `FilterChips` with `groups=[]` and one toggle ("Came along"); `FilterChips` already gives toggles their own row when there are no groups, so `FilterChips` itself does not change. A result line ("6 of 17 outings", with a Clear link) shows when any filter is on.
- **Header counts follow the filter.** With no filter, the server counts as today ("2026 so far: ..."). With any filter on, compute outings, distinct places and loved from the filtered rows whose `visited_on` falls in `data.year.year` (month and year outings are stored at their period start, so `visited_on` starts with the year), and the line reads "2026, filtered: N outings, M places, K loved." The result line counts all matches (so it can exceed the header when matches are older); the designer flagged this and it is intended.
- **Empty state.** "No outings match these filters." names the active filters and has a "Clear filters" button; the result line's own Clear link is hidden then.
- **Place link.** `AdminSpots.jsx` adds a "History" `Link` in the `td.spots-actions` cell to `/admin/history?spot=<spot.id>`, with an aria-label "History for <name>". `spot` filters rows by `spot_id`; the chip shows the name from the rows' `spot_name`, or "this place" when the spot has no outings.

## Decisions (my call, auto mode)

1. Tags need the backend field (rows carry none today); additive, no migration.
2. Header counts recompute on the client when filtered, because the server counts are for the unfiltered year.
3. Kid-along is a toggle row via a second `FilterChips` with no groups, so no shared component changes.
4. Unknown URL values are ignored, not an error.
5. No "No verdict" filter choice; the brief lists three verdicts.
6. Known gaps, on purpose: sheet focus return and keyboard testing beyond what `Sheet` already does; no persistence of filters outside the URL.

## Tasks

### Task 1: Tags on outings (backend)

Files: `backend/spots_routes.py` (`HistoryOutingOut`, `list_outings`), `backend/tests/test_spots_routes.py`, `backend/tests/test_public_outputs.py` if it pins outing fields.

- Add `tags: list[str]` to `HistoryOutingOut`, filled from the joined `Spot.tags` through `spots.canonical_tags` (null or empty becomes `[]`).
- Tests: an outing at a spot with tags `["kid-ok", "coffee"]` returns them in canonical order; a spot with no tags returns `[]`; the response still requires an admin session (existing 401 test stays).
- No new route; the `/api/spots*` count pin stays 34. Run `backend/tests/test_recs_response_models.py` to prove it.

### Task 2: Filters, sheet and place link (frontend)

Files: `frontend/src/pages/AdminHistory.jsx` (+ test), `frontend/src/lib/historyFilters.js` (+ test; pure parse, apply, options and counts), `frontend/src/pages/AdminSpots.jsx` (+ test), `frontend/src/content/outings.js`, `frontend/src/index.css` (`.history-*` additions), `frontend/CLAUDE.md` if a rule is worth recording.

- Build what the Solution section describes, matching `b-filters-sheet.html` at 400px and 1280px in light and dark.
- Pure logic in `lib/historyFilters.js`: parse params into a filter object (ignore unknown values), apply the filter, build the options with counts, and the filtered header counts. Test each, including: unknown param ignored, filters AND together, option lists show only values that exist, year counts use `data.year.year` and a Honolulu-TZ-safe date compare (the page's existing `process.env.TZ` test pattern).
- Page tests: the filter state is read from and written to the URL (`replace`), the header counts follow the filter, the empty state with Clear filters, the Place chip from `?spot=`, removing a chip updates the URL, the Kid toggle.
- AdminSpots: a "History" link per row with the aria-label.
- CSS: spacing only through `--space-*` tokens (a literal px needs a `space-exception` comment); 44px touch targets on the Filters button and chips; no horizontal overflow at 400px (`min-width:0; max-width:100%; overflow-wrap`).
- The verdict shows as a shape plus a word everywhere, never colour alone.
- Before the commit run the FULL frontend suite (`npm test`), `npm run format:check`, `npm run lint` and the build. All must be green; targeted runs are not enough.

## Ship notes

No migration, no new env var, no new outbound call, no new route. Smoke: the existing 130-check smoke; after deploy confirm a logged-out `GET /api/spots/outings` still returns 401.
