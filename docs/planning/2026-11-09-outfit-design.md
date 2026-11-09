---
status: ready-for-plan
mockups: docs/planning/mockups/2026-11-09-outfit/
chosen: chosen.html
shell: d-admin-areas.html
---

# Closet: what to wear today, and what to stop keeping (design)

Date: 2026-11-09 · Repo: joey-haas.dev · Mockups under
`docs/planning/mockups/2026-11-09-outfit/` (`index.html` links them;
`chosen.html` is the Closet direction below, `d-admin-areas.html` the admin
shell it lives in). Brainstormed in Cowork; the brief half is first, the
spec half follows "Design".

## Problem

Getting dressed currently runs through the Gemini and Claude phone apps:
"what should I wear today", "what goes with this shirt". Every conversation
starts from nothing. The model does not know what is in the closet, what was
worn Tuesday, that Denver will swing 30 °F between the bike ride in and the
ride home, or that Wednesday is an office day. The answers are generic
because the context is.

The second half of the problem is the closet itself. Things stay on the rail
that have not been worn in a year, that are out of season for the next five
months, or that no longer suit how I dress. Nothing tracks that, so nothing
prompts the decision to sell, donate or pack them away, and the active
closet is noisier than it needs to be.

A third problem surfaced while designing this one: the admin. After Closet
and Denver land it has about sixteen pages in six groups, and the flat
sidebar plus five-tab bar with sheets (site refresh, 2026-10-19) was sized
for ten pages in four. It needs reorganising in the same release.

## Decisions already made (2026-11-09)

- **Lives on joey-haas.dev as a private, phone-first admin area.** Same
  stack, sign-in and `llm.py` provider switch; no standalone app, no MCP
  connector in v1. Rationale: auth, the LLM seam and hosting already exist,
  and the weather data is coming anyway (below).
- **Intake is a photo per garment, tagged by the vision model, corrected in
  a quick form.** The same camera-first argument `importer.py` makes for the
  shelf: a closet typed into a form is abandoned at item forty. Photographs
  of racks as a first pass were rejected: segmentation is unreliable and
  the per-item photo is needed anyway for "what goes with this".
- **Occasion is quick-pick chips with a weekly default** (office Tue–Thu
  prefilled, say), not a calendar read. Zero integrations, two seconds a
  day. Calendar is a possible v2.
- **Private only.** No public page, no anonymized demo. A project
  case-study page (how the ranking and the cull work) fits the case-study
  pages already queued, later.
- **Closet direction: A with B's lock gesture and one-at-a-time Review, and
  C's table as the Closet list view.** Admin shell: **D · Areas**. Both
  chosen 2026-11-09; reasons under Key decisions.

## Scope

In (v1):

- The Closet area: **Today**, **Closet**, **Review**, **Profile** pages
  (`/admin/closet/today`, `/admin/closet`, `/admin/closet/review`,
  `/admin/closet/profile`).
- Tables `garments`, `outfits`, `outfit_garments`, `wears`,
  `closet_profile`, `garment_decisions`; the untagged state and the
  batched, quota-aware tagging queue; vision tagging through `llm.py`.
- NWS hourly weather for home (ZIP 80205) from the shared weather job the
  Denver-spots spec introduces.
- Occasion chips with a weekly default and the Bike modifier.
- Deterministic candidate filter plus model ranking for Today; **lock a
  piece** (build around it) and **Match this** from a closet piece or a
  shop photo; Wore this / Swap / Not this with reasons.
- The cull: flags, the four outcomes, the season-turn banner with Pack
  all, the Sell checklist.
- Nightly job: plan Today for each occasion chip; drain the tag queue to a
  daily budget.
- **Admin shell reorganisation**: area rail + per-area page list on
  desktop, area tab bar + segmented sub-nav on a phone, Home as one card
  per area plus the jobs list; existing routes keep their URLs.

Out (v1): any public page; MCP connector or exposing the closet to the
phone chat apps; calendar integration; laundry state; shopping suggestions
or "gaps in the closet"; packing lists for trips (natural v2 on the same
data, with the travel log); the week view (C) as a page; outfit photos of
me; sharing outfits; a "considering" status for shop photos (v1 discards
the transient garment after the Match this session).

## Proposed shape

```mermaid
flowchart LR
  Cam[Phone camera] --> Up[Upload: thumbnail stored, garment untagged]
  Up --> Q[Tag queue: batches of ~10 per model call, daily budget]
  Q --> Tag[Vision model: attributes JSON per image]
  Tag --> Form[Correct and save]
  Form --> G[(garments)]
  W[NWS hourly, home] --> Filt
  O[Occasion chip + Bike] --> Filt
  P[(closet_profile)] --> Rank
  G --> Filt[Deterministic filter: active, season, warmth, formality, not worn recently]
  L[(wears)] --> Filt
  Filt --> Rank[Model ranks: lead + two alternatives, reasons]
  Rank --> Today[Today page, precomputed nightly per occasion]
  Today -->|Wore this| L
  Today -->|lock / Match this| Rank
  G --> Cull[Cull flags: wear counts, season, condition, clusters]
  L --> Cull
  Cull --> Op[Model opinion, labelled]
  Cull --> Rev[Review: one piece at a time]
  Op --> Rev
  Rev --> Dec[Keep / Pack away / Sell / Donate]
```

Same architecture as Play Next and the shelf importer: the expensive
nondeterministic step (tagging, ranking) is a pure function of its input
and runs through `LLMProvider.complete_json`; the filtering, the wear
statistics and the cull rules are deterministic and testable with no model
call.

### Variables the recommendation uses

- **Weather**, NWS hourly for home. Denver specifics that shape the rules:
  large diurnal swing (layering beats one warm piece), strong sun and low
  humidity (UV, hats, sunglasses matter more than the temperature
  suggests), afternoon storms in summer, snow days where footwear is the
  whole decision.
- **Occasion**: Office, WFH, Date night, Weekend (durable, washable, Finn
  in tow), Travel, Event; **Bike** as a modifier (no dress shoes, nothing
  that fights a helmet or a chain, a cuff-free bottom). Weekly default
  pattern, editable on Profile.
- **Wear history**: no repeat of a top within N days, no repeat of the
  same outfit within M weeks; favour pieces that have not had a turn this
  season.
- **Season window** per garment (from tags, editable), so shorts are not
  proposed in November even on a warm day unless the chip says so.
- **Fixed pieces**: watch, ring and glasses are worn daily; modelled as
  always-on accessories the palette should flatter, not as garments.
- **Profile** (one row, edited rarely): sizes by category (for the Sell
  checklist, and so Match this on a shop photo can say "this runs small"),
  coloring (hair, skin undertone, so palette rules are mine rather than
  generic), build and fit preferences, a few style words and dislikes
  ("vintage, understated; no logos"). The ranking prompt gets the profile
  every call; tagging does not. Not a body-metrics tracker: nothing dated,
  nothing that changes weekly.
- **Laundry state**: **out** of v1. "Wore this" is a usable proxy (a top
  worn two days ago is probably in the hamper); a real in-the-wash toggle
  is friction every day for a small gain.
- **Feedback**: Not-this reasons (too warm, too formal, not those two
  together, tired of it) stored per outfit and summarised into the
  ranking prompt, so taste accumulates the way the shelf's pick events do.

### Garment attributes (what tagging extracts, all editable)

Category (fixed enum in code: outer, mid, top, bottom, shoes, accessory)
and free subtype (tee, oxford, overshirt, chinos, denim, sneaker, boot,
coat, knit, cap…), primary and secondary colors (named, plus a hex the
grid can render), pattern, material, warmth (1–5), formality (1–5, lounge
to business), seasons, fit or condition notes, acquired date. Tagging runs
on the downscaled copy; the model gets no candidate list, as in
`importer.py`.

### Intake budget (the free-tier problem)

The Gemini key is on AI Studio's free tier, which caps requests per day per
model (the exact figures are in the
[rate limits table](https://ai.google.dev/gemini-api/docs/rate-limits);
forum reports in 2026 put some Flash models at 20 RPD). A closet of a few
hundred garments tagged one request each would take weeks. Design around
the cap rather than assume it goes away:

- **Decouple upload from tagging.** Uploading stores the thumbnail at once
  and marks the garment `untagged`; it shows in the Closet grid as a photo
  with an "Add details" state and is usable by hand immediately. Tagging
  is a queue, not part of the upload request.
- **Batch many garments per request.** `llm.py` already sends several
  images per call under the 20 MB inline limit; ten downscaled garment
  photos per request at ~400 px is a fraction of that. The schema returns
  one attribute object per image, in order. Three hundred garments is
  thirty requests, not three hundred.
- **Quota-aware queue.** The nightly job (or a "Tag next batch" button)
  drains the queue in batches up to a configurable daily budget, stops on
  a 429 and resumes tomorrow. Daily use after intake is small: the nightly
  plan is one call per occasion chip; Swap, lock and Match this are one
  call each when used.
- **Escape hatches, both already in the stack.** The provider switch
  (`LLM_PROVIDER` env var) can send the intake burst to Anthropic
  pay-as-you-go, or billing can be enabled on the AI Studio project for a
  paid tier; either way a few hundred image taggings is small money. The
  consumer Google AI Pro subscription does not, as far as I know, carry
  API quota — verify before counting on it.

### Cull rules (deterministic first, model second)

Flags, each shown with its evidence so the decision is mine:

- **Not worn this season**: active, in season for at least eight weeks of
  the last twelve months, zero wears. The strongest signal.
- **Rarely worn**: one or two wears in twelve months while its category
  peers averaged many more.
- **Out of season now**: season window closed for the next three months →
  suggest Pack away with the bring-back month filled in. Surfaced as a
  seasonal review twice a year (Denver: roughly late October and late
  April), not every day.
- **Condition**: a note I wrote (pilled, stained, stretched) is a flag on
  its own.
- **Duplicate cluster**: more than N garments sharing category, color and
  formality; suggest keeping the most-worn.
- **Model opinion** (second pass, labelled as an opinion): given the
  closet, the wear history and the flags above, which pieces no longer fit
  how I dress. Shown with lower weight and never alone as a reason; style
  judgement is subjective and the data should carry the recommendation.

Sell vs donate is my call, but the review can help: a Sell outcome opens a
short listing checklist (brand, size, condition, photo already on file);
Donate just closes it. Both record the date so the history stays honest.

## Design

### The admin shell (`d-admin-areas.html`)

**Areas.** The admin is organised as five areas, in fixed order: **Home**,
**Shelf**, **Closet**, **Denver**, **Site**. Every existing page keeps its
URL and moves into an area:

| Area | Pages | Routes |
|---|---|---|
| Home | Home, Jobs | `/admin`, `/admin/jobs` (new: the jobs list on its own) |
| Shelf | Collection, Import photos, Play Next, Discover, Radar, Pull list, Sources, Store list | unchanged |
| Closet | Today, Closet, Review, Profile | `/admin/closet/today`, `/admin/closet`, `/admin/closet/review`, `/admin/closet/profile` |
| Denver | Spots, Weekend, Candidates | per the Denver-spots spec |
| Site | Analytics, Jobs (alias), Search index, Changelog | `/admin/analytics` unchanged; the rest are optional v2 rows |

`ADMIN_GROUPS` becomes `ADMIN_AREAS`: `{ key, label, icon, home, pages[] }`,
with each page `{ to, label, count?, end? }` as today. The Shelf area's
eight pages keep their three sub-groups (Collection · Recommend · Catalogue)
as mono-uppercase kickers inside the area list, so the grouping from the
site refresh is preserved one level down.

**Desktop (≥ 900px).** A 56px **area rail** (surface `--sunken`, hairline
right): the monogram, one icon per area with its label under it in
`--text-3` at 9px, a warn-coloured count badge where an area has something
pending (Closet shows the review count), and "View site ↗" at the foot.
Beside it the 200px **page list** (surface `--surface`): the area name
with a one-line description, the pages, and the foot with the signed-in
email, "View site ↗" and "Sign out". The active area is `--accent-soft`
on the rail; the active page is `--accent-soft` in the list. The main
column keeps `admin-main`'s padding; the two nav columns are both sticky
and scroll independently.

**Phone (< 900px).** The tab bar is the five areas, icon over label, with
the same count badge. Tapping an area lands on its home page (Home → Home,
Shelf → Collection, Closet → Today, Denver → Weekend, Site → Analytics).
Inside an area, the pages are a **segmented control** under the tab bar
and above the page title: full width, `--sunken` track, `--surface`
thumb, 4–5 segments at most (Shelf's eight pages collapse to Collection ·
Picks · Sources ·  More, where Picks and More open the existing
`TabSheet`; this is the only place a sheet remains). The segmented
control scrolls away with the page; the tab bar stays fixed.

**Home (`/admin`).** One card per area (Closet, Shelf, Denver, Site), two
columns on desktop and one on a phone, each with the area name, a link to
its home page, the single thing that matters today, two or three figures,
and at most two actions:

- Closet: today's lead outfit as four small swatches with its one-line
  summary and the weather/occasion line; figures: to review, untagged;
  actions **Wore this**, **Swap**.
- Shelf: the Continue card's game when one is active (else tonight's lead
  pick); figures: owned, comics this week, radar pre-orders; actions
  **Log tonight**, **Wrap up** (the existing sheet).
- Denver: the weekend's lead suggestion (from the planner) and the second
  day in one line; figures: new candidates, spots; action **Review
  candidates**.
- Site: views and visitors over 7 days, top path; the jobs summary line
  (ok count, the first non-ok job with its time); action **Jobs**.

A card hides when its area has nothing to show (no outfit planned yet, no
spots). Under the cards, the **Nightly jobs** list from the current
dashboard, extended with the Closet and Denver jobs, every row `Area ·
job`, time, one-line summary, status dot with its word. The current tiles,
quick actions and recent changes move: tiles become the figures on the
cards, quick actions become the card actions, recent changes move to
`/admin/jobs` under the jobs list.

**Header status** stays as today (API awake · nightly ok with time).

### Today (`chosen.html`, Today view)

Opens on the phone as the Closet area's home. Top to bottom:

1. **Page header**: "Today", with the date and "planned last night" (or
   "planned just now" after a re-plan) in `--text-3`.
2. **Weather strip** (`Panel`-styled, one row): the morning low as the big
   figure, the afternoon high after an arrow, a one-sentence read ("Cold
   ride in, mild ride home — layer for a 23° swing"), and six hourly
   figures in mono (7a to 6p). On a phone the hourly row wraps under.
3. **Occasion chips** (`FilterChips` reused): the day's default pressed,
   plus the **Bike** modifier chip in the `--accent-soft` pressed style so
   it reads as a modifier, not a second occasion. Changing a chip re-plans
   today only (one model call) and shows "planned just now".
4. **Wear this card**: a `--surface` panel with the mono kicker "Wear
   this", four garment tiles (four columns on desktop, two on a phone),
   each a 4:5 thumbnail with the slot name in mono in the corner, the
   garment name, and one short qualifier (warmth, last worn, bike note).
   Under them the **reason**, two sentences, in `--text-2`. Then the
   actions: **Wore this** (primary), **Swap a piece**, **Match this…**,
   **Not this…** (ghost). If the model is unavailable the card still
   renders the deterministic top candidate with "picked without the model"
   in place of the reason, the template-eight pattern from Discover.
5. **Two alternatives**: half-width cards (full on a phone) with four small
   swatches, the garment names as one line, a one-line reason and **Wear
   this instead**, which promotes the alternative into the lead card.
6. **Footnote**: how many active pieces, how many fit, how many skipped as
   worn this week, when it was planned.

**Lock (build around a piece).** Long-press a tile (or hover on desktop)
to reveal a **Build around** pill in its corner; pressing it locks that
garment, outlines the tile in `--accent`, relabels the pill "Built
around", and re-ranks the other three slots with the lock as a
constraint (one call). The reason opens with "You locked the …". A second
press unlocks. One lock at a time in v1.

**Swap a piece.** Opens a sheet listing the pressed tile's slot candidates
(the deterministic filter's output for that slot, ranked), each with its
qualifier; choosing one re-ranks nothing — it is the owner's choice and
the reason gets "(you swapped the …)" appended.

**Match this….** A sheet with two entries: **From the closet** (the Closet
grid in a picker mode; pick one garment, it is locked, and Today re-plans
around it) and **From a photo** (camera; the photo is tagged in one call
as a transient garment, shown as a tile with "not owned", and the other
slots are built around it). The transient garment and its outfit are not
saved; a **Save as owned** button on the tile is the only way they
persist. This is the "what goes with this shirt" question.

**Wore this.** Writes one `outfits` row (date, occasion, source =
`planned` / `swapped` / `alternative` / `own`) and a `wears` row per
garment, then changes to "Worn ✓ · Change" for the rest of the day.
**Not this…** opens a reason chip row (Too warm · Too cold · Too formal ·
Too casual · Not those together · Tired of it · Other) and re-plans once
with the reason added to the prompt; the reason is stored on the outfit.

### Closet (`chosen.html`, Closet view)

Header: "Closet", with pieces · active · packed · untagged as the subline.
Toolbar: status chips (Active pressed by default, Packed, Untagged with
its count), a divider, category and attribute chips (Tops, Bottoms, Outer,
Shoes, Warm, Smart), a **Grid / List** toggle (persisted via
`readShelfPref` under `closet.view`), and **＋ Camera** (primary).

**Grid**: `PosterGrid`'s layout with 4:5 tiles instead of covers; the slot
name in mono in the tile corner; name and one stat line (wears, season
window). Untagged tiles carry a dashed `--warn` outline and the label
"Untagged · add details"; packed tiles render at 45% opacity with "Packed ·
back in May". Tapping a tile opens the edit form.

**List**: C's table. Columns Piece (thumbnail + name), Type, Wears 12 mo (a
4px meter scaled to the closet's maximum plus the number), Last worn,
Season, and a trailing cell for a "flagged" tag or "packed → May". On a
phone only Piece, Wears and the trailing cell show.

**Camera → upload.** Multiple photos per upload; each becomes an untagged
garment with its thumbnail immediately. A toast says "12 added · tagging
tonight" and offers **Tag now** (runs one batch, respecting the budget).
The edit form is the same for untagged and tagged garments: thumbnail,
category (segmented), subtype, colors (two swatch pickers with the model's
hex prefilled), pattern, material, warmth and formality (1–5 steppers),
seasons (month chips), notes, acquired, status.

### Review (`chosen.html`, Review view)

Header: "Review", subline "9 flagged · autumn turn" when a season turn is
open. Then:

- **Season-turn banner** (`--accent-soft`): "It's the autumn turn. 12
  summer pieces close their season until February" with **Pack all 12**
  and **One by one** (ghost). Pack all sets each to `packed` with the
  bring-back month from its season window and shows an undo toast. The
  banner appears from the turn date until dismissed or emptied, twice a
  year (turn dates are two constants, configurable on Profile).
- **Four stat tiles** (`StatTile`): active pieces, worn in the last 30
  days, flagged for a decision, sold or donated this year.
- **The deck**: progress line ("3 of 9 flagged", the running tally of
  decisions) and a 3px progress bar, then **one piece** at a time: the
  thumbnail at 8rem (7rem on a phone, above the text), name, one mono stat
  line (wears, added, size), and the **evidence list**: one bullet per
  flag in full sentences, filled `--warn` bullets for data flags and a
  hollow `--text-3` bullet for the model's opinion, which is always last.
  Under it, the four outcomes as equal buttons with a small sub-label
  (Keep · clear until next season; Pack away · pick a month; Sell ·
  listing checklist; Donate · mark gone); the suggested outcome carries the
  `--accent` border and `--accent-soft` fill. Two columns on a phone.
- **Outcomes.** Keep writes a `garment_decisions` row (`kept`) and clears
  the flags until the next season turn. Pack away asks for the month
  (prefilled from the season window) and sets `status = packed`,
  `back_on`. Sell opens the checklist sheet (brand, size from the profile,
  condition from notes, material, the thumbnail; copy-to-clipboard for a
  listing) then sets `status = listed`; **Mark sold** on a listed garment
  sets `gone` with a date. Donate sets `gone` with `reason = donated`.
  Every outcome advances the deck; **Skip** (ghost, under the deck) leaves
  the piece for next time. An empty deck says "Nothing to decide. Next
  season turn: late April."

### Profile

A settings-style form, one row: sizes by category, coloring (hair, skin
undertone as three words), build and fit preferences (free text), style
words and dislikes (chips plus free text), the weekly occasion default
(seven day pickers), the Bike default per weekday, the two season-turn
dates, N and M for repeat rules, the daily tagging budget. Saved with one
button; nothing here is dated.

### Responsive and theme

- Phone ≤ 400px: tab bar fixed, segmented sub-nav, two-column tiles,
  one-column alternatives and area cards, list view drops its middle
  columns, the deck stacks thumbnail over text, outcomes two by two.
- Desktop 1280px: rail + page list + main; four-column tiles; two-column
  alternatives and area cards; the deck is capped at 34rem so the evidence
  stays readable.
- Tokens only; both themes are in every mockup. New marks: the untagged
  dashed outline (`--warn`), the opinion bullet (`--text-3`), the lock
  outline (`--accent`), all already measured tokens. Garment swatches in
  the mockups stand in for thumbnails and are not tokens.

### Accessibility

- Tiles are buttons with the garment name as text; the slot name in the
  corner is `aria-hidden` and repeated in the button's `aria-label`.
- The Build around pill is revealed on hover **and** `:focus-within`, by
  opacity, never `display: none`; on touch, long-press is the gesture and
  a visible **Match this…** button is the equivalent path.
- Chips keep `aria-pressed`; the segmented sub-nav is a `nav` with
  `aria-current="page"`; the area rail is a `nav aria-label="Areas"` with
  the label text present (not icon-only), and the badge's number is in the
  accessible name ("Closet, 9 to review").
- Flags are text, never colour alone; the opinion bullet's hollow shape is
  decorative, the word "Opinion:" carries the meaning.
- Sheets (Swap, Match this, Sell checklist) reuse `TabSheet`'s focus trap
  and Escape handling.

## Key decisions

1. **A · Morning card wins for Today**, because at 7am the question is
   "what do I put on", and A answers it as one finished outfit with a
   reason; it is also the shape Play Next already uses, so it reads as
   native.
   - *B · Rails* lost as the primary view because it shows candidates, not
     an outfit; glanceability suffers. Its **lock gesture** survives,
     because it answers "what goes with this" on the same page and makes a
     separate Match this page unnecessary. Its **one-at-a-time Review**
     survives because the cull is a decision per piece and deserves the
     evidence in full, not a row of four buttons per card.
   - *C · Week ledger* lost as a page: the nightly plan already covers the
     week's data, and a five-column plan is a desk view for a tool used on
     a phone. Its **table** survives as the Closet list view, where wear
     meters and last-worn dates are the point. The week view is parked for
     v2 (packing lists would want it).
2. **D · Areas for the admin shell** over E · Folding groups. Areas scale
   to the next three features without another redesign, the phone gets
   every area one tap away instead of burying Denver and half of Shelf
   behind More, and Home becomes a landing screen with the day's actions
   rather than a figures page. Cost accepted: `AdminShell` is rewritten,
   not extended, and the Dashboard's tiles move onto cards.
   - *E* lost because it is the same list with hinges; it fixes the
     sidebar's length and nothing about the phone, and the jump box is a
     feature for people who already know the page names.
3. **Deterministic filter, model ranks** (the picker pattern) over asking
   the model to pick from the whole closet. Testable without a model,
   cheaper per call, and the reason can cite the rule that excluded a
   piece ("denim worn Friday").
4. **Data-first cull with the model's view labelled as an opinion.** The
   decision is mine; the data earns the flag, the model adds colour. A
   model-led cull was rejected as unfalsifiable.
5. **Upload and tagging decoupled, batched, budgeted**, so the free tier
   is a speed limit rather than a wall, and the provider switch stays the
   escape hatch.
6. **Thumbnails in Postgres, originals discarded.** Consistent with the
   importer's "photographs are not kept"; a few hundred garments at ~400px
   WebP is low tens of MB, inside Neon's free tier; no new storage service.
7. **No laundry state, no calendar, no public page in v1.** Each is real
   scope for small gain against "Wore this" as a proxy, the weekly
   default, and a closet nobody else needs to see.

## Component inventory

**Existing, reused**: `AdminPageHeader`, `Panel`, `StatTile` (+
`StatTiles`), `JobStatusRow`, `FilterChips` (occasion, status, category
chips), `TabSheet` (Swap, Match this, Sell checklist, Shelf's Picks/More
on the phone), `PosterGrid` (layout only), `readShelfPref` /
`writeShelfPref` (grid/list, last area), `useMediaQuery`, the toast
pattern with undo, `llm.py` (`Image`, `complete_json`, provider switch),
the job-route pattern (`JOB_TOKEN`, `items.JOB_ROUTES` or the sibling
registry the Denver spec allows), `nightly.yml`.

**New, shell**: `AdminShell` rewritten around `ADMIN_AREAS`: `AreaRail`,
`AreaPages` (desktop list with kickers), `AreaTabs` (phone), `AreaSubnav`
(segmented), `AreaCard` (Home), `JobsList` (shared by Home and
`/admin/jobs`). `ADMIN_ROUTES` in `prerender-lib.mjs` gains the Closet and
Jobs routes.

**New, Closet**: pages `AdminClosetToday`, `AdminCloset`,
`AdminClosetReview`, `AdminClosetProfile`; components `WeatherStrip`,
`OutfitCard` (lead) and `OutfitAlt`, `GarmentTile` (grid and card tile,
lock pill), `GarmentTable` (list view), `GarmentForm`, `SwapSheet`,
`MatchSheet`, `ReviewDeck` (+ `EvidenceList`, `OutcomeRow`),
`SeasonTurnBanner`, `SellChecklistSheet`, `UploadToast`.

**Backend**: `closet.py` (pure: filter, repeat rules, season windows, cull
flags, clusters), `closet_rank.py` (prompt + schema for ranking,
provider-agnostic, Discover style), `closet_tag.py` (prompt + schema for
batch tagging; one object per image, in order), `closet_routes.py` (admin
CRUD, upload, today, plan, wore, decisions, profile), `closet_jobs.py`
(plan Today per occasion; drain the tag queue to the budget), weather read
from the shared weather module (Denver spec's `weather.py`). Migration:
`garments`, `outfits`, `outfit_garments`, `wears`, `closet_profile`,
`garment_decisions`, enum types `garment_category`, `garment_status`
(`untagged`, `active`, `packed`, `listed`, `gone`), `outfit_source`.

**Tokens used**: `--bg`, `--surface`, `--sunken`, `--line`,
`--line-strong`, `--text*`, `--accent`, `--accent-ink`, `--accent-soft`,
`--ok`, `--warn`, `--radius`, `--font-mono`. No new tokens.

## Acceptance criteria

- [ ] `/admin` signed in at 1280px matches `d-admin-areas.html` (Home
      screen): area rail, page list, four area cards, nightly jobs list; at
      400px the rail and list are replaced by the five-area tab bar.
- [ ] Every existing admin route still resolves and renders inside the new
      shell with the correct area and page highlighted; `/admin/analytics`
      is under Site, the eight Shelf pages under Shelf with their three
      kickers.
- [ ] `/admin/closet/today` at 1280px and 400px, light and dark, matches
      `chosen.html` (Today view): weather strip, chips with the weekly
      default pressed, four-tile lead card with reason, two alternatives,
      footnote.
- [ ] Changing an occasion chip re-plans today with one model call and the
      header reads "planned just now"; the nightly job writes one plan per
      occasion chip so the page paints from a stored row with no model
      call.
- [ ] Locking a tile re-ranks the other three slots with that garment held;
      the reason opens with "You locked the …"; unlocking returns to the
      stored plan.
- [ ] Match this from the closet locks the chosen garment and plans around
      it; from a photo, tags it in one call and builds around it without
      persisting anything unless Save as owned is pressed.
- [ ] Wore this writes one `outfits` row and one `wears` row per garment
      for today, and the same garment is excluded from tomorrow's plan by
      the repeat rule (N days, from the profile).
- [ ] Uploading 12 photos creates 12 `untagged` garments visible in the
      Closet grid before any model call; the tag job tags them in batches
      of up to 10 per call, stops at the daily budget or a 429, and
      resumes the next night; a garment edited by hand is never retagged.
- [ ] Closet grid/list toggle persists across reloads; the list at 400px
      shows Piece, Wears and the trailing cell only.
- [ ] Review shows one flagged piece at a time with every flag as a
      sentence and the opinion last and hollow; each outcome writes a
      `garment_decisions` row and advances; Pack away sets `packed` with a
      `back_on` month; a packed garment never appears in Today's candidates
      or the Active grid.
- [ ] The season-turn banner appears on the turn date with the correct
      count, Pack all packs them with undo, and the banner clears when
      the count is zero.
- [ ] With the model unavailable, Today renders the deterministic lead
      with "picked without the model" and no error; the nightly job records
      the failure on the jobs list with the reason.
- [ ] Every text/background pair measures ≥ 4.5:1 and every non-text mark
      (untagged outline, lock outline, opinion bullet, badge) ≥ 3:1 in both
      themes.
- [ ] No hover-only control: the Build around pill is reachable by focus
      and the Match this… button exists on touch.

## Open questions for Code

- **Weather sharing.** Confirm the Denver spec's `weather.py` caches per
  point; Closet needs one point (home), cached hourly, with the hourly
  series for the day. If spots cache per spot only, add the home point to
  that job rather than a second NWS client.
- **Thumbnail pipeline.** Where the downscale runs (Pillow in the upload
  route is the simple answer; HEIC from iPhone needs `pillow-heif`), the
  target size (~400px long edge, WebP q≈80), and whether `bytea` in
  Postgres or a `garment_images` table is cleaner for the ORM.
- **Tag schema per image.** One JSON object per image in order, as the
  brief says, or a `{ index, attributes }` array so a dropped image is
  detectable; recommend the latter and reject a batch whose count does not
  match.
- **Plan storage.** One `outfit_plans` row per date × occasion × bike,
  or the plan JSON on a `days` row; the Home card and Today both read it,
  so one shape. Re-plans overwrite the row for that key.
- **Ranking prompt budget.** How much wear history to include (the last
  30 days as counts per garment is probably enough) and whether the
  profile is sent verbatim or summarised once and cached.
- **Repeat rules** N (top within N days) and M (outfit within M weeks):
  profile fields with defaults 5 and 3 recommended.
- **`ADMIN_AREAS` and `prerender-lib.mjs`.** `ADMIN_ROUTES` is flat today;
  decide whether it derives from `ADMIN_AREAS` (one list) or stays a
  parallel list with a test that they match, the way `publicRoutes` and
  `render.yaml` are checked.
- **Jobs page.** `/admin/jobs` is new; it can be the Home jobs list plus
  recent changes and a Run now per job (the Denver spec's pattern), or
  deferred to the Denver phase. Recommend shipping it here, since Home no
  longer has room for recent changes.
- **Shelf sub-nav on a phone.** Collection · Picks · Sources · More as
  proposed, or Collection · Play Next · Discover · More with the rest in
  the sheet; Code's call after seeing it at 400px with real labels.

## Pointers

- `backend/importer.py` and `backend/llm.py` (`Image`, `complete_json`,
  provider-neutral JSON schema): the pattern for photo intake and tagging.
- `backend/picker.py` and `discover.py`: deterministic filter plus model
  ranking with reasons; the template fallback when the model cannot
  answer; `pick_events` for feedback.
- `components/AdminShell.jsx` (`ADMIN_GROUPS`, `SHEETS`, `TabSheet`),
  `layouts/AdminLayout.jsx`, `pages/Admin.jsx` (tiles, jobs panel, quick
  actions, recent changes): what the shell rewrite replaces.
- `StatTile`, `Panel`, `JobStatusRow`, `FilterChips`, `PosterGrid`,
  `readShelfPref` in `frontend/src/`.
- Denver-spots spec (`2026-11-08-denver-spots-design.md`) for the NWS job
  and the job-registry question; `nightly.yml`, `JOB_TOKEN`,
  `items.JOB_ROUTES` for the nightly pattern.
- Site refresh spec (`2026-10-19-site-refresh-design.md`) for the shell's
  original IA and the contrast measurements it must keep.
