---
status: planned
kind: writing
mode: auto
---
# Voice pass (#286)

## Problem
Flagged commentary and list-rhythm lines (issue #286). Joey approved each rewrite on 2026-11-15.

## Scope and approved edits
- `frontend/src/content/projects.js`: rewrite My Shelf's four bullets (drop the label colons and trailing clauses; drop "honest"); cut "Built to be read, including by the recruiter who clicks View source." from This site's description.
- `frontend/posts/how-spine-works.md` summary: "The model never grades its own work." (drop "One rule runs through it:").
- `frontend/trips/croatia-greece-2026.md` draft summary: "Twelve days in Dubrovnik, Naxos and Athens." (the ferry joke goes).
- `frontend/src/content/pages.js:84`: straight apostrophe "Render's" becomes "Render’s".
- `docs/voice.md`: remove the stale "Known departures" entries for status.js and render-rewrites-need-the-slash.md (no straight apostrophes remain).
Out: the bio list (done in #370), anything not listed.

## Acceptance
Tests green for the touched content (projects, posts, trips, pages/search, stats), `npm run format:check`, `VITE_DAILY_SALT=local npm run build`. smoke.sh and e2e grepped for the changed text. No migration.
