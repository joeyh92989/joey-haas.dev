---
status: planned
kind: UI / UX
mode: auto
---

# Main menu: a "More" group (#471)

## Problem

The masthead lists Home, About, Projects, My Shelf (Travel and Blog when
published). Now, Stats, TIL, Daily game, Denver and Colophon are reachable
only from the footer credit line. In the blind walkthrough a phone visitor
could not find `/denver` by menu, search ("places", "outings") or footer.

## Scope

In: a More disclosure in the desktop masthead, a second "More" group in the
phone sheet, search keywords so Denver is found by "places" and "outings",
tests, changelog, design-system note. Out: the footer site map (direction C
can follow as its own change), any change to the footer links.

## Chosen direction

Direction A, `docs/planning/mockups/2026-11-20-main-menu-more/a.html` (out of
git; also published as an Artifact). Rejected: B (one Menu at every width:
a modal on desktop and no current-page mark on the six pages) and C (the pages
stay in the footer, where they were already missed). Joey chose A on 2026-11-20.

## Solution

- `NAV_MORE` (new, in `layouts/RootLayout.jsx` beside `navItems`, or a small
  `lib/navMore.js`): Now, Stats, Daily game, Denver, Colophon, TIL. TIL shows
  only when `hasNotes`; Denver only when `hasSpots` (same rules as the
  footer's `hasNotes` and `hasSpots`). Travel and Blog stay primary.
- `SiteMast` renders `MoreMenu` (new component) as the last nav item: a
  button "More" with `aria-expanded` and `aria-controls`, opening a panel of
  links. Open and close: click, Enter/Space, Escape (focus returns to the
  button), outside click, following a link, focus leaving the panel. No
  focus trap (it is a disclosure, not a dialog). The button is underlined
  when the current route is one of its pages, except Daily game (see my
  calls). Arrow keys are not required.
- `MobileNavSheet` gets a second group labelled "More" under the primary
  links, then Resume (PDF). Same `NavSheet`, same links as the panel.
- Search: `row()` in `content/pages.js` takes an optional `keywords` array;
  `pageEntry` in `lib/searchIndex.js` folds it into the matchable text `s`
  but never into `sub`, the prerender or the sitemap. Keywords: Denver
  (places, outings, coffee, parks), Daily game (puzzle, guess), Colophon
  (stack, built with), Now (playing).
- Styles: plain CSS in `index.css`, tokens only, 24px target floor, 44px in
  the phone sheet, panel opens below the bar, light and dark, no animation
  beyond what `prefers-reduced-motion` allows.

## My calls (auto mode)

1. Daily game: listed in More; on `/daily` My Shelf stays the underlined
   item (it owns `/daily` through `also`) and the Daily row inside More is
   marked `aria-current`, More itself is not underlined.
2. Denver label: "Denver" in the masthead and sheet, with a second line
   "Places and outings" inside the desktop panel; the phone sheet row reads
   "Denver places". Search carries the keywords.
3. Width: with Travel and Blog both published the bar is tight near 900px. The
   implementer checks 761 to 1040px at Travel plus Blog; if the bar overflows
   or wraps, the nav hands over to Menu at a wider breakpoint than 700px
   (value chosen from the measurement, recorded in the PR).

## Tasks

1. **Search keywords.** `pages.js` `row()` optional `keywords`; `pageEntry`
   folds them into `s`. Tests: `searchIndex.test.js` ("places" and "outings"
   find Denver; keywords never in `sub`), `pages.test.js` (prerender rows
   unaffected). Acceptance: search finds Denver by "places" and "outings".
2. **MoreMenu and the masthead.** New `components/MoreMenu.jsx` (+ test),
   wired in `SiteMast.jsx`; items from `RootLayout`. Tests: opens, Escape
   returns focus, outside click closes, current-page marking, TIL and Denver
   hidden when absent. Acceptance: matches `a.html` desktop at 1040px.
3. **Phone sheet.** `MobileNavSheet` More group; update its and
   `SiteMast.test.jsx`. Acceptance: matches `a.html` at 390px; every public
   route is reachable from the menu or More.
4. **Width check and CSS.** Styles in `index.css` for both; measure 761 to
   1040px; adjust breakpoint if needed. `spaceScale`, `typeScale` and
   `designConsistency` tests stay green.
5. **Docs, changelog, e2e.** Entry under `## 2026-11-20` in
   `frontend/changelog.md`; a short Masthead paragraph in
   `docs/design-system.md`; an e2e case (open More, reach Denver) in the
   public suite; visual baselines regenerated on CI.

Model: Sonnet for all tasks. Ship notes: no migration, no backend change.
Visual baselines needed (shared chrome changes).

## Smoke check

On the deploy: `/` shows a More button in the masthead; opening it lists
Now, Stats, Daily game, Denver, Colophon; the phone sheet shows the same
under "More"; search "outings" returns Denver.
