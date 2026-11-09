---
status: ready-for-plan
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
