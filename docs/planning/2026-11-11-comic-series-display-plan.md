---
status: planned
topic: comic-series-display
date: 2026-11-11
spec: 2026-11-11-comic-series-display-design.md
---

# Plan (Code, 2026-11-11)

## Answers to the open questions

Researched against `origin/main` at `ac4458a`. Citations are repo paths.

| # | Question | Answer | Effect on the build |
|---|---|---|---|
| 1 | Following in public | **The spec misread D5.** Root `CLAUDE.md` (Comics) says "Following *alone* is private": following does not make a series public. On a public row the flag is public. `PublicComicRow` and `PublicComicDetail` emit it (`public_comics.py:59,169`), `test_public_comics.py:35-53` pins it, and `comic_weeks` and `ComicFacts` (`Item.jsx:266`) read it. | The existing Following pill in `SeriesRow` and the `following` chip stay. The new designs add no pill. AC 9's "no Following pill" now reads "adds no Following pill". |
| 2 | Intake | **The components are on main** (`frontend/src/components/intake/`). Issue numbers are **typed** (`intake/shelf_kinds.py:45`), not read from the photo. The commit reports `issues_added` as one total for the sitting and `already_owned` as a count of series, never per series (`intake/commit.py:114-137,368-450`). PR #149 (`fix/intake-add-issues`) is open on the same files. | Intake moves to **PR 2**, after #149 merges. It needs a per-series report from the backend first. See Milestone 3. |
| 3 | Skips on the item form | PATCH accepts `issues_skipped` (`items.py:100,133`), but `apply_comic_fields` (`comics.py:191`) does not refuse a skip on an owned issue. Only the pull list does (`comics_routes.py:368-377`). | T2 adds the same refusal to `apply_comic_fields` (422), so admin taps cannot get round it. |
| 4 | Edition rows | `kind` is free text of 1–20 characters. `label` is 1–80. `from` and `to` are ints in 1..9999 with from ≤ to. There are at most 50 editions and no overlap check (`comics.py:138-164`). `parseEditions` checks line shape only (`lib/comics.js:210`). | Rows send an `editions` array straight to the API, which stays the one validator. A `<datalist>` offers the kinds already used (Trade, Omnibus, Hardcover) without fixing the list. |
| 5 | Segments or derive | `segments` holds only owned, missing and upcoming, with no edition or read state (`comics.py:242-272`). The public **detail** carries `owned_text` (edition issues included), `editions`, `read_to` and `next_issue`. The **list row** carries `segments`, `owned`, `released`, `read_to`, `read` and `next_issue`, with no `owned_text`. Neither carries skips. | **Page and admin** derive per-issue state in a new pure `lib/comicRun.js`. The **card and Runs row** draw from `segments` and add one public field, `read_next` (T2). Skips cannot be inferred: in public they look missing, as today. |
| 6 | Ended or cancelled | No such field exists. `ongoing` means a dated issue within 120 days (`comics.py:437,493`). | "Finished" means not `ongoing`. No Ended tile. |
| 7 | Worst-case box size | An alternating 400-issue run is 400 cells. | Accepted with no ceiling: 400 small buttons are cheap, and every issue stays reachable. Covered by a test that renders it. |
| 8 | Signed-in toggle on the public page | It saves per tap (`Item.jsx:470-497`). | Keep both behaviours, as the spec's Interactions section says. |
| 9 | Tests | `RunBar.test`, `IssueGrid.test` (the cap) and `Item.test` pin today's marks. | Replaced alongside their components (T3–T6). |

Also from the research:
- The mockup's not-out-yet tail is `max(1, round(released × 0.08))`, while the backend's segment tail is `max(3, ceil(…))`. The spec makes the lane's tail a **fixed width**, so the lanes ignore the length of the upcoming segment and neither formula matters.
- "No issues recorded" is derived on the client: owned, nothing in `owned_text`, no editions.

## Milestones

```
Milestone 1 (auto): T1–T8 → finish gate → PR 1 "comic series display" (card, page, admin)
STOP: PR 1 opened
Milestone 2: wait for #149 to merge (Joey merges it)
Milestone 3 (auto): T9–T10 → finish gate → PR 2 "intake: series that grew"
```

There is no carve-out in either PR: no migration, infra, auth or deploy-path change. T2 and T9 are **additive** API changes. T2 adds one public field, which `test_public_comics.py` pins. T9 adds an admin-only response key. The snapshot is written from the API, so the new field arrives with the next build. Until then the card falls back (see T5).

## Tasks (PR 1)

Sequential by default. Only T1 ∥ T2 are **parallel-safe**: they touch disjoint files and neither needs the other.

**T1 — `lib/comicRun.js`, the run model (pure).**

Exports:
- `runModel({ownedText, editions, readTo, released, ongoing, nextIssue, skippedText?})` returns:
  - `issues[]`, the state per issue 1..released: owned, read, missing, skipped
  - `held` (counted once), `missing`, `readNext`, `firstGap`, `state` (complete, up_to_date, gaps, unrecorded, want-empty)
- `boxTiles(model, editions, openBundles)` returns book, cell, bundle and next tiles in issue order.
  - It is a port of the mockup's `B.box` (`chosen.html:351-371`), with overlapping editions handled: the first edition wins, as `editionCoverage` does.
- `laneSpans(model)` gives the full lanes, and `laneSpansFromRow(row)` gives the mini lanes from `segments`, `read_to` and `released`.
  - Blocks per issue at 12 or fewer, and a fixed tail when ongoing.
- `runSentence(model)` returns, for example, "I own #1–57, 60 and have read to #54.", and `lanesLabel(model)` returns the `role="img"` name.

Files: `frontend/src/lib/comicRun.js`, `comicRun.test.js`.

Tests:
- 4-issue run, and a 362-issue run gives 15 tiles (Spawn sample)
- an edition plus the same issues as singles is counted once (AC 6)
- 12 or more same-state issues become a bundle; 11 do not
- an alternating 400-issue run gives 400 cells
- skipped appears only when `skippedText` is passed
- every row of the Screens-and-states table
- the sentence and the label text

**T2 — Backend: `read_next` and the skip guard.**

- Add `read_next: int | None` to `PublicComicRow` and `PublicComicDetail`: the first held issue above `read_to` (editions included), or `None` when everything is read. It is computed in `comics.py` next to `read_state`.
- `apply_comic_fields` refuses with a 422 ("#n is owned; it can't be skipped") when the resulting skipped set meets the owned set (singles or editions, the pull list's rule), using the item's current values for whichever field the patch leaves out.

Files: `backend/comics.py`, `backend/public_comics.py`, `backend/items.py` (passing the current row, if needed), `backend/tests/test_public_comics.py` (`ROW_FIELDS`/`DETAIL_FIELDS`), `backend/tests/test_comics*.py`.

Tests: `read_next` with editions, gaps, all read and nothing read; the 422 on PATCH; a PATCH that owns a skipped issue and drops the skip in the same request passes.

**T3 — `RunLanes` (mini and full) and `RunKey`.** These replace `RunBar` and `RunLegend`.

- Missing is hollow (a 1.5px `--run-missing` outline). The Read lane uses `--text-2`. The tail uses `--hatch`. The Skipped lane is admin-only and dashed.
- The whole thing is one `role="img"` with the facts as its name.
- The full form adds the label column and axis ticks.

Files: `components/RunLanes.jsx` (+test), `index.css`. `RunBar.jsx` and its test are deleted once T5 has moved `SeriesRow` across.

Tests: the role and name, block-per-issue at 12 or fewer, the tail only when ongoing, no Skipped lane unless it is passed.

**T4 — `RunBox`, read-only and editing.** It renders `boxTiles` output.

- Bundles are `<button aria-expanded>` with the spec's names. A fold button is the first cell when a bundle is open. Focus moves to the fold or bundle button when the box redraws.
- Read-only: cells are `aria-hidden`, except in signed-in public mode, where they are owned toggles with names.
- Editing: every cell is a button named "Issue 59, Missing". Book tiles are never buttons. Skips are dashed with a ×.
- `--text-3` is used, never opacity, for a bundle's second line.

Files: `components/RunBox.jsx` (+test), `index.css`.

Tests: keyboard open and fold, with `aria-expanded` following (AC 5); a book is not a button (AC 12); a 300+ run renders its box (AC 4); no skip in the DOM when `skipped` is not passed (AC 9).

**T5 — Shelf card and Runs row.**

- `PosterCard` gets a comic variant: the stacked offset edges (decorative, `aria-hidden`), the mini `RunLanes` under the title, and the two lines (`owned/released+`, then Next, missing, Up to date or Complete; then `read next: #n` or `all read`). The cover keeps only the status mark.
- `Comics.jsx` stops passing `RunBadge`, and `RunBadge.jsx` is deleted with its test.
- `SeriesRow` swaps `RunBar` for the mini lanes, and `SeriesList` swaps `RunLegend` for `RunKey`.
- A row from an older snapshot without `read_next` shows `read to #n`.
- Want and unrecorded cards show their text and no lanes.

Files: `PosterCard.jsx`, `pages/Comics.jsx`, `SeriesRow.jsx`, `SeriesList.jsx`, their tests, `index.css`.

Tests: AC 2 and 3; the states table, card column (AC 14); admin card actions still a sibling of the link.

**T6 — Series page (`Item.jsx`, comic branch).**

- `ComicFacts` becomes the hero count and pill plus the **What's next** tiles: Next to read, First gap, and Next out (only with `next_issue`, AC 8).
- `ComicCards` becomes the run card: lanes only above 12 issues, then `RunBox`, the key and the sentence. Then come Collected editions with the "counted once" note, then About.
- The signed-in per-tap toggle moves onto `RunBox` cells. Edition-covered cells stay untappable.
- The dashed empty boxes cover unrecorded and Want.
- Delete `IssueGrid.jsx` and its test, which removes `ISSUE_GRID_CAP`.

Files: `pages/Item.jsx`, `pages/Item.test.jsx`, `index.css`.

Tests: the section order (AC 7), the states table page column, counted once (AC 6), the toggle still PATCHes `issues_owned`.

**T7 — Admin series edit (`ComicFields` in `components/ItemForm.jsx`).**

- The run card leads, with full lanes plus the Skipped lane.
- The tap-mode group is three `aria-pressed` buttons: Owned, Read to here, Skip.
- The editing `RunBox` applies the Interactions rules on the client. Owning a skipped issue drops the skip; Skip on a held issue does nothing.
- The typed fields stay in step: *Single issues I own*, *Read to*, and *Skipped (private)*. Taps rewrite the text with `compactRanges`. Typing re-expands, and a line the client can't expand leaves the box as it was until Save.
- Edition rows (kind with a datalist, label, from, to, remove, Add) replace `editions_text`. `comicPayload` sends `editions` and `issues_skipped`.
- A 422 shows beside the field it names, and the form keeps the input (AC 13).
- Two columns at 1280 wide (`AdminItem.jsx` layout), one at 400.

Files: `components/ItemForm.jsx` (`ComicFields` may move to `components/ComicFields.jsx`), `pages/AdminItem.jsx`, `lib/comics.js` (`comicPayload`; `parseEditions` and `editionsText` are deleted if nothing else uses them), tests, `index.css`.

Tests: AC 10, 11, 12 and 13; the Read-to-here tap moves back one on the current `read_to`.

**T8 — Contrast, docs, changelog.**

- Measure every mark in the mark-language table in both themes, in the browser, from computed tokens, with a small script in the scratchpad. Record the ratios beside the tokens in `index.css` (AC 17).
- Keep the book spine decorative, as the spec notes.
- Confirm no raw hex and no new token (`git diff` grep, AC 18).
- Confirm no hover-only reveal (AC 19).
- Update root `CLAUDE.md` (Comics: the run bar and issue grid sentence becomes lanes and box, missing hollow, the skip guard on PATCH, `read_next`) and README → Comics if it names `IssueGrid`.
- Add a `frontend/changelog.md` entry linking `/shelf/comics`.

## Tasks (PR 2, after #149 merges)

**T9 — Backend: per-series report from intake.**

- Commit (and `/add`, as changed by #149) adds `series_grew: [{item_id, title, before: {owned, released}, added: [n…], already: [n…], after_owned_text}]`.
- `issues_added` and `already_owned` stay as they are, for compatibility.
- The Check payload marks a row that matches an owned series with that series' current `owned_text` and `released`, so Check can draw the sentence and the near-cells strip before commit.
- This part is confirmed against the code once #149 has merged. If Check has no access to the match before commit, that is a scope question for Joey, not a guess.

Files: `backend/intake/commit.py`, `backend/intake/routes.py`, `backend/intake/README.md`, `backend/tests/test_intake*.py`.

**T10 — Check and Done.**

- Check gets the "Already on the shelf · adds issues · n" group. Each row has the sentence, the pill, a near-cells strip (a `nearCells(model, added)` helper in `comicRun.js`: up to three before, two after, and an ellipsis), an *Edit issues* action, and a disabled row for an issue already owned.
- Done gets the two tiles and "Series that grew", with linked titles.

Files: `components/intake/CheckStep.jsx`, `DoneStep.jsx`, a new `SeriesGrewRow.jsx`, tests.

ACs: 15 and 16.

## Verification

- **Unit and component:**
  - `cd frontend && npm test`
  - `cd backend && ./.venv/bin/pytest`, one run at a time per the repo note
- **Build:** `cd frontend && VITE_DAILY_SALT=local npm run build`. This runs prerender and the changelog parser.
- **Environment test (local, before the PR):**
  - Run the backend and the frontend dev server.
  - In the browser, at 1280 and 400, in dark and light, compare against `chosen.html`:
    - `/shelf/comics` (Covers and Runs)
    - a short series (Waterworld, 4 issues)
    - a long series (100+ issues, made locally if the shelf has none)
    - the admin edit: tap each mode, Save, check the 422 path
  - Screenshots go to the PR description.
  - Check the public detail JSON for absent skips: `curl localhost:8000/api/public/comics/<id> | grep -c skipped` should be 0.
- **Post-deploy smoke:** `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`, plus a look at `/shelf/comics` and one series page live.
