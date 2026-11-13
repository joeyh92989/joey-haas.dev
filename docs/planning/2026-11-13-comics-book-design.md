---
status: 5a done (5b, 5c planned)
kind: ui
mode: auto (Joey's stops from the shelf sweep run; design approved 13 Nov 2026)
---

# Comics: the book is what you own

Shelf sweep queue, item 5 (`docs/planning/2026-11-12-shelf-sweep-queue.md`),
shipped as three PRs in order: 5a intake reads the book, 5b ownership on the
issue row, 5c one place to edit and a comic edit page. Rules:
`docs/design-system.md`. This doc is the design for all three; each PR adds
its own plan section below and ticks it.

## Problem

Intake can't record which book a photo shows: `EXTRACTION_PROMPT` reports
each work once, `DETECTION_SCHEMA` has no issue number, and commit merges
comics by series, so four Waterworld photos become one row. Ownership is
range text on the series row; `comic_issues` is only a Comic Vine cache.
A book can be edited in three places, and once a series has issue rows the
signed-in owner grid disappears (the cover wall has no owner control). The
admin comic page is the game form with words swapped.

## Reader test (13 Nov 2026, Joey's covers)

8 phone photos of Joey's comics, run through the current prompt and a
per-book comic prompt (`gemini` chain, 16 requests; script kept out of the
repo).

| Photo | Current prompt | Per-book prompt | On the cover |
|---|---|---|---|
| Creepshow Vol. 4 | title only | series, collected, no number | trade, Vol. 4 |
| Star Wars Tales | title only | #5 | #5 |
| Jurassic Park Raptors Attack | title only | #1 | #1 |
| bagged Topps Jurassic Park book | "Turok Dinosaur Hunter" (wrong) | "Zorro #0" (wrong: bonus banner) | number hidden by bag and sticker |
| Waterworld: Children of Leviathan ×4 | title only, ×4 | "1 of 4", 2, 3, "4 of 4" | #1–#4 |

The right number on 6 of 7 single issues; nothing invented for the trade.
So the reader can do it, with guards: normalise "N of M" and "#N"; strip a
story title glued to the series ("…: Twilight of the Gods") before
matching; check the number against the series' run; and a typed number on
every entry, because a bagged book with a banner fools it.

## Decisions (Joey, 13 Nov 2026)

- **B1**: on the series page, signed in, tapping a cover cycles missing →
  owned → read → missing, with a status line and Undo beneath the wall. Skip
  is set on the issue page. (B2, a per-cover menu, rejected: two taps per
  book and a new menu component.)
- Read implies owned.
- A private series has no public page, so the admin comic page carries the
  same cover wall.
- Comic sittings keep the Details step.
- Long runs fold for visitors; signed in, the wall is open.
- Missing counts differ for the owner and a visitor (skips are private).
- A collected edition read at intake defaults to Trade, changeable in Check.
- No comparing a number against the Comic Vine cover image (out of scope).
- An issue with a cover and no description still credits "Cover from Comic
  Vine"; a description gets "From Comic Vine" under it.
- The admin comic page keeps Delete (item 4) and Favourite.
- Ranges read "#1–4", the site's form.
- Issue numbers stay whole numbers 1–9999: no #0, ½, annuals or variants
  (Joey: none owned that he tracks; the bagged bonus Zorro #0 is not
  tracked). The limit is stated where a number is typed.
- From item 1's review: the wall has **Show: All · Missing** (Missing is
  the store list) and shows even when nothing is owned; Star Wars Tales #5
  is owned (Joey: "set #5"; recorded in item 6's backfill, not by this
  code).

Mockups: `docs/planning/mockups/2026-11-13-comics-book/` (out of git).
Chosen: `a-intake-check.html` (5a), `b1-series-cycle.html` (5c), `c-issue.html`
(5b/5c), `d-admin-comic.html` (5c), at 1280 and 400 (`phone.html`).
Rejected: `b2-series-menu.html`.

## LLM budget

5a sends one request per photo, as today; only the prompt and schema for a
comic sitting change. Requests rise only because comics are photographed a
book at a time: about one request per book against roughly 108 free
requests a day (`intake/budget.py`). No paid fallback is added.

## Rules this item adds to `docs/design-system.md`

In the PR that first uses each: 5a adds "a mark that is not match
confidence" (the issue number's Read / Typed / Couldn't read, decided by a
check, never the model); 5c adds a cover that is a control (button for the
owner, link a sibling), the instantly saved change (status line + Undo),
labelled chips inside a detail page's section, the source line under a
description, and the admin twin of a detail page.

---

## 5a. Intake reads the book

### Scope

In: a comic sitting reads one entry per book with its issue number; Check
shows and corrects the number; commit adds the numbers (and any collected
edition) to the series. Out: ownership columns (5b), the cover wall control
and comic edit page (5c), mixed sittings (they keep today's prompt).

### Solution

```mermaid
flowchart LR
  P[photo] --> R{sitting kind}
  R -- comic --> C[COMIC prompt: books[] series, issue_number, format, range]
  R -- other/mixed --> O[today's prompt]
  C --> N[normalise number: '#4', '4 of 4', 'No. 4' -> 4; else none]
  N --> M[match series on Comic Vine; retry without a trailing story title]
  M --> K[run check: number within the volume's issues]
  K --> E[one entry per book]
  E --> CK[Check: number field on every entry]
  CK --> CM[commit: union numbers per series; collected -> edition]
```

- `backend/importer.py`: `COMIC_EXTRACTION_PROMPT` and `COMIC_DETECTION_SCHEMA`
  (from the test script's prompt), and a pure `normalise_issue_number(text)
  -> int | None` (1–9999; "1 of 4", "#4", "No. 4", "4" → int; "0", "½",
  "Annual 1", empty → None).
- `intake/reader.py`: choose the comic prompt when the sitting's kind is
  `comic`; one entry per book; never dedupe two books of one series. The
  entry payload gains `issue_number` (int | null), `number_source`
  (`read` | `typed` | `none`), `format` (`single` | `collected` |
  `unknown`), `collects_from` / `collects_to` and `edition_kind` (default
  `trade`) for a collected book.
- Matching: search with the series; when the best result is not exact and
  the series has a trailing ": <story>", retry with the part before it.
- Run check (pure, tested): in the run when the number is within the
  matched volume's issue count (from the candidate's Comic Vine data, or
  the series' `comic_issues` rows when it is already on the shelf); the
  Check mark reads "Read from the cover. In the run.", "Read from the
  cover. Not in this series' run.", "Typed." or "Couldn't read the number.
  Type it." Words in `content/`.
- Check (`CheckOne` / the list): an issue number field on every comic entry
  (1–9999, stated), the mark under it, "Issues it collects # to #" and a
  Trade/Omnibus/Hardcover choice for a collected book; Next is held until
  every kept single book has a number. Two entries for the same series and
  number: the second is flagged "Already in this sitting".
- Details: the comic `issues_owned` text field goes; per-book numbers
  replace it. Other Details fields stay.
- Commit (`intake/commit.py`): per matched series, the union of its books'
  numbers goes through the existing comics write path (`got_issues` for a
  series on the shelf, `issues_owned` on create, canonicalised by
  `comics.py`); a collected book adds an `editions` row. Done reads
  "<Series> · adds #1–4" and "<Series> · adds Vol. 4" style lines.
- `docs/design-system.md`: the non-confidence mark rule.

### Plan (TDD; one backend pytest run at a time)

1. `normalise_issue_number` + comic prompt/schema in `importer.py`, with a
   parse test over recorded model answers (use the 13 Nov results as
   fixtures: "1 of 4", "2", "4 of 4", "5", "1", "0", missing).
2. Reader: comic sittings use the comic prompt; one entry per book; the
   new payload fields; series retry without a trailing story title. Tests
   with a stubbed provider: four Waterworld answers → four entries; a mixed
   sitting still uses the old prompt.
3. Run check (pure) and the payload mark; tests for in run / not in run /
   no number / unknown count.
4. Entry edits: the number, format and collected range are editable through
   `PATCH /api/intake/entries/{id}` with validation (1–9999, from ≤ to);
   typed edits set `number_source = typed`.
5. Check UI: number field, mark, collected fields, duplicate flag, Next
   held; Details loses the comic range field. Matches
   `a-intake-check.html` at 1280 and 400.
6. Commit: numbers per series and the collected edition; Done lines.
   Test the queue's case: four Waterworld entries #1–#4 commit to a series
   holding #1–4, on create and when the series exists (Waterworld already
   owns #1–4 in production: committing them again changes nothing).
7. Docs: design-system rule, changelog bullet, CLAUDE.md (intake reads
   issue numbers for comic sittings; the comic prompt), this doc's 5a
   marked done.
8. Verify: full backend pytest once, `npm test`, lint, format, ruff, build,
   e2e.

Done when (5a's share of item 5): four photos of Waterworld #1 to #4
produce four entries at Check and a series holding #1 to #4; existing rows
keep what they recorded.

Ship notes: no migration; no public endpoint change.

5a status: done (13 Nov 2026)

Deviations from the plan above:

- The pure parts live where the code already had a home: the prompt,
  schema, `normalise_issue_number` and `parse_books` in `importer.py`, the
  run check and the entry-edit validation in a new `intake/comic_books.py`.
- The run check is computed when an entry is shown (`number_check` in
  `entry_json`), not stored, so it follows a changed match or a synced
  series. The words stay in `frontend/src/content/comicIntake.js`; the
  server sends a state (`in_run`, `out_of_run`, `read`, `typed`, `none`).
  A typed number reads "Typed." only, whatever the run.
- A series on the shelf is judged by the highest issue in its
  `comic_issues` rows (or its released count), else the candidate's Comic
  Vine `issue_count`; `on_shelf` gained `issue_max` for it.
- The comic `issues_owned` field stays in the kind registry (the add bar
  types it) and is hidden from Details by a new `in_details` flag on
  `FieldSpec`, not removed.
- Check shows a comic sitting's books as one list of rows (tick, photo,
  match, number and mark) with "What this adds" under it, in place of the
  skim grid and the "Already on the shelf" group, which a comic sitting no
  longer uses. Uncertain books are still asked one at a time first.
- Next is held for a ticked single book with no number and no typed range;
  a repeat of a series and number is flagged ("Already in this sitting")
  but does not block (the commit unions numbers, so it is harmless).
- An `unknown` format needs a number like a single; switching a book to a
  collected edition is the way out for a spine.
- A collected book with no range adds the series (and the shelf format)
  and no edition, since an edition needs a range; its label is the title as
  read.
- A collected book's edition (`shelf_kinds.book_edition`) is added to the
  series whatever the entry's state (an exact match to a series on the shelf
  is `owned`) and whatever the shelf format says: editions and the shelf
  format are independent, so Details' "Set for all: Singles" keeps a read
  trade's edition. A range the series already holds in any edition (any
  kind or label) is not added again, and Done does not report it.
- A collected book's implied shelf format (trades, omnibus) fills a series
  that has none and creates a new one; it never overrides the format a
  series on the shelf has. A format Details set on the entry still wins.
- An edition added at commit takes the issues it covers out of
  `issues_skipped` (Got it's rule), written through `comics.py`.
- Check's run check takes the most any source says: the candidate's Comic
  Vine count, the series' synced issue rows, its released count and its
  highest owned issue, so a stale count never marks a real issue out of the
  run.
- A number save never disables the page (so Tab goes on to the next field);
  saves of one book go one after another, each on the payload the last
  left. The server's 422 for a book field is `{field, message}` and shows
  beside that field. Blank or whitespace clears a number; non-ASCII digits
  and very long digit strings are refused in the field's words.
- Within one read, a repeated search (the same title, year and platform) is
  answered from memory, so N books of one series are one Comic Vine search
  plus at most one story-title retry; a busy source is asked once.
- The commit answer gained `series_new` (a created series' issues,
  editions and external id) so Done can say "<Series> · adds #1–4" for a series that is
  not "grew"; editions added to a series already on the shelf come from
  `series_grew.editions_added`.
- Entries read from one photo have the same `created_at`, so their order
  in the list within a photo is by id (as for every shelf photo today);
  numbers, not position, say which book is which.
- No visual check against `a-intake-check.html` at 1280 and 400 was made
  in a browser (the admin e2e needs local data); the layout follows the
  mockup's grid and breakpoint.
