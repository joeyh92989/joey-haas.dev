---
status: planned
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

---

# Plan

Planned 2026-10-30 on `feat/tonight-picks`. Tier: **Full**. It touches a
public API contract and needs a DB migration.

## What the code says (read before planning)

- **Public picks carry no slot, and none is stored.** `public_picks_with_day`
  (`backend/public_outputs.py`) rebuilds tonight's picks from `shown` events
  in `pick_events`. That table has no slot column, and `_PickRow` /
  `PublicTonightCard` leave the slot out on purpose ("those describe the
  owner's use of the tool"). The chosen mockup shows visitors the slot labels
  and a lead card in slot order. Both need the slot recorded, so this plan
  adds migration `0009` (see Decisions needed, D1).
- **Skips today don't reach `/api/public/next` until UTC midnight.** That's
  deliberate (S9, and the docstring of `public_picks_with_day`). A live
  refetch after Not tonight would bring the card straight back, so the
  owner's page needs its own short list of today's skips (D2).
- **`finished_at` is already stamped** on a first finish by
  `statusTransition` (`frontend/src/lib/statusTransition.js`), which the
  shelf card and the list table use. Only the edit page sets it by hand. It
  is already a public field (`public.py`, `PublicItem.finished_at`).
- **Only `PlayNext.jsx` sends `time`.** It's plain `useState` (not a stored
  shelf pref), and the nightly job posts `/api/picker/next` with no body. So
  renaming the values is safe.
- **Pin and unpin routes already exist** (`POST`/`DELETE
  /api/items/{id}/pin`, `items.py`). There's no route to undo a skip.

## Answers to the open questions

| Question | Answer |
| --- | --- |
| `finished_at` coverage | Already stamped on a first finish from the shelf card and list (`statusTransition`). No server-side stamping: the edit page edits the field directly, by design. **Out:** the admin-landing count. Recency with no dates is just today's behaviour. Backfill by hand on the edit page if wanted. |
| Live replacement on Not tonight | **No.** Hide plus Undo, as the mockup shows. A live replacement would show the owner a different set of picks than the public sees, which is the problem this spec fixes. |
| Recency curve | Additive, finished games only: `weight += RECENCY_BONUS × 0.5^(days / RECENCY_HALF_LIFE)`, with bonus 0.3 and half-life 30 days. A finish today counts 0.6 instead of 0.3. It's about 0.3 + 0.15 at 30 days and back to 0.3 within a year. It never subtracts, so a favorite (1.0) still outranks a fresh non-favorite finish (≤ 0.6 before rating). |
| Chip window | 60 days (`JUST_FINISHED_WINDOW`), about two half-lives. |
| Contrast test | Bands (Short / Medium / Long, the same edges as the filter), not a ratio. They match what the pill says, so the reason never reads "different size" for two games that both show "Medium". |
| API values | Rename to `short` / `medium` / `long` (`any` stays). Nothing else sends them. |
| Drop-in tag | Dropped. No clean signal: `roguelite` / `Arcade` / `Party` are already the `chaotic` mood bucket, which covers the use. |

## Decisions needed (at the go)

- **D1 — public slot labels (recommended: yes, with migration `0009`).**
  Add a nullable `slot` to `pick_events`, written on `shown` events.
  `PublicTonightCard` gains `slot_label` and `time_to_beat_hours`, and
  `PublicTonight` gains `last_finish`. This reverses the showcase spec's
  "no slot in public" for the labels only: no score, rank or event time.
  Two labels are withheld publicly (`slot_label: null`):
  - **Pick it back up**, because its rule ("not touched in 30 days") reports
    my activity. That's the same reason its reason line is already withheld.
  - **Change of pace** when the last finish is private, because the label
    would hint at a game the public can't see.

  *Alternative:* no migration. Visitors see an unlabelled lead plus
  alternatives in title order, and only Play Next shows labels. This is
  cheaper, but it drops half of the chosen design.
- **D2 — owner's skip list (recommended).** Two new admin-only routes:
  `GET /api/picker/skipped-today` (item ids skipped since today's UTC
  midnight), which the signed-in page uses to hide those cards; and
  `DELETE /api/picker/events/{item_id}/skipped`, which is Undo and removes
  that game's skips since today's UTC midnight. Neither is public, and
  neither is on `JOB_ROUTES`.

## Milestones

```
Milestone 1 (auto): tasks 1–5   scorer + admin Play Next + skip routes
STOP — carve-out review: migration 0009 + public contract change (D1)
Milestone 2 (auto): tasks 6–8   slot recorded, public tonight body
Milestone 3 (auto): tasks 9–11  Tonight UI on /shelf/next
Finish gate → PR   (deploy order: apply 0009 to Neon, then merge)
```

None of the tasks are parallel-safe. Tasks 1–3 share `picker.py`, and
tasks 9–11 share `Next.jsx` and `index.css`. They run in order.

## Tasks

**1. Recency in the profile.** `picker.py`, `picker_routes.py`,
`tests/test_picker.py`.
- `PickerItem.finished_at: date | None`, mapped in `to_picker_item`.
- `reference_weights(items, today)` adds the recency bonus (constants
  `RECENCY_BONUS`, `RECENCY_HALF_LIFE`) to finished games with a date. All
  callers pass `today`.
- AC: (AC5) with a finish this week, a candidate sharing its genres scores
  higher than with the same finish a year ago. A favorite outranks both. A
  finish with no date weighs exactly what it does today. Abandoned games are
  untouched.

**2. Size, not evenings.** `picker.py`, `picker_routes.py`,
`tests/test_picker.py`, `tests/test_picker_routes.py`.
- `TIME_WINDOWS` → `SIZE_BANDS` with keys `short` / `medium` / `long` (same
  edges). Add `size_band(hours)`. `PickRequest.time` → `size`, and
  `PickNextIn.size: Literal["any","short","medium","long"]`. `_length_reason`
  is removed from `_common_reasons`.
- AC: (AC7) no reason contains "evening", "a short one" or "a long one".
  (AC8) unknown hours means no band and a neutral `length_fit`. The old
  `time` values get a 422.

**3. Change of pace slot and the recency phrase.** `picker.py`,
`tests/test_picker.py`.
- `last_finish(items)` returns the owned game with the latest `finished_at`.
- Slot `change_of_pace` replaces `short_and_sweet` in slot 2. Among the
  remaining candidates whose affinity is ≥ the pool median, it takes the top
  total that contrasts with the last finish: a different `size_band` (both
  known), or no shared genre (both have genres). Its first reason reads
  "About 3 h to finish, after 62 h of X" (size) or "Something different from
  X: Puzzle, not RPG" (genre). The median computation is pulled out and
  shared with the third slot.
- Falls back to the existing Short and sweet rule and label when there's no
  last finish or no eligible game.
- `_overlap_reason` appends ", which I finished this week / last week / in
  {Month}" when the named reference is finished within `JUST_FINISHED_WINDOW`.
- `public_reasons(item, profile, today)` gains `change_of_pace_reason` only
  when the last finish is in the (public) profile.
- AC: (AC6) the slot is always a band or genre contrast at ≥ median
  affinity. With no finish it's Short and sweet. (AC9) with a private last
  finish, no public reason names it.

**4. Admin Play Next: Size filter and pill.** `components/SizePill.jsx`
(new), `pages/PlayNext.jsx`, `index.css`, `PlayNext.test.jsx`,
`SizePill.test.jsx`.
- The filter reads **Size**: Any · Short (under 6 h) · Medium (6–15 h) ·
  Long (15 h+), and sends `size`. `PickCard` meta uses `SizePill` (band text
  plus "about N h to finish", nothing when unknown).
- AC: (AC7, AC8) the labels and hints are as specified, and there's no pill
  without hours.

**5. Skip list and Undo routes (D2).** `picker_routes.py`,
`tests/test_picker_routes.py`.
- `GET /api/picker/skipped-today` → `{"item_ids": [...]}`.
- `DELETE /api/picker/events/{item_id}/skipped` → 204, idempotent, deletes
  only skips at or after today's UTC midnight.
- AC: both 401 without a session. Neither is on `JOB_ROUTES`
  (`test_job_token.py` stays unchanged and green). A skip from yesterday
  survives the DELETE.

**STOP — carve-out review** (migration plus public contract).

**6. Migration `0009`: `pick_events.slot`.** `migrations/versions/0009_*.py`,
`models.py`, `picker_routes.py`, `migrations/README.md`, CLAUDE.md (Media
tracker migrations line).
- Nullable `String(32)`, additive. `pick_next` writes the pick's slot on
  each `shown` event it inserts.
- AC: upgrade and downgrade run locally. `schema_check` passes. Old rows
  stay null.

**7. Public tonight body.** `public_outputs.py`, `public_next_cache.py` (only
if a new read needs it), `tests/test_public_outputs.py`,
`tests/test_public.py`.
- Picks are ordered by slot (`best_fit`, `change_of_pace` /
  `short_and_sweet`, third), using each game's latest `shown` event that day.
  A null slot (rows from before `0009`) sorts after the others in title
  order. The rule "events before today's midnight only" is unchanged.
- `PublicTonightCard` adds `slot_label: str | None` (withheld per D1) and
  `time_to_beat_hours: int | None`.
- `PublicTonight` adds `last_finish: {item_id, title, cover_url, finished_at,
  time_to_beat_hours} | null`. It's the latest public owned game finished
  within 60 days.
- The fingerprint already covers these reads (`items` xmin, and the windowed
  shown events). A test confirms a finish date change busts the cache.
- AC: (AC2) field pins updated, the forbidden-keys walk passes, and no score,
  event time or rank appears. (AC9) a private last finish gives
  `last_finish: null` and a null Change of pace label.

**8. Copy.** `content/spine.js`, `content/status.js` if a string is missing.
- The new slot label, the chip, the toast, "Or instead" / "The other picks",
  the owner note, the action labels, and How it works stop 3 ("how big a
  game it is").
- AC: (AC7) `grep -i evening frontend/src/content/spine.js` is empty.

**9. Tonight components.** `components/TonightLead.jsx`,
`TonightAlt.jsx`, `JustFinishedChip.jsx`, `SkippedToast.jsx`, `index.css`,
tests beside each.
- Built to `chosen.html` with tokens only. The buttons are siblings of the
  title link. The toast is `role="status"`. The chip thumb is
  `aria-hidden`. Buttons are ≥ 36px tall.
- `TonightCard` is retired: the How it works tour moves to `TonightAlt`
  (`HowItWorks.jsx`), so there's no dead code.

**10. Tonight on `/shelf/next`.** `pages/Next.jsx`, `Next.test.jsx`.
- Reads `signedIn` from the outlet context. Signed in, it fetches
  `skipped-today` once and hides those cards.
- Play this / Play this instead / Unpin are optimistic pin/unpin calls,
  followed by a live refetch of `/api/public/next`. They roll back with
  `ACTION_ERROR` on failure.
- Not tonight posts `skipped` and shows the toast. Undo calls the DELETE
  and restores the card. Skipping the lead promotes the next pick.
- Focus goes to the new lead's title link after Play this, and to Undo after
  Not tonight.
- AC: AC1–4 and AC10 in component tests. Signed out renders no buttons,
  toast or note.

**11. Docs.** CLAUDE.md (Play Next paragraph: slots, size, recency, the
public slot labels, the two routes), `backend/README` / README → Tonight
if it documents the picks.

## Tests and environment

- Backend: `./.venv/bin/pytest` (one run at a time; the shared test DB).
- Frontend: `npm test` and `npm run build`.
- Browser (preview, local backend with fixtures): `/shelf/next` at 400 and
  1280, dark and light, signed out. Side by side with `chosen.html`.
- **Signed-in states can't be driven locally** (Google OAuth). They're
  covered by component tests with a stubbed outlet context. Joey checks Play
  this, Not tonight and Undo on production after deploy.
- Smoke: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`
  after deploy.
- **Deploy order:** apply `0009` to Neon
  (`backend/scripts/migrate_neon.py current` then `upgrade`, from the
  worktree), then merge.
