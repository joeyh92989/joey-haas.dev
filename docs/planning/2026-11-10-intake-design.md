---
status: planned
mockups: docs/planning/mockups/2026-11-10-intake/
chosen: chosen.html
demo: d-public-demo.html
---

# Intake: one way in for everything with data behind it (design)

Date: 2026-11-10 · Repo: joey-haas.dev · Mockups under
`docs/planning/mockups/2026-11-10-intake/` (`index.html` links them;
`chosen.html` is the direction below, `d-public-demo.html` the public demo).
Every mockup has a toolbar for theme (dark / light), width (1280 / 400) and
screen.

## Problem

The whole closet, the whole comic collection and a Blu-ray/DVD collection
are about to be entered. Each needs a bulk path and a single path, by photo
or by search, and it has to be pleasant enough to survive item 300.

Today each "thing" has its own way in, built at a different time:

| Thing | Bulk | Single | Unfinished work lives |
|---|---|---|---|
| Games, movies, comics, board games | `/admin/import`: photos → titles read by the model → matched through `sources/` → review grid → `POST /api/items/bulk` (`importer.py`, `AdminImport.jsx`) | `ItemForm` with the metadata picker (`GET /api/items/search-metadata`) | In the browser only. Closing the tab loses the batch (`AdminImport.jsx` says so) |
| Comics (series) | same importer, no issues or format asked | Pull list search → Follow / Want (`comics_routes.py`); owned issues typed on the edit page | n/a |
| Garments | ＋ Camera: up to 24 photos, one untagged garment each (`POST /api/closet/garments/photos`), tagged 10 per model call by the queue (`closet_tag.py`) | `POST /api/closet/garments` | On the server, as `untagged` garments |
| Denver spots | finder candidates → accept / dismiss | `POST /api/spots` | On the server, as candidates |

The parts are good and already shaped alike (read, match, review, commit),
but nothing binds them: a new kind of thing, or a new field on an existing
one, means another page, another review grid and another commit route.

## Scope

**In**

- An intake framework: a registry of **kinds**, each declaring its ways in,
  its recogniser, its matcher, its review fields and its commit.
- Five kinds at launch: game, movie, comic, board game, garment. Plus
  "mixed shelf", which is not a kind but a sitting whose reader assigns a
  kind per title (the importer already does this).
- **Sittings** (bulk): Shoot → Check → Details → Done, saved on the server,
  resumable on another device.
- **The add bar** (single): search or type on the Collection and Closet
  pages, with a drawer for the kind's fields.
- An **Add page** per area (`Shelf` and `Closet`) that starts sittings and
  lists unfinished ones. It replaces Import photos (`/admin/import`).
- A **barcode slot**: shown, disabled, labelled as later.
- A **public sandbox demo**, client-only, plus a stop on How it works.

**Explicitly out**

- Barcode scanning itself (no lookup source or iPhone Safari camera support
  has been verified).
- Denver spots: its candidates come from Overpass, not the owner.
- Board game matching (BGG is still blocked; the kind is type-only).
- Issue-level comics. A comic stays one row per series with range text.
- Bounding boxes or per-title crops of a shelf photo.
- Changing what any existing write rule decides (`formats.py`, `comics.py`,
  `playthroughs.py`, `apply_garment_fields`, the favourites cap).
- The pull list's Follow / Want and the edit pages: unchanged.

## Design

### The framework

A kind is the unit of extension: a declaration plus the few functions that
are truly its own. Everything else is shared.

```mermaid
flowchart LR
  subgraph Ways in
    P1[Shelf photo<br/>many per photo]
    P2[Piece photo<br/>one per photo]
    S[Search]
    T[Type it in]
    B[Barcode<br/>later]
  end
  P1 & P2 --> R[Recognise<br/>kind's own]
  R --> M[Match<br/>kind's own, optional]
  S --> M
  T --> D
  B -.-> M
  M --> D[(Draft entry<br/>saved on server)]
  D --> V[Review<br/>shared UI + kind's fields]
  V --> C[Commit<br/>kind's existing write path]
  C --> X[(items / garments)]
```

| A kind declares | Game / movie / comic / board game | Garment |
|---|---|---|
| Ways in | shelf photo, search, type (board game: type only) | piece photo, type |
| Recognise | the importer's title extraction, one photo per request | thumbnail, then the tag queue (10 per call, three strikes) |
| Match | `sources/` adapter + `matching.py` confidence | none: no catalogue |
| Review fields | game: platform, format · movie: disc · comic: issues owned, shelf format · all: status, acquired | name, slot, colour, material, warmth, formality (the tagger's answer, editable) |
| Has a Details step | yes | no |
| Commit | the existing item write path (`apply_copy_fields`, `comics.py` ranges, duplicate skip, `playthroughs` seeding) | `apply_garment_fields` |
| Duplicate rule | `(external_source, external_id)` | none |
| "Check" means | confidence is not exact, or more than one candidate | tagging failed three times, or a required value came back unusable |

One field list per kind drives three places: the sitting's Details step, the
single-add drawer, and the "set for all" row. Adding a field is one entry in
that list (plus its column if new). Adding a kind is one module and one
registry line, as `sources/` already works for adapters.

An entry's states:

```mermaid
stateDiagram-v2
  [*] --> reading: photo uploaded
  [*] --> ready: single add / search
  reading --> ready: exact match, or tagged cleanly
  reading --> check: uncertain, several candidates, or tagging failed
  reading --> failed: photo unreadable
  check --> ready: owner confirms or fixes
  check --> skipped: Skip
  check --> ignored: Not mine
  ready --> added: commit
  ready --> duplicate: already on the shelf
  skipped --> check: resume
  failed --> reading: retry
```

### Screens (all in `chosen.html`)

**Add bar** (screen "Add bar"; Collection and Closet). One row above the
grid: a text field, ▤ Photos, and the disabled barcode button.

- Typing and submitting searches every configured source for the area and
  lists results, each labelled with its kind. A result already owned says
  "On shelf" and links to it instead of adding.
- Add on a result opens the drawer. ▤ Photos opens the Add page's kind
  choice (or goes straight to Shoot when the area has one photo kind, as
  the Closet does).
- On the Closet the field is "type a piece to add it by hand" and there is
  no search.
- An unfinished sitting shows as one line under the bar with Resume. Shelf
  drafts never appear in the collection grid.

**Single-add drawer** (screen "Single add"). The chosen result, the kind's
fields, then Add to shelf, Add and search again (adds, closes, refocuses
the bar with the query cleared), Cancel. Beside the grid at 1280; a bottom
sheet at 400. "No match, keep as typed" is offered when a search returns
nothing, creating a manual row.

**Add page** (screen "Add page"; `Add` in the Shelf and Closet page lists,
badge = entries left to check). Kind tiles built from the registry, each
listing the ways in it declared; then Unfinished, one row per sitting with
its label, kind, counts, a three-part meter (ready, to check, still
reading) and Resume / Discard. Discard asks once.

**Sitting · 1 Shoot.** Take photos / Choose files. Each photo is uploaded
and read on its own; the strip shows per photo: queued, reading, N read,
N read · 1 blurred, or failed with Retry. A running line gives titles so
far, exact, to check, and photos still reading. Start checking is enabled
as soon as one photo is read. "Search instead" adds entries to the same
sitting by search.

**Sitting · 2 Check.** Two parts.

- *One at a time*, for entries in `check` only: the source photo, the text
  that was read, candidates as a radio group with the best pre-selected,
  then Yes, this one · Search… · Skip, and two quieter actions: Not mine,
  ignore · Keep as typed, no match.
- *Skim grid*, for exact matches: covers with a ticked checkbox each;
  untick to drop one. No per-item tap needed.

For garments (screen "Clothes · Check") the left side is the piece photo
and the right side is the tagger's fields with the missing ones empty;
actions are Save and next · Tag again · Skip · Remove this photo. Pieces
tagged cleanly are not shown one at a time.

**Sitting · 3 Details** (kinds that have one). "Set for all N" with the
kind's fields and Apply, then a compact row per entry with the fields that
differ per item (a comic's issues). Finish later keeps the sitting; Add N
commits.

**Sitting · 4 Done.** Four figures taken from the commit's own answer:
added, already on the shelf, skipped and kept, photos that read nothing.
Then Shoot the next box (new sitting, same kind), Publish these N (shelf
kinds only), See them on the shelf.

**Closet** (screen "Closet"). Unchanged in substance: untagged pieces are
real garments and show in the grid at once; ＋ Camera becomes the add bar's
▤ Photos, and the "N photos waiting · Tag now" line stays.

**Public demo** (`d-public-demo.html`, proposed at `/shelf/intake`). A
drawn shelf of nine film spines, "Read this shelf", a four-stage strip
(Read, Match, Review, Add) that lights as the recording plays, and the
Check rows with their confidence labels. The final button says it is
pretend. Everything comes from a recorded fixture shipped with the site:
no API call, no model call, nothing stored. It states that confidence is
computed from string distance and never reported by the model.

### States and errors

| Situation | What the owner sees |
|---|---|
| Backend asleep | The existing "Waking the server" treatment; the add bar and Add page stay usable once it answers |
| A photo fails to read (model error, timeout) | That photo's tile says failed with Retry; other photos are unaffected |
| A photo reads nothing | "nothing read" on the tile; counted on Done |
| Wrong file type or too large | Refused before upload with the file's name, as today (JPEG, PNG, WebP, HEIC; 14 MB) |
| Source has no credentials | That kind's search and matching are off; the tile says so (board games: "no source until BGG opens") and entries are kept as typed |
| Source rate-limited or down | The entry stays in `reading` with "Comic Vine is busy, will retry"; nothing is recorded as a miss |
| Already on the shelf | Shown dimmed and unticked in the skim grid; counted on Done, never an error |
| A commit refuses a row (bad issue range, contradicting cart ID) | The Details row shows the write path's own message beside the field; nothing is added until it is fixed or unticked |
| The day's model budget is used up | Unread photos say "waiting for tomorrow's budget"; checking what is already read carries on; the reason uses #121's wording, never "did not answer" |
| Garment tagging budget spent | "N waiting for tonight's run" with Tag now; the sitting stays open |
| Empty Add page | The kind tiles and "Nothing unfinished" |
| Sitting opened on a second device | The same state; the last write wins per entry |

### The model budget

`llm.py` records the free tier as measured: twenty requests a day per
model (`FREE_TIER_DAILY_REQUESTS`), across three models tried in order, so
about sixty calls a day for the whole site. A 429 is not retried, because
a daily quota does not refill in seconds. Intake shares that budget with
the nightly Closet tags, outfit plans, Discover, the Sunday spot finder
and the Closet opinion (#121 already saw Discover fall back to its
template picks with the model unanswered).

What intake spends:

| Work | Calls |
|---|---|
| One shelf photo (15 to 20 titles) | 1 |
| Ten garments tagged | 1 |
| A 300-piece closet | about 30 |
| 400 discs and comics at 15 to 20 a photo | about 20 to 27 |

So the whole backfill is roughly a day's entire budget, and realistically
two or three days beside the nightly jobs. Design consequences:

- **Uploading and reading are separate.** Shoot accepts every photo at
  once; reading is a queue. When the day's budget is gone the unread tiles
  say "waiting for tomorrow's budget" and the running line says how many
  are waiting. Nothing fails and nothing is lost.
- **This makes keeping the photo a requirement, not a nicety**: a photo
  that has to wait for tomorrow must be stored until it is read (see Open
  questions).
- **The sitting says what it will cost** before Shoot ("about 1 model call
  per photo; N left today" when the count is knowable, the plain rule when
  it is not).
- **Intake leaves room for the nightly** (proposed: stop reading when a
  small reserve is left; see Open questions).
- Search and typing cost no model calls and are never blocked by the
  budget.
- **Intake stays on the free tier** (Joey, 2026-11-10). The ceiling is
  widened without paying, by adding further free Gemini models to
  `GEMINI_MODELS` (see Open questions); the queue absorbs whatever ceiling
  remains. A paid model for a one-off sitting stays possible later through
  the provider switch `llm.py` already has, and nothing here assumes it.

### Responsive and theme

- 1280: the admin shell's rail and page list; Check is two columns (photo,
  candidates); the skim grid is eight across; the drawer sits beside a
  five-column grid.
- 400: the area's segmented control gains Add; Check stacks (photo on top,
  capped height); the three primary actions are full width with the primary
  on its own row; the skim grid is four across; the drawer is a bottom
  sheet; kind tiles are two across; the stepper keeps all its labels.
- Form controls take the shared admin rule from #123 (`:where(.admin-main)`
  inputs, selects, textareas and classless buttons: `--surface`, `--line`,
  8px radius). The mockups draw fields on `--bg` with a 6px radius; the
  shared rule wins, and intake adds no input styling of its own.
- Both themes, tokens only. No new colour tokens: confidence uses `--ok`
  (exact), `--accent` (probable) and `--badge` (check). `--badge` rather
  than `--warn` because `--warn` as text on `--surface` measures 4.24 in
  light, under 4.5; `--badge` is recorded at 5.38 there and equals `--warn`
  in dark. The meter's segments are non-text marks: measure `--ok`,
  `--badge` and `--line-strong` against `--sunken` before shipping
  (`--line-strong` is recorded as failing 3:1 elsewhere, so the "still
  reading" segment may need `--status-backlog`).

### Accessibility

- The stepper is an ordered list with `aria-current="step"`; moving a step
  moves focus to the step's heading.
- Candidates are a real radio group; the skim grid is real checkboxes whose
  label is the title.
- Reading progress is announced through one polite live region ("Photo 3
  read, 11 titles"), not per title.
- Confidence is always a word (Exact, Probable, Check), never colour alone.
- Nothing is hover-only; the drawer traps focus and returns it to the Add
  button that opened it; Escape closes it.
- Touch targets are at least 44px at 400.
- A disabled way in (barcode, a source with no credentials) is a disabled
  button with its reason in text, not a hidden one.

### Public copy

**How it works: rewrite stop 1, do not add a tenth.** Stop 1 is already
the photo import (`where: '/admin/import'`), and its live caption says in
public that "nothing from a photo is kept after the request completes".
That sentence stops being true if sittings keep a thumbnail, so it changes
in the same release. Draft, in the page's voice:

- `where`: Shelf's Add page.
- `title`: Takes everything in the same way
- `claim`: Games, films, comics and clothes all come in through one
  pipeline: photograph a shelf or search for a title, let the source match
  it, check the doubtful ones, add. A vision model reads the titles off the
  photo and is never asked how confident it is: the server compares each
  title with the source by string similarity and marks the match exact,
  probable or uncertain.
- `why.lead`: Why one pipeline:
- `why.text`: each kind of thing declares only what is its own: how it's
  recognised, what it's matched against, which fields it asks for. A new
  kind is one module, not a new page. And a similarity score can be tested
  where a model's confidence can't, so the whole matching path runs in
  tests without calling the model.
- `live.caption`: The newest things on the shelf. The intake itself is
  signed-in only, but you can try it on a recorded shelf. A shelf photo is
  kept as a small thumbnail until its sitting is added or discarded, then
  deleted. (Drop the last sentence if photos are not kept.)
- The capture's rows and the `code` list follow the built files.

**Demo page** (as drawn in `d-public-demo.html`):

- Title: Try the intake
- Lede: Everything on my shelf got there through one pipeline: photograph
  it or search for it, let the sources match it, confirm, add. This is that
  pipeline on a recorded shelf. No model is called and nothing is saved.
- Stages: Read (a model reads the spines) · Match (titles looked up in
  TMDB) · Review (a person confirms) · Add (rows written, private)
- Buttons: Read this shelf · Search instead · Start over · Add 7 (pretend)
- Empty: Nothing read yet. Press "Read this shelf".
- Under the shelf: The same four stages take a rack of clothes: one photo
  per piece, a tagger instead of a catalogue, the same review and the same
  commit. How it is built →
- Fine print: Confidence is computed from string distance between what was
  read and what the source returned. The model never grades itself.

**Changelog entry** (for the day it ships):

- One way in for everything I track: photograph a shelf or a rack, or
  search for one title; the sources match it, I check the doubtful ones,
  and it's added. Games, films, comics and clothes all use it, and a
  sitting can start on my phone and finish at my desk.
  [Try it on a recorded shelf](/shelf/intake).

## Key decisions

1. **B for bulk, C's bar for single, A's list for unfinished work.** Bulk
   and single are different jobs.
   - *A · Inbox lost* as the main surface: a cross-kind table is heavy on a
     phone and sits across an admin organised by area. Its batch list
     survives as Unfinished on each Add page.
   - *C · Add in place lost* for bulk: 400 dashed cards in the collection
     grid is scrolling, and it puts rows that do not exist yet inside the
     real collection. Its bar and drawer survive for single adds.
2. **Drafts are saved on the server** (Joey, 2026-11-10). A closet or a
   longbox is more than one sitting on more than one device. Cost: one
   additive migration and an expiry rule.
3. **Shelf drafts stay out of the collection; untagged garments stay in the
   closet.** A shelf draft is not an item until commit (it may be a
   duplicate or a misread). An untagged garment is already a garment with a
   photo, and the Closet design chose to show it at once.
4. **Only uncertain entries are asked one at a time.** Exact matches are a
   skim grid. One tap per item across a few hundred items is where the
   current importer would be abandoned.
5. **"Check" is data, never the model's opinion**, for every kind. This is
   the existing rule in `matching.py` and in Closet Review.
6. **The write paths do not move.** Intake calls them; it never writes a
   column itself. This is what keeps "entirely customised per kind"
   compatible with "one framework".
7. **Generic draft payload over a table per kind.** Less type-safe, checked
   by the kind on the way in and again at commit; in exchange a new kind
   needs no migration.
8. **Barcode gets a slot, not a build** (Joey). Ways in are pluggable, so
   it can arrive later without redesign.
9. **The public demo is a recording**, in the manner of Shelfle: the site's
   public pages stay free of model calls and writes.
10. **Reading is a queue under a daily budget**, not a promise of one
    sitting. The free tier's measured ceiling is the reason; server-saved
    sittings are what make waiting painless.
12. **Free tier only.** The backfill takes a few days instead of an
    evening; the budget is widened with more free models, not with
    billing. Sources for the figures:
    [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
    [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
11. **How it works keeps nine stops.** Intake replaces what stop 1
    describes, so stop 1 is rewritten rather than a tenth added.

### Checked against the PRs in flight (2026-11-10)

Read from the worktrees for #118 to #129 and the docs branch; the main
checkout had not been updated, so anything merged outside those is unseen.

| PR | Effect on this design |
|---|---|
| #123 admin form controls | Intake's fields use the shared rule; see Responsive and theme |
| #121 Discover failure note | Its named reasons are the wording for intake's model failures; its quota finding led to "The model budget" |
| #125 hide empty pages | The Comics tab appears only once a public comic is in the build's snapshot, so "Publish these N" on Done shows publicly after the next build, not at once. Done says so for comics |
| #120 weekly job next run | If sitting expiry joins the nightly, its row uses the same "next run" treatment |
| #119 / #124 wide routes | `/shelf/intake` is under `/shelf` and already wide; no change |
| #118, #122, #126, #127, #128, #129 | None |

## Component inventory

**New**

- `AddBar`: field, ▤ Photos, disabled barcode; props decide search or
  type-only.
- `AddResults`: the result list under the bar, kind label per row.
- `AddDrawer`: chosen result + `KindFields` + actions; drawer / bottom
  sheet.
- `KindFields`: renders a kind's field list; used by the drawer, Details
  rows and "set for all".
- `SittingStepper`, `ShootStep` (with `PhotoTile`), `CheckOne`,
  `SkimGrid`, `DetailsStep`, `DoneStep`.
- `ConfidenceBadge` (Exact / Probable / Check / On shelf).
- `KindTile`, `UnfinishedList` (with the three-part meter).
- Public: `IntakeDemo` with the drawn shelf and the stage strip, reusing
  `ConfidenceBadge` and the Check row.

**Existing, reused**

- `AdminPageHeader`, `Panel`, `StatTile` (Done's figures), `CoverImage`,
  `FilterChips` where a filter is needed, `useMediaQuery` for the
  drawer / sheet switch, `ADMIN_AREAS` for the two Add pages.
- Backend: `sources/` adapters and registry, `matching.py`, the importer's
  extraction prompt and schema, `closet_tag.py`, `closet_images.py`, the
  item and garment write paths.

**Retired**

- `AdminImport.jsx` and the Import photos entry (the route should redirect
  to Shelf's Add page).

**Tokens used**: `--bg`, `--surface`, `--sunken`, `--line`,
`--line-strong`, `--text`, `--text-2`, `--text-3`, `--accent`,
`--accent-ink`, `--accent-soft`, `--ok`, `--badge`, `--badge-ink`,
`--radius`, the three font tokens. No new tokens expected.

## Acceptance criteria

1. Each screen of `chosen.html` matches the built page at 400px and 1280px
   in both themes: Add bar, Single add, Add page, Shoot, Check, Details,
   Done, Closet, Clothes · Check.
2. The public demo matches `d-public-demo.html` at 400px and 1280px in both
   themes, makes no request to `/api`, and works with the backend asleep.
3. A sitting started on one device can be resumed on another at the same
   step with the same entries and choices.
4. Closing the tab during Shoot loses nothing already uploaded; reopening
   shows each photo's true state.
5. A shelf sitting of 40 exact matches can be committed without any
   per-item interaction beyond the skim grid.
6. Committing a sitting produces the same rows the current paths would:
   copy fields through `apply_copy_fields`, comic ranges canonicalised by
   `comics.py`, duplicates skipped and reported, playthroughs seeded, new
   items private.
7. A garment sitting creates the same garments and thumbnails as ＋ Camera
   does today, and an untagged piece is visible in the Closet at once.
8. Done's four figures equal what the commit reported.
9. Registering a kind (a test kind in the suite) makes it appear on the Add
   page with its declared ways in and renders its fields in the drawer and
   Details, with no change to any shared component.
10. Adding one field to a kind's list shows it in the drawer, the Details
    row and "set for all" without touching those components.
11. A kind whose source has no credentials shows its search disabled with
    the reason, and its entries commit as typed.
12. One failed photo does not fail the others, and can be retried alone.
13. No colour is a literal; confidence labels clear 4.5:1 and the meter's
    segments 3:1 on the surface they sit on in both themes, with the ratios
    recorded beside the rules in `index.css`.
14. Every action is reachable by keyboard; the stepper, radio group,
    checkboxes and live region behave as described under Accessibility.
15. `/admin/import` lands on Shelf's Add page.
16. With the day's model budget used up, uploaded photos wait and are read
    after the reset without being uploaded again; search and typing still
    work; no entry is recorded as a miss.
17. How it works still has nine stops, stop 1 describes intake, and no
    public sentence says a photo is never kept unless that is true.
18. The changelog has an entry, and the public demo has its row in
    `STATIC_PAGES` and `publicRoutes` and its rewrite in `render.yaml`.

## Open questions for Code

- **Movie disc format: recommended shape.** `OwnedFormat` is physical /
  digital / subscription and `PhysicalFormat` has only `disc`, so Blu-ray,
  4K UHD and DVD cannot be told apart today. Recommended: a new nullable
  `disc_format` column with its own enum (`dvd`, `bluray`, `uhd`), the way
  migration `0010` gave comics `shelf_format`. Reasons:
  - `physical_format` is the game copy's field: `formats.py` derives and
    protects it from cart IDs and the registry, the catalogue tables reuse
    the type, and the public shelf counts it per platform. Film values
    there would pass through rules written for cartridges.
  - Postgres cannot drop an enum value (the `0011` migration notes this),
    so widening a shared type is the one choice that cannot be undone; a
    new column can.
  - `source_metadata` is the source's snapshot, refreshed from TMDB; an
    owner's fact stored there would be overwritten or need special-casing.
  A combo pack records its best disc. Whether the field is public (as
  `shelf_format` is) and gets a filter chip is Code's call; the design
  needs only that the movie kind can write it. Code to confirm against the
  write paths.
- **Draft storage shape.** Proposed: a batch row (kind, area, label, step,
  timestamps) and an entry row (batch, kind, state, JSONB payload,
  candidates, chosen candidate). For garments, should the entry point at
  the existing `untagged` garment rather than copy it? Recommended: point
  at it, so images stay in `garment_images`.
- **Shelf photos have to be kept until read.** The importer keeps nothing
  after the request, but a photo waiting for tomorrow's model budget must
  be stored somewhere. Proposed: keep a reading-size copy until the photo
  is read, then only a small WebP (as `closet_images.py` makes) for Check,
  deleted when the sitting is committed or discarded. The alternative is
  asking the owner to upload again the next day, which defeats the
  sitting. Stop 1's public sentence changes either way (see Public copy).
- **Widen the free budget with more models.** `llm.py` found the free
  quota is per project per model, so each further model in `GEMINI_MODELS`
  adds its own daily allowance. Google's pricing page (read 2026-11-10)
  lists as free of charge: gemini-3.5-flash, gemini-3.1-flash-lite,
  gemini-3-flash-preview, gemini-2.5-flash and gemini-2.5-flash-lite. Its
  rate-limits page names models the pricing page does not (and `llm.py`
  already calls 3.7 and 3.6), and publishes no free-tier numbers, so:
  - list what the key can actually call, and measure each model's daily
    allowance the way the current figure was measured;
  - record real fixtures first: the same shelf photos and the same garment
    batch through each candidate, compared with today's answers (titles
    read, garments tagged, schema obeyed). A Flash-Lite model joins the
    list only if it holds up; a model that reads worse costs more in Check
    than it saves in waiting;
  - consider order by job: the strongest models for reading and tagging,
    the lighter ones as the tail, so the nightly jobs are not left with
    only the weakest model;
  - free-tier content is used to improve Google's products (stated on the
    pricing page). That already applies to today's importer and Closet
    photos; noted so it is a known choice.
- **A reserve for the nightly.** Should intake stop reading while some
  calls remain, so Discover and the outfit plan still get an answer?
  Google reports which limit was hit only on a 429, so a count of the
  day's calls would have to be kept by the API itself. Proposed: count
  them, and hold back a small fixed reserve.
- **Who drives reading?** Three photos in one request once took seven to
  eight minutes, hence one per request. With drafts on the server, can
  reading continue after the tab closes (a background task on a free-tier
  service that sleeps), or does the browser still drive it photo by photo,
  with criterion 4 covering only what was uploaded?
- **Cross-kind search** fans one query out to every configured adapter
  under each one's own throttle (Comic Vine about 1 req/s, 10 results
  max). The design is search-on-submit, not type-ahead; is a per-source
  partial answer acceptable when one is slow?
- **Mixed shelf.** The reader already classifies each title. Does a mixed
  sitting split into one Details pass per kind, or skip Details and leave
  kind fields for the edit page? Recommended: one pass per kind present.
- **Expiry and jobs.** Do abandoned sittings expire (proposed: 30 days,
  with their photos), and does the cleanup join the nightly job and
  `JOB_ROUTES`?
- **Limits.** Bulk create caps at 500 and Closet upload at 24 per request;
  does a sitting have its own cap, or just many requests under those?
- **Demo route.** `/shelf/intake` is proposed (it inherits the wide
  measure). Does it need the slash-form handling the other `/shelf/*`
  catch-all pages use, or its own rewrite like a static page?
- **Demo fixture.** Record it from a real run against a real shelf photo
  (fixtures first), not hand-written.

## Appendix: barcode, researched 2026-11-10

Not in this release. Findings, for the follow-up brief:

- **Scanning in the browser.** The native `BarcodeDetector` API is listed
  by caniuse as "disabled by default" in Safari on iOS and macOS and
  unsupported in Firefox; MDN calls it not Baseline. It does list `ean_13`,
  `upc_a` and `upc_e`. On an iPhone it would therefore need a decoder
  bundled with the site (self-hosted, like the fonts). No specific library
  has been evaluated, and camera access in iOS Safari was not tested.
- **UPC to title.** UPCitemdb's free plan needs no sign-up: 100 requests a
  day, 6 lookups a minute, at `api.upcitemdb.com/prod/trial/lookup`. Its
  terms pages were not read and its coverage of discs is unknown. TMDB's
  find-by-id accepts only IMDb, TVDB, Wikidata and social IDs, not a UPC.
- **Comics.** Comic Vine's issue resource lists no UPC or barcode field
  (its filter table could not be read in full). Trades and hardcovers have
  ISBNs: Open Library looks one up at `/isbn/<isbn>.json` with no key, at
  1 request a second, or 3 with an identifying User-Agent, and says its
  APIs are not meant as a backend for third-party services.
- **What that means.** Barcode is workable as one more recogniser: a scan
  yields a product title, which goes through the existing matcher like a
  title read from a photo. That fits films and collected comics, not
  single issues or clothes, and it costs no model calls, which matters
  under the budget above. Before designing it: scan twenty real discs
  against UPCitemdb and record the hit rate.

Sources: [caniuse: BarcodeDetector](https://caniuse.com/mdn-api_barcodedetector) ·
[MDN: Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API) ·
[UPCitemdb rate limits](https://www.upcitemdb.com/wp/docs/main/development/api-rate-limits/) ·
[UPCitemdb plans](https://www.upcitemdb.com/wp/docs/main/plan) ·
[TMDB find by ID](https://developer.themoviedb.org/reference/find-by-id) ·
[Open Library APIs](https://openlibrary.org/developers/api) ·
[Comic Vine API](https://comicvine.gamespot.com/api/documentation)

---

# Plan (Code, 2026-11-10)

Tier: **Full** (migration, a new nightly step and `JOB_ROUTES` entry, an
LLM-layer change shared by every model caller, a new public page and its
`render.yaml` rewrite). Built from `origin/main` at the base of `feat/intake`
(this doc is commit `0a22475`). Joey's calls (2026-11-10): four stacked PRs;
the browser drives reading with a nightly step as backstop; the public demo
ships last, from a recording of a real shelf photo; no GitHub issues.

## Corrections to the spec, found in the code

- **`OwnedFormat` has five values**: physical, digital, subscription,
  `borrowed` and `none` (the want list). The disc-format reasoning stands.
- **"One photo per request" is a client rule.** `POST /api/import/photos`
  accepts up to 20 files; only `AdminImport.jsx` sends one at a time. Intake
  makes it a server rule: its upload route takes exactly one file.
- **There are no page badges, only area badges** (`AreaBadge` in
  `AdminShell.jsx`; `adminAreas.js` pages are `{to, label, end?, count?,
  group?, alias?}`). The Add page's "entries left to check" badge needs a new
  page field, `badge: 'intake.shelf' | 'intake.closet'`, read from one count
  endpoint.
- **The Closet has no "N photos waiting · Tag now" line today**; it is built
  here (task 12), from the existing tag queue and `POST /api/closet/tag`.
- **The `.confidence-*` rules exist** (`index.css` ~2429-2450, used by the
  import page) with different colours from the design. `ConfidenceBadge`
  replaces them; the old rules go with `AdminImport.jsx`.
- **Nothing runs in the background.** No route outlives its request and
  Render's free tier sleeps, so "reading continues after the tab closes"
  means the nightly step (D4), not a task.
- **No cross-kind search exists.** Each adapter in `backend/sources/`
  (`igdb`, `tmdb`, `comicvine`, `bgg`) is called per kind; the fan-out is new
  (D5).
- **The phone layout is ≤900px** (the admin shell's breakpoint); 400px is the
  mockup width, which is where it is checked.
- **How it works stop 1** caption lives in `frontend/src/lib/spine.js`
  (~L115, `where: '/admin/import'`); both the caption and `where` change.
- **Shelfle-style fixtures come from the build snapshot**, not a recorded
  file; the demo's recorder is new (task 15).

## Open questions, resolved

| Question | Decision | Why |
|---|---|---|
| D1 · Movie disc format | Nullable `items.disc_format`, new enum `movie_disc_format` (`dvd`, `bluray`, `uhd`). Written only for `type = movie` (422 otherwise, in `_write_fields`); public like `shelf_format`; **no filter chip**. A combo pack records its best disc. | The spec's three reasons hold in the code: `formats.py` owns `physical_format`; enum values cannot be dropped. A chip can follow once there are discs to filter. |
| D2 · Draft storage | Migration `0015`: `intake_sittings` (id, area, kind nullable for mixed, label, step, created/updated), `intake_photos` (id, sitting FK cascade, state `uploaded`/`reading`/`read`/`empty`/`failed`, `attempts`, `error`, `reading_jpeg bytea` nullable, `thumb_webp bytea`, `width`, `height`), `intake_entries` (id, sitting FK cascade, photo FK nullable, kind, state `reading`/`exact`/`probable`/`check`/`owned`/`ready`/`ignored`/`typed`, `payload jsonb`, `candidates jsonb`, `chosen jsonb`, `garment_id` FK `ON DELETE CASCADE` nullable, `updated_at`), and `llm_usage(day date, model text, calls int, exhausted bool, PK(day, model))`. | One migration for the whole feature, additive. Garment entries **point at** the untagged garment so its image stays in `garment_images`. Last write wins per entry via `updated_at`. |
| D2 · Photo bytes | On upload: `reading_jpeg` = upright JPEG, long edge ≤3072, q90 (new `closet_images.make_reading_copy`), plus the 400px WebP from `make_thumbnail`. After a successful read `reading_jpeg` is set NULL; thumbnails are deleted with the sitting on commit or discard. | A waiting photo has to survive until tomorrow; 3072px keeps spine text legible at ~1–2 MB; the thumbnail is all Check needs. |
| D3 · Model budget | `build_provider(config, recorder: UsageRecorder \| None = None)`. `GeminiProvider` calls `recorder.attempt(model)` before each try and `recorder.exhausted(model)` on a 429 whose quota id contains `PerDay`. The recorder writes through **its own short session** (commits even when the request rolls back). Day = **Pacific** calendar day (Google's reset). `remaining = Σ(20 − calls)` over models not exhausted today, **minus a reserve of 12**; the reader refuses to start a read when `remaining ≤ 0`. Enforced only when `llm_provider == "gemini"`. Every `provider_factory` in `main.py` (L155-198, import router L205) passes the recorder so all callers are counted. | Google reports the limit only on a 429, so the API counts. 12 covers a nightly's closet-tag, closet-plan, Discover and spots with room. Counting every caller is what makes "remaining" honest. |
| D4 · Who reads | The browser drives `POST /api/intake/sittings/{id}/read-next` one photo at a time while Shoot is open. `POST /api/intake/jobs/nightly` (job token) first expires sittings untouched for **30 days** (with photos), then reads waiting photos while `remaining > 0`. Workflow step `intake` goes **after `closet-plan`, before `registry`**, so it precedes Discover; the reserve protects Discover, spots and the opinion. | Joey's choice. A request per photo fits the free tier's 7–8 minute reads; the nightly is the only "after the tab closes". |
| D5 · Search | `GET /api/intake/search?area=&query=` fans out with `asyncio.gather` to each configured adapter of the area's kinds, **8s per source**, and returns `{results: [...], sources: [{kind, state: ok\|not_configured\|busy\|failed}]}`. Owned results carry `owned_item_id` (On shelf). Submit only. | A slow Comic Vine never blocks IGDB's answer; the per-source state is what the UI words. |
| D6 · Mixed shelf | One Details pass per kind present, in kind order. | Spec's recommendation; each kind's fields differ. |
| D7 · Limits | A sitting holds at most **200 photos** (409 with its own text beyond). Commit sends rows in chunks of ≤500 through the shared commit service. | 200 photos ≈ 3,000+ titles, far past a box; keeps one sitting's thumbnails bounded. |
| D8 · Commit | Extract `/bulk`'s core (`items.py` :874-963) into `commit_items(session, rows, *, today) -> CommitResult` at module level, with `_require_favorite_slots` lifted beside it. Intake pre-validates each row with `_write_fields` so a refusal maps back to its entry. `/bulk` calls the same function; its tests stay unchanged. | AC 6 asks for the same rows; one function is the only way to promise that. |
| D9 · Demo route | `/shelf/intake` is an explicit static route, a `STATIC_PAGES` row (`content/intake.js`), a `publicRoutes` entry and its own `render.yaml` rewrite before `/*` (deploy-path carve-out, PR 4). | Static pages already work this way; the `/shelf/*` catch-all handles item slugs, not pages. |
| D10 · More Gemini models | **Out of this stack**: a follow-up spike (measure each model's allowance, compare readings on recorded fixtures). The budget derives from `len(GEMINI_MODELS)`, so a model added later widens it with no code change. | Needs real measurements first, as the spec says. |
| D11 · Kind contract | `GET /api/intake/kinds` returns `[{key, area, label, ways_in, source_state, has_details, fields: [{key, label, control, options, per_item, required}]}]`; the frontend renders only from it. | AC 9 and 10: a kind or field added on the server reaches every component with no frontend change. |
| Admin routes | `/admin/collection/add` and `/admin/closet/add` (`AdminAdd`), sittings at `…/add/:sittingId` (`AdminSitting`). `/admin/import` → `<Navigate replace to="/admin/collection/add">`. | The static `add` segment outranks `/admin/collection/:id` in react-router's ranking (pinned by a test). |
| 409 wording | Intake passes its own text to `errorMessage`, never the catalogue-lock wording. | `errorMessage` words every 409 as the catalogue lock today. |

## Conflicts with open PRs

The spec's list (#118, #122, #126-#129) shows none. Re-check `gh pr list`
before each PR opens; `JOB_ROUTES`, `test_job_token.py`, `nightly.yml`,
`items.py` and `index.css` are the likely shared files.

## Delivery: a four-PR stack

Branches: `feat/intake` (PR 1, this worktree, carries this doc), then
`feat/intake-shelf`, `feat/intake-add`, `feat/intake-demo`, each in its own
worktree under `~/Developer/joey-haas.dev-worktrees/` based on the previous.

```mermaid
flowchart LR
  P1[PR 1 · migration 0015, budget, kinds, sittings API, reader, nightly] --> P2[PR 2 · Add page, sitting stepper, retire /admin/import, stop 1]
  P2 --> P3[PR 3 · add bar, search, drawer, closet kind, Tag now line]
  P3 --> P4[PR 4 · public demo, recorder, changelog, render.yaml]
```

Tasks are sequential unless marked **parallel-safe**.

### PR 1 — Backend: storage, budget, kinds, sittings, reading

1. **Migration `0015_add_intake.py`** + models (`IntakeSitting`,
   `IntakePhoto`, `IntakeEntry`, `LlmUsage`, `MovieDiscFormat`,
   `Item.disc_format`) per D1/D2. `schema_check.py` learns the new tables.
   *Tests:* migration up/down on the test DB; `test_schema_check` passes;
   `disc_format` written for a movie, 422 for a game (`test_items.py`).
2. **Budget** (`backend/intake/budget.py`): `UsageRecorder` (`attempt(model)`,
   `exhausted(model)`, own session factory), `pacific_day(now) -> date`,
   `remaining(session, models, reserve=12) -> int`,
   `budget_state(...) -> {remaining, enforced, resets_at}`. `llm.py`:
   `build_provider(config, recorder=None)`, `GeminiProvider` records per
   attempt. `main.py` passes one recorder to every factory.
   *Tests:* attempt counts per model; a PerDay 429 marks only that model;
   counts survive a rolled-back request session; day boundary at Pacific
   midnight (not UTC); `remaining` excludes exhausted models and the
   reserve; anthropic provider ⇒ `enforced: false`; existing `test_llm.py`
   green with `recorder=None`.
3. **Kind registry** (`backend/intake/kinds.py`, `shelf_kinds.py`,
   `garment_kind.py`): frozen `FieldSpec`/`Kind` dataclasses, `register()`,
   `kinds_for(area)`. Shelf kinds `game` (igdb), `movie` (tmdb; fields
   include `disc_format`), `comic` (comicvine; `issues` is `per_item`),
   `boardgame` (bgg; `source_state` explains "no source until BGG opens"
   when unconfigured); `garment` (closet, ways in photos and type).
   Each kind supplies `to_row(entry) -> dict` for commit. **Parallel-safe
   with task 2.**
   *Tests:* a test kind registered in the suite appears in `GET
   /api/intake/kinds` with its fields (AC 9 server half); a field added to
   it appears in the response (AC 10 server half).
4. **Photo storage**: `closet_images.make_reading_copy(data) -> bytes`
   (exif-transposed JPEG ≤3072, q90). **Parallel-safe with tasks 2–3.**
   *Tests:* a sideways iPhone JPEG fixture comes out upright and ≤3072; HEIC
   opens; oversize refused as today.
5. **Sittings API** (`backend/intake/routes.py`, router at `/api/intake`,
   admin auth): `GET kinds`, `GET budget`, `GET counts` (entries left to
   check per area, for the badge), `POST/GET/PATCH/DELETE sittings[/{id}]`
   (list = unfinished per area), `POST sittings/{id}/photos` (one file;
   type/size refused with the file's name; cap 200), `GET
   photos/{id}/image`, `POST photos/{id}/retry`, `POST sittings/{id}/entries`
   (typed or searched), `PATCH entries/{id}`. Garment photos create an
   untagged `Garment` + `garment_images` row exactly as `/garments/photos`
   does (shared helper) and an entry pointing at it.
   *Tests:* a sitting reads back identically from a second client (AC 3);
   uploaded photos keep their state across reloads (AC 4); discard removes
   photos and entries; 409 text is intake's own; 201st photo refused.
6. **Reader** (`backend/intake/reader.py`): `read_next(session, sitting_id,
   provider, budget) -> ReadOutcome`. Picks the oldest `uploaded` photo,
   runs the importer's prompt and `parse_detections`/`resolve_detections`,
   writes entries with `matching.py` confidence (exact/probable/check;
   owned ⇒ `owned`), sets `reading_jpeg` NULL. A source that is busy leaves
   the entry `reading` ("will retry"), never a miss. Budget spent ⇒ returns
   `waiting` and changes nothing. A failure marks only that photo `failed`.
   Garment sittings call the existing tagging function instead.
   *Tests (recorded LLM fixture, fake adapters):* one photo ⇒ entries with
   confidences; one failed photo leaves others readable, retry reads it
   alone (AC 12); budget at 0 ⇒ `waiting`, photo still stored, read after
   the day rolls (AC 16); nothing-read ⇒ `empty`.
7. **Commit** (`backend/intake/commit.py` + D8 extraction in `items.py`):
   `POST sittings/{id}/commit` → `{added, already_owned, skipped_kept,
   photos_empty, refused: [{entry_id, field, message}]}`. Refused rows stop
   the commit before any write. New items private; playthroughs seeded;
   comic ranges through `comics.py`; garments flip nothing (already real).
   *Tests:* 40 exact entries commit with no per-entry calls (AC 5); rows
   equal what `/bulk` writes for the same input (AC 6); figures equal
   what was written (AC 8 server half); a bad issue range maps to its entry.
8. **Nightly** `POST /api/intake/jobs/nightly` (job token): expire, then
   read within the reserve; add to `JOB_ROUTES`; `test_job_token.py`
   updated; `nightly.yml` step `call intake 600 /api/intake/jobs/nightly`
   between `closet-plan` and `registry`; `lib/nightly.js` row; README for
   `backend/intake/`.
   *Tests:* 31-day-old sitting expires with photos, 29-day-old stays; reads
   stop at the reserve; job-token pin.

### PR 2 — Shelf sittings UI, retire Import, stop 1

9. **Kind-driven components** (`components/intake/`): `KindFields` (renders
   any `FieldSpec` list; "set for all" mode), `ConfidenceBadge`, `KindTile`,
   `UnfinishedList` with the three-part meter. `adminAreas.js` gains Add
   pages with `badge`; `AreaPages`/`AreaSubnav` render page badges.
   *Tests:* a test kind's fields render in `KindFields` with no component
   change (AC 9/10 client half); badge in the accessible name; meter
   segments labelled.
10. **`AdminAdd` and `AdminSitting`**: `SittingStepper` (ordered list,
    `aria-current="step"`, focus to heading), `ShootStep`/`PhotoTile`
    (client refusal of type/size with name; one upload per photo; drives
    `read-next` serially; budget line; one polite live region), `CheckOne`
    (radio group, best preselected, the five actions), `SkimGrid`
    (checkboxes labelled by title; owned dimmed and unticked),
    `DetailsStep` (one pass per kind, refusals beside the field),
    `DoneStep` (four `StatTile`s from the commit answer). Routes in App.jsx
    and `ADMIN_ROUTES`; `/admin/import` redirects; `AdminImport.jsx` and the
    old `.confidence-*` rules removed; stop 1 caption and `where` updated
    in `spine.js` (public copy from the spec, nine stops kept).
    *Tests:* stepper keyboard path end to end with a mocked API; reload in
    Shoot shows true per-photo state; `waiting for tomorrow's budget`
    wording (#121's), never "did not answer"; `/admin/import` lands on Add
    (AC 15); `add` outranks `:id`; How it works has nine stops and no
    "never kept" sentence (AC 17); axe on each step.
11. **CSS** (admin block of `index.css`): tokens only; measure confidence
    words ≥4.5:1 and meter segments ≥3:1 on their surfaces in both themes,
    record beside the rules (swap `--line-strong` for `--status-backlog` if
    it fails). *Verification:* browser at 1280/400, both themes, vs
    `chosen.html` (Add page, Shoot, Check, Details, Done).

### PR 3 — Add bar, drawer, Closet

12. **`AddBar`, `AddResults`, `AddDrawer`** on Collection and Closet:
    search on submit (per-source states worded; disabled kinds say why —
    AC 11), On shelf links, drawer beside the grid at 1280 and bottom sheet
    below 900 (`useMediaQuery`), focus trap and return, "Add and search
    again", "No match, keep as typed". Single adds go through the commit
    service (`POST /api/intake/add`, added to PR 3's backend). Unfinished
    sitting line with Resume; drafts never in the grid. Closet: type-only
    field, ▤ Photos straight to Shoot, the "N photos waiting · Tag now"
    line.
    *Tests:* drawer Escape/focus return; keep-as-typed commits a manual row;
    an unconfigured source's kind commits as typed; garment sitting creates
    the same garments and thumbnails as before and shows untagged pieces at
    once (AC 7); clothes Check actions (Save and next, Tag again, Skip,
    Remove this photo).
13. **CSS + verification** for Add bar, Single add, Closet, Clothes · Check
    at 1280/400, both themes (AC 1 completes here).

### PR 4 — Public demo and changelog

14. **Recorder** `backend/scripts/record_intake_demo.py`: runs one real
    shelf photo through the reader and matcher, writes
    `frontend/src/content/intake-demo.json` (titles, candidates, confidences,
    stage timings; no image bytes, no ids). README beside it. Tests use a
    provisional fixture under `tests/`; **the public file is only ever the
    recorder's output.**
15. **`IntakeDemo`** at `/shelf/intake`: drawn shelf, stage strip, Check
    rows reusing `ConfidenceBadge`; final button says it is pretend; the
    confidence-from-string-distance sentence. `content/intake.js`
    `STATIC_PAGES` row, `publicRoutes`, `render.yaml` rewrite before `/*`,
    `prerender-lib.test` pin; changelog `## 2026-11-…` entry (the demo for
    the public; "Behind the scenes" for the admin tools).
    *Tests:* no `fetch` to `/api` (AC 2); prerendered; rewrite pinned;
    changelog parses (AC 18). **Blocked on Joey's recording**; the PR waits
    in draft until then.

### Acceptance criteria → tasks

| AC | Task(s) | AC | Task(s) |
|---|---|---|---|
| 1 | 11, 13 | 10 | 3, 9 |
| 2 | 15 | 11 | 3, 12 |
| 3 | 5 | 12 | 6, 10 |
| 4 | 5, 10 | 13 | 11, 13 |
| 5 | 7, 10 | 14 | 10, 12 |
| 6 | 7 | 15 | 10 |
| 7 | 5, 12 | 16 | 2, 6, 10 |
| 8 | 7, 10 | 17 | 10 |
| 9 | 3, 9 | 18 | 15 |

### Review Focus

Inputs the spec implies that no AC names, each pinned by a test in its task:

1. **Two devices committing the same sitting** — the second commit gets 409
   with intake's text and writes nothing (task 7).
2. **A photo that is read but whose source is down for every title** — all
   entries stay `reading`, the nightly retries the match without a model
   call (task 6).
3. **The same title on two photos of one sitting** — one entry ready, the
   other marked duplicate, counted once on Done (task 7).
4. **A garment deleted from the Closet mid-sitting** — its entry goes with
   it (FK cascade) and the sitting still commits (task 5).
5. **Budget recorder failing to write** — the model call still proceeds and
   the error is logged; reading never breaks because counting did (task 2).

## Milestones

```
STOP — carve-out review (before any code): migration 0015 (tables and enum
       above), the llm.py recorder touching every model caller, the new
       JOB_ROUTES entry + nightly.yml step
Milestone 1 (auto): PR 1 — tasks 1–8, opened ready for review
Milestone 2 (auto): PR 2 — tasks 9–11
Milestone 3 (auto): PR 3 — tasks 12–13
STOP — carve-out review: render.yaml rewrite (deploy path), and Joey's
       real shelf photo for the recorder
Milestone 4 (auto): PR 4 — tasks 14–15
Finish gate per PR → PRs opened as a stack
```

**Deploy order:** apply `0015` to Neon (`migrate_neon.py current`, then
`upgrade`, from the PR 1 worktree), then merge PR 1. PRs 2–4 need no
migration. PR 1 merged alone is invisible (no UI) apart from the nightly
step, which finds nothing to read.

## Environment testing

- Backend: `./.venv/bin/pytest` from the main checkout's venv, **one run at
  a time**. LLM calls use recorded fixtures; no network in tests.
- Frontend: `npm test`, `VITE_DAILY_SALT=local npm run build` per PR.
- Browser per UI PR: local API with dummy env, Vite dev server, signed in;
  1280 and 400, both themes, against `chosen.html`. One real sitting of ~3
  shelf photos through Gemini on the dev key (PR 2) and ~5 garments (PR 3)
  is the only model spend before merge; a forced budget of 0 checks the
  waiting state without spending.
- Contrast pairs measured and recorded in `index.css`.

## Smoke test strategy

`smoke.sh` gains signed-out checks: `GET /api/intake/kinds`, `GET
/api/intake/sittings`, `POST /api/intake/sittings/1/read-next` and `POST
/api/intake/jobs/nightly` without the token answer 401; `/admin/collection/add`
serves the shell (200, noindex). After PR 4: `/shelf/intake` 200 and
indexed, no `/api` request in its HTML. After PR 1 deploys, the next
nightly shows `intake` ok with 0 read. After PR 2, Joey shoots one real
box; Done's figures match the collection's new private rows.
