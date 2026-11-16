---
status: planned
kind: refactor
mode: auto
---
# Admin copy lives in content/ (#300)

## Problem
Admin pages hard-code user-facing strings (`AdminItem.jsx` "No item with that id.", `AdminClosetToday.jsx`, `AdminPullList.jsx`, `AdminComics.jsx`) while public pages keep words in `frontend/src/content/`. Voice rules can't be checked in one place. No full count exists (a heuristic found about 29).

## Scope
In: move the five named strings (and any identical sibling strings in the same files) into `frontend/src/content/adminCopy.js` (exists, 21 lines; follow its shape); add a ratchet test that scans `frontend/src/pages/Admin*.jsx` and `frontend/src/components/Admin*.jsx` for inline visible JSX text and string-literal props (title, aria-label, placeholder, alt) and compares against a committed baseline of the files and counts that remain today. New or changed inline strings beyond the baseline fail the test; the baseline may only shrink. Print the full remaining list from the test or a documented script so the issue's "scan lists remaining inline strings" is met. Out: moving all ~29 strings (follow-up), any copy rewording (move words verbatim, keep curly apostrophes), the admin pages' behaviour.

## Decisions
My call: ratchet over a big-bang move, because a 29-string move touches many admin tests and #244 just reduced their flakiness. Tests that assert on the moved strings should import the constant from content/ rather than repeat the literal.

## Acceptance
Five named strings come from content/; scan test passes and fails when a new inline string is added (prove with a throwaway edit, not committed); `npm run format:check`, targeted Admin* tests, `VITE_DAILY_SALT=local npm run build` pass; README note for the scan (frontend README or scripts README, wherever the test is documented).

## Ship notes
Frontend only, no migration, no changelog entry.
