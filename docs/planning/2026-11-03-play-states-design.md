---
status: ready-for-plan
mockups: docs/planning/mockups/2026-11-03-play-states/
chosen: chosen.html
---

# Play states: replays, paused games, and what Play Next sees (design)

Date: 2026-11-03 · Repo: joey-haas.dev · Builds on
`2026-10-30-tonight-picks-design.md` (recency in the scorer, the last finish,
Change of pace) and the Play Next scorer in `backend/picker.py`. The Ledger
tokens from `2026-10-19-site-refresh-design.md` still apply; the mockups use
them. Status labels follow the copy pass (`2026-10-22-copy-pass-design.md`).

## Problem

Two things the status model cannot say today:

1. **A replay is invisible.** `statusTransition.js` on Playing → Finished
   keeps the first `finished_at` (`item.finished_at ?? today`) and bumps
   `times_completed`. One item has one finish date, so a second playthrough
   has nowhere to put its own. Dredge, replayed and finished in October 2026,
   still carries its 2024 finish: the Tonight-picks recency curve
   (`recency_bonus`, 30-day half-life on `finished_at`) sees a stale finish,
   Change of pace's "last finish" is wrong, the public Now page and the RSS
   feed do not show it, and the Played tile says "Finished 2 times" with no
   dates.
2. **"Put down, coming back" has no state.** `active` means both "what I am
   playing tonight" and "what I parked in August". The Now page lists every
   `active` game as Playing, the shelf's Playing chip counts them, and the
   only way out is `abandoned`, which is a *negative* taste reference
   (`BASE_WEIGHTS.abandoned = -0.5`) and pushes similar games away. The
   picker already half-handles the parked case (candidates are
   `backlog` + `active`; the "Pick it back up" slot fires for an `active`
   game with no event in 30 days), but it cannot tell parked from playing.

What the better trackers do, for comparison: Backloggd keeps a game-level
shelf (Played / Playing / Backlog / Wishlist) and makes every *log* "a single
playthrough" with its own outcome (Played / Completed / Abandoned / Retired /
Shelved), dates and rating; a replay is "Create new log"
(https://backloggd.com/about). StoryGraph's Paused (Dec 2024) is a sub-state
of Currently Reading: paused books move to a collapsed section, paused time
is excluded from pace stats, a pause can be backdated, and resuming is one
toggle back (https://roadmap.thestorygraph.com/changelog/mark-books-as-paused-);
the request behind it was that DNF "gives the impression I disliked the book"
(https://roadmap.thestorygraph.com/requests-ideas/posts/book-status-of-paused).
From `2026-09-22-tracker-design-research.md` (not re-fetched): HowLongToBeat
counts Playing / Backlog / Replays / Retired / Completed; Backloggery keeps
outcome (Unfinished / Beaten / Completed / Mastered / Null) orthogonal to a
Now Playing flag. The common shape: **one simple status the owner touches,
per-playthrough history underneath.**

## Scope

In:

- A `paused` status, labelled **Paused**, between Playing and Finished.
- A `playthroughs` record per run of a game, opened and closed by status
  changes. `started_at`, `finished_at` and `times_completed` on items become
  derived from it (first start, last finish, count of finished runs).
- The picker reads the last finish; Paused games stay candidates with the
  Pick it back up reason and carry no taste weight.
- The admin card/list status control, the item edit page (dates), the public
  shelf (mark, chip), the item page (status line, Played tile, playthrough
  table when signed in), Now (Paused list; "again" on a replayed finish), the
  How-it-works stop that describes statuses, and the public snapshot /
  RSS where they read `finished_at`.
- Backfill of existing rows.

Out, explicitly:

- Per-playthrough ratings or reviews (Backloggd's model). One rating per
  game stays.
- Linking `play_sessions` rows to a playthrough by foreign key. Journal days
  are attributed by date range (see Open questions).
- A Replays chip on the public shelf or a Replays section in Year in review.
  The data will support both; neither ships here.
- Renaming Abandoned. "Dropped" was considered and left for the copy pass.
- Mastered / Completed-100% outcomes. Finished is the only positive outcome.
- Films, comics and board games: they keep the same enum and get Paused for
  free, but nothing here designs for them.

## Design

Direction: **chosen.html** — A's shelf, item page and Now, with B's idea
that the move out of the current state is named as a verb.

### States and transitions

```mermaid
stateDiagram-v2
    [*] --> Backlog
    Backlog --> Playing : Start (opens playthrough n+1)
    Playing --> Finished : Finish (closes it, finished_on = today)
    Playing --> Paused : Pause (playthrough stays open)
    Playing --> Abandoned : Abandon (closes it, outcome abandoned)
    Paused --> Playing : Resume (same playthrough)
    Paused --> Abandoned : Abandon
    Finished --> Playing : Replay (opens playthrough n+1)
    Abandoned --> Playing : Try again (opens playthrough n+1)
    Finished --> Backlog : (edit page only; corrects a mistake)
```

Status order everywhere (chips, charts, menus):
`backlog · active · paused · finished · abandoned`. Labels: Backlog ·
Playing · Paused · Finished · Abandoned.

Semantics:

- **Playing** means playing now. The Now page's Playing list and the
  Tonight "Pick it back up" stall check both assume it.
- **Paused** means set aside, intend to return. It is not an opinion about
  the game. A Paused game keeps its open playthrough and its `started_on`.
- **Finished** closes the open playthrough with today's date (local date,
  as `localToday` already does). A game with no open playthrough (Backlog →
  Finished on the edit page, say) gets one created with no start date.
- **Abandoned** closes the open playthrough with outcome `abandoned` and
  today's date.
- Moving to Playing from Finished or Abandoned opens a new playthrough
  numbered one higher. Moving to Playing from Paused reopens nothing: the
  same playthrough continues. Moving to Playing from Backlog opens
  playthrough 1 (or the next number if dateless backfilled runs exist).

### Admin: the status control

Shelf card, list view and the edit page all use the same control. It is
the menu that exists today with two changes (chosen.html, surface 1):

- Paused is in it.
- The move out of the current state is named as a verb, with a one-line
  muted hint saying what it records: from Finished the Playing entry reads
  **Replay** · "starts playthrough 3"; from Paused it reads **Resume** ·
  "since Aug 2026"; from Abandoned, **Try again**; Playing → Finished reads
  **Finish** · "dated today"; Playing → Paused reads **Pause** · "keeps the
  date". Entries that are not a move out of the current state keep the
  plain label. The selected entry is the current state.
- Nothing asks for confirmation. Choosing Replay on a finished game is the
  whole gesture; a wrong click is undone by choosing Finished again, which
  deletes the just-opened playthrough rather than closing it (an open
  playthrough with no sessions and a `started_on` of today, closed the same
  day, is treated as a misclick and removed — Code decides the exact rule).

The edit page (`/admin/collection/:id`) gains a **Playthroughs** table under
the status: number, started, finished, outcome. Dates are editable there,
which replaces editing `started_at` / `finished_at` directly. A row can be
deleted. New rows are not added here (the status control is the writer);
if a past run needs recording, add a row with dates and outcome Finished
through a small "Add a past playthrough" link at the table's foot. Both
of these are the only hand edits to the table.

The touch "…" sheet on the admin card lists the same entries with the
same verb labels.

### Public shelf

- **Status mark** (card corner): Paused is a hollow square in
  `--status-active`'s colour with a 2px stroke and the existing 1px
  `--surface` halo, so it reads as "Playing, but not filled in". Playing
  stays the filled square. `aria-label` "Paused". Contrast of the stroke
  against covers is what the existing marks already rely on (the halo).
- **Replay mark**: a small `×2` (`×n`) at the poster's bottom-left in the
  overlay style the format mark uses at the bottom-right, mono numeral,
  `aria-label` "Finished 2 times". Shown only when `times_completed > 1`.
  Nothing new below the poster.
- **Status chips** gain Paused with its count, hidden at zero like the rest.
- **Dim finished** keeps dimming finished and abandoned only. Paused is not
  dimmed: it is unfinished business, which is what the owner's view is for.
- Sort "Recently finished" reads the new `finished_at` (last finish), so a
  replay rises to the top. Hero number "finished this year" counts finished
  playthroughs in the year, not items, so a replay in October counts for
  2026 (see Open questions for the stats query).

### Item page

- Status line in the hero: "Finished twice · last Oct 2026" for a replayed
  game; "Finished · Oct 2026" for one finish; "Paused · since Aug 2026";
  "Playing · since 24 Oct 2026". Relative phrasing matches
  `2026-10-30-tonight-picks-design.md` ("this week", "last week", "in
  October").
- **Played tile**: figure "Finished 2 times", muted line "Last 19 Oct 2026 ·
  first Mar 2024". With one finish: "Finished once", "19 Oct 2026". With an
  open playthrough and prior finishes: "Finished 2 times", "Playing again
  since 3 Oct 2026".
- Signed in: a **Playthroughs** table below the tiles (number · started ·
  finished · outcome · journal, where journal is "6 days · 11 h" summed
  from `play_sessions` inside the run's date range). Read-only here; the
  edit page is where dates change. A note under it says so.

### Now and the snapshot

- **Playing** lists `active` games only.
- **Paused** is a new list under Playing, same row style, "since Aug 2026 ·
  41 h in" (hours from the journal when any; omit otherwise). Hidden when
  empty. On the phone it is the same list, not collapsed; the list is
  short.
- **Just finished** reads last finishes. A replayed finish carries a small
  "again" tag after the title and "second time" / "third time" after the
  date.
- Home's facts table ("Playing · Hades II") reads the Playing list and is
  unchanged in shape.
- The finished-games RSS feed emits one entry per finished playthrough,
  dated by `finished_on`, so a replay is a new entry.

### Play Next (picker)

- `PickerItem.finished_at` is the last finish. `recency_bonus` is
  unchanged in shape; a replay is a fresh finish and counts like one. No
  extra weight for being a replay.
- `candidates()` admits `backlog`, `active` and `paused`.
- A `paused` candidate's "Pick it back up" slot uses the pause date, not
  the 30-day stall check: any Paused game qualifies; prefer the one with
  the most journal hours (sunk cost is the honest reason) and name it:
  "41 h in, paused since August". The stall check for `active` games
  stays, since it catches the game that should have been paused.
- `_is_reference`: Paused games are not references (no weight either way).
  A paused game's genres do not pull picks toward or away from it.
- Reasons that name the recent finish ("…which I finished last week") are
  correct for free once `finished_at` is the last finish. A replay reason
  may say "which I finished again last week"; the public rule (only when
  that game is public) is unchanged.

### Stats, Month and Year in review

- The stacked status bar gains a Paused segment between Playing and
  Finished, in the Paused mark's colour at the same fill as Playing (the
  bar has no hollow option; the legend carries the name).
- The twelve-month finishes strip and "finished this year" count finished
  playthroughs by `finished_on`.
- Month in review's finished list includes replays with the "again" tag.
  Nothing else changes here.

### Responsive and theme

Nothing in this design introduces a new layout. The hollow Paused mark and
the ×n badge use existing tokens and work in both themes (mockups show
both). The verb-and-hint menu rows wrap on a phone (hint drops under the
verb), as the mockup's popover shows at 400px.

### Accessibility

- Every mark has an `aria-label` ("Paused", "Finished 2 times"); nothing
  is colour-only, since the hollow-vs-filled distinction is also a shape
  difference and the chips and status line say it in words.
- Menu entries are the verb plus the hint as one accessible name ("Replay,
  starts playthrough 3").
- The playthrough tables are real tables with header cells.

## Key decisions

- **Playthroughs table, not `last_finished_at`.** One column fixes Dredge
  today, but the journal has nothing to hang off, Replays never show in a
  review, and the third time this comes up the table gets built anyway.
  The table is the shape Backloggd, HLTB and Backloggery all landed on. The
  cost is a migration and a backfill.
- **The status control stays the only writer.** Backloggd makes the user
  manage logs by hand; that is the part to leave behind. Playthroughs are a
  consequence of changing status, and the only hand edits are dates and
  adding a past run on the edit page.
- **Paused, not Shelved or Set aside.** Backloggd's "Shelved" collides with
  a tracker called My Shelf. "Paused" is one word, pairs with Playing, has
  StoryGraph precedent, and reads as neutral: pausing is not an opinion.
- **Paused carries no taste weight.** Abandoned is -0.5 and Finished is
  +0.3 because they say what the owner thought. A pause says nothing yet.
- **Replay recency equals first-finish recency.** A replay is arguably a
  stronger signal, but there is no evidence for a multiplier and it adds a
  knob. Revisit if picks feel off.
- **Rejected: B's lanes.** Playing and Paused as sections above the grid
  (StoryGraph's collapsed Paused) duplicate the chips, push the grid down
  on a phone, and break the research rule that status is a corner mark, not
  text. Now already is the "what am I playing" list; the shelf does not
  need to be one too.
- **Rejected: B's action-only control.** Listing verbs instead of states
  (Finish · Pause · Abandon) hides where you are and what the other states
  are, and the list view's `<select>` cannot do it. The verb *labels* were
  worth keeping, so chosen.html names the move and keeps the menu.
- **Rejected: A's plain menu.** Adding Paused to today's menu works but
  leaves "Playing" on a finished game meaning something the label does not
  say.

## Component inventory

Existing, changed:

- `StatusMenu` / the card `<select>` and the "…" sheet (`AdminCollection`,
  `PosterCard` shelf actions): Paused entry, verb labels, hints.
- `PosterCard`: Paused mark, replay badge; `STATUS_ORDER` / `STATUS_LABEL`
  in `lib/shelf.js`; `statusTransition.js` becomes a thin call to the API's
  status route (the transition logic moves server-side, see Open
  questions).
- `FilterChips` status row: Paused.
- `Item` page `Tiles` Played tile and hero status line; new read-only
  `Playthroughs` table (signed in).
- `AdminItem` edit page: Playthroughs table with editable dates, delete
  row, "Add a past playthrough".
- `Now` page and `nowLists.js`: Paused list, "again" tag.
- Stats status bar, finishes strip, hero numbers; Month in review finished
  list.
- `HowItWorks` stop that describes statuses.

New:

- `PlaythroughTable` (shared between the public item page, read-only, and
  the edit page, editable).
- `ReplayMark` (or an extension of the existing mark/format-mark pattern).

Tokens: `--status-active` reused for Paused's stroke (no new colour);
`--overlay`, `--text` for the ×n badge; `--text-3` for hints. No new
tokens.

## Acceptance criteria

- [ ] Marking a Finished game Playing opens a new playthrough; marking it
      Finished again sets `finished_at` to today and `times_completed` to
      the count of finished playthroughs. Dredge-style: a 2024 finish and
      an October 2026 finish both exist as rows.
- [ ] Playing → Paused → Playing leaves exactly one open playthrough with
      the original `started_on`.
- [ ] Paused games appear in Play Next candidates, never as references, and
      can fill Pick it back up with the pause date in the reason.
- [ ] `recency_bonus` for a replayed game uses the latest finish; a pure
      unit test covers first-finish-old / last-finish-recent.
- [ ] Now lists Paused games under a Paused heading and marks a replayed
      finish "again"; the Playing list contains only `active` games.
- [ ] The RSS feed has one entry per finished playthrough.
- [ ] Backfill: every existing item with `started_at`, `finished_at` or
      `times_completed > 0` has playthrough rows that reproduce those three
      values exactly through the derived path, and `active` items have an
      open row.
- [ ] Public shelf matches `chosen.html` surface 2 at 400px and 1280px in
      both themes: hollow Paused mark, ×2 badge, Paused chip.
- [ ] Item page matches `chosen.html` surface 3: status line, Played tile
      with last and first, playthrough table when signed in and absent for
      visitors.
- [ ] Admin control matches `chosen.html` surface 1: verb labels and hints
      for the moves out of the current state, in the card menu, the list
      `<select>` (labels only; `<option>` cannot carry a hint) and the
      touch sheet.
- [ ] Every mark and menu entry has an accessible name as specified.

## Open questions for Code

- **Where the transition logic lives.** Today it is client-side
  (`statusTransition.js`) and the API is a plain PATCH. Opening and closing
  playthrough rows should be one transaction, which argues for a
  `POST /api/items/{id}/status {status}` route (the pin route is the
  precedent) and the client calling it instead of computing fields. The
  item PATCH would then refuse `status`, `started_at`, `finished_at` and
  `times_completed`, or accept them only from the edit page's playthrough
  editor. Code's call.
- **Derived vs cached.** `started_at`, `finished_at`, `times_completed` can
  stay as columns maintained by the status route (cheap reads for the
  public snapshot, the sort and the index on `finished_at`), with a check
  that recomputes them from playthroughs. Dropping the columns is cleaner
  but touches every reader. Recommend keep-and-maintain.
- **Playthrough shape.** Suggested: `id, item_id (cascade), number
  (smallint), started_on (date, null), finished_on (date, null), outcome
  (enum finished | abandoned, null while open)`, unique `(item_id, number)`,
  and a partial unique index on `item_id where outcome is null` so a game
  can have at most one open run.
- **Backfill rule for `times_completed > 1` with one set of dates.** The
  latest run gets the dates; the earlier `n - 1` runs are dateless with
  outcome `finished`. The Played tile then shows "first —" until the owner
  fills a date on the edit page.
- **Journal attribution.** Sessions fall into the playthrough whose
  `[started_on, finished_on]` contains `played_on`; a dateless or open run
  takes what no other run claims. If that proves ambiguous in practice,
  add `playthrough_id` to `play_sessions` later.
- **"Finished this year" and the finishes strip** now count playthroughs;
  the stats query joins `playthroughs` instead of reading
  `Item.finished_at`. Check the snapshot build time stays trivial (it will;
  the table is tiny).
- **Misclick undo rule** for Replay, as described under the admin control.
- **Pause date.** `paused_on` is not stored; "since Aug 2026" comes from
  the most recent status change. If there is no event record for status
  changes, add `paused_on` (date, null) to playthroughs and stamp it on
  Pause, clear on Resume. Recommend the column; it is one line and the
  Pick it back up reason needs it.
