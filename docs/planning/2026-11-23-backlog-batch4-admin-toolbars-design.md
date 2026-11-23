---
status: done
kind: UI / UX (admin only)
mode: auto
---

# Batch 4: admin list toolbars (#495) and the shared table wrap (#459)

## Problem

- **#495** (part of #366/#468): the admin Games header mixed primary links, bulk
  actions and the Shelf/List toggle in one wrapping row; the add bar's
  placeholder was cut at 390px; the barcode button was a bare glyph.
- **#459**: a visually-hidden span in a table header cell escapes
  `.item-table-wrap` (overflow-x:auto, not positioned) and widens the page.

## Re-verification first (390 and 1280, mocked admin fixtures, built app)

| Claim | Result |
|---|---|
| Games header crowded, groups mixed | Reproduces at 390 (Add games, Publish all, Hide all, Refresh and Shelf/List interleaved in loose rows) |
| Add placeholder clipped at 390 | Reproduces: 441px of text in a 169px field; fine at 1280 |
| Glyph-only buttons | The three glyph buttons already carry `aria-label`s; the barcode button (and only it) shows no word. Partly reproduces |
| Closet "From links" full width beside a boxed glyph | The add bar was a 3-column grid holding up to five items; it wraps oddly when "From a file" and "From links" are offered. Reproduces by construction (grid auto-placement) |
| #459 on `/admin/spots` | Does **not** reproduce: `AdminSpots` already wraps its table in `relative overflow-x-auto` (slice 3 of #535, #576) and `admin-denver-site.spec.js` pins `position: relative` and no page scroll. The class the issue names is now used only by the Games list view table |

## Design (my call)

- **Header groups, not a redesign.** `AdminPageHeader` keeps its one slot; the
  page fills it with three groups that each wrap inside themselves:
  primary (View link, Add games), **Bulk actions** (`role="group"`, Publish all,
  Hide all, Refresh metadata), and the existing Shelf/List toggle. Why: the
  header component stays shared and untouched; a confirm opening in one group
  re-wraps only that group. On a desktop the bulk group is set off by a rule on
  its left; at 700px and below it takes a row of its own. Same on Comics.
- **Add bar is a flex-wrap row**, with the field on its own row on a phone
  (`basis-full`) and growing beside the buttons from 701px. A grid of three
  columns cannot hold five items. The placeholders are shortened to fit the
  narrowest phone ("Add a piece, or ▤ Photos"): placeholders cannot wrap, so
  shorter text is the only fix that works at 320px.
- **Every add-bar button shows a word**: the barcode button reads "Scan"
  (its `aria-label` already contains it, so the visible text is part of the
  accessible name).
- **`ITEM_TABLE_WRAP` gains `relative`**: defensive and cheap, so no table
  using the shared class can be widened by a hidden span. Spots needs nothing.

## Scope

In: `AdminCollection`, `AdminComics` headers, `AddBar` (the Games, Comics and
Closet toolbar) and its classes, `ITEM_TABLE_WRAP`. Out: Closet intake
internals, public shelf chrome, `AdminPageHeader`, `.github/`.

No public changelog entry (admin only). No migration.

## Tasks

1. Header groups on Games and Comics. Test: `AdminCollection.test.jsx` group
   test. Done.
2. Add bar: layout, placeholders, "Scan". Tests: `AddSection.test.jsx`
   (no glyph-only button; placeholder). Done.
3. `ITEM_TABLE_WRAP` `relative`. Test: e2e list view at 390.
4. `e2e/admin-toolbars.spec.js` (desktop project, in the default config):
   no clipped placeholder and no glyph-only button on Closet add and Games at
   320 and 390; bulk group present; confirm does not move Add games; list table
   inside its wrapper, no sideways scroll.

## Smoke check

None needed beyond CI: admin routes are behind sign-in and have no
prerendered content change.
