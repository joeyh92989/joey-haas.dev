---
status: done
kind: feature
mode: auto (Joey's stops from the shelf sweep run; no stop on item 4)
---

# Delete, bulk delete, redo, and discard an empty sitting

Shelf sweep queue, item 4 (`docs/planning/2026-11-12-shelf-sweep-queue.md`).
Rules: `docs/design-system.md`.

## Problem

Delete exists only in the admin List view and at the bottom of the edit page
(`ConfirmDelete`, inline). A Shelf-view card has no delete, there is no bulk
delete, no way to send a bad result back through intake, and an unfinished
sitting announced on the Shelf ("Game · Nov 11, 7:42 PM is unfinished") has
no Discard there. The confirm never says what goes with the row.

## Scope

In:
- Delete in a card's controls on admin Games (`ShelfCardActions` panel) and
  admin Comics (`ComicActions`).
- Admin Comics card controls behind the same "…" toggle on touch devices
  that `ShelfCardActions` uses (item 3 gap).
- Multi-select bulk delete in the admin Games List view, in the existing
  selection bar beside bulk set.
- Redo on a row: the item is removed and comes back as one intake entry in
  a sitting, ready to match again.
- Discard on the unfinished-sitting line (`UnfinishedLine` in
  `AddSection.jsx`) when it names one sitting.
- Every delete, redo and discard confirm names the row and what goes with
  it, with real counts.

Out:
- Undo. A delete is final (the API has no soft delete); the confirm is the
  guard.
- Comics List view and multi-select (Comics has one view).
- Replacing `window.confirm` on Publish all / Hide all (leftover, noted).

## Design (small; no mockup round)

Built only from existing parts, so no new pattern needs a rule:
`ConfirmDelete` (inline two-step: "Delete" → "Delete for good" / "Keep it"),
the `ShelfCardActions` panel and its touch "…" toggle, the List view's
selection bar, and `UnfinishedList`'s inline discard ("Discard {name}?" →
"Yes, discard" / "Keep it").

- `ConfirmDelete` gains an optional `detail` line shown in the armed state,
  e.g. *"Waterworld goes with its 4 issue records."* or *"Hollow Knight goes
  with 2 playthroughs and 11 journal days."* A row with nothing attached
  says only its name.
- Card Delete: last control in the panel, `danger` style. On success the
  card leaves the grid and a status line says "Deleted “X”."
- Bulk: the selection bar gets "Delete N" (a `ConfirmDelete` whose subject
  is "N items" and whose detail lists up to three titles, "and N more",
  then the totals that go with them). The selection clears on success and
  stays on failure, as bulk set does.
- Redo: on the List view row and in the card panel, beside Delete. Its
  confirm reads "Redo “X”? It leaves the shelf and comes back as an entry
  in Add to match again" plus the same detail line (its playthroughs,
  journal and issue records go with it). On success the page navigates to
  the sitting.
- Banner Discard: shown only when the line names exactly one sitting. With
  two or more the line already links to the Add page's list, which has
  Discard per sitting.

## Backend

- `POST /api/items/delete-preview` `{ids: [uuid] 1–500}` →
  `{items: n, playthroughs, play_sessions, comic_issues, pick_events,
  titles: [first 3]}`. Read-only counts over the cascading tables
  (`models.py`: `pick_events`, `playthroughs`, `play_sessions`,
  `comic_issues` are `ON DELETE CASCADE`; nothing blocks an item delete).
  Pick events are counted but not shown (history the owner doesn't think
  of as part of the row).
- `POST /api/items/bulk-delete` `{ids: [uuid] 1–500}` → `{deleted: n}`.
  All-or-nothing in one transaction; an unknown id is a 404 naming it and
  deletes nothing. A POST path, not `DELETE /bulk`, because
  `DELETE /{item_id}` would shadow it (`items.py` route-order note).
- `POST /api/items/{id}/redo` → `{sitting_id, entry_id}`. One transaction:
  find the newest unfinished intake sitting for the shelf area with the
  item's kind, or create one; add one entry built the way
  `POST /api/intake/sittings/{id}/entries` builds a typed entry (title, and
  the item's external source and id as the chosen match so the owner can
  keep or change it); delete the item. The entry's state is the one that
  asks for a check, not ready, so nothing commits without a look.
- All three are admin-only through the routers' existing `require_admin`;
  none joins `JOB_ROUTES`. No public endpoint changes, so
  `test_public_outputs.py` is untouched.

LLM requests: none added. Migration: none.

## Decisions (my calls; the queue left these open)

1. Counts come from the server (`delete-preview`) rather than per-type
   boilerplate, so the confirm is true for each row.
2. Bulk delete is all-or-nothing, like bulk set.
3. Redo reuses the newest unfinished sitting of the same kind, so several
   redos in a row land together rather than leaving one sitting each.
4. Redo's entry asks for a check: a redo exists because the match was
   wrong.
5. Discard on the banner only for a single sitting; the multi-sitting line
   already leads to per-sitting discard.

## Smoke check

- Smoke green. `POST /api/items/bulk-delete` without a session answers 401
  (not 404) once live.
- By hand, signed in, nothing deleted: open a card's panel and see Delete
  and its armed detail, then Keep it.

## Plan

TDD per task; one backend pytest run at a time (`ps aux | grep '[p]ytest'`).

1. **Delete preview + bulk delete (backend).** Routes in `backend/items.py`
   declared before `/{item_id}`; models for both bodies with the 1–500 cap.
   Tests in `test_items_bulk.py` (or a new `test_items_delete.py`): counts
   per table, cascade actually removes child rows, unknown id → 404 and
   nothing deleted, cap 422, unauthenticated 401.
   *Accept:* deleting a comic removes its `comic_issues` rows; preview
   counts match.
2. **Redo (backend).** Route on the items router (or intake router if it
   owns entry creation helpers; pick the one that avoids a circular
   import). Tests: one entry, no item, reuses an unfinished sitting of the
   same kind, creates one otherwise, game and comic.
   *Accept:* "Redo on a row leaves one intake entry and no item."
3. **`ConfirmDelete` detail + a `deleteDetail(preview)` helper** in
   `lib/` with the words in `content/` (voice per `docs/voice.md`).
   Tests for the wording, including singular/plural and "nothing attached".
4. **Card Delete and Redo.** `ShelfCardActions` gets `onDelete` / `onRedo`;
   AdminCollection wires them. AdminComics `ComicActions` gets the touch
   "…" toggle (reuse `ShelfCardActions`' mechanism; don't copy it) plus
   Delete and Redo. The preview is fetched when the confirm arms.
5. **List view.** Redo per row; "Delete N" in the selection bar with the
   preview detail; existing row delete gains the detail.
6. **Edit page.** `AdminItem` delete gains the detail.
7. **Banner Discard.** `UnfinishedLine` gets Discard for one sitting,
   reusing `UnfinishedList`'s confirm wording; on success the line goes.
8. **Docs.** `frontend/changelog.md` bullet under today; CLAUDE.md (the
   "Editing lives at…" bullet: delete and redo from the card and List
   view; TODO item 4 ticked); README admin section if it lists delete;
   `docs/design-system.md` if `ConfirmDelete`'s detail line is a rule
   (add it under One of each: "a destructive confirm names the row and
   what goes with it"); this doc `status: done`.
9. **Verify.** Full backend pytest (once), `npm test`, lint, format, build,
   e2e.

Ship notes: no migration. Live check: `POST /api/items/bulk-delete`
unauthenticated → 401 instead of 404.

## Deviations

- **Redo's route lives on the items router** (`POST /api/items/{id}/redo`,
  in `backend/items.py`), as written. It needs only the intake models, not
  `intake.routes`, so there is no circular import; the entry is built
  directly (`payload.detected_title`/`detected_year`, `chosen` the item's
  external match when it has one) rather than through the entries route.
  A comic or any row with no external match has `chosen: null`.
- **`ConfirmDelete` took more props than `detail`**: `label`,
  `confirmLabel`, `intro`, `name`, `ready` and `onArm`, so Redo reuses it
  and the confirm holds off while the counts load or if they fail. A new
  `ShelfConfirm` wraps it and the preview fetch (`lib/useDeletePreview.js`)
  for every row-shaped use.
- **`CardActionsShell` was extracted** from `ShelfCardActions` so the Comics
  card shares the hover/touch mechanism instead of copying it. The Comics
  card's old CSS-only `@media (hover: hover)` reveal is gone.
- **The Add page's Discard wording changed** with the banner's: "Its 6
  photos and 43 entries go with it" (real counts) replaces "All its photos
  go with it".
- **Delete and Redo wording**: the redo sitting has no label, so the banner
  names it "Untitled sitting" (see below).
- **Edit page**: Delete only; Redo is on the card and List row as planned.
- Task 5's "existing row delete gains the detail" and Task 6 are the same
  `ShelfConfirm`; the edit page's Delete button is now named "Delete
  {title}" for screen readers.

### After the final review

- **Bulk confirm deletes only what it named.** `ShelfConfirm` hands
  `onConfirm` the ids it armed with, and the bulk bar's confirm is keyed on
  the selection so a changed selection disarms it.
- **Redo's entry lists the old match as a candidate** (`candidates=[chosen]`
  plus `thumbnail_url`), so Check offers it; with no external match both are
  empty. The sitting opens on `check`, and a reused one is stamped
  `updated_at = now()` and moved to `check`. A mixed-shelf sitting (kind
  null) is never reused: Redo creates a kind-specific one.
- **Focus**: Comics delete parks focus on the grid (`.collection-list`); the
  banner's Discard focuses Keep it when asking and returns to Discard.
- **Words**: "Its 1 photo goes with it"; the banner's fallback name is
  `sittingName()` ("Untitled sitting", replacing "A sitting" from the first
  pass); Redo's confirm adds "Its rating, status and notes don't come back."
