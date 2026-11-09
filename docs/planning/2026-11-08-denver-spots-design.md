---
status: planned
mockups: docs/planning/mockups/2026-11-08-denver-spots/
chosen: a-public-map.html
plan: 2026-11-09, five-PR stack
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

---

# Plan

Written 2026-11-09 on `feat/denver-spots`. Every open question above is
answered below, either in **Decisions taken at plan time** or in the task
that settles it. Five PRs off this one branch, in order; each is
independently valid (builds, tests green) and leaves the site working.

## Docs alignment

Conventions this plan relies on, with the path or URL that fixes each.

| Claim | Source |
|---|---|
| Migration head is `0012`; a new revision is `0013`, `down_revision = "0012"` | `backend/migrations/versions/0012_add_playthrough_note.py` |
| Migrations are additive; deploy order is apply-then-merge | `backend/migrations/README.md` (The rule: migrations are additive) |
| Enum types are created and dropped explicitly, never by `create_table` | `backend/migrations/versions/0006_add_recommendations.py:25-53` |
| No `ARRAY`/`text[]` column exists anywhere; list data is JSONB | `backend/models.py` (`Item.editions`, `Recommendation.based_on`) |
| `test_migrations.py` asserts `compare_metadata(...) == []`, and upgrade→downgrade→upgrade is clean | `backend/tests/test_migrations.py` |
| Admin gating is a router-level `dependencies=[Depends(require_admin)]` | `backend/journal_routes.py:55-65` |
| Job routes are an exact whitelist matched on the routed template, duplicated in the test | `backend/items.py:401-435`, `backend/tests/test_job_token.py` |
| Public bodies are Pydantic allowlists; a forbidden-key walk bans `id`, `note`, `status`, `url`, `score`, `created_at` at every depth | `backend/tests/test_public_outputs.py` (`FORBIDDEN`, `_keys`) |
| Every new snapshot is `required: false`, with the same predicate in two files | `frontend/scripts/fetch-snapshot.mjs:107-157`, `frontend/src/lib/snapshot.js:105-124` |
| A new public page needs a `STATIC_PAGES` row **and** a `render.yaml` rewrite before the `/*` catch-all; a test asserts the two match exactly | `frontend/src/content/pages.js:8-9`, `frontend/scripts/prerender-lib.test.mjs:451-495` |
| `ADMIN_ROUTES` must equal App.jsx's admin children exactly | `frontend/scripts/prerender-lib.test.mjs:278-296` |
| `AdminShell`'s phone `SHEETS` references `ADMIN_GROUPS` **by index** (`[2]`, `[3]`) | `frontend/src/components/AdminShell.jsx:44-60` |
| `FilterChips` hides a group with at most one chip and none pressed, via `offersChoice` | `frontend/src/components/FilterChips.jsx:21-24` |
| Pure modules are listed literally in the purity test and must be added to it | `backend/tests/test_physical_imports.py` (`PURE_MODULES`, `TOP_LEVEL`) |
| Optional credentials are absent from `_REQUIRED` and checked lazily | `backend/config.py:47-63` |
| HTTP client loggers are held at WARNING because keys travel as query parameters | `backend/config.py:73-85` |
| Overpass fair use: ~10,000 queries/day on the main instance, "for regular use divide by 100"; identifying User-Agent required; 30 s backoff on 429/406; defaults 180 s / 512 MiB; 429 after a 15 s slot wait | https://dev.overpass-api.de/overpass-doc/en/preface/commons.html, https://wiki.openstreetmap.org/wiki/Overpass_API |
| ODbL attribution is required for a stored derived list of names and coordinates, visible without interaction, linking the licence | https://www.openstreetmap.org/copyright, https://osmfoundation.org/wiki/Licence/Attribution_Guidelines |
| NWS needs no key but requires a contact User-Agent; `/points/{lat},{lon}` → `properties.forecastHourly`; hourly body ships `cache-control: max-age=2676` and refreshes about hourly | https://www.weather.gov/documentation/services-web-api |
| NWS hourly field shapes: `temperature` a bare number with `temperatureUnit`, `windSpeed` a **string** (`"5 mph"`), `probabilityOfPrecipitation.value` nullable per the OpenAPI schema | https://api.weather.gov/openapi.json (`QuantitativeValue`), live `/gridpoints/BOU/63,62/forecast/hourly` |
| Foursquare's free tier is 500 Pro calls/month from 2026-06-01; place data may not be kept past 30 days unrefreshed; derivative works and third-party exposure are excluded; "Powered by Foursquare" badge required | https://docs.foursquare.com/developer/reference/upcoming-changes, https://foursquare.com/legal/terms/apilicenseagreement/ |

**Deviations from the spec**, all deliberate, each with its reason:

1. **No Foursquare.** Decided with Joey 2026-11-09 on the terms above: a
   500-call monthly ceiling, a 30-day refresh clock on rows in *our* spots
   table, a derivative-works exclusion, and a vendor badge on `/denver`
   are a poor trade for café coverage. OpenStreetMap only. The
   `candidate_source` enum still ships the `foursquare` value, so adding
   it later is a data change, and `sources` stays plural in the copy.
2. **Tags are JSONB, not `text[]`.** The repo has no ARRAY column; JSONB is
   the established list type.
3. **Six tables become five plus a settings table.** `candidates`,
   `dismissals`, `spots`, `visits`, `weather_hours`, and one
   `spot_settings(key, value jsonb, updated_at)` row-per-key table
   carrying the constraints blob, the last run summaries and the saved
   weekend plan. A table per blob would be five more migrations' worth of
   schema for data that is read whole and written whole.
4. **Pins are HTML buttons in an overlay, not `<g role="button">` inside the
   SVG** — which is what the chosen mockup does. Focus rings, the popover
   anchor and the font stacks all behave without SVG workarounds, and
   `role="button"` on a `<g>` is the shakier screen-reader path. The
   projection, out-of-area rule and drawing prop are unchanged, so the
   travel log's contract is unaffected.
5. **The public note field is `blurb`, not `note`.** `test_public_outputs.py`'s
   forbidden-key walk bans `note` at every depth (a playthrough's note is
   the owner's). Renaming the public field is cheaper and safer than
   carving an exception into that list. The column stays `blurb` end to end
   so nothing has to translate.
6. **Undo has no ten-second timer.** No timed toast exists in the codebase;
   what exists is `SkippedToast`, rendered in place of the removed row with
   no timer, driven by `Next.jsx`'s `act(optimistic, request, rollback,
   confirm, wait)`. Reusing it means Undo stays available until the list is
   reloaded, which is strictly more forgiving than ten seconds.
7. **Two admin pages, two sidebar rows.** The mockups' sidebar lists
   Weekend, Spot finder and Spots; the spec's Surface 2 puts the finder and
   the table on one page. The spec wins: `/admin/spots` (finder left, table
   right) and `/admin/weekend`.
8. **The map's geometry is generated, not drawn by hand.** Decided with Joey
   2026-11-09: a committed script pulls downtown Denver's streets, rivers
   and parks from Overpass once, projects them, and emits a committed JS
   module. Real streets and the Colfax grid join come for free, the
   projection is exact rather than measured, and the drawn area can be
   extended by re-running the script with a wider bbox. The file is
   OSM-derived, so it carries an ODbL header and `/denver` carries the
   attribution.
9. **No response cache on `/api/public/spots`.** `PublicNextCache` exists for
   bodies that are expensive to build; this is a fifteen-row select, and
   `/api/public/items` is uncached for the same reason. Noted because the
   backend review will ask.

## Decisions taken at plan time

- **Tag vocabulary** is closed and lives in `backend/spots.py` as
  `TAGS = ("coffee", "park", "food", "kid-ok", "rainy-day", "bike-friendly")`,
  the authority (the `PLATFORM_NAMES` precedent). Labels for display live in
  `frontend/src/content/denver.js`; a test asserts the two sets match.
- **Anchors** are spots with `anchor = true`, never public even when the
  spot is. Nothing is hardcoded: Joey adds his anchors through
  `/admin/spots`, and the candidates job records `no_anchors` and does
  nothing if there are none.
- **Distance bands** (`spots.DISTANCE_MODES`): under 1.0 mi → `walk`, under
  3.0 mi → `bike`, else `drive or bus`. Straight-line haversine from the
  nearest anchor, with the mode word; never a routed time.
- **Weather verdict rules** (`weather.VERDICT`): over the hours 08:00–20:00
  local, an hour is *rideable* when temp ≥ 45 °F, precipitation probability
  < 40 % (a null probability counts as 0), and wind < 20 mph. The longest
  run of rideable hours is the window; ≥ 2 hours gives an `ok` verdict
  naming it, otherwise a `warn` verdict naming the blocker (precipitation,
  cold or wind, in that order). Rule-written, never the model.
- **The gridpoint is resolved every run.** The job calls `/points/39.7392,-104.9903`
  then the `forecastHourly` URL it returns — two calls a day, and the docs
  ask callers to re-check `/points` periodically rather than pin a
  gridpoint.
- **One migration, not three.** `0013` creates all six tables and their
  enums in PR 1, the `0005` precedent. Tables sit unused until PR 3 and
  PR 4, which is additive and harmless, and buys one Neon apply and one
  carve-out stop instead of three.
- **The Overpass client is the existing `physical_http_client`** from
  `main.py`: its `USER_AGENT` (`physical_sources/limits.py`) is already the
  identifying contact string Overpass asks for. Queries go out
  **sequentially** with an explicit `[timeout:60]`, and a 429 or 406 waits
  30 s before one retry.
- **Nightly workflow edits are one carve-out in PR 5**, not two in PR 3 and
  PR 4. Until then both jobs are reachable by their Run now button.
- **`/denver` is a `WIDE_ROUTES` page** (72rem), not `CONTENT_ROUTES`.
- **The Denver group goes last in `ADMIN_GROUPS`**, after Catalog, because
  the phone `SHEETS` map indexes `ADMIN_GROUPS[2]` and `[3]`; its two rows
  join the hand-written `more` list.

## Tasks

### PR 1 — Schema, spots API, the admin table

1. **Migration `0013_add_spots.py`** — `spots`, `visits`, `candidates`,
   `dismissals`, `weather_hours`, `spot_settings`; enums `candidate_source`
   (`osm`, `foursquare`) and `spot_city` is **not** an enum (plain text,
   default `'denver'`). Columns per the spec's schema sketch with the
   plan-time changes: `spots.tags` JSONB not `text[]`, `spots.blurb` not
   `note`, `spots.anchor` bool, `spots.slug` unique; `visits(spot_id →
   spots.id ON DELETE CASCADE, visited_on date, note text)`;
   `candidates` unique `(source, source_id)`; `dismissals(source,
   source_id)` composite PK; `weather_hours(gridpoint, starts_at)`
   composite unique; `spot_settings(key text primary key, value jsonb not
   null, updated_at)`. Enums created and dropped explicitly. Docstring
   follows `0012`'s shape and cites this file, with the "Additive:"
   paragraph.
   - **AC:** `alembic upgrade head` then `compare_metadata` is empty;
     upgrade → `downgrade base` → upgrade is clean.
   - **Tests:** `backend/tests/test_migrations.py` (existing, must pass).
2. **Models** in `backend/models.py`: `Spot`, `Visit`, `Candidate`,
   `Dismissal`, `WeatherHour`, `SpotSetting`, following `PlaySession`'s
   shape (UUID PKs with `default=uuid.uuid4`, `DateTime(timezone=True)` +
   `server_default=func.now()`, `__table_args__` tuple of constraints and
   indexes). Each docstring names migration `0013` and its single writer
   module, as `Playthrough`'s does.
   - **Tests:** covered by task 1's `compare_metadata`.
3. **`backend/spots.py`** (pure): `TAGS`, `canonical_tags(values)`,
   `slugify(name)`, `parse_coords("39.75, -104.99")` → `(lat, lng)` or a
   `ValueError` the route turns into a 422, `haversine_miles`,
   `DISTANCE_MODES` + `distance_line(miles)`, `nearest_anchor(point,
   anchors)`.
   - **AC:** no FastAPI or SQLAlchemy in its import graph.
   - **Tests:** `backend/tests/test_spots.py` (pure, no database, the
     `test_picker.py` fixture style); add `spots` to `PURE_MODULES` and
     `TOP_LEVEL` in `backend/tests/test_physical_imports.py`.
4. **`backend/spots_routes.py`** — admin only, router-level
   `dependencies=[Depends(require_admin)]`: `GET /api/spots` (every spot
   with its last visit), `POST /api/spots`, `PATCH /api/spots/{id}`,
   `DELETE /api/spots/{id}`, `POST /api/spots/{id}/visits`, `GET
   /api/spots/status` (last run summaries read from `spot_settings`, for
   the admin jobs panel). Every write passes through `spots.py` for tags,
   slug and coordinates. Mounted in `main.py` beside the other admin
   routers.
   - **AC:** an unauthenticated call is 401, never 422; a bad coordinate
     string is a 422 whose message the form can show; `is_public` defaults
     to **false** on create, as items do.
   - **Tests:** `backend/tests/test_spots_routes.py`.
5. **`/admin/spots`, table half** — `frontend/src/pages/AdminSpots.jsx`
   built from `AdminPageHeader`, `Panel` and a real `<table>`: Name and
   neighbourhood, Tags, Last visit, Public toggle, Edit; a search box
   filtering name and tag; **Add by hand** and **Edit** opening
   `components/SpotForm.jsx` (name, paste-from-maps coordinates,
   neighbourhood, tags, blurb, anchor, public); Log a visit. Phone drops
   the Last visit column. Lazy-loaded in `App.jsx`, a row in the new
   Denver group of `ADMIN_GROUPS`, a path in `ADMIN_ROUTES`.
   - **AC:** `prerender-lib.test.mjs`'s ADMIN_ROUTES ↔ App.jsx assertion
     passes; the page works at 400px and 1280px; `npm run build` passes.
   - **Tests:** `frontend/src/pages/AdminSpots.test.jsx`,
     `frontend/src/components/SpotForm.test.jsx`, and the existing
     `AdminShell.test.jsx` for the new group.

### PR 2 — `SpotMap`, `/denver`, the snapshot

6. **`frontend/scripts/draw-denver-map.mjs`** — the one-off generator. Takes
   a bbox (default: the spec's extent, Civic Center to the Sunnyside edge,
   sized so `Δlng · cos(39.74°) : Δlat` is 4:3), queries Overpass once for
   arterial and grid streets, the South Platte, Cherry Creek and parks,
   projects each node with the same affine transform `lib/mapFit.js` uses,
   and writes `frontend/src/content/maps/denver.js`: a `viewBox`, a `fit`
   (the two reference points and the derived transform constants), and
   path/polygon data grouped as `arterials`, `streets`, `water`, `parks`,
   plus hand-written `labels`. The file header records the ODbL provenance.
   Run by hand, not in the build; the script is committed so the area can
   be extended.
   - **AC:** the emitted module is deterministic for a given bbox; the
     generated `fit` round-trips both reference points to within 1px and a
     third known intersection to within 6px; the file states its OSM
     origin and licence.
   - **Tests:** `frontend/scripts/draw-denver-map.test.mjs` runs the pure
     projection and emitter over a recorded Overpass fixture (no network).
7. **`frontend/src/lib/mapFit.js`** (pure): `makeFit(fit)` → `project({lat,
   lng})` → `{x, y}` in viewBox units, plus `isOffMap(point, viewBox,
   margin = 12)`. Asserts at construction that the two implied scales are
   within a few percent of `cos(latitude)`, so a bad drawing fails loudly.
   - **Tests:** `frontend/src/lib/mapFit.test.js` — both reference points
     to 1px, a third intersection to 6px, an out-of-area point, and a
     drawing whose scales disagree.
8. **`frontend/src/components/SpotMap.jsx`** — props `{drawing, spots,
   selected, onSelect, label}`. An inline `<svg>` with the drawing's
   `viewBox` inside a `role="group"` wrapper labelled by `label`, every
   colour a token, plus an absolutely-positioned overlay of one
   `<button className="pin">` per on-map spot (percentage left/top from
   `mapFit`), each with the spot's name and tags as its accessible name.
   Selected pin is larger and filled `--text` with a `--surface` halo; the
   grow is a 120 ms transform disabled under `prefers-reduced-motion`.
   A `role="status"` line announces the selection.
   - **AC:** keyboard reaches every pin; Escape clears; an off-map spot
     renders no pin; correct in both themes with tokens only.
   - **Tests:** `frontend/src/components/SpotMap.test.jsx`, the
     `DayBars.test.jsx` convention (accessible names and classes, not
     markup).
9. **`GET /api/public/spots`** in `backend/public_outputs.py`, registered on
   the existing public router: a `PublicSpot` allowlist model —
   `spot_id`, `name`, `slug`, `neighbourhood`, `tags`, `blurb`, `lat`,
   `lng` — and nothing else. Only `is_public` rows; anchors and private
   spots never appear, and no row carries a visit, a distance or an
   `anchor` flag.
   - **AC:** `set(PublicSpot.model_fields)` equals the literal in the test;
     the forbidden-key walk over the whole body is clean; a private spot
     and an anchor are absent.
   - **Tests:** `backend/tests/test_public_outputs.py` — a `SPOT_FIELDS`
     literal and a walk, matching the existing shape.
10. **The `spots` snapshot**: a `spots` entry in `fetch-snapshot.mjs`'s
    `SNAPSHOTS` with `required: false` and an `isSpotsBody` predicate,
    duplicated verbatim into `frontend/src/lib/snapshot.js`'s `SHAPES`.
    - **Tests:** `frontend/src/lib/snapshot.test.js`, and the existing
      fetch-snapshot test for the new entry.
11. **`frontend/src/pages/Denver.jsx` and `content/denver.js`** — `h1`, the
    two-line lede, `FilterChips` over the tag vocabulary with counts from
    the unfiltered list and the pressed set mirrored into `?tag=`, the map
    and list two-column layout (stacked under a Map/List `tablist` at
    phone width, List the default), `components/SpotCard.jsx` for the
    rows, the selected-pin popover, and the ODbL attribution line. Reads
    the snapshot first, then `/api/public/spots`, via
    `useSnapshotThenLive('spots')`. The list alone is the no-JS state.
    Route in `App.jsx`, `/denver` in `WIDE_ROUTES`, a row in
    `STATIC_PAGES`, the matching `render.yaml` rewrite before the
    catch-all, and a footer link.
    - **AC:** every acceptance criterion in the spec's list that names
      `/denver`; `prerender-lib.test.mjs`'s render.yaml ↔ publicRoutes
      assertion passes; no API call is made when the snapshot is present
      beyond the one live refresh; axe reports no violations.
    - **Tests:** `frontend/src/pages/Denver.test.jsx` (the `Stats.test.jsx`
      mocked-hook shape plus `Collection.test.jsx`'s axe helper),
      `frontend/src/content/pages.test.js`, `SpotCard.test.jsx`.

### PR 3 — The candidates job and the finder

12. **`backend/spot_sources/`** — `overpass.py` (pure: `build_query(anchors,
    radius_m)` producing one `[out:json][timeout:60]` query with an
    `around:` block per anchor, and `parse(payload)` → frozen
    `CandidateRow` dataclasses of plain strings), `dedupe.py` (pure: name
    similarity plus a 75 m proximity rule, the `matching.py` precedent),
    `limits.py` (radius, the 30 s backoff, the retry count). A package
    README, as `sources/` and `physical_sources/` have.
    - **AC:** no FastAPI or SQLAlchemy in the import graph; a 429 or 406
      waits 30 s and retries once; queries are sequential.
    - **Tests:** `backend/tests/test_overpass.py` and
      `test_spot_dedupe.py` over a fixture recorded by
      `backend/scripts/record_spot_fixtures.py`; the new modules added to
      `test_physical_imports.py`.
13. **`backend/candidates.py`** — the LLM scoring layer, the `discover.py`
    pattern exactly: a `SCORES_SCHEMA` the model answers with **indices**
    into a server-built list (so it can never introduce a place), an
    `INSTRUCTIONS` constant, `build_prompt(candidates, profile)`,
    `validate(payload, candidates)` dropping bad or repeated indices and
    tags outside the vocabulary, and a deterministic `fallback` that
    leaves `fit` null with the reason `"not scored"`. Pure.
    - **AC:** a model failure of any kind (quota, timeout, unreadable
      answer, no provider) still fills the queue; the reason is stored as
      the run's note, worded from `llm.py`'s own messages.
    - **Tests:** `backend/tests/test_candidates.py`.
14. **`POST /api/spots/candidates/refresh`** on `spots_routes.py`: walks
    Overpass per anchor, dedupes, drops dismissed `(source, source_id)`
    pairs, scores the remainder in one model call, replaces the pending
    candidate rows, and writes the run summary to `spot_settings`. Shares
    one `asyncio.Lock` with nothing else (it writes only spot rows, the
    comics precedent). Added to `items.JOB_ROUTES` **and** to
    `test_job_token.EXPECTED`.
    - **AC:** `test_job_token.py` passes with the route in the whitelist and
      no other route reachable by the token; a second concurrent call is
      409; no anchors records `no_anchors` and writes nothing.
15. **`POST /api/spots/candidates/{id}/accept|dismiss`** — Accept creates a
    private spot with the pressed tags and the candidate's coordinates;
    Dismiss writes the `(source, source_id)` pair permanently. Both remove
    the candidate row. A second answer to the same candidate is 409.
16. **The finder column on `/admin/spots`** —
    `frontend/src/components/CandidateCard.jsx` (OSM source badge, name,
    category, distance line, the reason with matched tags muted and the
    fit as a small mono figure, toggleable suggested tags, Accept into
    spots / Dismiss) and a `JobStatusRow`-style run line with Run now,
    following `AdminDiscover.jsx`: a module-level `fetchCandidates()` that
    returns rather than sets state, one `state` string, a `busy` flag, the
    re-read-before-re-enable ordering, and optimistic `drop(row)` with
    `SkippedToast`-style in-place Undo driven by an `act(...)` helper.
    Empty state: *Nothing new this week. Next run Sunday.*
    - **AC:** the badge carries its word, so colour is decoration; actions
      are buttons that are siblings of any link; focus lands sensibly
      after a card leaves; 400px and 1280px match `c-spot-finder.html`.
    - **Tests:** `CandidateCard.test.jsx`, and the finder cases added to
      `AdminSpots.test.jsx`.

### PR 4 — The weather job and the planner

17. **`backend/weather.py`** — `fetch_hourly(client, lat, lng)` resolving
    `/points` then `forecastHourly`, and the pure half: `parse_periods`
    (handling `temperature` + `temperatureUnit`, `windSpeed` as a string
    like `"5 mph"`, and a nullable `probabilityOfPrecipitation.value`),
    `VERDICT` constants and `verdict(hours)` → `{state: 'ok'|'warn', text,
    window}`. The NWS contact User-Agent is the tracker's.
    - **AC:** the parser survives a null precipitation probability and a
      non-numeric wind string; the verdict matches the rules for the three
      mockup states; nothing here touches a request path.
    - **Tests:** `backend/tests/test_weather.py` over a fixture recorded by
      `record_spot_fixtures.py`; added to the purity test.
18. **`backend/planner.py`** (pure) — `plan(spots, visits, hours,
    constraints, today)` → three `Suggestion`s with slot, when-line, tag
    pills, distance line and rule-written reasons. Slots **Best fit**,
    **Somewhere new**, **Haven't been in a while**, with the outdoor slot
    swapping to **Snow day** over the rainy-day pool when a day has no
    window. Tuning in one dict, the `picker.py` shape; `today` passed in,
    never read.
    - **Tests:** `backend/tests/test_planner.py` — the dry weekend, the
      snowy Sunday, and no-candidates and no-visits edges.
19. **`POST /api/spots/weather/refresh`** (a job route, whitelist + test
    literal) storing the hourly periods for the downtown gridpoint; and
    `GET /api/spots/plan`, `POST /api/spots/plan/save`,
    `POST /api/spots/plan/skip`, `POST /api/spots/{id}/visits` (Been,
    reusing PR 1's route) on `spots_routes.py`. The saved plan and the
    weekend's skips live in `spot_settings` under a `plan:<iso-week>` key;
    the constraints blob under `constraints`.
    - **AC:** the page makes no external call; one saved card per day;
      Been writes a visit dated that day; Skip is scoped to the weekend.
20. **`/admin/weekend`** — `frontend/src/pages/AdminWeekend.jsx` with
    `components/WeatherPanel.jsx` (the 13-bar 8am–8pm sparkline, bars in
    `--chart`, precipitation hours hatched with `--hatch`, high/low, the
    verdict in `--ok` or `--warn`, and a text equivalent),
    `components/SuggestionCard.jsx` (the Play Next card shape with Save /
    Been / Skip), the read-only constraints pills with an Edit form in the
    page footer, a Reroll text button for the unsaved slots, and a Recent
    visits `Panel`. Phone layout is the primary one. Lazy route,
    `ADMIN_GROUPS` row, `ADMIN_ROUTES` path.
    - **AC:** the sparkline is never colour-only; 400px and 1280px match
      `b-weekend-planner.html` in its dry, snowy and saved states; axe
      clean.
    - **Tests:** `AdminWeekend.test.jsx`, `WeatherPanel.test.jsx`,
      `SuggestionCard.test.jsx`.

### PR 5 — Wiring, docs, verification

21. **`.github/workflows/nightly.yml`** — a `call weather 120
    /api/spots/weather/refresh` step every run, and `call spots 600
    /api/spots/candidates/refresh` inside the existing `if [ "$weekly" =
    true ]` block; `spots` added to the snapshot-compare `for` list as a
    non-fatal name. Two rows added to `frontend/src/lib/nightly.js` with
    `runNow` pointing at `/admin/spots` and `/admin/weekend`.
    - **AC:** a dry-run of the workflow's shell classifies both calls; the
      compare step treats `spots` as a warning, not a failure.
22. **Docs and copy** — `frontend/changelog.md` entry; `CLAUDE.md` gains the
    Denver admin group, the `spot_settings` convention, the `blurb`
    rename, the ODbL obligation and the migration `0013` line; the
    `spot_sources/` README; `backend/env.example` unchanged (no new
    credential).
23. **Verification** — `cd frontend && npm run build && npm test`; `cd
    backend && ./.venv/bin/pytest`; the contrast measurements for the pin
    halo, the OSM badge and the sparkline recorded beside the tokens in
    `index.css`; screenshots of all five mockup states at 400px and
    1280px in both themes; `./scripts/smoke.sh` extended with `/denver`
    and a check that `/api/public/spots` carries no private row.

## Milestones

```
STOP — carve-out review: migration 0013 (six new tables, two enums)
Milestone 1 (auto): PR 1, tasks 1–5           → migrate Neon, then PR
Milestone 2 (auto): PR 2, tasks 6–11          → PR
Milestone 3 (auto): PR 3, tasks 12–16         → PR
Milestone 4 (auto): PR 4, tasks 17–20         → PR
STOP — carve-out review: nightly.yml (CI workflow)
Milestone 5 (auto): PR 5, tasks 21–23         → PR
```

The two stops are the only ones: the first before writing `0013`, the
second before touching the workflow. Everything else runs through to an
opened PR per `sdlc-execution`'s finish gate. Migration `0013` is applied
to Neon from this worktree with `backend/scripts/migrate_neon.py current`
then `upgrade`, **before** PR 1 merges, and no spot data is written
between the apply and the merge.

## Issues

One per PR, created at the start of execution with `gh issue create`:

1. Denver spots: schema, spots API and the admin table
2. Denver spots: the drawn map and the public `/denver` page
3. Denver spots: the weekly candidates job and the spot finder
4. Denver spots: the weather job and the weekend planner
5. Denver spots: nightly wiring, changelog and verification

## Smoke test strategy

Local, before each PR: `npm run build`, `npm test`, `pytest`, and the page
driven in the browser at 400px and 1280px in both themes against a
worktree API on the local test database (the pattern recorded in memory:
dummy env vars, the main venv, `npm ci`).

Post-deploy, after each merge: `./scripts/smoke.sh https://joey-haas.dev
https://api.joey-haas.dev`, extended in PR 5 with `/denver` (200, and the
prerendered head present at `/denver` as well as `/denver/`) and
`/api/public/spots` (200, no `anchor`, no `visits`, no key named `id`).
Expect the "new rewrite serves an empty 200" window of about five minutes
after the PR 2 deploy before re-smoking.

## Environment test

- Neon: `0013` applied from this worktree, verified with `migrate_neon.py
  current`, with a restore point taken first.
- Render: no new environment variable. Both new jobs are keyless; the
  existing `JOB_TOKEN` opens them.
- GitHub Actions: `nightly.yml` gains two steps in PR 5; the weekly one
  rides the existing Monday-UTC flag.
- Overpass is called once a week from Render, sequentially, with the
  tracker's User-Agent — three orders of magnitude inside the main
  instance's fair-use figures.
