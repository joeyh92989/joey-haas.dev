---
status: done
kind: fix (UI copy)
mode: auto
---

# Backlog batch 1: stats, owned/tonight wording, header controls

Issues #480, #481, #482 (sub-issues of #366, walkthrough 2026-11-19).

## Problem and findings (re-verified 2026-11-23)

| Issue | Still reproduces? | Cause |
|---|---|---|
| #480 Stats figures | Yes. Live API: 260 views in 30 days; the Pages list is the top 10 (`LIST_SIZE`), summing to 90. All-time (264) is almost the 30-day figure because counting began 2026-10-20. Fixed pages show raw paths (`/`, `/shelf`). | The list is capped and says nothing about it; titles exist only for items, comics, year and month pages. |
| #481 owned / Tonight | Partly. The live shelf has one source for the owned count (`stats.owned`) and one for tonight's game (`bandCounts(next).tonight`, also used by Now). The 108 vs 109 and Donkey Kong vs Hades II gap is the Projects hero screenshot (taken 2026-11-15). "Tonight: X" (the engine's pick) next to "Now playing" (the game in hand) read as one thing. | A static, undated screenshot; same word for two ideas. |
| #482 toggle / Escape | Toggle: its accessible name already says "Switch to light theme", but a phone shows only "Light", which reads as the current mode. Escape: reproduced. The search field is `type="search"`, so Chrome clears its text on the first Escape and the dialog stays open, showing the default list (including Projects) under the next tap. | Native search-field behaviour beat the dialog's Escape. |

## Changes

- Stats: `PAGES_COVER` line ("top 10 pages: 90 of 260 views, last 30 days", plain when the list holds every view); `PAGE_NAMES` titles for fixed routes in `pageName`; all-time tile detail "all time, since <date>".
- Projects: hero screenshot gets a "Screenshot from <date>" caption (`hero.captured`). The image is not regenerated: that needs a browser capture pass and is Joey's call.
- Shelf link wording: `Tonight:` becomes `Tonight’s pick:`; Now playing is unchanged. Only that string; shelf chrome belongs to the other batch.
- Theme toggle: on a phone, a sun or moon icon (the target theme) replaces the bare word; the accessible name is unchanged.
- Search: Escape in the field closes the dialog (prevents the native clear).

## Tests

Stats, pageTitles, SiteMast, SearchDialog unit tests; e2e `verify.spec.js` "Escape on a no-results search closes it and the page beneath is tappable" (failed before the fix, passes after, desktop and phone).

## Not covered

Regenerating the Projects screenshot; a visible "Tonight" vs "Now playing" legend on the shelf header (shelf chrome).
