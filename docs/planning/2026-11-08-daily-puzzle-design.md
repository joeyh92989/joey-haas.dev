---
status: ready-for-plan
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
