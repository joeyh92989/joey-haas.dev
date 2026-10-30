---
status: ready-for-plan
mockups: docs/planning/mockups/2026-10-30-tonight-picks/
chosen: chosen.html
---

# Tonight's picks: smarter, honest about length, pickable (design)

Date: 2026-10-30 · Repo: joey-haas.dev · Builds on
`2026-10-05-spine-next-design.md` (What's next and its public Tonight section)
and the Play Next scorer in `backend/picker.py`. The Ledger tokens and the
compact tracker masthead from `2026-10-19-site-refresh-design.md` still apply,
and so do the public-output rules in `2026-09-28-tracker-showcase-design.md` §D
and the Spine Next spec (B5, B8, S9). Copy goes in `content/spine.js`.

## Problem

Three things are wrong with Tonight on `/shelf/next` and Play Next on
`/admin/play-next`:

1. **The picks ignore what I just finished.** `reference_weights` gives a
   game I finished last week the same weight as one I finished years ago, and
   no pick responds to the last finish. `PickerItem` doesn't carry
   `finished_at`.
2. **The length wording is wrong.** `time_to_beat_hours` is IGDB's "normally"
   time to finish the *whole game*. The filter still calls 6–15 h "Evening",
   and the reason line says "About 15 h — fits an evening". No evening is 15
   hours long.
3. **I see a pick on one page and act on it on another.** Tonight on What's
   next is read-only even when I'm signed in. To act on a pick I have to open
   admin Play Next, which shows a different, live set of picks.

## Scope

**In**

- Recency in the scorer: finished games weigh more the more recently they
  were finished.
- A new **Change of pace** slot that contrasts with the last finish. It
  replaces Short and sweet.
- Length shown as the size of the game: renamed filter, size pill, and
  reason text, in both Tonight and Play Next.
- The Tonight section on What's next redesigned as a lead pick plus
  alternatives (direction B), with a "Just finished" chip.
- **Play this** and **Not tonight** on Tonight cards, visible only when the
  owner is signed in.

**Explicitly out**

- Shopping sections (Wanted, Buy now, Pre-orders, Later, Not on cartridge):
  unchanged.
- Moods, platforms and reroll on admin Play Next: unchanged apart from the
  size labels and the new slot.
- A "how much time do I have tonight" input, and guessing session length
  from genre. Considered and declined (see Key decisions).
- A drop-in tag. It appears in the mockups as an option only. It's not in
  scope unless Code finds a cheap, reliable signal (see Open questions).
- Any change to the public/private data rules, or to the nightly job's
  schedule.

## Design

Chosen: **B · Lead pick** (`chosen.html`, a copy of `b-lead-pick.html`).

### Tonight section (`/shelf/next`)

Top to bottom:

1. `h2` **Tonight**.
2. **Just finished chip.** A pill with a round cover thumb:
   *Just finished **{title}** · {day} · {hours} h*. "Day" uses the page's
   existing `dayWords` format, e.g. "Mon 26 Oct". Hours means time to beat,
   rounded, and is left out when unknown. The chip is hidden when there's no
   public finish in the last 60 days (see Open questions for the window).
   Publicly it shows the most recent *public* finish only.
3. **Lead card** (`hero`). The first pick in slot order, or the Up next game
   when one is pinned. It shows: cover (8.5rem desktop, 5.5rem phone), the
   slot label (or **Up next** when pinned), the title as a link to the item
   page, the platform, the size pill + "about N h to finish", and up to two
   reasons. Signed in, its actions are **Play this tonight** (primary) and
   **Not tonight**. When pinned, the actions become a green "● Up next" label
   and an **Unpin** text button.
4. **"Or instead"** (label changes to "The other picks" once a game is
   pinned). The remaining picks as compact cards, two columns on desktop and
   one on a phone. Each card shows: cover 3rem, slot label, title, size pill +
   hours, and the *first* reason only. Signed in, each gets **Play this
   instead** and a **Not tonight** text button.
5. Signed in only: a muted line, *Only you see these buttons.*, with the
   small green dot.

Slots, in order: **Best fit** · **Change of pace** · one of **Pick it back
up** / **Overdue classic** / **Waited longest** (the existing rule for the
third slot). Short and sweet is gone. When the last finish was long, Change
of pace will usually be a short game anyway. When I want short games I can
set the Size filter to Short.

### Recency in the score

- A finished game's reference weight gets a recency multiplier based on
  `today - finished_at`. A finish within the last ~30 days counts the most,
  and the multiplier falls back to today's weight by about a year. Code picks
  the curve. It has to be pure and tested like the rest of `picker.py`. A
  finish with no `finished_at` keeps today's weight.
- Favorites and ratings work exactly as they do now. Recency only *adds* to
  them, so an old favorite never drops below where it is today.
- The Best fit reason may name the recent finish: *"Shares RPG and Turn-based
  with Xenoblade Chronicles 3, which I finished last week."* The relative-time
  phrase is "this week", "last week", or "in {Month}". In public mode it
  appears only when that game is public (same rule as every public reason).

### Change of pace slot

- The **last finish** is the owned game with the latest `finished_at`.
- Contrast means either a **different size band** (Short / Medium / Long)
  from the last finish, or **no shared genre** with it. Among the eligible
  picks, take the highest total score that clears the median affinity gate
  (the same gate the third slot already uses), so a contrast pick is never a
  bad fit.
- Its first reason states the contrast in plain words:
  - *"About 3 h to finish, after 62 h of Xenoblade Chronicles 3"* (size
    contrast), or
  - *"Something different from Xenoblade Chronicles 3: Puzzle, not RPG"*
    (genre contrast).
- With no last finish, or no eligible game, the slot falls back to today's
  Short and sweet rule and keeps the **Short and sweet** label. That way the
  section never loses a card.

### Length: honest labels

| Where | Today | New |
| --- | --- | --- |
| Play Next filter | Time: Any · Quick (under 6 h) · Evening (6–15 h) · Long (15 h+) | **Size**: Any · Short (under 6 h) · Medium (6–15 h) · Long (15 h+) |
| Card meta | `≈ 15 h` | Pill **Medium** + "about 15 h to finish" |
| Reason line | "About 15 h — fits an evening" / "a short one" / "a long one" | Removed. Size is in the meta now. The Change of pace reason is the only reason that mentions hours. |
| Copy (`content/spine.js`, How it works stop 3) | "whether it fits the evening" | "how big a game it is" |

The windows keep their numbers. Only the names and the wording change. The
API request value can stay `quick` / `evening` / `long`, or move to `short` /
`medium` / `long` (see Open questions). Games with no IGDB time get no pill
and no hours. They are still never penalized.

### Interactions (signed in)

- **Play this / Play this instead** calls `POST /api/items/{id}/pin`, which
  already clears any other pin and marks the game in progress. The game moves
  into the lead card as **Up next**, and the other picks drop to "The other
  picks". Writes are optimistic. On failure the card goes back to how it was,
  with an inline error from `content/status.js` (`ACTION_ERROR`).
- **Not tonight** records a `skipped` event (`POST /api/picker/events`) and
  replaces the card with a dashed toast: *"{title} is off tonight's list."*
  plus an **Undo** button. Undo removes the toast. Skipping the lead card
  promotes the next open pick into the lead.
- **Unpin** calls `DELETE /api/items/{id}/pin`, and the picks return to their
  normal order.
- After an action, the page refetches `/api/public/next` live rather than
  relying on the snapshot, so Up next stays correct.
- Signed out: no buttons, no toasts, and no owner note. A pinned Up next still
  shows as the lead card, as it does today.

### Responsive and themes

- Desktop (1280): the section is up to 52rem wide. The hero has its actions
  inline under the reasons, and the alternatives sit in two columns.
- Phone (400): the hero cover is 5.5rem. The actions span the full card
  width under the text, with the primary button stretching to fill. The
  alternatives are one column. All buttons are at least 36px tall.
- Dark (default) and light both use the existing tokens. No new colors. The
  pinned border is `--accent` and the "Up next" label is `--ok`.

### Accessibility

- The buttons are siblings of the title link, never nested inside it (as with
  `NextRow`).
- The toast is `role="status"`, and Undo is a real button.
- After Play this or Not tonight, focus moves to the new lead card's heading
  link (or the toast's Undo). Focus is never dropped to `body`.
- The size pill is text ("Medium"), not just a color. The chip's thumbnail is
  `aria-hidden`.
- Nothing is hover-only. Focus-visible uses the existing 2px `--accent`
  outline.

### Mockups

`docs/planning/mockups/2026-10-30-tonight-picks/`: `index.html` lists all
three directions plus the table of shared changes. `chosen.html` is the
winner. Each page has a bar to switch theme, width (400 / 1280), and viewer
(signed in / visitor), and the actions work.

## Key decisions

- **Recency does both things** (Joey, 2026-10-30): it boosts taste toward
  recent finishes, *and* it drives one contrast slot. Momentum alone narrows
  the picks into a rut. Contrast alone ignores what I clearly enjoyed.
- **Length means game size, not tonight's session** (Joey). The only data is
  IGDB's time to finish the whole game. A session-length guess would come
  from genre and be unreliable, and dropping length altogether would throw
  away a useful filter.
- **Act on picks on What's next when signed in** (Joey), using the
  `signedIn` outlet context the way `Item.jsx` already does. Rejected:
  - linking out to admin Play Next, which keeps two pages showing different
    picks;
  - merging Play Next into What's next, which puts admin controls on a
    public route and is too big a change for this phase.
- **Direction B, Lead pick, chosen.** It answers "what do I play?" in one
  tap, and the alternatives are still right below.
  - **A · Same rows, owner actions** lost because every pick looks equally
    important and three primary buttons are busy on a phone.
  - **C · From the last finish** lost because the four-column layout is
    wide, it stacks into four cards on a phone, and it falls apart when the
    last finish is old.
- **Change of pace replaces Short and sweet** instead of adding a fourth
  slot. Three picks stays the shape on both pages, and the Size filter
  covers "I want something short".

## Component inventory

**New**

- `TonightLead`: the hero card. It replaces the first `TonightCard` in
  `Next.jsx`. Its props are the pick and `signedIn`, plus action handlers.
- `TonightAlt`: the compact alternative card.
- `JustFinishedChip`: the pill with the round cover thumb.
- `SkippedToast`: the dashed status row with Undo. It could share the
  existing toast/status styles if one fits.
- `SizePill`: the "Long" pill plus hours. Shared by Tonight and
  `PlayNext.jsx`'s `PickCard`.

**Existing, changed**

- `Next.jsx`: the `Tonight` component (layout and signed-in actions).
- `PlayNext.jsx`: the `TIMES`/`TIME_HINTS` labels become Size, and
  `PickCard` meta uses `SizePill`.
- `TonightCard` (shared with the How it works tour's Play Next stop): keep it
  for the tour or move the tour to `TonightAlt`. Code decides.
- `content/spine.js`: the new strings (slot label, chip, toast, owner note,
  How it works wording).

**Backend**

- `picker.py`: the recency multiplier, the `change_of_pace` slot and its
  reasons, the length reason removed, and `finished_at` on `PickerItem`.
- `picker_routes.py`: map `finished_at` onto `PickerItem`.
- The public-picks loader: put the new slot through the same public-reasons
  path.

**Tokens used:** `--surface`, `--sunken`, `--line`, `--line-strong`,
`--text`, `--text-2`, `--text-3`, `--accent`, `--accent-ink`, `--accent-soft`,
`--ok`. No new tokens.

## Acceptance criteria

1. Tonight on `/shelf/next` matches `chosen.html` at 400px and 1280px, in dark
   and light, both signed in and signed out.
2. Signed out, Tonight has no buttons, toasts or owner note, and the response
   body carries no new private field (the existing forbidden-keys walk still
   passes).
3. Signed in, Play this pins the game. It shows as Up next in the lead card
   without a full page reload, and after a reload it is still Up next, its
   status is in progress, and any previous pin is cleared.
4. Signed in, Not tonight records one `skipped` event and shows the toast.
   Undo restores the card. Skipping the lead promotes the next pick.
5. With a finish this week, a game sharing that finish's genres outranks
   (fixture test) the same game when the finish is a year old. Favorites
   still outrank both.
6. Change of pace is either a different size band or shares no genre with
   the last finish, and its affinity is at least the pool's median. With no
   finish, the slot is Short and sweet.
7. The strings "evening" and "fits an evening" don't appear in picks,
   reasons, filters or `content/spine.js`. The Play Next filter reads Size:
   Any · Short · Medium · Long with their hour hints.
8. A game with no time to beat shows no pill and no hours, and its length
   term is still neutral.
9. Public reasons that name the recent finish appear only when that game is
   public (test with a private last finish).
10. Keyboard only: every action is reachable, focus lands as described above,
    and the toast is announced.

## Open questions for Code

- **`finished_at` coverage.** It's only set by hand: marking a game finished
  doesn't stamp it, and imported finishes are probably null. Should the
  status change to `finished` set `finished_at = today` when it's empty (no
  schema change)? And is a one-off backfill or admin prompt worth doing so
  recency has data on day one? Recommendation: auto-set it, and show a count
  of finished games without a date on the admin landing.
- **Public picks are daily.** `/api/public/next` publishes the picks recorded
  by the nightly job, while admin Play Next scores live. Should Not tonight
  on What's next fetch a live replacement for the owner, or just hide the
  card until the next night? The mockup shows hide plus Undo. If a live
  replacement is cheap, prefer it for the owner only.
- **Recency curve and the chip window.** Exact decay (half-life of about 30
  days?), and whether the chip window (60 days) should match it.
- **Size band edges for contrast.** 6 h and 15 h are fine for the labels.
  Should the contrast test use bands, or a ratio (e.g. under half or over
  double the last finish's hours)?
- **API value names.** Rename `time` values to `short` / `medium` / `long`,
  or keep the old values with new labels? This depends on whether anything
  else (snapshot, nightly job request) sends them.
- **Drop-in tag.** Only if IGDB keywords or genres give a clean signal
  (roguelite, arcade, party). Otherwise drop it.
