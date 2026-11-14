---
status: in-progress
kind: ui
mode: auto
---

# Tag chip groups on the admin shelf (#231)

## Problem

#229 added Play style, Setting and Tone chip groups to `/shelf/games` and
Genre and Form to `/shelf/comics`. Their admin twins, `/admin/shelf/games`
and `/admin/shelf/comics`, have none, against the twin rule in
`docs/design-system.md` (twins share their filters).

## Solution

Wire the same pieces the public pages use, over the admin's rows:

- Games: `tagChipGroups('game', rows, { maxShare: MAX_SHARE, selected: filters, limit, moreLabel })`
  appended to the toolbar groups after Status, `filterByTags` on the visible
  rows, `hasTagFilter` in `filtered`, tag keys in the filter state
  (`noTags('game')`), reset by Clear filters.
- Comics: Genre and Form (not Based on, which is shown, not filtered) from
  `tagChipGroups('comic', rows)`, picked state alongside `publisher`,
  `filterByTags` over the rows, cleared by Clear filters.
- Admin rows carry `tags` (the API sends it on every item); the comics
  `asRow` passes it through.

## Decisions (my call)

- No mockup: it reuses `FilterChips` and the public page's look.
- Counts come from the admin's rows, private included, so the more-than-half
  rule applies to what the admin page shows.
- Games applies the public `MAX_SHARE` rule and the Play style limit of 8;
  admin Comics, like public Comics, applies no share rule.
- Tag filters are not persisted, as on the public pages (only chip and sort
  are, for comics); no new `shelf.admin.*` key.
- No design-system change (the twin rule already covers it), no migration, no
  public changelog entry (admin only).

## Tasks

1. Tests mirroring `Games tags` and Comics `tags` cases on the admin pages.
2. Wire `AdminCollection.jsx`, then `AdminComics.jsx`.
3. Preflight: full `npm test`, lint, format, build, e2e.

## Smoke check

Open `/admin/shelf/games`: Play style and Setting groups appear, pressing a
chip narrows the grid and Clear filters restores it. Same for Genre and Form
on `/admin/shelf/comics`.
