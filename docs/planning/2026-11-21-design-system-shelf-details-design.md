---
status: planned
kind: UI (page bodies)
mode: auto
issue: "#533, epic #519"
---

# Design system: shelf details

## Problem
The shelf lists (#532 slice a) are on record cards and the spine view. The detail pages still use hand-written CSS: the item page, comic title, volume and issue pages, Year in review and Month in review.

## Scope
In: `pages/Item.jsx`, `pages/ComicVolume.jsx`, `pages/ComicIssue.jsx`, the comic title page (find it: the route `shelf/comics/:id` public side), `pages/YearInReview.jsx`, `pages/MonthInReview.jsx`, and components used only by them (`CoverTile`, neighbour strip, and the like), using a Breadcrumb (a plain `nav` with an ordered list, `aria-label="Breadcrumb"`, `aria-current="page"` on the last item, built in the #528/#531 style, eager-safe: no Base UI), the Record card and the status mark per `docs/design-system.md`.
Out: the shelf lists, admin pages, Stats, prose pages.

## Look
Mockups (on disk only) have no detail page; follow `docs/design-system.md`, the spike spec `docs/planning/2026-11-20-design-system-spike-design.md`, and the merged Home, prose, tools and shelf-list pages for patterns (`RecordCard`, `StatusMark`, `CatalogueNumber`, `shelf-classes.js`, `prose-classes.js`, `buttonVariants`, `cx`, `badge-variants.js`). Tokens win.

## My calls
- Behaviour, routes, canonical forms, link-preview heads (prerendered: diff built HTML heads against main), the neighbour strip, ids, aria, heading levels, test hooks and data reads stay identical; only look and primitives change. No new API call.
- Catalogue numbers appear on collections only; on a detail page show the same number the list shows for that entry (use `lib/catalogue.js`) only if the data is already at hand without a new read, otherwise omit and say so.
- Eager vs lazy: check `App.jsx`; eager files must not import `cn`, `ui/*` except `*-variants.js`/`*-classes.js`, or Base UI; keep the designConsistency guard and `scripts/check-entry-chunk.mjs` green; report entry size vs main.
- Whole-card and neighbour-strip links painted rings (inset, pixel-tested focused vs unfocused, both themes); no clipping `overflow` over a ring. Coloured text uses `-text` tokens; no opacity on text; zero sideways scroll at 320 to 1440 with long titles and many tags.
- Item pages on a cold API (skeleton and waking line, see root CLAUDE.md "Item pages on a cold API") must still behave: keep those states and test them.
- Legacy classes stay where other CSS/tests/admin read them until #536; remove CSS only these pages used.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, the root CLAUDE.md sections on item pages, and the merged shelf-list slice (PR #572) with its tests and e2e as the pattern. Inventory the detail pages' hand-written card/chip/header CSS and who else uses each class (grep src, e2e, scripts, admin).
2. Add the Breadcrumb component with tests; rebuild Item, comic title, volume, issue, Year and Month.
3. Tests first (run against old code, say which failed); Playwright overflow, ring pixel, axe both themes on every route; prerendered head diff vs main.
4. Verify: lint, format, full npm test once, build with and without the fixture snapshot, check-entry-chunk, targeted e2e (`--workers=1`); view ALL screenshots (each page type, 320/390/1280/1440, both themes) and count them. Baselines regenerate on CI (mine).

## Ship notes
No migration, secrets or render.yaml change. Changelog: one plain bullet. Smoke: an item page, a comic title, `/shelf/year`, in both themes; smoke titles unchanged.

## Sources
`docs/design-system.md`, `docs/planning/2026-11-20-design-system-spike-design.md`, `frontend/CLAUDE.md`.
