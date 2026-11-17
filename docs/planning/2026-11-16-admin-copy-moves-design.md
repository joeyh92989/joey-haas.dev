---
status: planned
kind: refactor
mode: auto
---
# Move the remaining inline admin strings into content/ (#300 follow-up)

## Problem
#372 added a ratchet (`adminCopyScan.test.js`, `adminCopyBaseline.json`): 237 inline strings in 22 Admin files. Joey wants them moved so voice rules can be checked in one place.

## Scope
In: move inline visible strings and string-literal title/aria-label/placeholder/alt props from Admin*.jsx into `frontend/src/content/adminCopy.js` (or a sibling module under content/ when one area's copy would swamp it), verbatim, and lower the baseline to match. Tests that assert on a moved string import the constant instead of repeating the literal. Out: rewording, behaviour, non-Admin files.

## Batches (one PR each, strictly in order; all share adminCopy.js and the baseline JSON)
A: AdminItem (33), AdminComic (10). B: AdminCollection (25), AdminComics (7), AdminAdd (3), AdminSitting (2). C: AdminCatalogue (24), AdminStoreList (3), AdminRadar (12), AdminDiscover (9). D: AdminClosetToday (19), AdminClosetProfile (14), AdminClosetReview (8), AdminCloset (7), AdminGarment (2). E: Admin (14), AdminPullList (12), AdminAnalytics (9), AdminShell (9), AdminSpots (8), AdminJobs (6), AdminWeekend (1).

## Rules
- Words move verbatim (curly apostrophes stay). Dynamic strings (template literals) are out of the scan; leave them.
- Naming: group keys by page then purpose (`adminCopy.item.missing`), matching the existing file's shape.
- The baseline may only shrink; each PR sets the touched files' counts to what the scan now finds (usually 0).
- A string that is not user-facing prose (a CSS-ish token, a test id) stays; note it as an exception in the baseline with a reason if the scan flags it.

## Acceptance per batch
Scan test, targeted Admin* tests for touched pages, `npm run lint`, `npm run format:check`, `VITE_DAILY_SALT=local npm run build` pass; no rendered text changes (tests prove it).

## Ship notes
Frontend only, no migration, no changelog entry. #300 closes with batch E.
