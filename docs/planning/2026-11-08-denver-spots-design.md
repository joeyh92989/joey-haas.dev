---
status: ready-for-plan
mockups: docs/planning/mockups/2026-11-08-denver-spots/
chosen: a-public-map.html
---

# Denver spots: a curated map, a spot finder and a weekend planner (design)

Date: 2026-11-08 · Repo: joey-haas.dev · Mockups under
`docs/planning/mockups/2026-11-08-denver-spots/` (`index.html` links them).
The three pages are three surfaces of one feature, not competing
directions: `a-public-map.html` is the public page and the chosen map
treatment (Static poster state), `b-weekend-planner.html` and
`c-spot-finder.html` are the admin surfaces. The Ledger tokens from
`2026-10-19-site-refresh-design.md` apply; admin pages follow the
`AdminLayout` / `AdminShell` conventions in CLAUDE.md. The map component
is shared with `2026-11-08-travel-log-design.md`.

## Problem

Deciding what to do on a weekend with a kid is a recurring small chore:
weather, kid-friendliness, whether it is bike-reachable from Five Points,
whether we have been there too recently. The places we like live in heads
and group chats. Visiting friends ask for recommendations and get a
re-typed list each time.

## Scope

In:

- **Public `/denver`**: a curated map of spots the owner marks public,
  with tag filters, a selected-spot popover and a list beside (under, on a
  phone) the map. Rendered from a build-time snapshot
  (`/snapshot/spots.json`); no API call for visitors.
- **`SpotMap`**: a drawn static poster map as an inline SVG component
  (streets, river, creek, parks, neighbourhood labels, pins), themed with
  tokens, shared with the travel log. Decided 2026-11-08: live tiles
  rejected; a build-time static image is the named fallback if the
  poster proves too costly to maintain.
- **Admin spots table** (`/admin/spots`): CRUD, tags, public/private,
  last visit, search, add by hand.
- **Admin spot finder** (same page, left column): a weekly job pulls
  candidates from OpenStreetMap (Overpass) and Foursquare Places (free
  tier) near a few anchors, dedupes, drops prior dismissals, and the
  LLM layer (`backend/llm.py`, the Discover pattern) scores each against
  the owner's tags and visit history and writes one reason. Accept into
  spots / Dismiss.
- **Admin weekend planner** (`/admin/weekend`): for the coming Saturday
  and Sunday, an NWS hourly weather strip per day and three suggestions
  drawn from spots plus accepted candidates, with Save / Been / Skip.
  Weather is fetched by a scheduled job and cached; never on the request
  path.
- **Visits**: a `visits` table written by Been (and by the table's "Log a
  visit"); read by the planner's "haven't been in a while" slot and the
  table's Last visit column. Private.
- Copy in a new `content/denver.js`; footer link to `/denver`; a
  `render.yaml` rewrite and prerendered head for `/denver`.

Out, explicitly:

- Routing or turn-by-turn: distance is stated as *by trail / drive / bus*
  from the nearest anchor, a straight-line figure with a mode word, not a
  routed time. No routing API is in the stack.
- Reservations, hours-aware "open now", reviews, photos of places.
- Multi-user accounts or anyone but the owner acting. Every button is
  owner-only; the public page is read-only.
- Any city but Denver. The schema carries a `city` column so a second
  area is a data change, but nothing here designs for one.
- Pan/zoom or live tiles on the map (see Key decisions).
- Showing home, the office, or any private spot on the public page.

## Design

### Surface 1 · Public `/denver` (`a-public-map.html`, Static poster state)

A public page in the 72rem `WIDE_ROUTES` measure (add `/denver` there),
masthead and footer as every public page. Top to bottom:

1. `h1` **Denver, the short list** and a two-line lede (copy in
   `content/denver.js`).
2. **Tag chips** in the `FilterChips` style with counts: All · Coffee ·
   Park · Food · Kid-OK · Rainy day · Bike-friendly. Multi-select,
   AND-combined; a group with at most one chip to show hides, per the
   existing chip rule. The pressed set is in the URL query (`?tag=park,
   kid-ok`) so a filtered view is shareable.
3. **Map and list**, two columns on desktop (map ~55%, list ~45%),
   stacked on a phone with a **Map / List** segmented toggle above and
   List as the default at 400px (the list is the thing a phone visitor
   actually uses; the map is one tap away).
   - **Map**: `SpotMap` with one pin per visible spot. Selecting a pin
     (click, or Enter/Space on its focusable `<g>`) opens a **popover**
     anchored to it: name, neighbourhood · distance line ("0.9 mi from
     the office" is admin-only; publicly the line is the neighbourhood
     only), tag pills. Selecting a pin also scrolls its list row into view
     and marks it; selecting a row marks its pin. One selection at a
     time; Escape clears.
   - **List**: header *15 spots · sorted by neighbourhood*; one card per
     spot: name, neighbourhood (right), tag pills, one-line note. Cards
     are `article`s, not links, since there is no spot page in this
     phase. The selected card takes a 1px `--accent` border.
   - Filtering updates both at once; the map never re-fits (the drawn
     area is fixed), pins simply appear and disappear.
4. **List only** is also the no-JS and reduced-motion-safe state: the
   page is server-prerendered as the list with the map region empty, and
   the SVG mounts on hydration. Nothing depends on the map to be usable.

Private spots never reach the snapshot. Home is not a spot and is not an
anchor the public page knows about; the map is centred on downtown and
drawn from Civic Center to the near north side (LoHi, RiNo, Five Points,
Sunnyside edge), which is the public content's extent.

### `SpotMap`: the drawn poster component

An inline `<svg>` with a fixed `viewBox` (the mockup uses `0 0 700 520`;
Code picks the final numbers once the drawing is authored) carrying:

- **Ground**: `--surface` fill, 1px `--line` frame.
- **Streets**: two line weights in `--line-strong` (arterials) and
  `--line` (the grid), as `<path>`s. The downtown grid runs at Denver's
  ~45° offset and the grid north of Colfax runs cardinal; the drawing
  should show that join, it is what makes the map read as Denver.
- **Water**: the South Platte and Cherry Creek as `--accent-soft` fills
  with a `--chart-2` stroke; mono labels along them.
- **Parks**: `--ok` at low opacity (`color-mix` with `--surface`, ~18%).
- **Labels**: neighbourhoods in the mono kicker style (`--text-3`,
  uppercase, letter-spaced); the title "Downtown Denver" in
  `--font-display` at the lower left; a small N arrow.
- **Pins**: a `<g role="button" tabindex="0" aria-label="{name}, {tags}">`
  per spot, a 12px drop shape filled `--accent` with a 1.5px `--surface`
  halo so it clears any ground colour; selected pin filled `--text`,
  larger (16px). The halo is the contrast guarantee: the pin never relies
  on what is under it.

**Projection**: the component takes `{lat, lng}` per spot and a
`fit` prop of two reference points (`[lat, lng] → [x, y]`) measured when
the drawing is authored (two known intersections at opposite corners of
the drawn area). From those it computes an affine map: x scales linearly
with lng, y with lat (inverted), with no rotation. At Denver's latitude
the lng scale is cos(39.75°) ≈ 0.769 of the lat scale, so a true-north
drawing with an equal-pixels-per-degree fit would look squashed; the fit
points absorb that because they are measured on the drawing, but Code
should assert that the two implied scales are within a few percent of
the expected ratio, otherwise the drawing's proportions are off. Pins
land within a block or two, which is right for a poster; the popover
and the list carry the exact name.

**Out of area**: a spot whose projected point falls outside the
`viewBox` (or inside a margin of 12px) is **not drawn**; it still appears
in the list, and the list card shows a small *off the map* kicker. The
admin spots table flags the same spots with the same words, so the owner
knows when the drawing needs extending. Extending the drawing is a
deliberate authoring step, never automatic.

**Theme**: every colour is a token, so the one SVG is correct in both
themes. **Motion**: the selected-pin grow is a 120 ms transform, disabled
under `prefers-reduced-motion`. **Text in the SVG** uses the same font
stacks as the page via CSS, not SVG attributes.

The travel log reuses the component with a different drawing (sea, land,
route line, numbered stops) and the same pin/projection/out-of-area
contract; the drawing is a prop, the behaviour is shared.

### Surface 2 · Admin spots table and spot finder (`c-spot-finder.html`)

`/admin/spots`, a child route of `AdminLayout`, a row in `ADMIN_GROUPS`
(a new **Denver** group holding Spots and Weekend) and in `ADMIN_ROUTES`,
titled through `AdminPageHeader`. Desktop: two columns, finder left,
table right; phone: stacked, finder first. Built from `Panel`, `StatTile`
and `JobStatusRow`.

**Run line** (a `JobStatusRow`): *Candidates refreshed Sun 2 Nov · 64
from OpenStreetMap, 41 from Foursquare · 83 after dedupe · 9 new*, with
the job's status and a **Run now** button (admin-only, the job route
pattern).

**Candidate queue**: one card per candidate, highest fit first:

- source badge: **OSM** in `--chart`, **Foursquare** in `--warn`; two
  sources only, each badge carries its word, so colour is decoration;
- name, category from the source, *0.6 mi from Union Station · by bike*
  (nearest anchor, straight-line, mode word by distance band: under 1 mi
  walk, under 3 mi bike, else drive/bus);
- the LLM reason, one or two sentences, with the matched tags set in
  `--text-3` inline; the fit score as a small mono figure after it (the
  reason leads, the score is secondary and not sortable in v1);
- suggested tag pills, toggleable (pressed = will be applied);
- **Accept into spots** (primary) and **Dismiss** (ghost). Accept creates
  a private spot with the pressed tags and the source's coordinates, and
  the card leaves; Dismiss records the source id permanently and the card
  leaves. Undo for ten seconds via the existing toast pattern.

**Empty state**: *Nothing new this week. Next run Sunday.* with the run
line still shown.

**Spots table**: a real `<table>`: Name and neighbourhood · Tags · Last
visit · Public (a toggle) · Edit. Search box filters by name and tag; **Add
by hand** opens the same edit form the Edit button opens (name, lat/lng
with a paste-from-maps field that parses "39.75, -104.99", neighbourhood,
tags, note, public). On a phone the Last visit column drops; Public stays.
Rows flagged *off the map* when the public map would not draw them (see
projection).

### Surface 3 · Admin weekend planner (`b-weekend-planner.html`)

`/admin/weekend`, same shell. Read on a phone on Saturday morning, so the
phone layout is the primary one.

1. **Constraints row**: the owner's standing pills (Kid along · Bike if
   dry · Under 30 min · Home by nap) as read-only pills with an *Edit* link
   to a small form in the same page's footer. Stored as a JSON blob on a
   single settings row; nothing public.
2. **Weather strip**: one `Panel` per day (Saturday, Sunday). Inside: the
   day name and date, a **13-bar temperature sparkline** for 8 am–8 pm from
   the cached NWS hourly forecast (bars in `--chart`, hours with
   precipitation probability ≥ 40% hatched with `--hatch`), high/low in
   text, and a one-line **verdict**: *Ride window 9–1, wind picks up after*
   in `--ok`, or *No window: snow from 10* in `--warn`. The verdict is
   rule-written from the hourly data (temperature band, precipitation,
   wind), not from the LLM.
3. **Suggestions**: three cards in the Play Next card style (slot kicker ·
   when-line · title · tag pills + distance line · one or two reasons ·
   actions). Slots: **Best fit** (highest score for the better day),
   **Somewhere new** (an accepted candidate or a spot with no visit), and
   **Haven't been in a while** (longest since last visit among kid-OK
   spots); when a day has no outdoor window the slot that would have been
   outdoor swaps to **Snow day** and the pool is Rainy-day spots. Reasons
   are rule-written in v1 (*"Dry until 2, so the park first; 1.1 mi by
   bike"*); the LLM is not on this page (see Key decisions). Actions:
   **Save** (pins the card to the day, turns its border `--ok`; one saved
   card per day), **Been** (logs a visit dated that day, the card shows
   *Visited*), **Skip** (per-weekend dismissal, Undo toast). A **Reroll**
   text button regenerates the unsaved slots.
4. **Recent visits** `Panel`: the last eight visits as a list (date · spot
   · day of week), with a *Log a visit* link to the table.

States in the mockup: dry weekend, snowy Sunday (outdoor plan moves to
Saturday, Sunday slots go indoor), plan saved. The page is a plain read of
cached data plus the pure planner function; Reroll and Save are the only
writes besides Been/Skip.

### Scheduled work

Three jobs on the existing nightly/weekly job pattern (`JOB_ROUTES`,
token-gated, run from the Actions workflow):

- **candidates-weekly**: Overpass and Foursquare pulls per anchor, dedupe
  (name similarity + < 75 m), drop dismissed ids, LLM scoring of the
  remainder, write `candidates`.
- **weather-daily** (Thursday to Sunday, early morning): fetch the NWS
  hourly forecast for one gridpoint (downtown), store the raw periods;
  the planner reads only this table.
- **snapshot**: `spots.json` is written by the existing snapshot build
  from public spots (name, neighbourhood, tags, note, lat, lng, slug).

Nothing on a public or admin request path calls Overpass, Foursquare,
NWS or the LLM.

### Responsive and theme

- 400px: `/denver` is List by default with the Map toggle; the SVG scales
  to the column width (aspect fixed by `viewBox`); chips wrap to two
  rows. Admin pages stack their columns; the weather panels stack; the
  suggestion cards are full width.
- 1280px: as the mockups.
- Tokens only; the SVG and the badges are measured on `--surface` (the
  pin halo guarantees the pin; OSM badge text `--chart` on `--surface`
  already clears 4.5:1 in both themes per `index.css`'s notes; Foursquare
  badge uses `--warn` as a border and `--text` as text, not `--warn` as
  text, since `--warn` on `--surface` in light is 4.24).

### Accessibility

- The map is `role="group"` labelled *Map of spots*; every pin is a
  focusable button with the spot's name and tags; selection is announced
  through a `role="status"` line (*Union Station selected*). Arrow keys
  are not required; Tab order follows list order.
- The list is the complete content; the map adds nothing a screen reader
  user lacks. The Map/List toggle is a `tablist`.
- The weather sparkline has a text equivalent (the verdict plus
  high/low); precipitation is hatched and named, never colour-only.
- Badges and slot kickers are words; the source colour is decoration.
- Candidate and suggestion actions are buttons that are siblings of any
  link, per the shelf rule; focus returns sensibly after a card leaves.

## Key decisions

- **Drawn poster over live tiles.** The repo's rule is no runtime
  third-party fetches on public pages and pages that work while the
  backend sleeps; tiles are that fetch a few hundred times per visit, OSM's
  tile policy asks public sites to use another provider, and a key-based
  vector host is still a dependency and a 40 KB library. The poster is one
  SVG, token-themed, loads with the page. The cost is accepted: no zoom to
  a door, and extending the drawn area is authoring work. **Fallback**: a
  build-time static image (one fetch at `npm run build`, served from the
  site's origin, no key in the browser) if the poster proves too costly to
  keep current; the `SpotMap` contract (pins, projection, out-of-area) is
  the same either way, only the ground changes.
- **Rejected: Google Places.** Best data and photos, but paid after the
  monthly credit and needs a billing project; the free pool plus LLM
  ranking is the pattern the shelf already runs for Discover.
- **Rule-written planner reasons, LLM only in the finder.** The planner
  runs every weekend and its inputs (weather, tags, visits) are structured;
  rules are testable and free. The finder's job is taste, which is what
  the LLM layer is for, and it runs once a week.
- **Public map from a snapshot, admin from the API.** Same split as the
  shelf: visitors never wake the backend; the owner's pages may.
- **Private by default.** Accepted candidates and hand-added spots start
  private; the owner flips Public per spot. Home is never a spot.
- **Permanent dismissals.** The same park returning weekly is what kills
  candidate queues; Undo covers the misclick.
- **List is the phone default.** A map on a 400px screen is a thumbnail;
  the list is what a visitor on foot uses.
- **Three slots, not a day timeline.** A timeline duplicates the weather
  strip; three cards with slot names carry the logic the way Play Next
  does, and the owner already knows that pattern.

## Component inventory

Existing, changed:

- `RootLayout` `WIDE_ROUTES`: `/denver`. `SiteFooter`: Denver link.
  `prerender-lib.mjs` `publicRoutes` and `render.yaml`: `/denver`.
- `AdminShell` `ADMIN_GROUPS` (new **Denver** group), `ADMIN_ROUTES`,
  `App.jsx` child routes `/admin/spots`, `/admin/weekend`.
- `FilterChips` (reused as-is for tags), `Panel`, `StatTile`,
  `JobStatusRow`, `AdminPageHeader`.
- Snapshot build (`frontend/scripts/fetch-snapshot.mjs` +
  `public_outputs.py`): write `spots.json` beside `items.json` and
  `comics.json`.
- `backend/main.py`: mount `spots_routes`; `items.JOB_ROUTES` pattern
  extended with the two new jobs (or a sibling `jobs` registry; Code's
  call).
- `backend/llm.py` is the provider layer (`build_provider(config)` →
  `LLMProvider`, Gemini or Anthropic); the ranking call itself lives in
  the new spots module in the Discover style (`discover.py` is the
  precedent), provider-agnostic as today.

New:

- `components/SpotMap.jsx` (the SVG component: drawing prop, spots,
  selected, onSelect, fit) and `lib/mapFit.js` (the affine fit, pure,
  tested).
- `content/denver.js` (copy), `content/maps/denver.jsx` (the drawing).
- `pages/Denver.jsx` (public), `pages/AdminSpots.jsx`,
  `pages/AdminWeekend.jsx`.
- `components/SpotCard.jsx`, `CandidateCard.jsx`, `SuggestionCard.jsx`
  (the Play Next card shape), `WeatherPanel.jsx` (sparkline + verdict),
  `SpotForm.jsx`.
- `lib/planner.js` or `backend/planner.py` (pure: weather + spots +
  visits + constraints → three suggestions with reasons). Recommend the
  backend, beside `picker.py`, tested the same way.
- Backend: `spots.py` (pure), `spots_routes.py`, `candidates.py`,
  `weather.py` (NWS fetch + verdict rules), migration for `spots`,
  `visits`, `candidates`, `dismissals`, `weather_hours`, `planner_settings`.

Tokens used: `--surface`, `--line`, `--line-strong`, `--accent`,
`--accent-soft`, `--chart`, `--chart-2`, `--ok`, `--warn`, `--hatch`,
`--text*`, `--font-display`, `--font-mono`. No new tokens.

## Acceptance criteria

- [ ] `/denver` renders from `/snapshot/spots.json` with no API call,
      shows only public spots, never a home/office/anchor pin, and works
      as a list with JavaScript disabled.
- [ ] Tag chips filter map and list together; the pressed set is in the
      URL and restores on load; a chip group with one chip and none
      pressed is hidden.
- [ ] Selecting a pin or a card selects the other, opens the popover,
      and announces the selection; Escape clears; keyboard reaches every
      pin.
- [ ] `SpotMap` projects two reference points to within 1px of their
      measured positions and a third known intersection to within 6px;
      a spot outside the drawn area is omitted from the map and marked
      *off the map* in the list and the admin table.
- [ ] The map, badges and sparkline are correct in both themes using
      tokens only; nothing is colour-only.
- [ ] 400px: List is the default view with a working Map toggle; chips
      wrap; admin pages stack. Matches `a-public-map.html` (Static poster
      and List only states), `b-weekend-planner.html` (dry, snowy, saved)
      and `c-spot-finder.html` (queue, empty) at 400px and 1280px.
- [ ] The weekly candidates job writes deduped, LLM-scored candidates and
      never re-surfaces a dismissed source id; Accept creates a private
      spot with the chosen tags; Dismiss is permanent with a ten-second
      Undo.
- [ ] The weather job stores NWS hourly periods for the downtown
      gridpoint; the planner page makes no external call; the verdict
      matches the rules for the three mockup states.
- [ ] The planner returns three suggestions with the right slots for a
      dry weekend and swaps to Snow day slots when a day has no window;
      Save pins one card per day; Been writes a visit dated that day;
      Skip hides for the weekend with Undo.
- [ ] No request path (public or admin) calls Overpass, Foursquare, NWS
      or the LLM; all four happen in jobs.
- [ ] `frontend/changelog.md` entry; CLAUDE.md gains the Denver group in
      its admin conventions.

## Open questions for Code

- **Schema.** Suggested: `spots(id, name, slug, lat, lng, neighbourhood,
  note, tags text[], public bool, city text default 'denver', source,
  source_id, created_at)`; `visits(id, spot_id, visited_on date, note)`;
  `candidates(id, source enum osm|foursquare, source_id, name, category,
  lat, lng, distance_m, nearest_anchor_id, fit smallint, reason text,
  suggested_tags text[], fetched_at)` with unique `(source, source_id)`;
  `dismissals(source, source_id, dismissed_at)`; `weather_hours(gridpoint,
  starts_at, temp_f, precip_pct, wind_mph, short)`; `planner_settings` one
  JSON row. Anchors are spots flagged `anchor` (a column) and are never
  public even when the spot is.
- **Overpass.** One query per anchor with `around:3200` on a tag set
  (amenity=cafe|restaurant|library|museum, leisure=park|playground,
  tourism=attraction, route=bicycle nearby). Overpass public instances
  have per-IP fair-use limits and ask for a descriptive User-Agent; the
  exact rate limits and timeouts should be **verified** against the
  current Overpass API usage policy before the job is scheduled. Cache
  raw results; one run a week is well inside any reasonable limit.
- **Foursquare Places free tier.** The free tier's daily/monthly call
  cap and its terms on caching place data (how long results may be
  stored) must be **verified** against Foursquare's current developer
  terms; design the job so a weekly run of a few anchor searches fits
  under the cap with margin, and store only what the terms allow.
- **NWS.** `api.weather.gov`: resolve `/points/{lat},{lon}` once to get
  the `forecastHourly` URL for the downtown gridpoint, then fetch that
  daily; the API is free, keyless, and requires a User-Agent identifying
  the app (**verify** current header requirements). Cache the hourly
  periods; expire after 24 h.
- **LLM inputs and cost cap.** Prompt: the owner's tag vocabulary, the
  public and private spot list (names, tags, visit counts), the
  constraints, and the batch of candidates (name, category, distance,
  source tags). Output: fit 0–100, one reason, suggested tags from the
  vocabulary only. Batch all candidates in one or two calls per run; cap
  the job at a fixed token budget and skip scoring (leave fit null,
  reason "not scored") when it is exceeded, so the queue still fills.
- **Planner location.** Backend (`planner.py`, pure, tested) is
  recommended; the client then only renders. Confirm the planner's
  "distance by mode" bands and the verdict rules as constants in one
  place.
- **Reduced-motion and the SVG.** Confirm `prefers-reduced-motion` is
  respected for the pin grow and the popover.
- **Travel log reuse.** `SpotMap`'s drawing prop and fit contract should
  land in this phase in a shape the travel log can use with a different
  drawing and numbered pins; coordinate with
  `2026-11-08-travel-log-design.md`.
