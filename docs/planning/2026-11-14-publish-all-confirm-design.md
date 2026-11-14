---
status: done
kind: ui
mode: auto
---

# Publish all confirms in place (#233)

## Problem

Publish all on `/admin/shelf/games` and `/admin/shelf/comics`
(`setAllVisibility` in `AdminCollection.jsx` and `AdminComics.jsx`) asked with
`window.confirm`. Everything else on the shelf confirms inline (#222), and the
Artifact and e2e environments refuse browser dialogs.

## Solution

Publish all becomes `ConfirmDelete` (the one inline two-step confirm): press it,
and the row swaps in "Publish 14 games to My Shelf?", "Yes, publish" and
"Keep it". Keep it does nothing. `setAllVisibility(true)` runs only from the
confirming button. An ESLint `no-restricted-globals` rule (`confirm`) and a
`no-restricted-properties` rule (`window.confirm`) keep browser dialogs out of
`frontend/src`.

## Decisions (my call)

- No mockup: the existing confirm component is reused, as design-system.md
  requires ("Destructive confirm ... never in a browser dialog").
- Reuse `ConfirmDelete` directly, not `ShelfConfirm`: publishing reads no
  delete preview; the count comes from the rows already on the page.
- Hide all stays ungated, as before: it only removes things from view.
  (The issue title says both; the code only ever gated Publish.)
- `ConfirmDelete` gains an optional `disabled` prop for the first button, so
  Publish all keeps its "busy / everything already public" disabled states.
- The confirming button keeps ConfirmDelete's danger styling; publishing a
  whole shelf is the consequential act, and one look for confirms is the rule.
- Words live in `content/shelfPublish.js`, with a singular for one row.
- No migration, no changelog entry (admin only).

## Tasks

- [x] Tests first: no `confirm` call, detail names the count, Keep it writes nothing, Yes writes once (both pages)
- [x] `ConfirmDelete` `disabled` prop; both pages use it
- [x] Lint rules; confirm they fire on `confirm()` and `window.confirm()`

## Smoke check

On `/admin/shelf/games` and `/admin/shelf/comics`: press Publish all, see the
count line; Keep it restores the button with nothing changed; Yes, publish
publishes and the count updates.
