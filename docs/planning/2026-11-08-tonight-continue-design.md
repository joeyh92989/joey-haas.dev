---
status: planned
mockups: docs/planning/mockups/2026-11-08-tonight-continue/
chosen: chosen.html
---

# Tonight continues what I'm playing, and finishing is one gesture (design)

Date: 2026-11-08 · Repo: joey-haas.dev · Mockups under
`docs/planning/mockups/2026-11-08-tonight-continue/` (`index.html` links
them; `chosen.html` is the direction below). Builds on `2026-10-30-tonight-picks-design.md`
(lead pick + Or instead, Play this / Not tonight), `2026-11-03-play-states-
design.md` (playthroughs, Paused, verb-named moves), `2026-11-04-now-playing-
design.md` (Now Playing band) and `2026-11-04-quick-play-design.md` (one-tap
move to Playing, Finish explicitly left out).

## Problem

Two moments the shelf is built around are not designed around:

1. **Sitting down to play.** Tonight on `/shelf/next` and admin Play Next
   lead with three fresh picks even when a game is Playing. Mid-game, the
   honest answer to "what's on tonight" is the game I'm in, and the picks
   are the alternative, not the headline. Today it is the other way round.
2. **Rolling credits.** Marking a game Finished is still the status
   dropdown (hover, open, pick) or the edit page. There is no one-tap
   Finish (quick-play scoped it out), and the moment right after finishing,
   the only time a rating and a sentence come easily, has no place to put
   them. "Rate a few" exists because that moment is missed.

## Scope

In:

- A **Continue** card leading Tonight on `/shelf/next` and admin Play Next
  whenever a game is `active`. Picks move to **Or instead**, rendered as a
  compact list while a Continue card leads.
- A **Wrap up** sheet: Finished / Paused / Abandoned, then optional rating,
  one-line note and date. One component, three entry points: the Continue
  card, the admin Now Playing band, and the card menu's Finish entry (the
  dropdown's Finish / Pause / Abandon entries open it instead of writing
  directly).
- **Log tonight** on the Continue card: one tap adds a `play_sessions` row
  for today (minutes empty), the same route the journal uses.
- **Last played** carried in the public list body and snapshot
  (`last_played_on`, date only) so the public card can show it.
- The **stale** state: an active game with no session in `STALE_DAYS` (21)
  turns "last played" amber and swaps the action row's question and
  button order (see Design).
- Tonight's **post-finish transition**: Continue card out, Just finished
  chip gains the new rating, picks take the lead in today's layout.
- Copy in `content/spine.js` and the How-it-works stop that describes
  Tonight.
- A one-line **playthrough note** (`playthroughs.note`, text, null), the
  owner's and never public (same rule as `play_sessions.note`).

Out, explicitly:

- Picker scoring, slot rules, the shopping sections, `/now`, Home's facts
  table.
- Per-playthrough ratings (one rating per game, per play-states). The
  sheet's stars write the item rating.
- Designing for several active games. One Continue card is the case; two
  or more stack as further Continue cards in the same style, the most
  recent journal session first. No "Also playing" row.
- Any journal UI beyond Log tonight (minutes and notes stay on the item's
  journal).
- Visitors acting on anything. Every button in this design is owner-only.

## Design

Direction: **chosen.html** — A (Lead swap) with B's question-shaped action
row for the stale state and C's compact pick list for Or instead. See the
mockup's Visitor, Signed in, Wrap up, After finishing and Stale states at
1280 and 400, both themes.

### Tonight when a game is Playing

Order, top to bottom, inside the existing `.tonight` section:

1. `h2` **Tonight**. The Just finished chip is **not** shown while a
   Continue card leads: the card is about the game in hand, and the last
   finish still shows after wrap-up (below).
2. **Continue card** (`.tonight-lead.continue`): the lead card's chrome
   (surface, 1px line, 10px radius, 8.5rem cover / 5.5rem on a phone) with
   a 4px left rule in `--status-active`, the same rule the Now Playing
   band uses, so the two read as one thing. Contents:
   - kicker **Continue** in `--ok` with the 6px dot (the `.tonight-playing`
     pattern), mono, uppercase;
   - title (1.5rem / 1.25rem phone) linking to the item page (public) or
     the edit page (admin), platform, size pill and "about N h to finish";
   - a sessions line: *Playing since 24 Oct · **31 h** over 9 sessions ·
     last played **yesterday***. Hours and sessions come from the journal
     inside the open playthrough's date range (the play-states rule) and
     are omitted when there are none. "Last played" uses `dayWords`
     relative phrasing (yesterday, 3 days ago, 23 days ago);
   - signed in only, the **action row**: a muted question at the left and
     the buttons at the right, wrapping to a full-width question above the
     buttons at 400px. Normal state: *Sitting down?* · **Wrap up**
     (primary) · **Log tonight** · *Not tonight* (ghost).
3. **Or instead** as a compact list (`.picklist`): one bordered surface,
   rows of 2.6rem cover · kicker (slot) · title · platform, size pill,
   hours · first reason only · owner buttons **Play this instead** and
   *Not tonight* (small, stacked at the right on desktop, in a row under
   the text on a phone). Header row: kicker *Or instead* left, *rebuilt
   nightly* muted right. This replaces the two-column alt cards only while
   a Continue card leads; the alt cards return when the picks lead.
4. *Only you see these buttons.* note, as today.

Up next pin: when a game is both pinned and `active` it is the Continue
card (a pinned game that has been started is just the game in hand). A
pinned game that is still `backlog` while another game is `active` shows
as the first row of Or instead with its **Up next** kicker; Continue still
leads. Playing a pick ("Play this instead") pins it and moves it to
Playing through the existing pin route, so the next render shows two
Continue cards until the first is wrapped up or paused; that is the stack
case and needs no special layout.

Visitors see the Continue card, sessions line and list with no buttons,
no question, and no owner note. The card is in the public snapshot like
the rest of Tonight.

"Not tonight" on the Continue card is per-night, like a skipped pick: the
card drops to a Skipped toast with Undo for the rest of the day, and the
picks lead in today's layout. Tomorrow the card is back.

### Stale state

`STALE_DAYS = 21` (one constant, exported from `lib/tonight.js` or the
picker's existing stall window renamed; see Open questions). When the
active game has no `play_sessions` row within that window:

- "last played" in the sessions line is set in `--warn`;
- the action row's question becomes *Three weeks quiet. Still playing it?*
  and the buttons reorder: **Pause** (primary) · **Finished it** · *Not
  tonight*. Pause opens the Wrap up sheet with Paused preselected;
  Finished it opens it with Finished preselected. No separate nudge box.
- Visitors see only the amber date.

With no journal at all for the open run, the window counts from the
run's `started_on`.

### Wrap up sheet

A modal sheet, bottom-anchored on a phone (14px top radii), centered on
desktop (max 34rem), `role="dialog"` with `aria-modal`, focus trapped,
Escape and the ✕ close it, backdrop in `--overlay`. Header: 2.6rem cover,
**Wrap up {title}**, muted *Playthrough n · since {date} · {hours} h*.

Step 1, **outcome**: three large buttons (`aria-pressed` radio behaviour),
each a status mark + label + hint, in the play-states order:

| Button | Mark | Hint |
| --- | --- | --- |
| Finished | filled `--status-finished` square | dated today |
| Paused | hollow `--status-active` square | keeps the date, I'll be back |
| Abandoned | filled `--status-abandoned` square | closes the run |

Three columns on desktop, stacked at 400px (52px tall rows). The entry
point may preselect one (the stale row's Pause, the card menu's Finish).
The primary button's label follows the selection: **Mark finished** /
**Mark paused** / **Mark abandoned**.

Step 2, **While it's fresh (optional)**, under a rule, always visible (no
second screen; the sheet scrolls on a short phone):

- **Rating**: `QuickRate` (ten half-star targets, the item's rating, one
  rating per game). Prefilled with the current rating if any.
- **One line**: a single textarea, placeholder *What stuck with you*,
  writes `playthroughs.note` for the run being closed (or paused).
- **Date**: `<input type="date">`, default today, labelled **Finished on**
  / **Paused on** / **Abandoned on** with the hint *Change it if you
  finished earlier in the week.* Writes `finished_on` or `paused_on`.

Footer: muted *Two taps if you skip the extras.* at the left; **Skip
extras** (ghost; applies the outcome only) and the primary at the right.
Both close the sheet.

Save path: one call to `POST /api/items/{id}/status` carrying the status,
the date and the note (the route already takes `today`; it gains the
optional note), then `PATCH /api/items/{id}` for the rating only when the
stars changed. Optimistic UI as Tonight does today (`act()` with
rollback); a failed write shows the existing `ACTION_ERROR` line.

The same sheet opens from the admin Now Playing band (a **Wrap up**
button in the card, sibling of the link, per the shelf's control rule)
and from the card menu / touch sheet, where choosing Finish, Pause or
Abandon opens it with that outcome preselected instead of writing at once.
Start playing / Resume / Replay / Try again are unchanged (quick-play).

### After finishing

On a successful Finished or Abandoned:

- the Continue card leaves (the section re-renders, no animation
  required; a 200 ms fade is fine if cheap);
- the **Just finished chip** returns, now with the rating as inline stars
  after the hours when one was given: *Just finished **Hades II** · Sat 8
  Nov · 31 h · ★★★★½*;
- the picks render in today's layout (lead card + alt cards), with the
  Best fit reason already able to name the finish ("which I finished
  today") since the public body is rebuilt from the status change.
  Tonight on the public page updates at the next snapshot build, as every
  write does today; the owner sees the admin view at once.

On Paused: the card leaves and the picks lead; the game can come back as
Pick it back up per play-states.

### Admin Play Next

Same Continue card and compact list above the mood / platform filters,
replacing the lead pick when a game is active. Reroll regenerates the
list, never the Continue card.

### Responsive and theme

- 400px: cover 5.5rem, title 1.25rem, question above buttons, list rows
  two-column with buttons under the text, sheet bottom-anchored with
  stacked outcome rows.
- 1280px: as the mockup; `.tonight` keeps its 52rem max.
- Both themes use existing tokens only: `--status-active` rule and marks,
  `--warn` for the stale date, `--rating` for stars, `--overlay` backdrop.
  No new colour; no new contrast measurement needed, since every text
  token sits on `--surface` or `--sunken` as elsewhere.

### Accessibility

- The Continue card is an `article` labelled by its title; the kicker,
  sessions line and question are plain text, so nothing is colour-only
  (the stale date is amber **and** says "23 days ago").
- The outcome group is `role="group"` with `aria-label="How did it end"`;
  each button's accessible name is label + hint ("Finished, dated today").
- The sheet traps focus, returns it to the button that opened it, and
  announces the result in the existing `role="status"` region ("Hades II
  marked finished").
- The list rows keep the title as the only link; buttons are siblings,
  never inside it.
- Log tonight announces "Session logged for today" and is disabled with
  the same label once a session exists for today.

## Key decisions

- **Continue outranks the picks and the pin.** Tonight is a question with
  one honest answer mid-game; showing picks first is the engine ignoring
  the owner, the same fault the recency work fixed for finishes.
- **One sheet, three entry points, outcome first.** The outcome row is
  the whole gesture; rating, note and date are extras on the same screen
  so the fast path stays two taps and nothing is hidden behind a second
  step. C's one-screen idea was kept in spirit (nothing required but the
  outcome) without its denser control.
- **The stale nudge is the action row, not a box.** B's wording made the
  dashed nudge redundant: the row already asks a question, so it asks the
  right one and leads with Pause.
- **Compact list for Or instead, cards when the picks lead.** Three alt
  cards spend a lot of height on a fallback; the list keeps the picks
  visible without competing with the card. The card layout stays for the
  no-active state so the page is unchanged on nights between games.
- **Note on the playthrough, not the item.** "What I thought when I
  finished this time" belongs to the run; the table exists and the item's
  `notes` field stays free-form.
- **Rejected: B's hidden picks.** Visitors come to see the engine; a
  disclosure hides the page's point.
- **Rejected: B's journal strip.** A new visual element for one card;
  "last played" plus the amber date carries the same information.
- **Rejected: C's two-column Tonight.** A new layout for What's next for
  one state; the compact list gets most of the height saving.
- **Rejected: a "Finish" one-tap with no sheet.** Finishing is the one
  moment a rating comes easily; a bare status write throws that away and
  Rate a few exists because it did.

## Component inventory

Existing, changed:

- `pages/Next.jsx` Tonight section: branch on an active game; `TonightLead`
  gains a `continue` variant (or a sibling `ContinueCard`); `TonightAlt`
  list swaps for `PickList` rows while Continue leads; `JustFinishedChip`
  takes an optional rating.
- `pages/PlayNext.jsx`: same branch above the filters.
- `components/NowPlaying.jsx`: Wrap up button (admin only).
- `ShelfCardActions` / card `<select>` / touch sheet: Finish, Pause,
  Abandon open the sheet; `lib/statusMoves.js` marks which moves are
  "closing" moves.
- `lib/nowPlaying.js`: exports the active game(s) ordered by last session
  for Tonight's use too; `STALE_DAYS`.
- `content/spine.js`: `tonight.continue`, `sittingDown`, `stillPlaying`,
  `wrapUp`, `logTonight`, `finishedIt`, `pause`, sheet labels and hints,
  `orInsteadRebuilt`; How it works stop 3 copy.
- Public body / snapshot: `last_played_on` on list items; `PublicTonight`
  gains `continuing: PublicTonightCard | null` (title, cover, platform,
  size, hours to finish, playing_since, last_played_on, journal hours and
  session count).
- `POST /api/items/{id}/status`: optional `note`; `playthroughs.py` writes
  it on the run it closes or pauses.
- `playthroughs` table: `note` (text, null), migration.

New:

- `ContinueCard` (public + admin, props decide the buttons).
- `PickList` (compact Or instead rows).
- `WrapUpSheet` (dialog; outcome group, `QuickRate`, note, date; used by
  Tonight, Now Playing, card actions).
- `StatusMark` if the outcome buttons' marks are not already a shared
  piece of `PosterCard`'s mark.

Tokens used: `--status-active`, `--status-finished`, `--status-abandoned`,
`--ok`, `--warn`, `--rating`, `--overlay`, `--surface`, `--sunken`,
`--line`, `--line-strong`, `--text*`, `--radius`. No new tokens.

## Acceptance criteria

- [ ] With one `active` game, `/shelf/next` and `/admin/play-next` lead
      Tonight with the Continue card and render the picks as the compact
      list; with none, the page is unchanged from today.
- [ ] The Continue card shows playing-since, journal hours and sessions
      inside the open run, and last played; visitors see it without
      buttons, question or owner note.
- [ ] With two `active` games, both render as Continue cards, most recent
      session first; no other layout change.
- [ ] No session within 21 days (or since `started_on`): last played is
      `--warn`, the row asks *Still playing it?* and Pause is primary and
      preselects Paused in the sheet.
- [ ] Wrap up from the Continue card, the admin Now Playing band and the
      card menu's Finish / Pause / Abandon all open the same sheet; Skip
      extras applies the outcome only; the primary applies outcome, date,
      note and (when changed) rating. Two taps from Wrap up to a finished
      game.
- [ ] Finishing writes `finished_on` = the chosen date, `playthroughs.note`
      = the line, item rating = the stars; `times_completed` and
      `finished_at` follow through `playthroughs.py` unchanged.
- [ ] After Finished or Abandoned, the Continue card is gone, the Just
      finished chip shows the game with its stars, and the picks lead in
      the card layout; after Paused, the picks lead and the game is
      eligible for Pick it back up.
- [ ] Log tonight creates a session for today once and then disables.
- [ ] Not tonight on the Continue card hides it for the day with Undo and
      is cleared by the next day.
- [ ] Matches `chosen.html` at 400px and 1280px in both themes for the
      Signed in, Stale game, Wrap up and After finishing states; Visitor
      matches with the owner controls absent.
- [ ] Sheet: focus trapped, Escape closes, focus returns to the opener,
      result announced; outcome buttons have label+hint names; nothing is
      colour-only.
- [ ] `frontend/changelog.md` entry; How it works stop 3 updated.

## Open questions for Code

- **Stale window vs the picker's stall check.** The picker's "Pick it
  back up" fires for an `active` game with no event in 30 days. Recommend
  one `STALE_DAYS = 21` in the backend, exposed in the public body as a
  boolean (`stale`) so the client never recomputes it from dates, and the
  picker reads the same constant.
- **Where journal hours for the card come from.** Summing
  `play_sessions` inside the open run's range on each public build is
  cheap (one query per active game); do it in `public.py`'s item body
  rather than client-side.
- **Status route payload.** `POST /items/{id}/status` today takes
  `{status, today}`. Add `note` (≤ 500 chars) and let `today` carry the
  chosen date for Finished / Abandoned (`finished_on`) and Paused
  (`paused_on`). Confirm the PATCH still refuses status fields.
- **Rating write ordering.** Two requests (status, then PATCH rating).
  If the second fails the game is finished but unrated; acceptable, show
  the error line, the stars stay editable on the item page. Or extend the
  status route with `rating`; Code's call.
- **Snapshot staleness for the owner.** The owner sees the admin view at
  once; the public Tonight updates at the next snapshot. Fine as today,
  but the Continue card's "last played" after Log tonight should update
  optimistically in the admin view.
- **Not tonight on Continue.** Reuse `picker/events` with
  `action: skipped` and the item id; the skipped-today read already
  drives the toast. Confirm the picker ignores a skip on an `active` game
  for scoring.
- **Migration.** `playthroughs.note text null`, next number after 0011.

---

# Plan

Written 2026-11-08 on `feat/tonight-continue` (worktree
`~/Developer/joey-haas.dev-worktrees/feat-tonight-continue`, cut from
`origin/main` at #97). Full tier: a migration, a public API contract change,
and about twenty files.

## What the code says (read before planning)

- `POST /api/items/{id}/status` takes `StatusIn {status, today}` only
  (`backend/items.py:168-172`, route `:1120-1137`). `today` is the owner's
  local day, checked within ±1 day of the server's (`check_today`,
  `playthroughs.py:281`), and `plan_transition` (`:143-199`) stamps
  `finished_on` / `paused_on` with it. The misclick rule (`is_misclick`,
  `:113-140`) deletes a run started today, never paused, with no journal
  day since its start, closed back to its previous outcome. PATCH refuses
  `status`, `started_at`, `finished_at`, `times_completed` (422,
  `STATUS_FIELDS`, `items.py:191-198`); `rating` and `notes` stay PATCHable.
- `Run` (`playthroughs.py:46-58`) has no note; `_as_run` / `_write`
  (`:292-307`) are the only row mapping. `runs_with_journal` (`:500-526`)
  returns `(run, days, minutes)` per run with the journal attributed to
  the run whose dates hold it; callers are `items.py:687` (every ItemOut
  carries `playthroughs` with `journal_days` / `journal_minutes`) and
  `picker_routes.open_run_details` (`:148-169`).
- Latest migration is `0011_add_playthroughs.py`; next is `0012`,
  `down_revision "0011"`. `tests/test_migrations.py` diffs the migrated
  schema against `models.py`, so a model column without its migration
  fails the suite.
- The public body is built in `backend/public_outputs.py:498-548`
  (`load_public_next`); `PublicTonight {up_next, picks, last_finish}`
  (`:277-283`), `PublicTonightCard` (`:252-263`), `PublicLastFinish`
  (`:266-274`, no rating). Public picks are filtered to `PICKABLE` =
  backlog, active, paused (`:53`), so **an active game can be both the
  Continue card and a pick** and needs de-duplicating.
  `tests/test_public_outputs.py` pins the field sets (`PICK_FIELDS`,
  `LAST_FINISH_FIELDS`) and walks the whole body for `FORBIDDEN` keys
  (`id`, `status`, `slot`, `created_at`, `:796-801`): the card carries
  `item_id` and no `status` key.
- `public_next_cache.next_fingerprint` (`:68-90`) hashes items,
  recommendations, catalogue runs and windowed pick events. **Journal rows
  and playthroughs are not in it**, so Log tonight and the hours on the
  card would serve stale without a change. #97 made the cache generic
  (`PublicNextCache[Body]`), shared with Pick for me.
- The picker's stall rule is `STALLED_AFTER = 30 days` on shown / pinned
  **events**, not journal rows (`picker.py:368, 568-584`). A `skipped`
  event drops a game from Play Next's candidates for `SKIP_WINDOW` (7
  days, `:367`) and has no other score effect. `POST /api/picker/events`
  takes `{item_id, action: skipped|never}`; `GET /api/picker/skipped-today`
  and `DELETE /api/picker/events/{item_id}/skipped` exist. All admin-only.
- `POST /api/items/{id}/sessions` (`journal_routes.py:84-106`, admin)
  takes `{played_on?, minutes?, note?}`; `played_on` defaults to the
  **server UTC** date, so the client must send `localToday()`. No
  one-row-per-day constraint.
- `pages/Next.jsx`: `Tonight` (`:154-378`) is inline; `withLists`
  (`:59-74`) rebuilds `tonight` with exactly `up_next`, `picks`,
  `last_finish`, so a new key is dropped unless added there. The write
  helper `act(optimistic, request, rollback, confirm, wait)` (`:222-241`)
  serialises writes and rolls back on failure. `isNextBody` in
  `lib/snapshot.js:30-35` and `scripts/fetch-snapshot.mjs:53-58` check
  only `tonight.picks` and stay as they are. Components: `TonightLead`,
  `TonightAlt` (also used by `HowItWorks.jsx:145-159`), `SkippedToast`,
  `JustFinishedChip`.
- `pages/PlayNext.jsx` has **no Tonight section and no lead pick**: an
  `up-next` band for the pinned item (`:324-341`), Size / Mood / Platform
  chips (`:343-380`), a `.pick-grid` of three `PickCard`s and Reroll.
  Items come from `/api/items` (`:141-161`), picks from
  `POST /api/picker/next`; `playThis` pins (`pinPath`), `notTonight`
  records `skipped`.
- `components/NowPlaying.jsx:21-56` is one `Link.now-playing-card` per
  item with no sibling controls (`index.css:2640-2745`,
  `border-left: 4px solid var(--status-active)` at `:2695`).
  `lib/nowPlaying.js` exports `NOW_PLAYING_LIMIT`, `currentRunStart`,
  `nowPlaying(items)` (active games, newest start first). Used by
  `AdminCollection.jsx:579` and `Collection.jsx:573`.
- `lib/statusMoves.js`: `statusMoves(item)`, `playMove(item)`,
  `setStatus(id, status)` (POSTs `{status, today: localToday()}`),
  `localToday`, `pinPath`. Finish and Pause have verbs; Abandon is the bare
  label. `ShelfCardActions.jsx` calls `onStatus(item, value)`; the handler
  is `AdminCollection.updateStatus` (`:356-378`), not optimistic, `load()`
  after. The touch sheet (`ShelfCardActions.jsx:147-182`) is a non-modal
  `role="dialog"` that closes on any outside pointerdown.
- **No shared modal component.** `MobileNavSheet.jsx:26-98`,
  `AdminShell.jsx:86-139` and `SearchDialog.jsx` each use a native
  `<dialog>` + `showModal()` (focus trap and inert page for free; Escape
  through `onCancel`; backdrop click; focus returned by the owner). Tests
  stub `showModal` / `close` per file (`SearchDialog.test.jsx`,
  `AdminShell.test.jsx`): jsdom has neither.
- `QuickRate {value, onChange}` (ten half-star targets, choosing the
  current value clears); `Stars {rating}`. The status marks are
  `.status-mark[data-status]` (`index.css:3662-3690`), absolutely
  positioned for posters; `.status-swatch` is the inline variant.
- No relative-day helper exists: `lib/releaseWords.js` `dayWords` and
  `lib/next.js` `weekdayWords` are absolute.
- How it works stop 3 is `spine.how.stops[2]` (`content/spine.js:190-215`),
  rendered by `HowItWorks.jsx`. `frontend/changelog.md` tops at
  `## 2026-11-07`.

## Answers to the open questions

- **Stale window vs the picker's stall check.** Separate, on purpose.
  `STALE_DAYS = 21` is defined once in `backend/continuing.py` and shipped
  as `stale: bool` on the card; the client never compares dates. The
  picker's `STALLED_AFTER` (30 days, on shown / pinned events) decides
  "Pick it back up" and is out of scope: a journal-based stall would change
  which games the public picks name. Recorded as a deviation.
- **Journal hours.** Backend, in one builder: `runs_with_journal` learns
  the last played day per run, and `build_continuing` sums the open run's
  minutes and days. `/api/public/next` calls it over public active games;
  a new admin read `GET /api/picker/continuing` calls it over every owned
  active game (private included) for Play Next. One computation, two
  callers, the client only renders.
- **Status route payload.** `StatusIn` gains `on: date | None` and
  `note: str | None` (≤ 500). `today` keeps its meaning (the owner's local
  day; tolerance and misclick rule unchanged); `on` is the date stamped on
  `finished_on` / `paused_on`, defaulting to `today`, refused after `today`
  or before the run's `started_on` (`check_dates`). The spec's "let `today`
  carry the chosen date" would break the misclick rule (a run started
  today closed with last Tuesday's date is not a misclick). PATCH keeps
  refusing status fields; a test pins that.
- **Rating write ordering.** Two requests: status first, then
  `PATCH {rating}` only when the stars changed. The status route stays
  the one writer of status and runs, PATCH the one writer of `rating`. If
  the PATCH fails the game is finished and unrated: the error line shows
  and the result announcement still says "marked finished"; the stars
  stay editable on the item page. Spec's named fallback.
- **Snapshot staleness.** As the spec says. Log tonight updates the
  card's sessions count and "last played" optimistically and refreshes
  the live body; the public snapshot follows at the next build.
- **Not tonight on Continue.** `POST /api/picker/events {skipped}` with
  the item id; the skipped-today read already hides it and drives the
  toast and Undo. The week's exclusion from Play Next candidates is
  harmless for the game in hand. Visitors never see the skip (events are
  the owner's), so the public card stays.
- **Migration.** `0012_add_playthrough_note.py`: `playthroughs.note text
  null`. Additive; the old code ignores the column, so apply to Neon
  before merging, as always.

## Decisions needed (at the go)

1. **Admin Play Next layout.** The spec assumes a lead pick to replace;
   the page has none. Plan: the Continue card(s) render above the Size /
   Mood / Platform chips (where the Up next band sits; a pinned active
   game is a Continue card, not a band), and the `.pick-grid` stays as it
   is: it is the owner's working surface and already compact, and Reroll
   regenerates it, never the card. No `PickList` on the admin page.
   Say so if you want the compact list there too.
2. **The migration carve-out.** One nullable text column. Doctrine puts a
   STOP before it (Milestone 2 below). "Go, including the migration" at
   this gate skips that stop.

## Deviations from the spec (decided here, recorded for the build)

- `continuing` is a **list** (`list[ContinuingCard]`), not `card | null`:
  the spec's stack case is the same render path, most recent session
  first, and the client needs no second shape.
- `PublicLastFinish` gains `rating: int | None` (rating is already public
  on every item), so the Just finished chip can show the stars.
- The relative-day helper is new, `lib/relativeDay.js` `daysAgo(iso,
  today)` ("today", "yesterday", "N days ago"); `dayWords` is absolute and
  stays.
- Log tonight's once-a-day rule is client-side: the button is disabled
  when the card's `last_played_on` is today. The journal route keeps
  accepting a second row for a day (the journal UI relies on no
  constraint there); nothing new server-side.
- Opening the sheet from the touch sheet closes the touch sheet first:
  `AdminCollection` owns the `WrapUpSheet`, `ShelfCardActions` only
  reports the chosen status as today, and a modal `<dialog>` inside a
  sheet that closes on outside pointerdown would fight it.

## Milestones

```
Milestone 1 (auto): tasks 1–8   — the read side: cards, list, admin read, Log tonight
STOP — carve-out review: migration 0012 (playthroughs.note)
Milestone 2 (auto): tasks 9–13  — the write side: note, dated close, Wrap up sheet, wiring, copy
Finish gate → PR
```

Deploy order (in the PR body): apply `0012` to Neon from this worktree
(`backend/scripts/migrate_neon.py current`, then `upgrade`), then merge.
Additive, so no status freeze is needed between the two.

## Tasks

Each task ends with its tests green and one conventional commit. Backend
tests run one at a time (`cd backend && ./.venv/bin/pytest`). Frontend:
`cd frontend && npm test`.

### Milestone 1 — the read side

**Task 1 — `runs_with_journal` knows the last played day.**
`backend/playthroughs.py`: `attribute_journal` returns `(days, minutes,
last_played_on)` per run; `runs_with_journal` returns `(run, days, minutes,
last_on)`; callers unpack four (`items.py:687-700`,
`picker_routes.open_run_details`). No API change.
Tests: `tests/test_playthroughs.py` — attribution gives the open run's
latest day, a day before its start goes to the earlier run, no journal →
`None`. AC: existing journal totals unchanged.

**Task 2 — `backend/continuing.py` and the public body.**
New module: `STALE_DAYS = 21`; `ContinuingCard(BaseModel)` with `item_id,
type, title, cover_url, platform, time_to_beat_hours, playthrough (int),
playing_since (date|None), last_played_on (date|None), journal_hours
(float|None), sessions (int), stale (bool)`; `build_continuing(session,
items, today) -> list[ContinuingCard]` over the given items' open runs
(active only, journal inside the run), sorted last played desc (None last)
then `playing_since` desc then title; `stale` = `today - (last_played_on
or playing_since)` ≥ `STALE_DAYS`, false when both are None.
`public_outputs.py`: `PublicTonight.continuing: list[ContinuingCard]`
over `data.public_games` with status active; picks whose `item_id` is a
Continue card are dropped from `picks`; `PublicLastFinish.rating`.
`public.py`: `last_played_on` on `PublicItemOut` from one grouped query
(max `PlaySession.played_on` by item over public items) in `_list_fields`.
Tests: `tests/test_public_outputs.py` — `CONTINUING_FIELDS` pinned,
`PublicTonight` field set, the `FORBIDDEN` walk gains `"note"`, dedupe (an
active public game shown yesterday is a card and not a pick), private
active game absent, stale at 21 days and not at 20, hours summed inside
the run only, sort order; `tests/test_public.py` — `LIST_FIELDS` gains
`last_played_on`, value is the max day, null without journal, and
`PUBLIC_MODELS` gains `ContinuingCard`. AC: spec AC 1–4's data.

**Task 3 — the cache knows the journal.**
`backend/public_next_cache.py`: `_rows(PlaySession)` and
`_rows(Playthrough)` join `next_fingerprint`; module docstring lists them.
Tests: `tests/test_public_next_cache.py` — a new journal row and a
playthrough edit each change the key; an unrelated day does not.

**Task 4 — admin read `GET /api/picker/continuing`.**
`backend/picker_routes.py`: `ContinuingOut {cards: list[ContinuingCard]}`
over every owned active game (`owned_format != none`, private included),
today = server UTC date. Admin-only through the router dependency.
Tests: `tests/test_picker_routes.py` (or the existing picker route test
file) — 401 signed out, private game included, same shape as the public
card. `tests/test_job_token.py` unchanged (the route is not in
`JOB_ROUTES`). AC: Play Next can render the card for a private game.

**Task 5 — frontend libs and copy.**
`lib/relativeDay.js` `daysAgo(iso, today = localToday())`;
`lib/nowPlaying.js` `nowPlaying(items)` orders by `last_played_on` desc
(null last), then start, then title (the two bands and the Continue stack
agree); `pages/Next.jsx` `withLists` adds `continuing: list(...)`;
`content/spine.js` `next.tonight` gains `continue`, `sittingDown`,
`stillPlaying`, `wrapUp`, `logTonight`, `logged`, `finishedIt`, `pause`,
`playingSince`, `over`, `sessions`, `lastPlayed`, `orInsteadRebuilt`,
`playInstead`-for-list if the wording differs, `sessionLogged`, and a
`wrapUp` block (title, outcomes with hints, step 2 labels, placeholder,
date labels and hint, skipExtras, primary labels, twoTaps, announce).
Tests: `relativeDay.test.js`, `nowPlaying.test.js` (ordering),
`Next.test.jsx` (an old snapshot without `continuing` still paints).

**Task 6 — `ContinueCard.jsx`.**
Props: `card`, `signedIn`, `linkTo` (item page or edit page), `onWrapUp
(card, preselect)`, `onLogTonight(card)`, `onSkip(card)`, `loggedToday`.
`article.tonight-lead.continue` labelled by its title, kicker Continue in
`.tonight-playing` style, title link with `data-tonight-title`, meta
(platform, `SizePill`, "about N h to finish"), sessions line (`daysAgo`;
`.late` class on the date when `stale`; hours and sessions omitted when
`sessions === 0`), owner action row `.tonight-acts.ask`: normal question
and Wrap up (primary) · Log tonight · Not tonight (ghost); stale question
and Pause (primary, preselect paused) · Finished it (preselect finished) ·
Not tonight. Log tonight disabled with the "logged" label when
`loggedToday`. CSS in `index.css` beside `.tonight-lead`: the 4px
`--status-active` left rule, `.sessions .late { color: var(--warn) }`,
the question-above-buttons wrap at 400px. Visitors: no row, no question.
Tests: `ContinueCard.test.jsx` — visitor has no buttons, owner's two
states, stale date is amber and in words, preselect values, logged
disabled, title is the only link.

**Task 7 — `PickList.jsx` and Tonight's branch.**
`PickList {picks, signedIn, onPlay, onSkip, skipped, onUndo}`:
`ul.picklist` rows with 2.6rem cover, slot kicker, title link, meta,
first reason, owner buttons Play this instead / Not tonight as siblings;
a skipped row renders `SkippedToast`. Header `p.picks-h`: Or instead ·
"rebuilt nightly". `pages/Next.jsx` `Tonight`: `continuing` minus
`hidden` and `skipped` (a skipped card shows as a `SkippedToast` with Undo);
while one or more cards show, render them (most recent first), then
`PickList` of `open` picks (a pinned backlog game first with the Up next
kicker), hide `JustFinishedChip`; otherwise today's layout unchanged.
Handlers: `skipCard` → `act` with `picker/events skipped` (toast, Undo via
the existing `undo`); `logTonight` → `act` with
`POST /api/items/{id}/sessions {played_on: localToday()}`, optimistic
`sessions + 1`, `last_played_on = today`, `stale = false`, announce
"Session logged for today", confirm via `onRefresh`. `onWrapUp` is wired
in Task 12 (no-op prop until then). CSS for `.picklist`.
Tests: `PickList.test.jsx`; `Next.test.jsx` — card leads with one active
game and picks are a list, no chip while a card leads, two cards most
recent first, no card → unchanged layout, dedupe shown, Not tonight →
toast → Undo, Log tonight writes the local date once and disables, visitor
sees no buttons. AC: spec AC 1–3, 8, 9.

**Task 8 — admin Play Next.**
`pages/PlayNext.jsx`: fetch `/api/picker/continuing` with the items (and
after each write); render `ContinueCard`s above the chips with `linkTo`
the edit page; a pinned active game is a card, not the Up next band; Not
tonight and Log tonight as on Next (the page's non-optimistic `send`);
the pick grid and Reroll unchanged. Tests: `PlayNext.test.jsx` — card
above filters, private active game shown, band replaced when the pin is
active, Log tonight posts the local date.
AC: decision 1 as planned.

### STOP — carve-out review: migration 0012

### Milestone 2 — the write side

**Task 9 — migration `0012_add_playthrough_note.py` and the model.**
`playthroughs.note text null`; `models.Playthrough.note`; `Run.note: str |
None = None` carried by `_as_run` / `_write`; `PlaythroughOut.note`.
`backend/migrations/README.md` list gains 0012; `CLAUDE.md` migration
paragraph too. Tests: `test_migrations.py` green; `test_playthroughs.py`
round-trips the note. AC: the admin item detail returns the note; nothing
public changes (the `FORBIDDEN` walk from Task 2 proves `note` is absent).

**Task 10 — a dated, noted close.**
`StatusIn.on: date | None = None`, `note: str | None = Field(None,
max_length=500)`; `plan_transition(..., today, journal_in_open, on=None,
note=None)`: `stamp = on or today` on `finished_on` / `paused_on` for
closing and paused targets, `note` set on the Change / Open those produce
(a misclick Delete ignores both; active and backlog refuse `on` / `note`
with 422: nothing to date). `apply_status` passes them; route validation:
`on > today` → 422 "not yet", `check_dates` on the resulting run (before
`started_on` → 422). `lib/statusMoves.js` `setStatus(id, status, extras =
{})` spreads `extras` into the body; `WRAP_UP_STATUSES = ['finished',
'paused', 'abandoned']` and `isWrapUp(status)`.
Tests: `test_playthroughs.py` (pure: dated close, dated pause, note on
the closed run, misclick still deletes, `on` before start refused);
`test_items_status.py` (route: `on` and `note` land, `on` tomorrow 422,
`note` 501 chars 422, PATCH still refuses status fields, `on` on
`active` 422); `statusMoves.test.js`.

**Task 11 — `WrapUpSheet.jsx`.**
Native `<dialog class="wrap-sheet">` per `MobileNavSheet`'s pattern
(`showModal`, `onCancel` → `onClose`, backdrop click, focus returned to
`returnFocusRef`). Props: `open`, `item {id, title, cover_url, type}`,
`preselect`, `onClose`, `onDone({status, rating})`. On open fetch
`/api/items/{id}` for the header (open run number, `started_on`,
`journal_minutes` → "Playthrough n · since … · N h") and the current
rating. Outcome `role="group" aria-label` with three `aria-pressed`
buttons whose accessible name is label + hint; `QuickRate`; textarea
`maxLength 500`; `<input type="date" max={localToday()}>` defaulting to
today, label by outcome; footer Skip extras (outcome only) and the primary
(label by outcome). Save: `setStatus(id, status, {on, note})` then
`PATCH {rating}` when changed; errors show `ACTION_ERROR` inside the sheet
and keep it open on a status failure, close with the error reported
through `onDone` on a rating failure. Bottom-anchored at 400px, centred
34rem on desktop, `::backdrop` `--overlay`; marks use the
`.status-swatch` fills. CSS in `index.css`.
Tests: `WrapUpSheet.test.jsx` (stub `showModal` / `close`) — preselect,
primary label follows the outcome, Skip extras posts only status and
today, primary posts `on` and `note` then PATCHes the rating only when
changed, status failure keeps the sheet open, Escape calls `onClose`,
names of the outcome buttons. AC: spec AC 5–6, 11.

**Task 12 — three entry points, and after finishing.**
`pages/Next.jsx`: sheet state `{card, preselect}`; `onDone` removes the
card optimistically, announces "{title} marked {outcome}", calls
`onRefresh`; the refreshed body's `last_finish` (now with `rating`) shows
the chip, and `JustFinishedChip` renders `Stars` after the hours when
`rating` is set. `pages/PlayNext.jsx`: same sheet; after done, refetch
items and continuing. `components/NowPlaying.jsx`: optional `onWrapUp`
renders a Wrap up button as a sibling of the Link (`AdminCollection`
passes it; `Collection` does not). `AdminCollection.updateStatus`: a
wrap-up status opens the sheet with that outcome preselected (the touch
sheet closes first); other moves write as today; `onDone` → `load()`.
Tests: `Next.test.jsx` (finish → card gone, chip with stars, picks in
today's layout; pause → picks lead), `PlayNext.test.jsx`,
`NowPlaying.test.jsx` (button only with the prop, sibling of the link),
`AdminCollection.test.jsx` (Finish from the select opens the sheet and
writes nothing until saved; Start playing still writes at once). AC:
spec AC 5, 7.

**Task 13 — copy, tour, changelog, docs.**
`spine.how.stops[2].claim` and `live.caption` say Tonight leads with the
game I'm playing and that Wrap up finishes it in two taps; the How it
works live stop renders the card when `continuing` is non-empty (reuse
`ContinueCard` with `signedIn={false}`). `frontend/changelog.md`:
`## 2026-11-0X` entry (the merge day) with one bullet linking
`/shelf/next`. `CLAUDE.md`: this feature's TODO line ticked, migration
list gains 0012, the playthroughs paragraph mentions `note`, `on` and
`STALE_DAYS`; README's playthroughs / What's next sections if they
describe the status payload. `HowItWorks.test.jsx` for the live stop.

### Parallel safety

Tasks 1–4 (backend) and 5–7 (frontend) are independent until Task 7's
test needs Task 2's body shape (fixtures are hand-written, so even that is
loose). Flagged parallel-safe: {1–4} ∥ {5, 6}. Everything else sequential.
Default execution is sequential in this worktree.

### Finish gate

Both suites green, `npm run build` green, a browser pass of the four
mockup states at 400 and 1280 in both themes against `chosen.html`, the
accessibility checks in the spec (focus trap, Escape, return focus,
announcement, names), then one reviewer pass and the PR with the deploy
order in its body.

## Environment test section

- **Local**: backend `uvicorn main:app --reload` on the main checkout's
  `.env` (`stats_dev`), Vite on 5173. Sign in; set one game active; log a
  session on its journal; load `/shelf/next` and `/admin/play-next`: the
  card leads, hours and last played match the journal; Log tonight once
  (disables), Not tonight (toast, Undo); Wrap up → Skip extras (status
  only), then on another game Wrap up with stars, a line and last
  Tuesday's date: `finished_on` is that date, `playthroughs.note` is the
  line, `rating` is the stars, `times_completed` went up by one. Finish
  from the shelf's select and from the Now Playing band open the same
  sheet. Visitor tab: card and list, no buttons.
- **Stale**: in `stats_dev`, set the open run's `started_on` 25 days back
  with no journal row: amber date, "Still playing it?", Pause primary and
  preselected.
- **Pytest**: one run at a time (the suite recreates the test schema).
- **Deploy**: `migrate_neon.py current` → `upgrade` to 0012 from this
  worktree, then merge; after Render deploys, `./scripts/smoke.sh
  https://joey-haas.dev https://api.joey-haas.dev`, then
  `curl -s https://api.joey-haas.dev/api/public/next | jq .tonight.continuing`
  and a look at `/shelf/next` signed out and in. The nightly's next
  snapshot carries the card to the static paint.
