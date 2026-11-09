---
status: planned
mockups: docs/planning/mockups/2026-11-08-daily-puzzle/
chosen: c-shelfle.html
---

# Daily puzzle: one small game a day, answers from the shelf (design)

Date: 2026-11-08 · Repo: joey-haas.dev · Mockups under
`docs/planning/mockups/2026-11-08-daily-puzzle/` (`index.html` links them;
`c-shelfle.html` is the direction below). Reads the public snapshot the
shelf already builds; the Ledger tokens from
`2026-10-19-site-refresh-design.md` apply; size bands follow
`2026-10-30-tonight-picks-design.md` (Short under 6 h, Medium 6–15 h, Long
15 h+).

## Problem

The site has nothing a visitor comes back for daily. Daily puzzles with a
shareable result grid are the one format that reliably earns repeat visits
and gets passed around, and the shelf is already a well-described pool of
titles, covers, years, ratings and formats to draw answers from.

## Scope

In:

- A public page **`/daily`**, titled **Daily**, one puzzle per day, the
  same for everyone, no login. The format is **Shelfle**: guess the game in
  six tries; each guess grades platform, release year, genre and size
  against the answer.
- The answer pool is the owner's **public** shelf items (games only, owned,
  public visibility), read from `/snapshot/items.json`. Nothing from the
  private shelf; no store, price or stock data on the page.
- A deterministic daily pick from a date-salted seed, day numbering from
  a fixed epoch, the day boundary at midnight America/Denver.
- Autocomplete over public titles; the result card (won or lost) with the
  answer's facts and a link to its item page; a share sheet with the emoji
  board and a text alternative; yesterday's answer with its item link;
  streak and play count in `localStorage`.
- Prerendered head, `render.yaml` rewrite, sitemap entry, a footer link
  and a line on the shelf landing pointing at today's puzzle.
- Copy in `content/spine.js` (or a sibling `content/daily.js`).

Out, explicitly:

- Result reporting of any kind (no "61% got it", no leaderboard, no
  beacon). A later phase may post anonymous results to the first-party
  analytics; v1 stores nothing server-side.
- Accounts, difficulty settings, multiple formats at launch, an admin UI,
  any API call. The page must work while the backend sleeps.
- Films and comics in the pool. Games only; the shape can carry other
  formats later.
- Cover reveal and higher/lower formats (rejected below; the snapshot
  shape should not preclude them).

## Design

Direction: **c-shelfle.html**. States in the mockup: Start, Mid-game, Won,
Lost / reveal, Share, at 1280 and 400, both themes.

### Page

`/daily` is a public page in the shelf's compact masthead with the tabs
Shelf · What's next · Comics · How it works · **Daily**. It takes the 45rem
column (not `WIDE_ROUTES`): the board is narrow by nature.

Top to bottom:

1. Lede: *One small game a day, built from what's on the shelf. Same
   puzzle for everyone, new at midnight Denver time, no account.*
2. Header row: `h2` **Shelfle**, right-aligned mono kicker *DAY 37 · 8
   NOV*.
3. Stats row (muted): *Streak **12** · Played **31** · Avg guesses
   **3.8***. Hidden until the visitor has played once.
4. **Board**: six rows × five cells (Guess · Platform · Year · Genre ·
   Size) with a header row of mono kickers. Empty rows are dashed
   `--line` outlines on `--sunken`. A graded cell is one of three looks:
   - **match**: filled `--status-active` with `--accent-ink`-equivalent
     dark text (use `--bg` on dark, white on light: Code measures; the
     mockup uses the ok green with dark text at 1280 and 400);
   - **close**: 2px `--warn` outline, surface fill, the value plus an
     arrow and a word on a second line (*2022 ↑ later*, *Long ↓
     shorter*);
   - **no**: plain surface, `--text-2` value.
   The Guess cell is the title, never coloured.
5. Legend under the board: the three looks with their words, so the board
   is readable without colour.
6. **Guess input**: a single text field, placeholder *Type a game*, with an
   autocomplete list beneath it: cover thumb (2rem), title, muted
   *platform · year*. Up to six suggestions, matched on title prefix then
   substring, public titles only, already-guessed titles excluded. Enter or
   tap submits; the row grades at once (no network). Disabled after six
   guesses or a win.
7. **Yesterday** line: *Yesterday's answer: **Tunic** →* linking to
   `/shelf/<id>`. Hidden on day 1.

### Grading rules

The answer is a public game item. Each guess is another public game item
(from the autocomplete; free text that matches nothing is refused with the
message *Not on the shelf*).

| Attribute | Source | match | close | no |
| --- | --- | --- | --- | --- |
| Platform | `platform` | same string | same family (Switch / Switch 2; PS4 / PS5; Xbox One / Series) | otherwise |
| Year | `release_date` year | equal | within 2 years; arrow ↑ *later* / ↓ *earlier* says which way the answer lies | otherwise, with the same arrow |
| Genre | `genres` (list) | the sets are equal, or the guess's first genre equals the answer's first genre | any genre in common | none in common |
| Size | band from `time_to_beat_hours` | same band | adjacent band; arrow ↓ *shorter* / ↑ *longer* | two bands apart, with arrow |

Edge cases: an answer with no `time_to_beat_hours` is excluded from the
answer pool; a *guess* with none shows *—* in Size. An item with no
genres is excluded from the pool. An item with no release year is
excluded from the pool. The pool is therefore "public games with
platform, year, at least one genre and a time to beat"; the spec expects a
few hundred such items (Code confirms the count at build and fails the
build under 30).

Win: the guess is the answer (same `item_id`). Lose: six wrong guesses.

### Daily pick and day number

- Epoch: day 1 is the launch date, a constant.
- Day number `n` = days since the epoch in America/Denver local time,
  computed in the browser from the current date in that zone (not UTC).
- Pick: `index = hash(DAILY_SALT + isoDate) mod pool.length`, over the
  pool sorted by `item_id` so the order is stable across builds. The hash
  is a small pure function (FNV-1a or similar) in `lib/daily.js`, unit
  tested.
- `DAILY_SALT` is injected at build time (`import.meta.env`, set in
  `render.yaml` / `.env`, not committed), so the salt is not in the repo.
  **Threat model, plainly:** the salt is in the shipped bundle, so anyone
  who wants tomorrow's answer can compute it. This is a personal site's
  daily puzzle, not a contest; the salt stops the casual case (a
  `?day=` URL or reading the snapshot order), nothing more. Stated on the
  How-it-works stop so no one thinks otherwise.
- Repeat avoidance: if the pick equals any of the previous seven days'
  picks, step the index forward until it does not.

### Result and share

On win or loss the board stays visible and a **result card** appears under
it (surface, 10px radius): the answer's cover (5.5rem), title linking to
`/shelf/<id>`, platform · year · genres · size · *about N h to finish*,
and the line *Got it in 3* or *Not today. It was Hades II.* Below:
**Share** (primary) and **Yesterday's answer** (ghost link).

**Share** opens a small sheet (same sheet pattern as Tonight's Wrap up:
bottom-anchored on a phone, centered on desktop, `--overlay` backdrop):

```
Shelfle 37 · 3/6
⬛🟩🟨🟩🟨
🟩🟩🟩🟨🟩
🟩🟩🟩🟩🟩
joey-haas.dev/daily
```

Cell mapping: match 🟩, close 🟨, no ⬛. The first column (the title) is
not emitted. **Copy** uses `navigator.clipboard.writeText`, falling back
to a selectable `<textarea>`; *Copied* confirms in the `role="status"`
region. The sheet also shows the same result as text (*Day 37, solved in
3: row 1 — platform no, year close, …*) for assistive tech and for the
clipboard's `text/plain` when emoji are unwanted.

### Streak and history

`localStorage` key `daily:v1`: `{ lastDay, streak, played, guessesTotal,
days: { [n]: { guesses: [item_id…], won } } }`. Every read and write is in
`try/catch` and the page renders fully with no storage (stats row hidden,
board empty each visit). Streak increments when day `n` is solved and
`lastDay` is `n-1`; resets to 1 otherwise; a loss resets to 0. Reloading
mid-game restores today's guesses from `days[n]`.

### Responsive and theme

- 400px: the five columns shrink to fit (title cell wraps at two lines,
  attribute cells show the value and the arrow word on a second line);
  the autocomplete list is full width under the input; the share sheet is
  bottom-anchored.
- 1280px: as the mockup, 45rem column.
- Tokens only: `--status-active` for match, `--warn` for close outlines,
  `--sunken`/`--line` for empty cells, `--rating` nowhere (stars do not
  appear here). Both themes verified in the mockup.

### Accessibility

- The board is a real table (`<table>` with `<th scope="col">`), each
  graded cell carries its state in text (`<span class="visually-hidden">`
  *match* / *close, later* / *no*), so screen readers get the same
  information as the colours and arrows.
- The autocomplete is a combobox (`role="combobox"`, `aria-expanded`,
  `aria-activedescendant`, arrow keys move, Enter picks, Escape closes),
  the same keyboard contract as the search dialog.
- Every state change (row graded, won, lost, copied) is announced in one
  `role="status"` region.
- Nothing is colour-only; the legend names the three looks; focus rings
  use `--accent` as everywhere.

## Key decisions

- **Shelfle, not cover reveal, not higher/lower.** Shelfle is the only
  one of the three that is a deduction puzzle a stranger can reason
  through, it uses four fields already in the snapshot, it is the share
  grid people already recognise, and its board reads without colour.
- **Rejected: A · Cover reveal.** It uses the collection's best asset,
  but the clear cover URL is in the snapshot, so a client-side blur is
  defeated by the network tab; doing it properly means pre-rendering
  blurred frames at build time and withholding the clear cover until
  solved, which is a build pipeline, not a page. A ~300-item pool of mostly
  Switch indies also means a stranger blanks on most covers until a text
  hint arrives, at which point it is Shelfle with worse feedback. Revisit
  only if a build-time image step is wanted anyway.
- **Rejected: B · Higher or lower.** Cheapest to build and nothing to
  leak (ratings are already public), but it is a coin-flip reaction game
  with nothing to deduce. Kept as a possible later variant.
- **No result reporting in v1.** The mockup's "61% got it" line implies a
  beacon and server-side counts; dropped so the page needs no API and no
  new privacy paragraph. Can come back through the first-party analytics.
- **Client-only, salt in the bundle, and say so.** A server-side daily
  endpoint would hide tomorrow's answer but would break the "works while
  the backend sleeps" rule for a public page. The honest threat model is
  the right trade for a personal site.
- **Pool excludes items missing a graded field** rather than showing *—*
  in the answer's cells: a puzzle whose answer cannot be graded on one
  axis is a worse puzzle than a slightly smaller pool.
- **Denver midnight, not UTC.** The owner and most of his players are in
  Mountain time; "new at midnight" should mean the midnight they see.

## Component inventory

Existing, changed:

- Shelf masthead / tab row (`RootLayout` or the shelf's tab component):
  a fifth tab **Daily**.
- `frontend/scripts/prerender-lib.mjs` `publicRoutes`, `render.yaml`
  rewrite for `/daily`, sitemap.
- `SiteFooter`: a *Daily* link beside the shelf links.
- Shelf landing (`Collection.jsx`): one line under the hero numbers,
  *Today's Shelfle →*, only when the pool is non-empty.
- `content/spine.js`: `daily` copy (lede, legend words, result lines,
  share text, "Not on the shelf", yesterday line).
- `HowItWorks`: a stop describing the puzzle, the pool and the threat
  model in one paragraph.
- Snapshot: `/snapshot/items.json` already carries `platform`,
  `platforms`, `year`, `release_date`, `genres`, `time_to_beat_hours`
  and `cover_url` for public games (`PublicItemOut`, `backend/public.py`);
  nothing new is needed in the body except the optional `size_band` (see
  Open questions).

New:

- `pages/Daily.jsx`.
- `lib/daily.js` (pure, tested): `pool(items)`, `dayNumber(date, zone)`,
  `pickFor(isoDate, pool, salt, recent)`, `grade(guess, answer)`,
  `shareText(day, rows)`, `sizeBand(hours)` (reuse the picker's band
  thresholds from `lib/shelf.js` if they already live in the client).
- `components/ShelfleBoard.jsx` (table), `GuessCombobox.jsx`,
  `DailyResult.jsx`, `ShareSheet.jsx` (reusable by Tonight's Wrap up if
  Code wants one sheet primitive).
- `lib/dailyStorage.js` (try/catch wrapper over `localStorage`).

Tokens used: `--status-active`, `--warn`, `--sunken`, `--line`,
`--line-strong`, `--surface`, `--text*`, `--accent`, `--overlay`,
`--radius`. No new tokens; Code measures the match cell's text colour on
`--status-active` in both themes (4.5:1) and records the ratio beside the
token as the file does elsewhere.

## Acceptance criteria

- [ ] `/daily` renders with the backend down, from the snapshot alone;
      every visitor on the same Denver calendar day sees the same answer.
- [ ] The answer pool contains only public, owned games with platform,
      release year, at least one genre and a time to beat; the build fails
      if the pool has fewer than 30 items.
- [ ] `pickFor` is deterministic for a given salt and date and never
      repeats any of the previous seven days' picks; unit tests cover the
      hash, the day number across a DST change in America/Denver, and the
      repeat step.
- [ ] `grade` unit tests cover every cell of the grading table, including
      the platform families, the ±2-year window with both arrows, shared
      vs first-genre match, adjacent and two-apart size bands, and a guess
      with no time to beat.
- [ ] Six wrong guesses show the loss card with the answer; a correct
      guess on row k shows *Got it in k*; the input is disabled after
      either.
- [ ] Share copies the emoji board in the exact format above (day number,
      k/6 or X/6, one line per guess, the URL) and the text alternative
      describes every row.
- [ ] Streak, played and average update correctly across consecutive
      days, a missed day and a loss; with storage unavailable the page
      still plays and shows no stats row.
- [ ] Yesterday's answer links to the item page and is hidden on day 1.
- [ ] Matches `c-shelfle.html` at 400px and 1280px in both themes for the
      Start, Mid-game, Won, Lost / reveal and Share states, minus the
      "% of players" line.
- [ ] Board is a table with column headers and per-cell state text; the
      combobox is keyboard-operable; state changes are announced.
- [ ] Prerendered head, `render.yaml` rewrite and sitemap entry exist for
      `/daily`; the Daily tab, footer link and shelf-landing line are
      present; `frontend/changelog.md` has the entry; the How-it-works
      stop is added.

## Open questions for Code

- **Size band source.** `SIZE_BANDS` already exists client-side in
  `lib/pickForMe.js` (Short / Medium / Long from `time_to_beat_hours`).
  Reuse it for grading rather than shipping a `size_band` field, unless
  the picker's server thresholds and that constant have drifted; check
  they agree.
- **Platform families.** A small map in `lib/daily.js`; confirm the
  platform strings the shelf actually uses (Switch, Switch 2, others) so
  the family rule matches real data.
- **Salt injection.** `VITE_DAILY_SALT` from the Render static site's
  env, read at build; a missing value should fail the build (as
  `config.py` does for the API) rather than default to an empty salt.
- **Epoch.** Set to the deploy date in `lib/daily.js`; day 1 should be the
  day it ships.
- **Share sheet primitive.** Tonight's Wrap up (ready-for-plan, same
  day) also needs a bottom sheet; if Code builds one `Sheet` component,
  both should use it.
- **Pool size and guessability.** After the first build, report the pool
  count and how many answers a stranger could plausibly know; if the
  pool is lopsided toward obscure titles, a later option is weighting
  toward items with a rating or a favourite flag. Not in v1.

---

# Plan

Planned 2026-11-09 on `feat/daily-shelfle` (worktree
`~/Developer/joey-haas.dev-worktrees/feat-daily-shelfle`). Tier: **Full**
(new public route with prerender and `render.yaml` rows, a build-time env
var, CI change). One PR.

## What the repo actually has (research gate)

Measured on 2026-11-09 against the live `/snapshot/items.json` and the
code at `f08cc32`:

| Fact | Value | Consequence |
| --- | --- | --- |
| Public games in the snapshot | 70, all `type: game` today; films and comics will appear as `type` values | Pool filters `type === 'game' && !wanted` (Want rows are public but unowned) |
| Eligible pool (platform, year, ≥1 genre, time to beat) | **42** | Clears the 30 floor, far from "a few hundred". 28 games lack `time_to_beat_hours`; the pool grows as metadata is refreshed. With seven-day repeat avoidance the answers cycle in about six weeks |
| `platform` strings in the pool | `Nintendo Switch` 34, `Nintendo Switch 2` 8 | The Platform column is **match** or **close** on nearly every row. Kept as specified; the display shortens to *Switch* / *Switch 2* like the mockup |
| Genres | IGDB strings, 2.9 per item on average; *Adventure* on 34 of 42; lead genre spread: RPG 13, Shooter 9, Puzzle 8, Platform 7 | Long labels (*Role-playing (RPG)*, *Hack and slash/Beat 'em up*) need short display forms. "Any genre in common" grades **close** on most rows (see decision 3) |
| Size bands | Short 3 · Medium 16 · Long 23 | Fine for grading; the Short band is rare |
| Item key | `id` (uuid), not `item_id` | Storage and grading key on `id` |
| `SIZE_BANDS` client copy | `components/SizePill.jsx` (module-private; `sizeLabel` exported), ≤6 Short, ≤15 Medium, else Long; matches `backend/picker.py` `SIZE_BANDS` and its tests | Lift to `lib/sizeBand.js` so `lib/daily.js` and `SizePill` share one table |
| Shelf tabs | `SpineTabs.jsx` over `spine.tabs`: Collection · Comics · What's next · Year in review · How it works (five, not four) | Daily is the **sixth** tab; `SpineHeader.test.jsx` pins the link count |
| Sheet primitive | None; `WrapUpSheet`, `SearchDialog`, `MobileNavSheet` each repeat the native `<dialog>` pattern (`showModal`, `onCancel`, backdrop press guard, `--overlay` backdrop, bottom-anchored under 34rem) | Build `components/Sheet.jsx` from that pattern for the share sheet; migrating `WrapUpSheet` onto it is a follow-up, not this PR |
| Combobox | `SearchDialog.jsx` is the ARIA reference (`role="combobox"`, `aria-activedescendant`, `useId` option ids, composing guard) | `GuessCombobox` copies the contract |
| Denver time | `formatDate.js` has `OWNER_MONTH` (`Intl.DateTimeFormat`, `America/Denver`) and `ownerMonth`/`ownerYear`; no day helper | Add `ownerDay(now)` → `YYYY-MM-DD` beside them |
| Hash | No string hash in `lib/`; `mulberry32` is private to `shelf.js` | FNV-1a in `lib/daily.js` |
| Build env | `import.meta.env.VITE_API_URL` is the only env read; no validation anywhere; CI builds with no env and no snapshot; `fetch-snapshot.mjs` never fails the build | The salt check must not break CI: CI gets a non-secret `VITE_DAILY_SALT` |
| Prerender | A `STATIC_PAGES` row (`content/pages.js`) yields the head, sitemap entry and search-dialog entry; `prerender-lib.test.mjs` pins the route list **and** that `render.yaml` rewrites equal the page paths exactly | The row and the rewrite land in the same task |
| HowItWorks | `spine.how.stops` 1–8; `spine.test.js` pins `[1..8]`, the title and a test say "eight stops" | Stop 9; title and both tests move to nine |
| Footer | No shelf links; the credit line is Source · Now · TIL · Colophon · Stats | *Daily* joins the credit line, between Now and TIL |
| Match cell text | `--accent-ink` is `#0f1114` dark / `#ffffff` light; `--status-active` is `--ok` (#5ec48d) dark, `#2a8556` light; `--ok` light is `#1f7a4d` | Measure both candidates; white on light `#2a8556` is about 4.4, so the fill will likely be `--ok`, recorded beside the rule |

## Decisions (the spec's open questions, answered)

1. **Size bands:** reuse, by lifting `SIZE_BANDS` and `sizeLabel` into
   `lib/sizeBand.js` with a `sizeBand(hours)` that returns the band index
   (0–2) for adjacency; `SizePill` imports from it. Thresholds unchanged.
2. **Platform families:** `[['Nintendo Switch', 'Nintendo Switch 2'],
   ['PlayStation 4', 'PlayStation 5'], ['Xbox One', 'Xbox Series X|S']]` in
   `lib/daily.js`, keyed on the ten `PLATFORM_NAMES` strings; a test
   checks every family member is one of the ten (copied from
   `ItemForm.PLATFORM_OPTIONS`). Display labels drop *Nintendo* and
   *PlayStation* → *PS5*.
3. **Genre rule:** built **as specified** (sets equal or same lead genre →
   match; any in common → close; none → no), with the guess's lead genre
   shown in the cell. **Flag for Joey:** with *Adventure* on 34 of 42
   items, close will show on most rows. Say **"lead genre"** at the gate to
   switch to: match = same lead genre; close = the guess's lead genre
   appears anywhere in the answer's genres or vice versa; no = otherwise.
   One function, one test table either way.
4. **Salt:** `VITE_DAILY_SALT`, read by `vite.config.js` through `loadEnv`
   on `build` only, throwing when empty (dev and test fall back to
   `'dev'` through `lib/dailyConfig.js`). `render.yaml` declares it
   `sync: false`; `ci.yml` sets a visible `ci` value so CI keeps building.
   The salt reaches `pickFor` as a parameter, never read inside
   `lib/daily.js`, so the Node prerender script can import the pool filter.
5. **Epoch:** `DAILY_EPOCH` in `lib/daily.js`, set to the PR's merge day
   at the finish gate (Joey can edit it in the PR). Picks are computed from
   the epoch forward, one FNV hash per day, each avoiding the previous
   seven; that makes the seven-day rule well defined on day 1 and cheap
   for years.
6. **Sheet:** a generic `components/Sheet.jsx` lifted from `WrapUpSheet`'s
   dialog handling, used by `ShareSheet`. `WrapUpSheet` keeps its own code
   in this PR (follow-up card).
7. **Pool report:** 42 today (above). Weighting toward rated or favourite
   titles stays out of v1 as the spec says.
8. **Pool floor:** `prerender.mjs` fails the build when a snapshot is
   present and the pool is under 30. No snapshot (CI, local without
   `VITE_API_URL`) skips the check, as every other snapshot consumer does;
   the page then shows the copy's *No puzzle today* line.

**Deviations from the mockup, spec wins:** the board is a `<table>`, not
a div grid; the share header is `Shelfle 37 · 3/6` (no `#`); one emoji
per graded column, so four per row (the spec's five-emoji example counts
the title column it says to omit); the result card lists facts and
*about N h to finish*, no stars, no finish date; the *61% of players*
line is gone; the Yesterday line has no cover (link only). The Start-state
placeholder is the spec's *Type a game*.

## Tasks

Sequential unless flagged. Every task ends green (`npm test`, `npm run
lint`, `npm run format:check`) before its commit.

### Milestone 1 (auto) — pure core, components, page

**T1 · `lib/sizeBand.js`** *(parallel-safe)*
- Move `SIZE_BANDS` and `sizeLabel` out of `SizePill.jsx`; add
  `sizeBand(hours)` → `0 | 1 | 2 | null` and `SIZE_LABELS`.
- Files: `frontend/src/lib/sizeBand.js`, `lib/sizeBand.test.js`,
  `components/SizePill.jsx`.
- Tests: 6 → Short, 6.5 → Medium, 15 → Medium, 15.5 → Long, null → null
  (mirrors `test_picker.py`); `SizePill` tests still pass.
- AC: one threshold table in the client; the comment pointing at
  `backend/picker.py` moves with it.

**T2 · `ownerDay` in `lib/formatDate.js`** *(parallel-safe)*
- `ownerDay(now = Date.now())` → `YYYY-MM-DD` in `America/Denver`,
  reusing the `Intl.DateTimeFormat` pattern of `ownerMonth`.
- Tests: 2026-03-08T08:59Z → `2026-03-07` and 09:00Z → `2026-03-08`
  (MST, UTC−7, the morning of the spring change); 2026-11-01T06:30Z →
  `2026-11-01` (MDT, UTC−6, before the fall change) and
  2026-11-02T06:30Z → `2026-11-01` (MST after it); a Denver midnight.
- AC: the day flips at Denver midnight on both sides of each DST change.

**T3 · `lib/daily.js`** — pure, no React, no `import.meta`
- Exports: `DAILY_EPOCH`, `MIN_POOL = 30`, `MAX_GUESSES = 6`,
  `dailyPool(items)` (games, not wanted, with platform, year, ≥1 genre,
  time to beat; sorted by `id`), `dayNumber(isoDay)` (1 on the epoch;
  date parts through `Date.UTC`, so no DST drift), `fnv1a(string)`,
  `picksThrough(isoDay, pool, salt)` → `[{ day, isoDay, item }]` from the
  epoch, each stepping past the previous seven; `pickFor(isoDay, pool,
  salt)` and `yesterdayPick(isoDay, pool, salt)` (null on day 1 or before
  the epoch); `grade(guess, answer)` → `{ platform, year, genre, size }`
  cells of `{ state: 'match'|'close'|'no', value, arrow?, word? }`;
  `PLATFORM_FAMILIES`, `shortPlatform(name)`, `shortGenre(name)`;
  `suggest(query, pool, excludedIds)` (prefix matches first, then
  substring, case- and diacritic-insensitive, max 6); `shareText(day,
  grades, won)` (the exact block from the spec) and `shareWords(grades)`
  (the per-row text alternative).
- Files: `frontend/src/lib/daily.js`, `lib/daily.test.js`.
- Tests: pool inclusion and exclusion per field (wanted, no time to beat,
  no genres, no year, a movie); `dayNumber` on the epoch, +1, across the
  2026-03-08 and 2026-11-01 changes; `fnv1a` against two known vectors
  (`''` → `0x811c9dc5`, `'a'` → `0xe40c292c`); `pickFor` deterministic,
  changes with the salt, never equals any of the previous seven picks on
  a 10-item pool over 60 days, and stays in range; every cell of the
  grading table: same platform, same family, other family; year equal,
  ±1, ±2 with both arrows, ±3 with arrows; genre sets equal, lead equal
  with different tails, one shared, none shared; size same, adjacent both
  ways with words, two apart with the arrow; a guess with no hours → `—`
  and state `no`; `suggest` ordering, exclusion, cap and empty query;
  `shareText` byte-exact for a 3/6 win and an X/6 loss.
- AC: the spec's acceptance bullets for `pickFor` and `grade` hold.

**T4 · `lib/dailyStorage.js`** *(parallel-safe)*
- `readDaily()` / `writeDaily(state)` on key `daily:v1` with the
  `readShelfPref` try/catch shape and a shape check (object with `days`);
  `recordGuess(state, day, itemId)`, `recordOutcome(state, day, won,
  guesses)` applying the streak rule (solved and `lastDay === day − 1` →
  +1, solved otherwise → 1, lost → 0; `played` +1; `guessesTotal` +
  guesses on a win), `statsFor(state)` → `{ streak, played, avg }` or
  null when never played.
- Files: `frontend/src/lib/dailyStorage.js`, `lib/dailyStorage.test.js`.
- Tests: consecutive days, a missed day, a loss, a reload mid-game
  restoring guesses, a throwing `localStorage` (getter and setter) leaving
  the state usable, garbage in storage ignored.

**T5 · Components** (after T1, T3)
- `components/Sheet.jsx`: the native `<dialog>` shell from `WrapUpSheet`
  (open/close effect, `onCancel` → `onClose`, backdrop press guard, focus
  returned to the opener as `SearchDialog` does); CSS `.sheet` sharing
  `.wrap-sheet`'s rules by selector list, bottom-anchored under 34rem.
- `components/ShelfleBoard.jsx`: `<table class="shelfle">` with `<caption
  class="visually-hidden">`, `<th scope="col">` kickers, six rows, each
  cell carrying `data-state` and a visually-hidden state word; empty rows
  dashed `--line` on `--sunken`.
- `components/GuessCombobox.jsx`: input + listbox with the SearchDialog
  contract; suggestions show `CoverImage` thumb (2rem), title, muted
  *platform · year*; Enter on a highlighted row or an exact title submits;
  unmatched text → `copy.notOnShelf` in the status region; disabled prop.
- `components/DailyResult.jsx`: cover 5.5rem, title → `itemPath(id)`,
  facts line, *Got it in k* / *Not today. It was X.*, Share (primary) and
  Yesterday's answer (ghost link).
- `components/ShareSheet.jsx`: `Sheet` with the emoji block in a `<pre
  aria-hidden>`, the visible text alternative, Copy (clipboard API with a
  `<textarea>` fallback), *Copied* into the page's status region.
- CSS in `index.css`: the `.shelfle*`, `.guess-combobox*`, `.daily-*`
  and `.sheet` rules; the match fill's text colour measured in both
  themes and recorded in a comment beside the rule (4.5:1), `--warn`
  outline for close.
- Files: the five components, their tests (`*.test.jsx`, each running
  `axeViolations`), `index.css`.
- Tests: board renders six rows and the state words; combobox arrow keys,
  Enter, Escape, exclusion of guessed titles, the refusal message; result
  card both outcomes; share sheet copies the exact text, falls back when
  `navigator.clipboard` is missing, closes on Escape and backdrop.

**T6 · `pages/Daily.jsx`, route, copy, tab** (after T2–T5)
- `content/daily.js`: lede, hint, kicker format, legend words, status
  announcements, result lines, share labels, *Not on the shelf*, *No
  puzzle today*, yesterday line; `spine.tabs.daily = { to: '/daily',
  label: 'Daily' }` and the sixth `NavLink` in `SpineTabs.jsx`
  (`SpineHeader.test.jsx` → 7 links).
- `lib/dailyConfig.js`: `DAILY_SALT = import.meta.env.VITE_DAILY_SALT ||
  'dev'`.
- `pages/Daily.jsx`: `usePageTitle`, `<SpineHeader asLink />`, lede,
  header row with kicker *DAY n · 8 NOV*, stats row (hidden until
  played), board, legend, combobox, result, yesterday line; reads
  `readSnapshot('items')` once (no API, ever); `ownerDay()` on mount and
  on `visibilitychange`, so a tab left open rolls over at Denver midnight;
  one `role="status"` region; restores today's guesses from storage.
- `App.jsx`: `<Route path="daily" element={<Daily />} />`.
- Files: `pages/Daily.jsx`, `pages/Daily.test.jsx`, `content/daily.js`,
  `content/spine.js`, `components/SpineTabs.jsx`,
  `components/SpineHeader.test.jsx`, `lib/dailyConfig.js`, `App.jsx`,
  `App.test.jsx` if it enumerates routes.
- Tests (`readSnapshot` mocked as `Collection.test.jsx` does, storage
  cleared in `afterEach`, a fixed `Date` through `vi.setSystemTime`):
  renders from the snapshot with no `fetch` to `/api`; the same answer
  for two renders on one Denver day; a win on row 3 shows *Got it in 3*
  and disables the input; six misses show the loss card with the answer;
  stats row hidden before the first game and shown after; yesterday line
  hidden on day 1; no snapshot → *No puzzle today*; axe clean in Start,
  Mid-game and Won.
- AC: spec bullets 1, 5, 7, 8, 10 hold in tests.

**T7 · Entry points, stop 9, changelog, docs** (after T6)
- `Collection.jsx`: one line under `HeroNumbers`, *Today's Shelfle →*
  to `/daily`, only when `dailyPool(items).length > 0`.
- `SiteFooter.jsx`: *Daily* in the credit line between Now and TIL;
  `SiteFooter.test.jsx` order becomes Now · Daily · TIL · Colophon.
- `spine.how`: stop 9 (`where: '/daily'`, the pool, the Denver day, the
  salt's honest threat model in one paragraph, `code:
  ['frontend/src/lib/daily.js']`), title *in nine stops*; `spine.test.js`
  `[1..9]`, `HowItWorks.test.jsx` *nine stops*.
- `frontend/changelog.md`: a `## 2026-11-09` entry (or the merge date)
  linking `/daily`.
- `README.md`: a *Daily puzzle* section (pool rule, day number, salt,
  storage key, why no API); `CLAUDE.md`: a line in the TODO list and a
  bullet in Conventions pointing at `lib/daily.js`.
- `scripts/smoke.sh`: `/daily` answers 200 with the Daily head title.
- Files as listed, plus their tests.
- AC: spec's last bullet, minus the prerender and rewrite (T8).

### STOP — carve-out review (infra, CI, deploy path)

### Milestone 2 (auto) — build and deploy wiring

**T8 · Prerender row, rewrite, salt gate, pool floor**
- `content/pages.js`: the `/daily` `STATIC_PAGES` row (title *Daily*,
  head title *Daily · My Shelf*, description); `prerender-lib.test.mjs`
  route list gains `/daily` after `/stats`.
- `render.yaml`: `rewrite /daily → /daily/index.html` after `/stats`,
  before the blog rules and `/*`; `envVars` gains `VITE_DAILY_SALT` with
  `sync: false`.
- `vite.config.js`: on `command === 'build'`, `loadEnv(mode,
  process.cwd(), 'VITE_')` and throw a plain message when
  `VITE_DAILY_SALT` is empty.
- `.github/workflows/ci.yml`: `VITE_DAILY_SALT: ci` on the frontend
  build step.
- `scripts/prerender.mjs`: after reading the items snapshot, when it
  exists, `assertDailyPool(items)` (in `prerender-lib.mjs`, importing
  `dailyPool` and `MIN_POOL` from `../src/lib/daily.js`) throws under 30;
  tested in `prerender-lib.test.mjs` with 29 and 30 eligible items.
- Files: `content/pages.js`, `scripts/prerender-lib.mjs`,
  `scripts/prerender-lib.test.mjs`, `scripts/prerender.mjs`,
  `vite.config.js`, `render.yaml`, `.github/workflows/ci.yml`.
- AC: `npm run build` fails without the salt and passes with it; the
  render.yaml test passes; `dist/daily/index.html` and the sitemap entry
  exist after a local build with a fetched snapshot.

### Finish gate → PR

`sdlc-execution`'s finish gate (reviewer pass, verification, PR body
with the deploy order below).

## Environment test

Local, in the worktree, before the PR:

1. `npm ci`; `npm run snapshot` (reads the live public API into
   `public/snapshot/`, gitignored) so the pool is real.
2. `VITE_DAILY_SALT=local npm run build`: confirm the pool count printed
   by prerender, `dist/daily/index.html`'s head, the sitemap entry; then
   the same build with the salt unset must fail with the plain message.
3. `npm run dev` and the preview tool at 1280 and 400, dark and light:
   Start, Mid-game, Won, Lost, Share against `c-shelfle.html`; console
   and network clean (no `/api` request from `/daily`); keyboard-only run
   through a full game; axe through the tests.
4. Storage: play, reload (guesses restored), clear storage (stats row
   gone, board empty), block storage (page still plays).
5. Midnight: `vi.setSystemTime` in tests covers the roll-over; a manual
   check with the clock set past Denver midnight in the dev tools.

**Deploy order:** set `VITE_DAILY_SALT` on the Render static site
(dashboard, any long random string) **before** merging; merge; Render
builds and the first build fails loudly if the var is missing. Then
`./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`.
No migration, no API change.

## Follow-ups (not this PR)

- Migrate `WrapUpSheet` (and perhaps `MobileNavSheet`) onto `Sheet`.
- Fill `time_to_beat_hours` for the 28 public games without it
  (Refresh game metadata may cover most), which doubles the pool.
- Anonymous result counts through the first-party analytics, if wanted.
