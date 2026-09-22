# Tracker Enhancement — Shelf Redesign, Play Next, Discover, Radar

Design spec for the next round of media tracker work: a visual overhaul of the
public showcase and the admin shelf on one design system, and three ways of
answering "what should I play" — from the owned backlog, from what is not yet
owned, and from what is not yet released. Discover and Radar are
**physical-first**: they only surface games with a known physical edition,
and they tell a full-game cartridge from a Game-Key Card.

- **Date:** 2026-09-22 (revised the same day for physical-first and N64)
- **Status:** D1–D5 approved by Joey; D6–D9 (§10) open
- **Supersedes:** §3 (Recommendations, E6) of `docs/media-tracker-requirements.md`.
  Everything else in that document stands.
- **Research:** `2026-09-22-tracker-design-research.md` (Backloggd,
  Letterboxd, HowLongToBeat, Steam, Backlog Shuffle, Playnite PlayNext,
  StoryGraph, the LLM-recommender literature) and
  `2026-09-22-physical-sources-research.md` (the seventeen boutique stores,
  Game-Key Card detection, N64), both beside this file and in the Claude
  project. Patterns and endpoints cited below by name come from there.

---

## 1. Problem

**The showcase is functional and plain.** `/collection` renders inside the
site's reading column, so the poster grid is four across on a desktop. Stats
are two plain lists; the rating histogram and finishes-per-month blocks are
wired but never render because no item carries a rating or a finish date.
Filters are two `<select>`s. There is no sort, no hover state, no status mark
on a poster, no item page, and no favorites row — the four things a visitor
recognises a tracker by.

**The admin shelf is a table.** It does the job it was built for (publish,
correct, re-link) but rating a game means opening its edit page, which is why
68 games have zero ratings between them.

**Recommendations (E6) were never built, and the design needs revising.** The
collection now has 68 games, 50 in the backlog, and Joey's actual question
most evenings is not "what should I buy" but "which of these fifty do I start."
E6 only addressed acquisition. Joey has since asked for both, plus a view of
upcoming releases worth watching. Meanwhile two constraints were measured that
E6 did not know about: Gemini's free tier allows twenty requests per day per
model (`llm.py`), and the taste profile has nothing to work from until ratings
exist.

**The collection is physical, and nothing in the stack knows it.** Joey buys
cartridges, not downloads, and specifically full-game cartridges rather than
Game-Key Cards. IGDB cannot say whether a game has a physical edition at all,
let alone which kind; Nintendo's own pages do not mark key cards; the
`items` table has no platform column (the importer reads the platform off the
case and then drops it) and no way to record what kind of cartridge a copy
is. A recommender built on IGDB alone would suggest digital-only games and
key cards indiscriminately. An N64 collection is coming too, which needs a
platform per item and a completeness field, and has no format question.

## 2. Decisions (settled by Joey, 2026-09-22)

1. **One design system for public and admin.** The showcase and the admin
   shelf share the grid, cards, stats blocks, and item page; admin adds inline
   controls to the same components rather than owning a separate UI.
2. **Three suggestion modes, one taste profile.** *Play Next* picks from the
   owned backlog. *Discover* proposes titles not in the collection. *Radar*
   surfaces upcoming releases. All three score against the same profile
   derived from favorites, ratings, and finishes.
3. **Games first.** Every feature ships for games before films; comics and
   board games follow only where a source exists (BGG remains blocked).
4. **Physical first.** Discover and Radar only surface games with a known
   physical edition on a platform in the collection. Full-game cartridges
   are the default; Game-Key Cards and codes-in-a-box are shown only behind
   a toggle and always carry a visible mark. The physical catalogue is built
   from the boutique stores in Joey's bookmarks plus the community Switch 2
   registry (§5.4–§5.7); IGDB stays the metadata source.
5. **Platform is a property of the copy.** Every item gets a platform, and
   N64 is a first-class platform alongside Switch and Switch 2: same
   grid, same picker, same Play Next. N64 has no format question (every
   release is a cartridge) but gains a completeness field (D6).
6. **Want list, pinned pick, and format are public** (D1, D2 approved): the
   showcase shows a Want chip, the radar strip, the Up next card, and the
   cartridge-vs-key-card mark. Ownership format (physical/digital/borrowed)
   stays private.

## 3. Design principles

Drawn from the research and from what already works on the site:

- **Keep the warm brand.** Backloggd is navy-and-pink, Letterboxd is
  charcoal-and-green; this site is warm dark with a serif display face and a
  terracotta accent, and that is a differentiator, not a deficit. Covers carry
  the colour; the chrome stays quiet. Text stays off-white (`--text`,
  `--text-body`, `--text-muted` — never pure white).
- **One accent per meaning.** `--accent` (terracotta) means rating, favorite,
  and primary action. `--accent-2` (sage) means progress and "playing". New
  status tokens carry status; nothing else gets a colour.
- **Stars under posters, not on hover.** Ratings must be readable while
  scanning (Letterboxd).
- **Hide what is empty.** A chart with no data does not render (Backloggd's
  rule; StoryGraph's most-requested fix). A section with no data renders a
  one-line prompt in admin and nothing in public.
- **No community clutter.** Nothing from the achievement-tracker world —
  counters, ranks, "tracked gamers". One user's facts only.
- **Deterministic first; the model only where it adds value.** Play Next and
  Radar are pure scoring. Discover uses one model call to re-rank a list the
  server already built. No model output ever names a title the server has not
  resolved to an IGDB id.
- **Explain every pick.** Each suggestion carries a reason built from the
  user's own items ("shares Roguelike and Deck-building with Inscryption,
  which you finished"). Steam's Play Next comparables and Backlog Shuffle's
  "Why this game?" are the models; Diving Bell's argument for transparent,
  repeatable engines is the rationale.
- **Physical availability is a filter; format is a flag.** A game with no
  known physical edition never reaches Discover or Radar. A game whose
  edition is a key card can, behind the toggle, and is marked. "Unknown"
  is an honest third state — absence of a key-card phrase is never taken as
  proof of a full cartridge.
- **Every catalogue fact carries its evidence.** Format rows record which
  source said so (cart ID, registry, store text, store policy, manual) so a
  wrong call can be traced and overridden.

## 4. Shelf and showcase redesign (E7a)

### 4.1 Layout

The tracker pages break out of the reading column. The 45rem limit lives on
`.page` in `RootLayout`, so the layout adds a `page-wide` class there
(max-width around 72rem, same side gutters) when the route is one of
`/collection`, `/collection/:id`, `/admin/collection*`, or the three new
admin routes — the same pattern as its existing `isHome` check. Every other
page keeps the prose column.

### 4.2 Tokens

Extend both theme blocks in `index.css` — never raw hex in components:

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--rating` | = `--accent` | = `--accent` | stars, favorite heart |
| `--status-active` | = `--accent-2` | = `--accent-2` | playing mark, stacked bar |
| `--status-finished` | a lighter warm neutral | a darker warm neutral | finished mark, stacked bar, finishes strip |
| `--status-backlog` | a warm neutral distinct from `--border` | same | backlog mark, stacked bar |
| `--status-abandoned` | the least saturated of the four | same | abandoned mark, stacked bar |
| `--overlay` | translucent `--bg` | translucent `--bg` | hover overlay, hero scrim |
| `--skeleton` | slightly lighter than `--surface` | slightly darker than `--surface` | loading placeholders |

Pick actual values by measurement, as the Shiki pair was: every status
token clears 3:1 against `--surface` in both themes (WCAG 1.4.11, since
these are non-text marks), and `--status-backlog` also clears 3:1 against
`--border`. Adjacent segments of the stacked bar are separated by a 2px
`--surface` gap so surface is the pair that matters everywhere.

### 4.3 Page header

Title and one-line description as now, then a **hero-number row** (Backloggd,
Letterboxd): `68 owned · 17 finished · 9 finished in 2026` computed from
`/api/public/stats` (§9). Large tabular numerals, small uppercase labels.

Below it a **Favorites row** of four covers (Letterboxd's exact count). Public:
render only when at least one item is a favorite; show up to four, sorted by
rating then title. Admin: always render, with empty slots and a "Pick your
favorites" hint, because the row is also the picker's strongest signal.

### 4.4 Poster grid v2

- `grid-template-columns: repeat(auto-fill, minmax(var(--poster-min), 1fr))`
  with two sizes behind a **poster-size toggle**: Comfortable (8.5rem, the
  default — about seven across at 72rem, three on a phone) and Compact (6rem).
  Persist the choice in `localStorage` like the theme; wrap reads in try/catch.
- The poster and title are one link to `/collection/:id`. Admin affordances
  (§4.9) are siblings of that link, never nested inside it.
- **Status mark**: a small square in the poster's top-left corner coloured by
  the status token; no text. `aria-label` carries the status. Backlog items
  get no mark (the absence is the signal).
- **Favorite**: a heart glyph in `--rating` at the top-right corner of the
  poster, replacing the inline ♥ in the title.
- **Format mark** (E7b): at the bottom-right of the poster, a small key
  glyph in `--text-muted` when `physical_format` is `game_key_card` or
  `code_in_box`, and a muted "?" when the format is NULL on a platform in
  `KEY_CARD_PLATFORMS = {508}` — an unrecorded Switch 2 format must not look
  like a full cartridge (§3). Full cartridges and other platforms get no
  mark. `aria-label` spells each out.
- Beneath the poster: title (two-line clamp), then stars (existing `Stars`),
  then year · creator in `--text-muted`. On pointer devices, hover lifts the
  card slightly and darkens the poster with `--overlay`; no information is
  hover-only (§10 D4).
- **Dim finished** toggle: finished and abandoned posters at 45% opacity
  (Letterboxd's "fade watched"). Off by default in public, on by default in
  admin — the admin's job is the backlog.
- **Upcoming ribbon** (E7b, once `release_date` exists): an item whose
  `release_date` is in the future shows a small "Coming <Mon YYYY>" strip
  along the poster's bottom edge.

### 4.5 Filters and sort

Replace the two selects with **chip rows**: one row of type chips with counts
(`Games 68 · Film & TV 0 …`, zero-count chips hidden), one row of status
chips with counts (`Backlog 50 · Playing 1 · Finished 17 · Abandoned 0`) plus
a **Want** chip for `owned_format = none` (public too, per D1), and — for
games, once `platform` exists (E7b) — a row of **platform chips** built from
the platforms present (`Switch 2 · Switch · N64`). Chips wrap on desktop and
scroll horizontally on a phone. Selection is client-side; the list is small.

One **sort** control: Recently added (default) · Recently finished · Rating ·
Release year · Title · Random. A direction toggle beside it. No more.

### 4.6 Stats v2

Replace the lists with three blocks, each hidden when it has no data:

1. **Status bar** — one stacked horizontal bar (Backloggery's signature
   visual), segments in the order backlog · playing · finished · abandoned
   in status-token colours with 2px gaps, and a legend with counts. Renders
   whenever there is at least one item.
2. **Ratings** — ten thin vertical bars for 1–10 (Letterboxd's histogram) with
   the average as one large number beside it; each bar's count is in its
   accessible label and appears as a small numeral above the bar on hover or
   focus, so nothing is hover-only. Renders only when at least one item is
   rated.
3. **Finishes** — twelve months as small vertical bars, current month at the
   right, with the year's total. Renders only when a finish date exists.
4. **On cartridge** (E7b) — one line, not a chart, per platform in
   `KEY_CARD_PLATFORMS`: "Switch 2 · 61 on cartridge · 3 Game-Key Cards ·
   4 not recorded, of 68", from `by_format[platform_id]` in the stats
   response (§9), counted over public owned games. Unknowns are stated,
   never folded into the cartridge count. Renders only when at least one
   game on that platform has a recorded format.

Keep the chart CSS as it is now (widths and heights from custom properties set
in markup). Colours from tokens only; the dataviz skill's palette advice
(one hue, vary lightness for sequential data) applies.

### 4.7 Item page — `/collection/:id`

Public route, the Backloggd game-page anatomy without the community counters:

- Hero: the cover itself, scaled up, blurred, and dimmed with `--overlay`, as
  the background of a 12–14rem tall band. No new image sources.
- Cover (unblurred) overlapping the band's bottom edge, left; title, year,
  creator, and the status mark's meaning in words ("Finished · June 2026"),
  right.
- Chips: the item's own platform first (`Switch 2`), then genres, then the
  other platforms the game exists on in `--text-muted`. Then a **format
  chip**: "Full game on cartridge", "Game-Key Card", "Code in a box", or
  "Format not recorded" for a NULL on a `KEY_CARD_PLATFORMS` platform; and
  the completeness when set ("Complete in box"). The public endpoint never
  carries the evidence; when signed in, the page also fetches
  `/api/items/{id}` and shows "NSCollectors, USA, cart LB-AAE7A" beside the
  chip from that response.
- Description from the snapshot, clamped to six lines with "More".
- A tile row: **Your rating** (stars + numeral), **Community** (score / 100
  and vote count when present), **Time to beat** ("≈ 12 h · 18 h to complete"
  once `time_to_beat` is in the snapshot, §5), **Played** (times completed,
  started/finished dates).
- **More from this shelf**: a strip of up to eight other public items that
  share an IGDB `similar_games` link or at least two genres with this one.
- Admin, when signed in: an "Edit" link to `/admin/collection/:id` in the
  hero. The existing edit page is unchanged.

Served by `GET /api/public/items/{id}` (§9), which ships in E7a; the
time-to-beat tile and the Upcoming ribbon wait for E7b's snapshot fields and
simply do not render until then. A 404 renders the site's NotFound.

### 4.8 Loading and errors

Replace the loading paragraph with a **skeleton grid** of twelve `--skeleton`
cards plus the existing "waking the server" line after two seconds. Keep the
error state.

### 4.9 Admin shelf — `/admin/collection`

The same header, chips, sort, and grid as public, with admin affordances on
each card and a **view toggle** (Shelf / List) where List is the existing
table, kept for bulk work. Card affordances are revealed on hover and on
focus-within on pointer devices, and collapse into one "…" button per card
that opens a sheet on touch (§4.10):

- **Quick rate**: ten half-star targets under the poster; click sets `rating`
  via `PATCH /api/items/{id}`. This is the single most important control in
  the release — it is how the profile gets populated.
- **Favorite** heart toggle.
- **Status** menu (backlog / playing / finished / abandoned); choosing
  finished sets `finished_at` to today if empty and `times_completed` to
  `n + 1` when there was a prior finish (`finished_at` set or
  `times_completed > 0` — the status alone cannot tell, since a replay
  arrives as playing → finished) and to `1` otherwise.
- **Publish** toggle (existing `is_public`).

Above the grid, a dismissible **nudge** when fewer than five items are rated
or favorited: "17 finished games have no rating. Rating them is what makes
Play Next work." with a chip that filters to finished-and-unrated. Also a
**Refresh game metadata** button (§5.3) and, from E7c, a **Refresh physical
catalogue** button (§5.6) with a "last refreshed" stamp.

The item edit page (`/admin/collection/:id`) and the create form gain four
fields in E7b: **Platform** (a select of platforms already in the collection
plus a search over `GET /api/igdb/platforms?q=`, storing the id; the name
is resolved server-side), **Format** (`game_card` / `game_key_card` /
`code_in_box` / `disc`, blank for unknown or digital) with a **cart ID**
text field beside it, **Region** (defaulting to USA), and **Completeness**
(D6, shown only for cartridge-era platforms). From E7c, when a Switch 2 game
is linked, the form calls `GET /api/physical/registry-lookup` (§5.6) and
offers the answer as a one-click fill — "NSCollectors lists the USA release
as a Game-Key Card (LP-AAC4B) — use this?" — which submits the edition id so
the server records `format_source = registry` (§5.8).

### 4.10 Mobile

Three posters across (the poster minimum drops to 6rem under 34rem), chips
scroll, sort is a select with an explicit Shuffle button for Random, card
affordances collapse into one "…" button per card that opens a sheet. No
hover-only content anywhere.

## 5. Metadata depth (E7b) — prerequisite for §6–§8

### 5.1 IGDB snapshot

Extend `FIELDS` in `sources/igdb.py` and the snapshot in `_parse_detail`:

| Snapshot key | IGDB field | Why |
|---|---|---|
| `themes` | `themes.name` | mood buckets, affinity |
| `keywords` | `keywords.name` (first 10) | mood buckets, affinity, reasons |
| `game_modes` | `game_modes.name` | affinity |
| `player_perspectives` | `player_perspectives.name` | affinity |
| `genre_ids`, `theme_ids`, `platform_ids` | `genres.id`, `themes.id`, `platforms.id` | every `where` clause in §7–§8 needs ids; the name lists stay for display |
| `hypes` | `hypes` | Radar ranking |
| `release_status` | `game_status` (fall back to the older `status`; store the raw value and treat missing as unknown, not released) | Radar filter |
| `first_release_date` | `first_release_date` (ISO date, converted from epoch) | `release_date` backfill |
| `time_to_beat` | `/v4/game_time_to_beats` — `hastily`, `normally`, `completely`, `count`, stored as hours to one decimal (source is seconds) | Play Next length fit, item page |

`game_time_to_beats` is a separate endpoint: `where game_id = (…); fields
game_id,hastily,normally,completely,count; limit 100;` batches up to 100 ids.
A game with no submissions is absent from the response — leave the key out,
never store zeros.

One thing the fixture step must settle before the queries in §7.1 (N64
universe) and §8.1 (lane 3) are written, because the research took its
query shapes from third-party code: which Apicalypse bracket form means
*contains any of* on an array field — the intent everywhere in this document
is "any of the selected platforms" — since the three bracket forms mean
different things. As with everything IGDB here, confirm field names against
the live API and record a fixture before writing the parser.

### 5.2 Migrations `0003` (E7b) and `0004` (E7c)

Two migrations, deliberately: `0003` carries everything the shelf and Play
Next need and is applied once; `0004` carries the catalogue tables, which
will change shape while the store adapters are written against real data
and should not hold `0003` hostage.

**`0003` — columns on `items`, plus two tables**

| Column | Type | Notes |
|---|---|---|
| `items.release_date` | date, nullable | Backfilled from the snapshot on refresh (IGDB `first_release_date`, TMDB `release_date`). Drives the Upcoming ribbon and Radar's "Watching" rows. `year` stays as the display field. |
| `items.pinned_at` | timestamptz, nullable | The Play Next commit ("Up next"). At most one game pinned at a time; the pin endpoint (§6.5) clears the previous. |
| `items.acquired_at` | date, nullable | When the copy joined the shelf. Backfilled from `created_at::date` in the migration, editable on the item page. Exists because the collection was bulk-imported on one or two days, so `created_at` says nothing about how long a game has waited. |
| `items.platform_id` | smallint, nullable | IGDB platform id of **this copy** (508 Switch 2, 130 Switch, 4 N64 — confirm 4 against `/v4/platforms`). Backfilled by the bulk refresh when the snapshot lists exactly one platform, otherwise left for the form. Add `"nintendo 64"` / `"n64"` → 4 to `PLATFORM_IDS` in `igdb.py`. |
| `items.platform` | varchar(60), nullable | Display name, resolved server-side from `platform_id` (a `PLATFORM_NAMES` map beside `PLATFORM_IDS`); never accepted from a request body. |
| `items.physical_format` | enum `physical_format`: `game_card` \| `game_key_card` \| `code_in_box` \| `disc`; nullable | What the physical copy is. `game_card` covers every full-game cartridge (Switch, Switch 2, N64). NULL means unknown or not physical. Never defaulted. |
| `items.format_source` | enum `format_source`: `cart_id` \| `photo` \| `registry` \| `store_text` \| `store_policy` \| `platform_policy` \| `manual`; nullable | How `physical_format` was decided (§5.7). Derived server-side on every write (§5.8); NULL whenever the format is NULL. |
| `items.cart_id` | varchar(20), nullable | Switch 2 product code off the label (`LP-AAC4B-USA-0`). Rejected by the API unless it matches the §5.7 regex; `LP-` forces `game_key_card`. |
| `items.region` | varchar(4), nullable | Region of the copy (`USA`, `EUR`, `JPN`…). Defaults to `HOME_REGION = "USA"` (a config constant) when NULL; the cart ID's third segment sets it when present. |
| `items.completeness` | enum `completeness`: `loose` \| `boxed` \| `cib` \| `sealed`; nullable | D6. The form shows it only for platforms in `CARTRIDGE_ERA_PLATFORMS` (N64 and whatever retro platforms are added later); the item page shows it whenever set. |
| `pick_events` | new table | §6.4 |
| `recommendations` | new table | §7.2 |

**`0004` — the physical catalogue** (`physical_editions`, `store_listings`,
`catalogue_runs`; §5.5–§5.6), created empty.

`owned_format` is nullable. The importer writes `physical` and the form
requires a choice, but any NULL that exists is treated as owned everywhere in
§6–§8 (`owned_format IS DISTINCT FROM 'none'`), never as a want-list row.

### 5.3 Bulk refresh

`POST /api/items/refresh-metadata/bulk?type=game` (admin). Collects every game
with an `external_source = 'igdb'`, fetches them in batched `where id = (…)`
queries of 100 (`limit 100`), then their `game_time_to_beats` in batches, and
updates `source_metadata`, `creator`, `cover_url`, `release_date`, and — only
where NULL — `platform_id`/`platform` when the snapshot lists exactly one
platform, without touching user-entered fields. For 68 games this is three
or four IGDB calls and finishes in seconds, so it runs synchronously and
returns `{updated, skipped, failed}`. Add a batched `fetch_many(ids)` to the
IGDB adapter for it; the single-id `fetch` stays for the picker.

### 5.4 Why a physical catalogue, and what it is

IGDB cannot answer "does this game exist on a cartridge, and which kind."
Nothing first-party can either: Nintendo's product pages list only a
Digital edition for third-party games, its store facets have no key-card
value, its European search API's physical flag was wrong for three games
checked, and IGDB's schema has no key-card concept. The physical universe
therefore has to be assembled from three kinds of source:

- **Registries** — the r/NSCollectors "Switch 2 Releases" Google Sheet (CSV
  export, no auth; one row per title and region with `Card Type` = Game
  Card / Game-Key Card / Code in a Box, the cart ID, publisher, and release
  date; 500+ rows, retail publishers included) and, as a cross-check, the
  `switch2-tracker` GitHub project's daily-built `games.json`. For Switch 2
  this is close to the whole physical universe. Nothing equivalent exists
  for Switch 1.
- **Store catalogues** — the boutique publishers in Joey's bookmarks, read
  through the adapters in §5.6. Stores give pre-orders, prices, ship
  windows, and links — and for Switch 1, PS5 and older platforms they are
  the only physical signal.
- **Platform policy** — platforms on which every release is a cartridge
  (`CARTRIDGE_ONLY_PLATFORMS = {4}`, N64). Their whole IGDB catalogue is
  ingested as editions with `physical_format = game_card` and
  `format_source = platform_policy`, so the one rule in §7 ("no edition
  row, no recommendation") holds for N64 too instead of needing a side
  path.

### 5.5 Catalogue tables (`0004`)

**`physical_editions`** — one row per known physical edition of a game on a
platform in a region, from a registry or a platform policy. Stores never
write this table; their rows live in `store_listings` and are joined.

| Column | Notes |
|---|---|
| `id` uuid | |
| `title`, `title_normalized` | `matching.normalize_title` output for joins |
| `platform_id` smallint, `platform` | |
| `region` varchar(4) | `USA`, `EUR`, `JPN`, … as the registry spells them; `ALL` for platform-policy rows |
| `physical_format` enum, `format_source` enum | same enums as `items`; `registry` or `platform_policy` here |
| `cart_id` | when the registry has it |
| `publisher` | |
| `release_date` date, `release_precision` enum `day` \| `month` \| `quarter` \| `year` | The sheet's Release Date is free text: `YYYY-MM-DD` → day, `Mon YYYY` / `YYYY-MM` → month, `Q[1-4] YYYY` → quarter, `YYYY` → year, `TBA`/blank → NULL. |
| `igdb_id` int, `match_confidence` enum (from `matching.Confidence`) | resolved by `igdb.search(title, platform=…)` + `matching.best_match`; NULL when unmatched |
| `igdb_cache` jsonb | the §5.1 snapshot fields for `igdb_id`, fetched in batches during refresh so scoring never calls IGDB per generate |
| `source` varchar(40) | `nscollectors` \| `switch2tracker` \| `igdb_platform` \| `manual` |
| `source_ref` text | `nscollectors`: `normalize_title(Master Title) + "|" + Region`; `switch2tracker`: its game id + region; `igdb_platform`: the IGDB game id |
| `first_seen_at`, `last_seen_at`, `retired_at` timestamptz | a row absent from a successful run for its source gets `retired_at` set (never deleted); every pool filters `retired_at IS NULL`. A retired row that reappears is un-retired. |
| unique | (`source`, `source_ref`) |

**`store_listings`** — one row per **platform variant** of a product on a
boutique store, because Limited Run, Aksys, and Nicalis sell one product
with a `Platform` option whose variants have their own price, SKU, and
availability.

| Column | Notes |
|---|---|
| `id` uuid | |
| `store` varchar(40) | key into `STORES` in §5.6 |
| `store_product_id` varchar(40), `variant_id` varchar(40), `handle`, `url` | Premium Edition reuses handles across products — never key on handle. Single-variant products use the product id as `variant_id`. |
| `region` varchar(4) | from the store config: `USA` for USD stores, `EUR` for EUR and GBP stores |
| `title`, `title_normalized`, `edition_label` | `title` as the store shows it; `title_normalized` after the store's `title_strip` regexes and then `matching.normalize_title`; `edition_label` from the shared `EDITION_LABEL` regex (`Standard \| Collector'?s \| Deluxe \| Special \| First \| Limited \| Exclusive \| Retro \| Premium`) over the original title and option values |
| `platform_id`, `platform` | per the store's platform strategy; NULL when unresolved — such rows are excluded from pools and listed under Needs match |
| `collections_seen` jsonb | the collection handles (or WooCommerce category ids) the variant was found in during the latest run; the status strategy and Limited Run's format policy read it |
| `is_game` bool | false for merch, vinyl, trading cards, club keys, `Shipping` products |
| `price` numeric(8,2), `currency` char(3) | from the variant; currency is a per-store constant (Shopify JSON carries none) |
| `availability` enum `preorder` \| `in_stock` \| `sold_out` \| `archived` | |
| `preorder_closes_at` date, `release_date` date, `release_precision`, `release_text` | parsed from tags and body text (§5.6) |
| `format_hint` enum `physical_format`, `format_tier` enum `store_text` \| `store_policy`, `format_evidence` text | from the classifier (§5.7); all NULL when nothing applied |
| `image_url` | store image, used only until an IGDB cover is linked |
| `igdb_id`, `match_confidence`, `igdb_cache` | as above |
| `edition_id` uuid FK → `physical_editions`, nullable | linked by `igdb_id` + `platform_id` + `region` first, then by `title_normalized` + `platform_id` + `region` |
| `raw` jsonb | product_type, tags, options, this variant's fields, body excerpt — enough to re-classify without refetching |
| `first_seen_at`, `last_seen_at`, `updated_at` | a variant not seen in the latest successful run for its store is marked `archived`, never deleted |
| unique | (`store`, `variant_id`) |

**`catalogue_runs`** — `id`, `source` (a store key, `nscollectors`,
`switch2tracker`, `igdb_platform`), `started_at`, `finished_at`,
`rows_seen`, `rows_resolved`, `unresolved_remaining`, `errors` jsonb. The
"last refreshed" stamps in admin read the latest finished row per source.

### 5.6 `backend/physical_sources/` — reading the stores

A package beside `sources/`, same conventions (pure parsers, recorded
fixtures, lazy config, per-source throttle), with a different interface:
`list_products() -> list[StoreProduct]` rather than search-and-fetch, where
a `StoreProduct` is already one row per platform variant.

**`STORES`** in `physical_sources/stores.py` is the data table, one entry per
store key, transcribed from the research doc (which is its fixture): the
first cut (D8) is `limited_run`, `iam8bit`, `strictly_limited`,
`premium_edition`, `nicalis`, `aksys_us`, `aksys_eu`, `fangamer`, `atari`,
`super_rare` (ten Shopify storefronts, nine publishers) and `pixelheart`,
`gamefairy`, `oneprint` (three WooCommerce). Each entry carries: `adapter`
(`shopify` | `woocommerce`), `domain`, `currency`, `region`, `collections`
(handles or category ids to walk), `title_strip` (regexes applied before
normalization: `^SW2#\d+: `, `^PRE-ORDER: `, `\((Switch 2|Nintendo Switch
2|Switch|PS5|Xbox)[^)]*\)$`, ` - Nintendo Switch™.*$`, `(Physical|iam8bit
.*)Edition$`, …), `platform` strategy (an ordered list of `option:Platform`,
`option:Edition`, `option:Video game platform`, `tags`, `product_type`,
`title_regex`, `sku_prefix`), `status` strategy (an ordered list of
`collection:<handle>`, `tag:<name>`, `title_prefix`, `badge_tag_regex`,
then `variant.available`), `game_filter` (product types, tags, or
categories that mark a real game), and `format_policy` (see §5.7).

- **`shopify.py`** walks `/collections/<handle>/products.json?limit=250&page=N`
  until an empty page; an empty first page is logged, because an unknown
  handle returns the same thing as an empty collection. Throttle 2 req/s per
  store. Explodes each product into one `StoreProduct` per platform variant.
- **`woocommerce.py`** walks `/wp-json/wc/store/v1/products?per_page=100&page=N&category=<id>`;
  `is_on_backorder` is the pre-order flag; prices arrive in minor units.
- **Limited Run HTML step** — for Switch 2 variants only, fetch the product
  page and regex the notes block for `Game Key Card` and `Estimated Ship
  Date: (.+)`, both theme blocks absent from every JSON endpoint (confirmed
  on the RAIDOU and Tomb Raider pages; re-confirm against the recorded
  fixture before coding the regex). One fetch per listing, throttled.
- **PrestaShop scrapers** (Red Art, Pix'n Love) are E10; the interface does
  not change when they land. Skip Forever Limited (no Switch 2 items,
  custom cart), Team17 (digital keys), PM Studios/PANAX (JS-rendered).

**Date and status parsing** is a pure function over collections seen,
tags, title, variant, and body: `PRE-ORDERS CLOSE ON (.+?)\.` →
`preorder_closes_at`; `Release Date: (.+)`, `Shipping Q([1-4]) (\d{4})`,
`Releasing (Spring|Summer|Fall|Winter) (\d{4})`, `EST (\d{4})`,
`Estimated Ship Date: (.+)` → `release_date` + precision; status from the
store's strategy list in order, with `variant.available` last as the
tiebreak (Strictly Limited had a `Sold Out` tag on an available item;
Premium Edition's only pre-order signal is collection membership).

**Title matching**: `year` for `matching.best_match` is `release_date.year`
when precision is `year` or finer, else None (confirm `best_match` accepts
None; the importer already passes it for undated detections). Candidates
come from `igdb.search(title_normalized, platform=platform)`, which falls
back to an unfiltered search on its own.

**Refresh**: `POST /api/physical/refresh` (admin) with an optional `stores`
list and `resolve_limit` (default 50) runs every requested adapter, upserts
`store_listings`, marks variants missing from a successful run as
`archived`, then resolves up to `resolve_limit` listings without an
`igdb_id` through the title matching above, fills `igdb_cache` for the
newly resolved in batches of 100, links `edition_id`, and records one
`catalogue_runs` row per store with `unresolved_remaining`. The store walk
is under a hundred requests; resolution is the expensive part (up to two
IGDB searches per listing), which is why it is bounded and the admin
button loops until `unresolved_remaining` is 0. Synchronous, reports per
store. Manual only, with a "last refreshed" stamp per source — no
background jobs (§12); if that ever changes, a weekly run of exactly this
endpoint is the one scheduled job worth having.

`POST /api/physical/refresh-registry` (admin, same `resolve_limit`) fetches
the NSCollectors Release Details and Upcoming CSVs (follow the 302 to
googleusercontent.com), upserts `physical_editions` with
`source = nscollectors`, retires rows absent from the run, resolves new
rows to IGDB within the limit, links `store_listings.edition_id`, then
**syncs items** (§5.8). The `switch2-tracker` JSON is fetched second and
only fills editions the sheet lacks (`source = switch2tracker`); it carries
no licence, so a snapshot is vendored into `tests/fixtures/` and the live
fetch is best-effort. `POST /api/physical/refresh-platform?platform_id=4`
ingests a cartridge-only platform's IGDB catalogue (`where platforms = (4)
& total_rating_count >= 5; limit 500`, paged) as `igdb_platform` editions.

Supporting routes: `GET /api/physical/status` (latest run per source, counts,
`unresolved_remaining`); `GET /api/physical/registry-lookup?title=&platform_id=&region=`
(the form's one-click fill, §4.9; returns the edition row or nothing);
`PATCH /api/physical/listings/{id}` and `PATCH /api/physical/editions/{id}`
accepting `igdb_id` (the Needs match link-by-hand; sets `match_confidence =
manual` and fills `igdb_cache`); `GET /api/igdb/platforms?q=` (the form's
platform search, proxied to `/v4/platforms` and cached for a day).

### 5.7 Deciding the format

`physical_sources/format.py`, pure, tested against every phrase in the
research doc. `classify(text, policy) -> Classification` with fields
`format` (enum or None), `tier` (`store_text` | `store_policy` | None),
`platform_override` (an IGDB platform id or None), `evidence` (the matched
phrase):

1. Strip false positives first: `download code for the .* soundtrack`,
   `code in the box for <bonus>` (any "code in the box" not preceded by the
   game's own title), `Steam Key`, `Teeto Key`.
2. Key-card and not-full-cart phrases → `game_key_card` / `code_in_box`,
   tier `store_text`: `game[- ]?key[- ]?card`, `download code in a box`,
   `code[- ]in[- ]a[- ]box`, `full game download via internet required`. The
   Fangamer phrase `includes the Nintendo Switch game and the Nintendo
   Switch 2 Edition upgrade pack` returns `game_card` with
   `platform_override = 130` — it is a Switch 1 cartridge sold on a Switch 2
   listing.
3. Full-cartridge phrases → `game_card`, tier `store_text`: `full game on
   cartridge`, `full physical cartridge`, `cartridge includes the full
   game`, `full game included on cartridge`, `is a game card`, `entire game
   data on cartridge`, `full game cartridge`, `game with cartridge`, `game
   on cartridge`, `complete (game, )?on disc/cartridge`, `region-free
   physical cart`, `switch case and cartridge`, `physical case and game`;
   title suffix `\(Game Card\)`.
4. Otherwise the store's `format_policy`, tier `store_policy`, else nothing.

`format_policy` per store, from the research: `limited_run` is `game_card`
only for variants whose `collections_seen` excludes `distro` (the numbered
line is full-cart by stated policy; partner items are not); every other
store is `None` — the stores that say "full game on cartridge" say it per
item, and the classifier reads it there.

**Collapsing to one answer.** Wherever several rows describe the same
`(igdb_id, platform_id)` — an item's registry match plus its store
listings, or a Discover candidate's rows — the format is chosen by tier
(`manual` > `cart_id` > `photo` > `registry` > `store_text` >
`store_policy` > `platform_policy`) **within the home region first**; if
the home region has no row at any tier, fall back to any region and mark
the result "from EUR" (D9). When the home-region answer is a key card but a
full-cart edition exists in another region, the candidate keeps the
key-card answer and carries a note ("Full game on cartridge in EUR — Red
Art"), so the toggle in §7.3 hides it but the note survives for when it is
shown.

For an **item**, the same order applies and the result is written to
`format_source`: a valid `cart_id`
(`\bL[PBNA]-[A-Z0-9]{5}-[A-Z0-9]{3}-[0-9A-Z]\b`; `LP` → key card, `LB`/`LN` →
game card, `LA` → a Switch 1 card, which on a Switch 2 item means the
platform is wrong and the API says so) beats a photo banner, which beats
the registry row for the item's platform and region, which beats store
text, store policy, and platform policy; `manual` beats everything.

### 5.8 Writing formats to items

`PATCH /api/items/{id}` and `POST /api/items` keep accepting every field,
with these server-side rules so the resolution order is enforced at the one
place writes happen:

- `format_source` is never accepted from a body. The server derives it: a
  valid `cart_id` in the body or already on the row → `cart_id` (and the
  format it implies overrides any `physical_format` in the same body; the
  response says so); an `edition_id` in the body (the one-click fill) →
  `registry`, copying that edition's format and cart ID; a
  `physical_format` alone → `manual`.
- A body with `physical_format: null` clears `format_source` and `cart_id`.
- A `cart_id` failing the regex is a 422. Its third segment sets `region`
  when the body does not.
- `platform` is resolved from `platform_id` by the server.
- The **registry sync** step of `refresh-registry` walks Switch 2 items
  whose `format_source` is NULL, `registry`, `store_text`, or
  `store_policy`, looks up their edition by `external_id` + `platform_id` +
  region, and writes the registry's format with `format_source =
  registry`. It never touches `manual`, `cart_id`, or `photo` rows. A
  disagreement between an item's `manual`/`cart_id`/`photo` value and the
  registry is computed from the join at read time and shown on the item
  edit page as a note (D9) — never written to the item, so nothing
  automated ever overrides what Joey or the cartridge said.

The **photo importer** stores what it already detects and two new things:
`platform` (free text) is mapped through `platform_id()` to
`platform_id`/`platform` on the rows it creates; two optional fields join
`DETECTION_SCHEMA` — `cart_id` (the product code if legible on the box or
label; discarded unless it matches the regex) and `key_card_banner` (true
only when the front of the case shows the white "GAME-KEY CARD" banner with
the key icon and QR code). A valid cart ID sets the format with
`format_source = cart_id`; `key_card_banner: true` sets `game_key_card`
with `format_source = photo`; `false` or absent sets nothing — absence of
the banner is not evidence of a full cartridge. The prompt describes both
tells.

## 6. Play Next (E8a) — the owned backlog

Deterministic, zero model calls, rerollable. The Playnite PlayNext scoring
model with Backlog Shuffle's two inputs and StoryGraph's three-named-cards
output.

### 6.1 Inputs

- **Time**: Any · Quick (under 6 h) · Evening (6–15 h) · Long (15 h+), scored
  against `time_to_beat.normally` as a soft term (§6.3), not a filter. A game
  with no estimate is neither favoured nor excluded, but cannot win the
  "Short and sweet" slot.
- **Mood** chips, multi-select, defined in a `MOOD_BUCKETS` table in the
  backend as sets of exact IGDB strings matched over genres ∪ themes ∪
  keywords (Cozy, Story, Action, Creepy, Brainy, Chaotic as the starting six).
  The strings must be copied from recorded fixtures, not typed from memory —
  IGDB's names are things like "Turn-based strategy (TBS)" and "Hack and
  slash/Beat 'em up", and "Roguelike" and "Deck-building" are keywords, not
  genres. Selected moods are hard filters; when they leave no candidate the
  response says so (`candidate_count: 0`) and the UI offers to relax the
  moods rather than showing an empty page.
- **Platform** chips built from the distinct `items.platform_id` values in
  the collection (labels from `items.platform`); none selected means all.
  Items with no platform set match every chip.

### 6.2 Candidates

Games with `owned_format IS DISTINCT FROM 'none'` and status `backlog` or
`active`, minus the pinned game, minus anything with a `never` pick event,
minus anything with a `skipped` event in the last seven days, minus the ids
the client sends in `exclude` (the current reroll's previous picks).

### 6.3 Scoring

**Reference items** are every game that is a favorite, rated, finished, or
abandoned. Each carries one weight, `w`, used for every attribute it has
(genres, themes, keywords, game modes, developer, player perspectives):

- base: favorite 1.0; finished 0.3; abandoned −0.5; a favorite that is also
  finished uses 1.0;
- plus a rating adjustment when rated: `(rating − mean) / (10 − mean)` above
  the collection mean, `(rating − mean) / mean` below it, 0 at the mean;
- clamped so a finished item never falls below 0.1 — rating a game you
  finished must never make it count for less than not rating it.

The **attribute table** maps each attribute value to the mean `w` of the
reference items carrying it. With no ratings at all, favorites and finishes
are the whole profile — the nudge in §4.9 exists for that reason.

Each candidate scores 0–100 on six terms; the total is
`Σ(weight × term) / Σ(weight)`, also 0–100, with weights in a
`PICKER_WEIGHTS` dict so they can be tuned without touching the algorithm:

| Term | Default weight | Definition (all 0–100) |
|---|---|---|
| affinity | 35 | `clamp(50 + 50 × mean_w, 0, 100)` where `mean_w` is the mean attribute-table value over the candidate's attributes (attributes absent from the table contribute 0); 50 when the candidate has no attributes |
| similarity | 20 | `100 × max(w, 0)` for the best-weighted reference item whose `similar_games` contains the candidate's id or whose id is in the candidate's `similar_games`; 0 when none |
| quality | 15 | `community_score` (already 0–100); 50 when missing |
| length fit | 15 | 100 for Any or when the estimate is unknown; otherwise, for a window `[lo, hi]`, 100 inside it, falling linearly to 0 at `lo / 2` below and at `2 × hi` above; Long has no upper edge |
| waiting | 10 | days since `acquired_at` (`started_at` for active items), 100 at 365 or more |
| jitter | 5 | random 0–100, re-drawn per request so Reroll reorders |

Then subtract 15 from the total for each `shown` event in the last fourteen
days, capped at −45 (staleness decay — Steam's "same three games for a year"
is the failure this prevents).

### 6.4 Output

Three cards, each with a **named reason** for its slot:

1. **Best fit** — highest total.
2. **Short and sweet** — highest total among candidates with `normally` ≤ 6 h
   (≤ the Quick window when Time is Quick). Omitted if nothing qualifies.
3. **Waited longest** — highest `waiting` among candidates whose affinity is
   at or above the candidate median. If an `active` game has no `shown`,
   `started`, or `pinned` event in thirty days, this slot becomes **Pick it
   back up** for that game instead.

No card repeats a game. Each card shows cover, title, year, time to beat,
genre chips, and two or three reason lines built from templates: attribute
overlap ("Shares Roguelike and Deck-building with Inscryption ♥"),
similarity ("IGDB lists it beside Hades II, which you rated 9"), length
("About 8 h — fits an evening"), waiting ("On the shelf since March 2026",
from `acquired_at`, never from `created_at`).

Actions: **Play this** (calls the pin endpoint, which sets status `active`,
`started_at` today if empty, `pinned_at` now, clears any other pin, and
records `pinned`), **Not tonight** (records `skipped`; client adds it to
`exclude`), **Never suggest** (records `never`), **Reroll** (re-requests with
`exclude` extended).

`pick_events`: `id`, `item_id` (FK, cascade), `action` enum
(`shown` | `skipped` | `never` | `pinned`), `created_at`. Every returned card
is written as `shown`. A `never` is undone by deleting it: the item edit page
shows "Excluded from Play Next" with a Restore control when one exists.

### 6.5 API and UI

- `POST /api/picker/next` `{time, moods, platforms, exclude}` (admin) →
  `{picks: [...], candidate_count, profile_size}`. A POST because it writes
  `shown` events. `profile_size` is the number of items that are rated or
  favorited (not merely finished); the UI shows the nudge when it is below
  five.
- `POST /api/picker/events` `{item_id, action}` and
  `DELETE /api/picker/events/{item_id}/never` (admin).
- `POST /api/items/{id}/pin` and `DELETE /api/items/{id}/pin` (admin). Pin is
  its own route rather than a PATCH field because it has to clear the previous
  pin and write the event in one transaction.
- Route `/admin/play-next`: controls on top, the three cards, Reroll. A
  pinned game shows above the controls as **Up next** with an Unpin.
- Public (D2): the pinned game appears on `/collection` as a single **Up next**
  card beside the favorites row. This ships with E8a, not E7a — the column
  and the endpoint that set it live here.

The scoring lives in a pure module (`backend/picker.py`) that takes items and
events as plain data and returns scored candidates, tested with fixtures and
no database — the `matching.py` pattern.

## 7. Discover (E8b) — not yet owned, available on a cartridge

The E6 pipeline with the research applied: retrieve → filter → deterministic
pre-score → one model re-rank → explain → persist. The retrieval step is the
physical catalogue, not IGDB: a game that has no row in `physical_editions`
or `store_listings` on a selected platform does not exist to Discover.

### 7.1 Generate

`POST /api/recommendations/generate` (admin) with body
`{kind: "discover", type: "game", popularity: "safe" | "balanced" | "deep",
window: "recent" | "any", platforms: [...], include_key_cards: false}`:

1. **Profile**: the reference items from §6.3, summarised as up to ten titles
   with ratings, the top five genres and themes by weight, top developers, and
   the titles of every `dismissed` recommendation as a do-not-suggest list.
2. **Seeds**: the top eight reference items by favorite, rating, and
   `times_completed`.
3. **Candidate universe**: every live `physical_editions` row
   (`retired_at IS NULL`, including the `igdb_platform` rows that make N64
   work) and every `is_game` `store_listings` row with `availability` in
   (`preorder`, `in_stock`) whose `platform_id` is in the request's
   `platforms`, **collapsed to one candidate per `(igdb_id, platform_id)`**.
   `platforms: []` means every platform the catalogue has; the UI's default
   is the distinct `items.platform_id` values in the collection, or
   `{508, 130}` when none is set yet (D5 would otherwise empty the pool on
   the current data). Rows with no `igdb_id` or no `platform_id` are skipped
   here and surfaced under Needs match (§7.3). Discover keeps only
   candidates that are **released** (`release_date IS NULL OR release_date <=
   today`); everything dated in the future belongs to Radar, so no game
   appears in both. The candidate's format is collapsed by the §5.7 rule
   (home region first, tier order, cross-region note); candidates whose
   format is `game_key_card` or `code_in_box` are dropped unless
   `include_key_cards`, and NULL (unknown) candidates are kept and marked.
   `window: recent` keeps `release_date >= now − 3y`.
   Drop anything owned (match `external_id` + `platform_id`, then title +
   year), anything whose recommendation status is `wanted`, `dismissed`, or
   `owned` **in either kind**, and the do-not-suggest titles. `pending` and
   `skipped` rows from earlier batches stay eligible: if one is chosen again
   it is **upserted** into the new batch (new `batch_id`, `reason`, `score`,
   `generated_at`) rather than inserted, which is what the unique key in
   §7.2 requires.
   The metadata for scoring is the `igdb_cache` on the catalogue rows
   (filled during refresh, §5.6, never per generate); a candidate whose
   rows all lack a cache is scored with affinity 50 and flagged in the
   response so the admin button can rerun the refresh.
4. **Pre-score** with the §6.3 affinity and similarity terms plus quality,
   then a popularity term from `log(total_rating_count)`: added for `safe`,
   ignored for `balanced`, subtracted for `deep`. Similarity now also counts
   the seeds' `similar_games` ids that appear in the universe — the forward
   and reverse IGDB queries of the earlier draft are replaced by this
   intersection, since the universe is already enumerated. Add +10 for a
   candidate currently on pre-order or in stock at a bookmarked store
   (buyable today) and −10 for an unknown format. Keep the top twenty and
   shuffle them (position bias).
5. **One model call** via `llm.complete_json`: the profile's reference titles
   as a numbered list, the twenty candidates as an indexed list (index, title,
   year, genres, themes, score, votes); schema
   `{picks: [{index: int, reason: str, based_on: [int]}]}` where `based_on`
   indexes the profile list; instruction to pick eight, favour variety across
   genres, name the owned titles behind each pick in `based_on` and in the
   reason, and never add a title that is not in the list. Validate every
   `index` and every `based_on` entry; drop anything invalid. If the call
   fails (429s will happen on the free tier) fall back to the deterministic
   top eight with template reasons and `reason_source = template` — the
   feature never blocks on the model.
6. **Persist** as one batch and return it.

### 7.2 `recommendations` table

| Column | Notes |
|---|---|
| `id` uuid | |
| `kind` enum `discover` \| `radar` | |
| `type` item_type | |
| `title`, `year`, `release_date` | |
| `external_source`, `external_id` | unique together with `kind` and `platform_id` — one row per game per platform per kind |
| `cover_url` | |
| `reason` text | |
| `reason_source` enum `model` \| `template` | which one wrote `reason` |
| `based_on` jsonb | ids of the collection items the pick was explained by; empty for template reasons that cite none |
| `score` smallint | pre-score, for sorting and debugging |
| `batch_id` uuid, `generated_at` | one generate call = one batch; a re-chosen row moves to the newest batch |
| `status` enum `pending` \| `wanted` \| `dismissed` \| `owned` \| `skipped` | |
| `platform_id`, `platform` | the platform the physical edition is for; part of the unique key |
| `physical_format`, `format_source`, `format_note` | best-evidenced format at generation time (NULL for unknown) and the cross-region note from §5.7 when there is one |
| `listing_ids` jsonb | the `store_listings` ids behind this row, for the store links and prices on the card |
| `source_metadata` jsonb | genres, themes, platforms (names and ids), scores, hypes, `similar_games`, release dates — enough to create an item without another fetch |

`skipped` is recorded but not excluded from future pools (skip is not dislike
— Steam's Discovery Queue got this wrong). `dismissed`, `wanted`, and `owned`
exclude the game from both kinds; `dismissed` is also listed in the prompt.
The upsert rule in §7.1 applies to Radar identically.

### 7.3 UI — `/admin/discover`

Controls (popularity three-way, window, platform chips, a **Show Game-Key
Cards** toggle off by default per D7) and a **Generate** button whose label
carries the budget: "Generate — uses one of today's Gemini requests". Cards
in the shared grid style with the reason beneath the poster, "Based on:
Inscryption, Hades II" from the row's `based_on` ids, genre chips, community
score, the **format chip** ("Full game on cartridge" / "Game-Key Card" /
"Format unknown"), and a **store line** from `listing_ids`: "Limited Run ·
$59.99 · pre-orders close Nov 8" or "Super Rare · £46.20 · in stock", each a
link to the product page. Actions: **Want** (`POST /api/recommendations/{id}/want`, server-side:
creates an item with `owned_format = none`, status `backlog`, and the
platform, format, format source, cart ID, release date, and metadata copied
from the row — the one path besides §5.8 that sets `format_source`, because
the row already carries its evidence — `is_public` true per D1; marks the
row `wanted`), **Not interested** (`dismissed`),
**Already own** (creates the item with `owned_format = physical` — the
collection's default reality — `is_public` false like every other new item,
and marks `owned`), **Skip**. Previous batches are listed by date beneath.

A **Needs match** panel at the bottom lists catalogue rows with no
`igdb_id` (the store title could not be resolved) or no `platform_id`, each
with a `MetadataPicker` and a platform select that write through
`PATCH /api/physical/listings/{id}` or `/editions/{id}` (§5.6); linked rows
join the next generate.

### 7.4 Other media

Films follow with TMDB `GET /movie/{id}/recommendations` for the top five
rated films as the pool, same pre-score and model step; the physical filter
is a games-only concern and does not apply to films. Comics and board games
keep the original E6 shape (model proposes, source search validates, misses
are discarded) and wait for ratings to exist on those types; board games wait
for BGG.

## 8. Radar (E8c) — not yet released, physical edition announced

Joey's addition: the engine should also note upcoming games of interest.
Radar is a Discover variant with a different pool and no model call, and it
is where the physical catalogue pays off most: a pre-order window at a
boutique store is a deadline, and the registry's Upcoming tab is the
announcement feed.

### 8.1 Generate

`POST /api/recommendations/generate` with `{kind: "radar", type: "game",
platforms: [...], horizon_days: 365, include_key_cards: false}`:

- **Pool**, three lanes, all from the catalogue, with the same platform
  defaults, `(igdb_id, platform_id)` collapse, Needs-match skipping, owned
  and status exclusions, and upsert rule as §7.1:
  1. `store_listings` with `availability = preorder` on a selected platform
     — sorted by `preorder_closes_at` (a closing window is the most urgent
     thing Radar can show), then `release_date`;
  2. live `physical_editions` **and** `store_listings` with a future parsed
     `release_date` (the NSCollectors Upcoming tab, store bodies with a
     date), day- or month-precision only — year-only and quarter-only rows
     go to a small **Dated later** list at the bottom rather than the month
     groups. Lanes 1 and 2 are one pool after the collapse: a Limited Run
     pre-order that is also an Upcoming row is one candidate carrying both
     the closing date and the registry's format;
  3. **Digital so far**: IGDB's own upcoming query (`where
     first_release_date > now & first_release_date < now + horizon &
     platforms = any of (…) & hypes >= 5; sort hypes desc; limit 100`) minus
     any `igdb_id` present in lanes 1–2 — games that are coming but have no
     physical edition announced. Shown collapsed under its own heading,
     never mixed into the physical lanes, so a hyped digital-only release
     cannot pass for a cartridge. Persisted with `physical_format` NULL and
     a `format_note` of "no physical edition announced".
  Format filtering as in §7.1; unknown formats kept and marked.
- **Score**: affinity (§6.3) + `log(hypes)` scaled + similarity against the
  reference items' `similar_games` + a +15 urgency term when a pre-order
  window closes within 30 days; lane 3 rows use their IGDB fields directly.
  Keep the top thirty across lanes 1–2, the top ten in lane 3.
- **Reasons** from templates: attribute overlap, "IGDB lists it beside
  Dredge", "Nintendo Switch 2 · Mar 2027", "Pre-orders close Nov 8 at
  Limited Run · $59.99", "Full game on cartridge (Red Art)", hype count.
  `reason_source = template`.
- Persist as a batch of kind `radar`; regenerating replaces that kind's
  `pending` rows and leaves `wanted`/`dismissed` alone.

### 8.2 UI — `/admin/radar`

Three sections. **Watching**: every item with `owned_format = none` and a
future `release_date` or an open pre-order at a linked listing, soonest
first, each with its store line and format chip — these are the want-list
entries with a deadline. The link from an item to its listings is the join
`store_listings.igdb_id = items.external_id AND store_listings.platform_id =
items.platform_id` (for `external_source = 'igdb'`), computed at read time;
nothing is copied onto the item. **Suggested**: the pending radar rows grouped by
month (pre-orders closing soonest pinned to the top of the group), each card
with cover, title, human date, platform, format chip, store line, hype
count, and reasons. **Digital so far**: lane 3, collapsed. Actions:
**Watch** (creates the want-list item exactly as Discover's Want does —
`owned_format = none`, status `backlog`, platform, format, `release_date`
set, `is_public` true per D1 — and marks the row `wanted`; it moves to
Watching), **Not interested**, **Skip**. A **Refresh** button first runs the
catalogue refresh (§5.6) and then regenerates, so Radar is never staler than
the stores; suggest weekly, never automatic.

Physical announcements that reach none of the configured sources (a
retail-only PS5 release, say) are added by hand through the existing picker
as a want-list item with the format set on the form.

### 8.3 Public

`/collection` gains an **On the radar** strip (D1): wanted items with a
future `release_date`, soonest first, each poster carrying the Upcoming
ribbon and the format mark. Radar suggestions that were not watched, store
prices, and pre-order windows are never public.

## 9. Public API changes

The allowlist pattern in `public.py` stays: fields are named by hand, and
nothing else leaks.

- `GET /api/public/items` adds `platforms`, `created_at` (for the "Recently
  added" sort), and `wanted` (bool, D1 — the value of `owned_format` itself
  stays private) in E7a; `release_date`, `themes`, `time_to_beat_hours`
  (`normally`, rounded), `platform`, `physical_format`, and `completeness`
  (D6) in E7b; `pinned` (bool, D2) in E8a, when `pinned_at` and the pin
  endpoint exist.
- `GET /api/public/items/{id}` (E7a) — everything above plus `description`,
  `community_votes`, `times_completed`, `started_at`, and
  `similar_in_collection`: up to eight other public items sharing a
  `similar_games` link or at least two genres, as minimal cards
  (`id`, `type`, `title`, `cover_url`) so the strip needs no second request
  against a sleeping backend. Unknown and non-public ids both 404 — a 403
  would confirm a private row exists.
- `GET /api/public/stats` adds `owned` (public items with `wanted` false —
  the hero number, since `total` will include the want list under D1),
  `finished_this_year`, `average_rating` (null when nothing is rated), and
  in E7b `by_platform` and `by_format` — the latter keyed by `platform_id`
  for platforms in `KEY_CARD_PLATFORMS` only, each value
  `{game_card, game_key_card, code_in_box, unknown, total}` over owned
  public games, for the "On cartridge" line.
- Never: `notes`, `owned_format`, `acquired_at`, `region`, `cart_id`,
  `format_source`, `pick_events`, `store_listings`, prices, recommendations
  of any kind, anything with `is_public = false`. The test that pins the
  public response model's field list asserts `cart_id` and `format_source`
  are absent.

Extend `PUBLIC_METADATA_FIELDS` deliberately for each new key; a test pins
the response model's field list.

## 10. Decisions

Approved by Joey on 2026-09-22, as recommended:

| # | Question | Decision |
|---|---|---|
| D1 | Expose the want list publicly (as a "Want" chip and the radar strip)? | **Yes** — as a boolean `wanted` only; `owned_format` stays private. |
| D2 | Show the pinned "Up next" game publicly? | **Yes.** |
| D3 | Add a `shelved` status (paused, not abandoned)? | **Not now.** "Never suggest" covers the picker's need. |
| D4 | Poster titles always visible, or hover-only like Letterboxd? | **Always visible**, two-line clamp. |
| D5 | Default platforms for Discover and Radar? | **The platforms present in the collection**, editable per generate. |

Open, from the physical-first revision:

| # | Question | Recommendation |
|---|---|---|
| D6 | Add `completeness` (loose / boxed / cib / sealed) for the N64 shelf, and show it publicly? | **Yes, in migration 0003**, nullable, shown on the form only for cartridge-era platforms; **public**, as a chip on the item page — it is collector vocabulary, not a price. It costs one column now and a second migration later. |
| D7 | Should Discover and Radar show Game-Key Card releases at all? | **Behind a toggle, off by default.** Excluding them entirely would hide the choice on games with no full-cart edition anywhere; showing them by default contradicts the point. The mark is always visible when the toggle is on. |
| D8 | Which stores in the first cut of the physical catalogue? | **The thirteen in `STORES` (§5.6)**: ten Shopify storefronts and three WooCommerce stores, all JSON. Red Art and Pix'n Love (PrestaShop, HTML scraping) as E10 — Red Art's labelling is the best in the set. Skip Forever Limited, Team17, PANAX. |
| D9 | Precedence when sources disagree on format — the NSCollectors sheet versus a store, or the USA row versus the EUR row? | **Home region first, then tier**: within USA the registry beats store text (a store's text describes an edition, the registry describes the cartridge); a cart ID, a photo banner, or a manual value on the item beats both. A full-cart edition that exists only in another region is kept as a note on the candidate, never used to relabel the USA copy. Disagreements are shown in admin so they can be reported upstream. |

## 11. Phasing

| Phase | Scope | Human prerequisite |
|---|---|---|
| **E7a** Shelf & showcase | §4 except the Upcoming ribbon, format mark, platform chips, and the time-to-beat tile; `GET /api/public/items/{id}`; the E7a fields in §9; admin shelf with quick-rate | none |
| **E7b** Metadata depth + schema | §5.1–§5.3 and migration 0003 (§5.2: the `items` columns, `pick_events`, `recommendations`); N64 in `PLATFORM_IDS`; the §5.8 write rules for platform, format, cart ID, region, and completeness on the forms (manual entry; no registry yet); the importer storing platform and reading cart IDs and the banner; bulk refresh with platform backfill; the Upcoming ribbon, format mark, platform chips, time-to-beat tile, "On cartridge" line, and E7b fields in §9 | apply migration 0003 to Neon before deploy; run the bulk refresh once; set platform and format on existing items as convenient (the registry sync in E7c will offer the rest) |
| **E8a** Play Next | §6 | rate the finished games and pick four favorites (the profile is empty otherwise) |
| **E7c** Physical catalogue | migration 0004 (§5.5); §5.4–§5.7: `physical_sources/` with the Shopify and WooCommerce adapters and `STORES`, the Limited Run HTML step, the format classifier, registry and platform ingest, IGDB resolution of catalogue rows, the refresh, status, lookup, and link endpoints, the registry one-click fill and registry sync (§5.8) | apply migration 0004 to Neon before deploy; none else (all sources are keyless); one recorded `products.json` fixture per store |
| **E8b** Discover | §7, games first; films after | none new (Gemini key exists); an Anthropic key removes the 20/day cap |
| **E8c** Radar | §8 | none |
| **E9** (optional) Year in review | `/collection/2026`: hero numbers, top-rated posters, status bar, finishes by month, a by-release-decade row, highs and lows — composed from §4.6 blocks plus a `by_release_decade` stats field added then, not before | none |
| **E10** (optional) PrestaShop stores | Red Art and Pix'n Love scrapers behind the same `physical_sources` interface (D8) | none |

E7a has no schema or external dependency and the most visible payoff; it
ships first. E7b carries every `items` change in one migration; the
catalogue tables wait for E7c's own migration because their shape will be
tested against real store data as the adapters are written. E8a follows
E7b immediately because it needs nothing physical and is the feature used
most evenings. E7c before E8b and E8c because both read the catalogue; E8b
and E8c are then independent of each other.

Each phase ends with tests in the existing pytest/vitest patterns, a passing
`npm run build`, and a `CLAUDE.md` TODO update. Scoring (`picker.py`) and the
recommendation pre-score are pure functions with fixture-based tests; source
parsers get recorded fixtures as `sources/README.md` requires.

## 12. Non-goals

- No background jobs or scheduled generation or catalogue refresh (free
  tiers; BGG throttle). The one candidate for a future exception is a
  weekly `POST /api/physical/refresh`.
- No HowLongToBeat scraping — IGDB's `game_time_to_beats` is the length source.
- No local image cache; no new image sources (the item hero is the cover;
  store images are used only until an IGDB cover is linked).
- No collection valuation or price history. PriceCharting's API is a
  $49/month tier whose terms forbid third-party-visible display; store
  prices in `store_listings` are for the admin card only.
- No scraping of Nintendo's storefront, Deku Deals, or editorial lists —
  the registry and the stores cover what they do, and Deku Deals is used
  only as an outbound link.
- No headless-browser scraping (PANAX, Nintendo Wire); no PrestaShop
  scrapers until E10.
- No diary/plays table, lists, or social features.
- No Steam or console library import.
- No model calls in Play Next or Radar; one per Discover generate.
- No multi-user, no public write.

## Source references

- Research summary: `2026-09-22-tracker-design-research.md` — sites
  surveyed, patterns, pitfalls, and the LLM literature cited above.
- Physical sources: `2026-09-22-physical-sources-research.md` — per-store
  endpoints, collection handles, tag vocabularies, every format phrase
  observed, the cart-ID prefixes, the NSCollectors sheet and
  `switch2-tracker` details, and the N64 catalogue options. The store table
  in `physical_sources/stores.py` is transcribed from it.
- IGDB `game_time_to_beats` (seconds; batch by `game_id`): confirmed in
  third-party integrations (Questarr PR #1063); IGDB upcoming query shape
  (`hypes`, `status`, `first_release_date`): bielacki/igdb-mcp-server. Both to
  be re-confirmed against the live API per `sources/README.md`.
- Gemini free-tier daily cap: measured, `backend/llm.py`.
