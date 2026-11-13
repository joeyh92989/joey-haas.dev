---
status: done
kind: writing
mode: auto
---

# Copy pass 3b: one name per thing, the voice markers, and the open copy lines (design and plan)

Issues: #201 (names, loading words), #186 (Now copy), #196 (contact line). Part A
(`2026-11-12-content-ia-design.md`) changed structure only and left the prose for this pass.
Branch `chore/copy-pass-3b`.

## Problem

The site calls one thing by several names: Blog and Writing; Daily and Shelfle; How it works,
Take the tour and guided tour; joey-haas.dev and This site; catalog and Sources in admin; mood
and vibe. 41 strings carry a `copy: pending voice review` marker. A few lines are still open:
Now's intro and empty state, the Denver lede, the contact line Home and About lack, and status
lines that use dashes and straight apostrophes. The repo had no voice file.

## Scope

In: `docs/voice.md` (approved by Joey on 2026-11-12), and every string in the draft below, with
the tests that pin those strings. Out: route paths, code identifiers, API fields, the mood chip
values, history in changelog entries dated before 2026-11-12, the public word "catalog", and
meta, RSS and share text, which keep the domain name.

## Solution

Apply the reviewed draft verbatim. The draft, inventory and review are in
`docs/planning/mockups/2026-11-12-copy-pass-3b/`, which is gitignored:

- `draft.md` holds the final strings by key and file:line. Line numbers are from main @f311f0b,
  so find each one by its current text.
- `inventory.md` holds the current string, where it shows, and its constraints.
- `draft-review.md` holds the independent review. All nine of its fixes are already in
  `draft.md`.

A string marked "keep" stays as it is and loses only its marker. Vale is clean apart from one
over-30-word sentence in tour stop 9, which keeps Joey's existing text.

## Decisions

- Names (Joey): Blog, Daily game, Tour, This site, Sources. The admin group is "Data", and the
  word is "vibe", not "mood".
- Meta descriptions, RSS and share text keep "joey-haas.dev", since out of context "this site"
  has no referent. Draft review B4.
- Changelog history stays as written. Only links in the 2026-11-12 entries change.
- My call: the contact line renders from `profile.email` and `profile.linkedin`, not from
  literals, so one edit to `profile.js` updates both pages.
- My call: the changelog gets one bullet under 2026-11-12, the day this ships, in the same voice.

## Smoke check

`/blog` h1 reads Blog, `/daily` reads Daily game, `/shelf/how` tab reads Tour, Home and About end
with the contact line, and smoke.sh passes.

## Plan

Each task runs `cd frontend && npm test`, `npm run lint` and `npm run format:check`, all green,
before its commit. Tests that assert old strings move to the new ones. Never delete an assertion
to make it pass.

### Task 1: voice file and Section A
- Commit `docs/voice.md` as approved.
- Section A: remove all 41 `copy: pending voice review` markers, in `content/spine.js`,
  `SortControl.jsx`, `ShelfToolbar.jsx` and `Collection.jsx`. Apply A1 (choose: vibe), A9
  (`Backlog (no mark)`) and A22 (behindLine, "Catalog of"). Every other A string stays as it is.
- Accept: `grep -rn "pending voice review" frontend/src` is empty, and A1, A9 and A22 match the
  draft.

### Task 2: Section B, the names
- B1 to B6 as drafted. That covers Blog.jsx, Home.jsx, daily.js, spine.js, SiteFooter.jsx,
  lib/daily.js, pages.js, the post link, adminAreas.js, AdminCatalogue, AdminDiscover,
  AdminRadar, nightly.js, PlayNext.jsx, and the 2026-11-12 changelog links. Rows marked "leave
  unchanged" stay as they are.
- Update every test that pins an old name, including `AdminShell.test.jsx`'s group, Home's
  kicker, the daily share text, and e2e specs that match by name.
- Accept: none of the old names (Writing, Shelfle, How it works, guided tour, mood as a visible
  word, "catalog" in admin copy) survives in visible copy outside the stated keeps. Check with
  grep, and list the remaining hits with the reason each one stays.

### Task 3: Sections C and D, and the changelog
- C1 and C2 (Now), C3 and C4 (denver.js), C5 and C6 (the contact line at the end of Home and
  About, built from `profile` fields, with About keeping `download="Joey Haas Resume.pdf"`), C8
  (status.js), C9 (TIL note apostrophes), and C10/D2 (SpotForm "Neighborhood"). Also D1
  (recognized) and D3 (`{label} color`).
- Add the changelog bullet under 2026-11-12. The `writer` agent drafts it before this task, and
  it is inserted verbatim, in `docs/planning/mockups/2026-11-12-copy-pass-3b/changelog-bullet.md`.
- Add tests: Home and About render the contact line with mailto and LinkedIn links built from
  `profile`.
- Accept: the strings match the draft, and the new tests pass.

### Finish
Preflight (full tests, lint, format, build, e2e). Whole-branch review (opus). `/code-review
medium`, since this is copy only. Screenshots of Home, About, Now, `/daily`, `/shelf/how` and
`/admin` at 393 and 1280. The learnings entry from PR #214 goes into this PR.

Ship notes: no migration. Frontend only.
