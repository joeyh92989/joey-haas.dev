---
status: done
kind: UI / UX
mode: auto
---

# Backlog batch 5: the admin Add flows (#489, #490, #491, #493, #494)

Sub-issues of epic #366 (found in the 2026-11-19 blind walkthrough, #468).
The Closet epic (#539) is not part of this batch: the Closet's intake files
change only where an issue names wording or behaviour of the shared Add page.

## Re-verification first

Read against `origin/main` (6b8345d8), not against the issue text.

| Issue | State on main | What this batch does |
|---|---|---|
| #489 game add form | Shipped in #510: labels, Title and Owned format marked Required with inline `role="alert"` messages and `aria-invalid`, a `role="status"` saved line with an "Open it" link, the form clears (`setForm(EMPTY_FORM)`), the shell refreshes (`refreshItems`). The shell shows no list counts at all (frontend/CLAUDE.md), so "sidebar count stays at 0" no longer applies. | Nothing to change. Close with evidence. |
| #491 place add | Places code was removed in #537. The one place form left, `SpotForm`, is shared by Add and Edit: one City-less field set, "Coordinates" marked Required with the maps-link tip, and "Show on the public map" on both. Joey parked the City dropdown and the coordinate lookup on the issue (2026-11-19). | Nothing to change. Close with evidence. |
| #490 private by default | Real. After an add the notice says "added, private" but not what publishing does; games cards and the item edit page have no "View public page" link (comics have one); a spot has none. Default wording differs (Games "Public", Spots "Show on the public map"). | Change (below). |
| #493 Add flow | Real: "sitting" wording, `AdminAdd.start()` POSTs a sitting on a card click, Movie and Board game tiles have no list. | Change (below). |
| #494 comic add wording | Real, each of the six items. | Change (below). |

## Decisions ("my call")

### #490 Keep the private default

New rows stay private (`backend/CLAUDE.md`: "Items are private when created"); a public default would put a half-typed row on a public site. Instead, after adding, the page says so:

- The Add bar's notice: "X added, private. It is not on the public site until you publish it." with a link to the item (`created[0]` from the add answer) so the owner can publish from there.
- Done (batch committed) says the same, and "Publish these N" is the first button.
- "View public page" is a link on a game card's action panel and on the item edit page, shown only when the item is public (a private item's public URL is a 404, so a dead link would be worse than none). A private row keeps its existing Private tag.
- Spots: a public row links to the Denver page.
- Defaults: games, comics and spots are all private on create (items `is_public` false in the backend; `SpotForm` `?? false`), and every list's switch reads "Public"; the spot form's hint says "Show on the public map". The walkthrough's "games were public by default" was not reproducible from the code (no create path sets it true), so nothing to change in the defaults.

### #490 The snapshot-cache lag: repro and finding

Read from code, `backend/public_cache.py:25`: every public read answers `Cache-Control: public, max-age=60, stale-while-revalidate=300`. So after "Publish all":

1. A browser that opened `/shelf/games` within the last minute reuses its cached answer with no request at all.
2. For the next five minutes the browser may show the old list first and fetch the new one in the background; the new one appears on the next load or when the live read lands.
3. The build-time snapshot (`/snapshot/items.json`, nightly) paints first for a visitor and is empty-and-valid for a shelf with no games, which is the "No games on the shelf yet" the walker saw until the live swap.

So the lag is real, bounded (about a minute for a fresh load; up to six minutes for a tab that already had the page) and not a bug in the swap. The fix is words: after Publish, Done and the Games page say "Public pages can take up to a minute to show a change." Not repro'd against a live server in this session (no running API here); the header is read from the source and pinned by `backend/tests/test_public_cache.py`.

### #493 Create the batch on the first photo, not on a card click

The Add page's card click now goes to `/admin/<area>/add/new/<kind>` (a "new batch" page that has no server record). It shows the Shoot step's pickers. Choosing the first photo POSTs the batch, then hands the files to the batch page (a one-shot in-memory hand-off, `lib/intakeHandoff.js`) which uploads them, so no record exists until a photo does. A card click, then Back, leaves nothing behind. Rejected: a confirm dialog on the card (an extra tap for every batch, and it still creates a record before a photo exists) and lazily creating inside `ShootStep` (it needs a sitting id for every request, so it would have meant reworking the step the Closet shares).

The Closet's Add page shares `AdminAdd`, so it gets the same behaviour. Left alone: the Closet's add-bar "Photos" button (`AddSection.photos()`, creates a batch directly) and `ShootStep` itself.

"Sitting" becomes "batch" in everything the owner reads: the Add page lede and heading, the unfinished list and line, the stepper copy, `Finish later` help, link/seed remove lines, and the sitting page header. Code identifiers, routes and API paths keep `sitting` (renaming those is churn with no reader).

"Every kind on Add has a visible home": Game and Comic live in the Shelf nav (Games, Comics), Garment in the Closet area. Movie and Board game have no list anywhere in the admin (movies and board games are saved but never listed), so they are **removed from Add** (tiles, Keep-as-typed buttons and search results): `lib/intake.js` `hasHome(kind)` (an exclusion list, so a kind the server newly registers still appears without a frontend change, AC 9). The backend kinds stay registered; a future Movies page removes its key from the list. Report: Movie and Board game removed.

Card layout: the kind tiles are a grid of equal-height cards with the kind name on top, one line of what it takes, and the ways in as a footer pinned to the bottom, so uneven note lengths no longer leave uneven space.

### #494 Comic add wording

- "Keep as typed" is a full-size (44px) outlined button per kind, "Keep as typed Comic", not a small chip.
- Check's grid heading follows what is in it: all typed rows read "Typed · N · untick anything wrong", all matched read "Matched · N ...", a mix reads "Ready to add · N ...".
- Done: heading "Added to the shelf" (not "<label> is in"), the first button is "Publish these N", the next-batch button follows.
- "Finish later" is a plain (bordered) button, not ghost, so it clears contrast.
- A result list collapses after a successful add (the notice stays, with the link); a duplicate keeps it so the text can be corrected.
- "About 1 model call per photo; 108 left today" becomes "Each photo is read once; 108 reads left today." (no jargon); when not enforced, "Each photo is read once."

## Design note (admin UI)

Follows `docs/design-system.md`: the Add page stays a "tool" page (header, tiles, list); the new-batch page reuses `AdminPageHeader` and the existing Shoot drop panel look (`INTAKE_DROP`). Buttons are the existing `ibtn` looks (44px up to 900px), confirmations are `role="status"`, errors `role="alert"`. No new component library, no new tokens. Admin-only: no public changelog entry.

## Plan

1. `lib/intake.js`: `hasHome`; `lib/intakeHandoff.js`; unit tests.
2. Words: sitting to batch (content files, components); budget text; Done heading.
3. `AdminAdd`: card click navigates to the new-batch route; tile layout; filter tiles.
4. New-batch page (`pages/AdminNewBatch.jsx`), route in `App.jsx` (both areas) and `ADMIN_ROUTES` if needed; `ShootStep` takes handed-off files on mount.
5. `DoneStep`: Publish first, delay and "View public page" wording; `AdminSitting` header.
6. `AddResults`: Keep-as-typed button; `AddSection`: private notice with link, collapse results; `DetailsStep`: Finish later.
7. `ShelfCardActions`, `AdminItem`, `AdminSpots`: View public page.
8. `CheckStep`: skim heading.
9. e2e: one spec for the new-batch flow (no record on card click; record on first photo).

Ship notes: no migration, no backend change, no `render.yaml` change.

## Left alone

- The Closet's add-bar "Photos" button (`AddSection.photos()`) still creates a batch directly: it is the Closet's own entry, not the Add page's cards.
- `ShootStep` and the batch page are unchanged apart from taking handed-off files and their words.
- The API's own error text still says "sitting" (for example "This sitting has already been added"): a backend string, so out of this frontend batch.
- `/shelf/intake` public copy (`content/spine.js`) still says "sitting": a public page, not part of the admin Add flow.
- Add's search can no longer add a Movie or Board game; to add one, a Movies page has to exist first.

## Smoke check

On a built site: `/admin/collection/add` card click does not change the unfinished count; picking a photo does. `./scripts/smoke.sh` is unaffected (admin only).

## Sources

- Issues #489 to #494; `docs/planning/2026-11-19-blind-walkthrough-issues.md`.
- `backend/public_cache.py` (the cache header); `backend/CLAUDE.md` (private by default; snapshot).
- `frontend/CLAUDE.md` (shell shows no counts; Tailwind and class rules).
