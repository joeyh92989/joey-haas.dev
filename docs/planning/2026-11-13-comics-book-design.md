---
status: 5a, 5b, 5c done (5c implemented, awaiting merge)
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

---

## 5b. Ownership on the book

### Problem

What is owned, read and skipped lives only as range text on the series row
(`issues_owned`, `issues_skipped`, `editions`, `read_to`). `comic_issues`
is a Comic Vine cache keyed `(item_id, number)` with no ownership, and
`cv_id` and `fetched_on` are NOT NULL, so a book Comic Vine hasn't synced
(or a series with no Comic Vine link) has no row to carry a mark.

### Decisions (my calls)

1. **Marks go on the issue row**, as the queue says: `comic_issues` gains
   `owned`, `read` and `skipped` (boolean, NOT NULL, default false), and
   `cv_id` and `fetched_on` become nullable so a book Comic Vine hasn't
   synced can have a row (a "stub"). Dropping NOT NULL loses no data.
2. **The migration only adds columns and relaxes the two constraints; it
   inserts no rows.** The deploy order is migrate-then-merge, so the old
   code runs against the new schema for a few minutes; a stub row with a
   null `cv_id` would break the old code's issue serializers. Stubs and
   marks are written by the new code only.
3. **One writer.** `comics.py` gets `sync_marks(session, item)`: from the
   series' canonical ranges, `editions` and `read_to` it sets every row's
   marks (owned = held as a single or in an edition; read = owned and
   ≤ `read_to`, since read implies owned; skipped = in `issues_skipped`),
   inserting stubs for held or skipped numbers with no row and clearing
   marks on rows no longer held. Every comic write path already ends in
   `apply_comic_fields` or `got_issues`; each calls `sync_marks` in the
   same transaction. `comic_issues.sync_series` (the Comic Vine upsert)
   never touches the marks, and fills a stub's Comic Vine fields when the
   issue arrives.
4. **Backfill by the same function**, not by SQL in the migration: an
   admin route `POST /api/comics/marks/backfill` (idempotent, not in
   `JOB_ROUTES`) runs `sync_marks` on every comic row, run once after the
   deploy. It derives only from what each row already records.
5. **Readers don't change in 5b.** Public and admin pages keep reading the
   ranges; 5c switches them to the marks and adds the tap route. A parity
   test (and the backfill's answer: series, rows marked, stubs added,
   mismatches) shows the two agree before anything reads the marks.
6. **Skips stay private.** No public output gains a mark field in 5b; 5c
   adds `owned`/`read` to the public wall and pins it in
   `tests/test_public_issues.py` (where the issue pins live, not
   `test_public_outputs.py`), with `skipped` forbidden.
7. **Admin `ItemOut` gains `issues_synced_on`** (item 3's gap), so the
   admin Comics card can show sync state in 5c.

### Plan (TDD; one backend pytest run at a time)

1. Migration `0017`: the three mark columns (server default false), and
   `cv_id` / `fetched_on` nullable; model updated. Rehearse with
   `tests/test_migrations.py` (upgrade, downgrade, upgrade); the downgrade
   deletes stub rows (null `cv_id`) before restoring NOT NULL.
2. `comics.sync_marks` (pure core over the parsed series + a small DB
   apply), with tests: singles, editions, read_to, skips, a number that
   stops being held, stubs created and later filled by a Comic Vine
   upsert, idempotence.
3. Wire `sync_marks` into every comic write path (PATCH/create/bulk
   create, Got it, Skip, intake commit's comic path, editions link) in
   the same transaction; a test per path. `sync_series` leaves marks
   alone (test).
4. Every reader of `comic_issues` tolerates a stub (null `cv_id`, no
   cover): public wall, issue page, edition linking, snapshot export,
   status. Tests.
5. Backfill route + parity check; tests on a seeded Waterworld (#1–4
   owned), a series with editions, one with skips and `read_to`.
6. `issues_synced_on` on `ItemOut`.
7. Docs: CLAUDE.md (migration `0017`, `sync_marks` as the one writer, the
   backfill run after deploy), changelog bullet, this section's status.
8. Verify: full backend pytest, frontend tests (any `ItemOut` consumers),
   ruff, lint, build, e2e.

Ship: apply `0017` to Neon from the worktree before merging (Joey approved
running migrations, 13 Nov 2026), merge, then run the backfill once
(signed in, from the browser) and record its parity answer.

5b status: done (13 Nov 2026)

Deviations from the plan above:

- `sync_marks` is a pure `mark_plan` (ranges in, marks out) plus a small DB
  apply, both in `comics.py`; it returns a `MarksResult`
  (`rows_marked`, `stubs_added`, `rows_changed`) that the backfill sums.
- A skip stored before the rule that refuses one on a held issue loses to
  ownership in the marks (owned, not skipped), as every reader treats it.
- `load_issues` and the index query hide stubs (null `cv_id`) and Check's
  `issue_max` ignores them, so no public body or run check changes. This is
  the plan's task 4; the edition link, snapshot export and status never read
  the table, so they needed nothing.
- `upsert_issues` updates a stub whatever the incoming `cv_id` (the
  lowest-id-wins guard compared against NULL and would never fill it).
- The backfill's parity check recomputes the expected marks through
  `series_from_row` (the readers' derivation) rather than `mark_plan`, and
  a series whose stored ranges will not parse is listed under `errors`
  while the rest are marked. Answer: `{series, rows_marked, stubs_added,
  rows_changed, mismatches, errors}`.
- The parity check is not independent evidence: `series_from_row` and
  `mark_plan` both parse through `owned_set`, `expand` and `parse_ranges`,
  so a bug in those would pass both. It catches a missed write path or a
  stale row, not a wrong reading of the ranges.
- A stub left with no mark (the number is no longer held or skipped) is
  deleted by `sync_marks` (our row, never a Comic Vine one); stubs go in
  with ON CONFLICT DO NOTHING and the rows are read back after, so a
  concurrent Comic Vine upsert keeps its row and gets the marks. A PATCH
  that changes `type` away from comic clears the marks and removes the
  stubs (an empty plan). A PATCH flushes through `_write_or_conflict`
  before `sync_marks`, so a re-link onto a held match is a 409.
- Bulk create and intake's commit of new series reach `sync_marks` through
  `commit_items`, after the rows are inserted.
- No frontend change: `issues_synced_on` is an additive field on `ItemOut`
  nothing reads yet, so the frontend tests are not rerun for this item
  beyond the full verification below.

---

## 5c. One place to edit, and a comic edit page

### Problem

The public series page draws the cover wall only when something is owned,
and the wall has no owner control; ownership is edited through range text,
the run editor's cells and the issue page's buttons. Read is one number
(`read_to`), so "read" can't be set per book, and 5b's `sync_marks`
rederives every row's `read` from it. The admin comic page is the game
form. Joey (13 Nov): the public comic page should show what the admin page
shows, minus the edit controls and private fields.

### Decisions (my calls)

1. **Read becomes per book.** The marks are the record from 5c on: a tap
   sets one issue's state, and `comics.py` keeps the series' range text
   and `read_to` in step from the marks (one writer, as the queue says):
   `issues_owned` = the owned singles; `read_to` = the highest n with every
   owned issue up to n read (what Read next and the run lanes already
   mean). `sync_marks` stops rederiving `read` from `read_to` except when a
   write sets `read_to` explicitly (the API still accepts it; it then marks
   every owned issue up to n read and clears those above, as today).
2. **One write for every tap**: `POST /api/comics/{id}/issues/{n}/mark`
   `{state: "missing" | "owned" | "read"}` (admin, not in `JOB_ROUTES`).
   Owned adds the single (and clears a skip, as Got it does); read sets
   owned and read; missing removes the single and clears read. An issue
   held only in an edition can't be made missing from a cover: 409 "In
   <edition>. Edit editions on the comic's page." and the cycle there is
   owned ↔ read. Skip keeps its route and stays on the issue page. The
   wall, the issue page and the admin page all use this one route. Undo
   posts the previous state back.
3. **Pages read the marks.** The public wall and issue page take owned and
   read from the rows (`owned`, `read` added to `WALL_FIELDS` /
   `ISSUE_FIELDS` in `tests/test_public_issues.py`; `skipped` stays out
   of every public body and is pinned out). A held issue with no Comic
   Vine row (a stub) shows on the wall as a numbered blank cover.
4. **The wall always shows** for a series with issue rows or anything held,
   with **Show: All · Missing** (labelled chips, counts). Signed in it is
   open; for visitors a long missing stretch folds as today.
5. **Comic edit page** at `/admin/shelf/comics/:id` (the twin rule's
   path); `/admin/collection/:id` for a comic redirects there client-side,
   games keep their path. Panels per `d-admin-comic.html`: Series (title,
   status, rating, favourite, following, public, notes), Issues (the same
   wall with taps, counts), Editions (add, remove, link), Comic Vine match
   (Refresh, re-link), Delete (item 4's confirm). Gone: Pin as Up next,
   the journal's Minutes, platform, format, the range text field, the
   read-to field, the run cells (`ComicRunEditor` retires).
6. **Public mirror** (Joey's ask): the public series page shows
   description ("From Comic Vine" under it), publisher, years, issue count
   (Comic Vine's `count_of_issues`, added to the public allowlist), shelf
   format, editions, the wall and Read next — everything the admin page
   shows except edit controls and private fields (notes, skips, prices,
   following). An empty Comic Vine description shows nothing, not a
   placeholder.

### Rules added to `docs/design-system.md` in this PR

A cover that is a control (button for the owner; the issue link is a
sibling; the button's name says the state it moves to); the instantly
saved change (status line under the thing changed, Undo, no toast);
labelled chips inside a detail page's section; the source line under a
description ("From Comic Vine", omitted when empty; a cover-only issue
says "Cover from Comic Vine"); the admin twin of a detail page (rail,
breadcrumb, `AdminPageHeader` with the page's actions, panels); and the
public mirror rule: a public detail page shows what its admin twin shows,
minus edit controls and private fields.

### Plan (TDD; one backend pytest run at a time)

1. Backend: the mark route and per-book read in `comics.py` (marks →
   `issues_owned` + `read_to`; `sync_marks` keeps row reads unless
   `read_to` is written); edition-held 409; skip clearing. Tests for
   every state change, Undo round-trips, cumulative `read_to`, the
   explicit `read_to` write path.
2. Public reads: wall and issue page from the marks, `owned`/`read` added
   and pinned, `skipped` pinned out; stubs drawn as blank covers;
   `count_of_issues` on the public allowlist with its pin.
3. `CoverWall`: owner mode (B1 cycle via the route, status line + Undo,
   edition-held cycle), Show All · Missing, signed-in open, always shown.
   Matches `b1-series-cycle.html` at 1280 and 400.
4. Issue page: the owner controls write through the same route (Skip
   unchanged); "From Comic Vine" / "Cover from Comic Vine". Matches
   `c-issue.html`.
5. Public series page: the mirror fields; the wall replaces `RunBox`
   whenever there are rows; `ComicSummary` no longer hides at zero held.
6. Admin comic page `AdminComic.jsx` at `/admin/shelf/comics/:id` with the
   redirect, `ADMIN_ROUTES` row, links updated (`AdminComics`, `Item`,
   `ComicEdition`, `adminListPath`); `ComicRunEditor` and the comic range
   fields retired from `AdminItem`/`ItemForm`. Matches `d-admin-comic.html`.
7. Docs: design-system rules above, CLAUDE.md (marks are the record; the
   mark route; the comic edit path), changelog bullet, `voice.md` if a
   word is new, this section's status, and the queue's item 5 ticked in
   CLAUDE.md's TODO.
8. Verify: full backend pytest, `npm test`, lint, format, ruff, build,
   e2e.

Done when (the rest of item 5): owned and read set by tapping a cover,
signed in, on the series page and the issue page, both writing the same
data; the range text field and the run cells are gone from the comic edit
page; signed out, no skip or owner control appears anywhere; existing rows
keep what they recorded (Waterworld still owns #1–4).

Ship notes: no migration. Public outputs gain `owned`, `read` and
`count_of_issues`, all pinned.

### 5c status: done

Tasks 1 to 8 built on `feat/comic-edit-in-place`; nothing pushed.

### 5c Deviations

- **`sync_marks` preserves reads.** The plan said it "stops rederiving
  `read` from `read_to` except when a write sets `read_to`". Done as
  parameters: `from_read_to` (item PATCH that carries `read_to`) and `reads`
  (the mark route); every other writer keeps the read marks of rows that stay
  owned, and a newly held number reads as `read_to` says. `mark_mismatches`
  no longer compares `read` (it cannot be derived), only owned, skipped and a
  read mark on a book not owned.
- **`read_to` after a tap** is the highest owned issue with every owned issue
  up to it read; reading #2 before #1 leaves `read_to` unset until #1 is
  read. Existing rows keep the `read_to` they have until a tap changes it.
- **The mark route takes an optional `to`** (mark #n through #to). The edition
  page's Read to the end uses it (it marks the book's issues read; it no
  longer marks everything before the book, which `read_to` did).
- **A new admin read, `GET /api/comics/{id}/wall`,** serves the wall and the
  comic block for any comic. The admin page for a private series needs it,
  and the public route 404s a private row.
- **Public reads tolerate rows the marks have not reached:** a held issue is
  held if the row says so or the ranges do, and read if the row says so or
  `read_to` does (the series detail's read count is the larger of the two).
- **`count_of_issues` is stored as `issue_count`**, so the public field on the
  comic block is `issue_count`.
- **The Issues panel on the admin page is the wall itself**, with the counts
  line and a hint, not the mockup's link to the series page (a private series
  has no page). The number under a cover is not a link there when the series
  is private.
- **`ComicSummary` at zero held** shows the format, issue count and "as of"
  notes only (no "0 of N" count); nothing recorded and no notes shows nothing.
- **No `ADMIN_ROUTES` row** for `/admin/shelf/comics/:id`: it is a dynamic path
  like `/admin/collection/:id`, which the test excludes; the Comics page owns
  it by prefix.
- **The admin comic page has no Reads table** (playthroughs), as the panel
  list says; status moves go through the status route. Comic Type is no longer
  offered on the game page.
- Undo of a tap on a skipped cover posts `missing`, so the skip is not
  restored (owning clears it).

Review follow-ups (after the first pass):

- `plan_mark`: missing on a book held as a single and in an edition keeps its
  read mark (the edition still holds it).
- The wall draws for a series with issue rows, `released > 0` or anything held,
  and the admin page has an "Add issue #" box (1 to 9999) that posts `owned`
  to the mark route; a number with no row gets a stub and shows on the wall.
- Undo restores a skip the tap cleared (`setMark` missing, then the skip) and
  what a first tap moved on a Want: the mark route answers `previous`
  (`owned_format`, `status`, only what changed) and Undo puts it back
  (`restoreSeries`).
- The shelf card's read count and Tonight's comic progress use the marks-based
  count like the series page (`read_marks_by_item`); `comic_issues` joined the
  `/api/public/next` fingerprint (keyed by item and number), with a test.
- Focus: after Undo it returns to the cover button (wall) or the Owned button
  (issue page); under Show: Missing a tapped cover's focus moves to the next
  cover, or the wall heading.
- PATCH takes the row lock when its body touches the mark fields, so it
  cannot interleave with a tap (no test: the lock needs two live connections).
- `e2e/fixtures/api/issue.json` carries `owned` and `read`.
- The wall's "The number opens the issue" line shows only when numbers are
  links (not on a private series' admin wall).
