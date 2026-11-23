# Backlog batch 2: shelf chrome (#470, #473, #474)

Sub-issues of epic #366 (the 2026-11-19 blind walkthrough). Spec and plan in
one, since the three touch the same files and ship as one PR.

## Re-verification (23 Nov 2026, built site on the e2e fixture snapshot)

Method: `public/snapshot` from `e2e/fixtures/snapshot`, `npm run build`,
`vite preview`, Chromium at 390 and 1440, measured with a script.

| Issue | Reproduces? | Evidence |
|---|---|---|
| #470 byline | Yes | No owner name on `/shelf/games`, `/shelf/comics`, an item page or `/daily`; `SpineHeader` had no byline and the detail pages had only the trail |
| #473 filters | Yes | Games at 390: search at y=743, first card at y=1180 (397px apart) with the count and Now playing between; four filter rows sit before the grid on a five-chip fixture, 25 pills on the real shelf. Display toggles (View, Comfortable, Dim finished) shared a row with Sort |
| #474 comics | Yes, partly | Cards in a row: lanes start at different heights (kind and volume lines differ); "Single book" has no explanation; the lede and "Showing the last saved copy." touch the figures; a game's trail was "My Shelf / title" and a comic's "My Shelf / Comics / title". Same-title twins cannot be shown with the fixture (all titles differ); the code path has no qualifier at all |

## Design

**Byline (#470).** `ShelfByline`: one 13px muted line, "Joey Haas's shelf ·
Part of joey-haas.dev", the link going to `/`. In `SpineHeader` it sits under
the name (so list pages, What's next, Year, Tour and Daily get it); on item,
issue and book pages `ShelfTrail` puts it above the breadcrumb. Chosen over
renaming the root crumb because the crumb's "My Shelf" is also the area name,
and the link back needs a place of its own. The link is 44px on a phone.

**Filters (#473).** `ShelfControls`: Filters button + sort left, Display group
right with a rule between. The filter rows live in a `hidden` panel (kept
mounted so "More…" survives). Closed at every width, not only on a phone: one
pattern, and at 1440 the five rows were also what pushed the grid down. The
button shows how many filters are on. Order of the page: search, result bar,
controls bar, grid; Now playing moves above the search so the count and the
first game stay together under it. Comics uses the same component.

**Comics (#474).**
- Twins: `titleQualifiers` picks the fewest of year, publisher and shape that
  separate same-title rows (falling back to "n of m") and `PosterCard` draws it
  in the link under the title. A grid with any twin keeps an empty line on the
  other cards so they stay level.
- Level cards: the kind and volumes block reserves three lines when any card
  on the page has volume lines or is a single book; titles clamp to two lines
  with a two-line minimum. Grid rows already stretch cards to one height.
- "Single book" gets a line on the card: "One collected book, not a run of
  issues" (`spine.comics.kindNotes`).
- Space: the figures take `mt-6`, the load line `mt-3`.
- One breadcrumb pattern: My Shelf / Games or Comics / the title.

## Tests

Unit: Games and Comics (disclosure closed and open, count in the button,
order, display group apart, byline, twins, reserve, single-book note),
`titleQualifiers`, `activeFilterCount`. Existing chip tests open the
disclosure through their render helper. E2E (`e2e/shelf-chrome.spec.js`):
first game within one screen of the search with no filter open at 390 and
1440; Filters button is 44px and toggles; equal card heights and lane
positions in a comics row.

## Not covered

Same-title twins on the real shelf are not exercised in the browser (no twin
in the fixture; unit-tested). Spine view cards carry no qualifier.
