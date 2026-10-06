# `physical_sources/` — the physical catalogue's sources

Which games exist physically, and as what, for games the owner does not own:
the r/NSCollectors Switch 2 registry and its Switch 1 sheet, `switch2-tracker`
as a cross-check, twelve boutique stores and IGDB's N64 catalogue, read into
the E7c tables (migration `0005`; the Switch 1 sheet needed no migration).
Spec: `docs/planning/2026-09-23-tracker-e7c-design.md`; the plan's Execution
summary records every way the live sources differed from it. The Switch 1
sheet's spec and plan are `docs/planning/2026-10-04-switch1-catalogue-*`.

## Why

Discover (E8b) and Radar (E8c) are physical-first: a game with no known
physical edition does not exist to them, and a Game-Key Card must never pass
for a cartridge. IGDB has no idea what a Game-Key Card is, Nintendo's pages do
not mark one, and `items` only knows the copies already owned. The answer is
assembled here from sources that each know a part of it.

## The modules

| Module | Does | Pure |
|---|---|---|
| `base.py` | `EditionRow`, `StoreProduct`, `PhysicalSourceError`, the per-host throttle, `plausible_price` | yes |
| `limits.py` | every tunable number, and the format constants `formats.py` also uses | yes |
| `courtesy.py` | robots.txt per RFC 9309 | yes (one GET) |
| `format.py` | `classify(text, policy, platform_id)`: key card, code in a box or cartridge from a listing's words | yes |
| `parse.py` | dates with their precision, availability, edition labels, store titles, platform labels | yes |
| `registry.py` | the sheet's two details tabs through the Google Sheets API | yes (three GETs: the tab list, then each tab) |
| `registry_switch1.py` | the Switch 1 sheet's Master and code-in-a-box tabs (source `nscollectors_ns1`), through `registry.py`'s helpers | yes (three GETs) |
| `tracker.py` | `switch2-tracker`'s `data/games.json` | yes (one GET) |
| `stores.py` | `STORES`, and the interpreters that read a product through its store's config | yes |
| `shopify.py`, `woocommerce.py` | one listing per variant; the Limited Run HTML step | yes (their `list_products`) |
| `collapse.py` | one honest format per game and platform; the item note | yes |
| `catalogue.py` | runs, edition and listing upserts, retire and archive | database |
| `resolve.py` | matching rows to IGDB games; link, ignore, re-key | database |
| `platform_policy.py` | the N64 ingest | database |
| `switch1_titles.py` | bulk matching of Switch 1 keys to IGDB's Switch list, by name and year | yes |
| `switch1_ingest.py` | the Switch 1 refresh: IGDB's title list, editions, match decisions, snapshots; the automatic-ignore rules | database |
| `sync.py` | registry formats onto owned items; disagreements | database |

"Pure" means no FastAPI and no SQLAlchemy in the import graph;
`tests/test_physical_imports.py` imports each pure module in a fresh
interpreter and fails if either appears. That is why `formats.py` imports the
shared constants from `limits.py`, not the other way round. The routes are
`physical_routes.py`, one level up.

## Fixtures first

No parser is written before its fixture exists. Every `parse_*` and
`explode` is tested on real bytes in `tests/fixtures/physical/`, recorded by
`scripts/record_physical_fixtures.py` (see `scripts/README.md`), never on a
shape remembered from the research. The first recording changed the plan in a
dozen places; that is the point of it.

Re-record a source when its handles or columns change, commit the changed
files, and fix what the new shape breaks. Never edit a fixture by hand. The
store fixtures hold every page (`--all-pages`), because the key-quality test
has to see every title a refresh keys; the route tests serve page 1 only.

## The sources

**Registry** — two tabs of the NSCollectors sheet, found by gid (titles
change, gids do not): Switch 2 Release Details `764784245` and Upcoming
Switch 2 Releases `238551450`. Both have the Details layout; each row is one
edition of a title in a region, dated by its own `Release Date`. Neither
summary tab is read. An edition is keyed by title, region, publisher and card
type, because WWE 2K25 EUR has a Game-Key Card and a Code in a Box from one
publisher. `TBC` and a blank upcoming card type mean `is_physical = NULL`.

Every source's key goes through `strip_title` (`game_title()` for the
registry and tracker, which first moves the sheet's trailing ", The" to the
front), then `matching.normalize_title`, which folds accents ("Pokémon" keys
as `pokemon`: IGDB's search ignores accents). `strip_title` removes, in
order: the store's own patterns; a leading "ONLINE EXCLUSIVE (EDITION):";
"Nintendo Switch 2 Edition" and everything after it (a bundled expansion, a
pack); bracket groups naming a platform, a region, an edition, a version,
a rating board, extras or a pre-order (`(NSW)`, `[PlayStation 5]`,
`(Japanese Version)`, `[PEGI]`); printing notes (First Press SE, Limited to
1,000, "- Standard Cover", "- Preorder", "- Standard Release"); then, for up
to four passes, platform tails after a dash, colon, "for" or an unclosed
opener (`for Nintendo Switch™ and PlayStation 4`), a run of one to four
**packaging** words before "Edition" (`Special Limited Edition`,
`- Extra Elite Edition`, with a following "Box"), packaging words in front
of a named edition, a run ending in "Collector's" or a lone "LE"/"CE" at the
end, and a bundle suffix led by merch words (`Plushie Bundle`). Deluxe,
Complete, Definitive and Ultimate count as packaging only right before
"Edition": "Spelunker HD Deluxe Collector's Edition" keeps "Deluxe".

What stays is the game's own name, including a **named** edition ("Elden
Ring Tarnished Edition", "Tales of Arise - Beyond the Dawn Edition"): IGDB
lists many of them as the Switch game itself, in brackets too ("Elden Ring
(Tarnished Edition)"). A "Bundle" not led by merch words stays, labelled or
not ("Taito Milestones 1&2 CE Bundle"), since the title cannot say whether
it holds one game or several. When a named
edition's full name finds nothing, Resolve retries with words before
"Edition" dropped, keeping at least two (`edition_fallbacks`), and what a
shorter query finds waits in Needs match: "Hades II Olympian Edition"
shortened to one word would otherwise link the first game.

`PLATFORM_WORDS` lists what a key never keeps. `tests/test_physical_keys.py`
holds every recorded key to it, to a list of packaging leftovers, and to
being a fixed point of the cleaner; `test_physical_parse.py` pins each shape
by its raw title. The raw title is kept, so changing the key updates a row
in place. `strip_title` collapses whitespace before any pattern runs, and
on collapsed text every pattern takes bounded time; timing cases put each
rule through `game_title` on a 50k-character title. The patterns are not
safe on raw text, so nothing outside `parse.py` should use them. It never
returns an empty string.

Accent folding also changes the registry's and tracker's `source_ref`
(built from `normalize_title`): on the first refresh after it shipped, the
14 accented registry rows (Pokémon Legends: Z-A, Pokémon Pokopia) were
inserted as new rows and the old ones retired. Letters with no
decomposition (`ø`, `æ`, `ł`) are still dropped.

A refresh that changes a row's (title, platform) key clears its `igdb_id`:
the match decided under the old key says nothing about the new one. Resolve
then links it through the new key's decision, or searches the key if none
exists. An N64 edition carries its own id and keeps it. A Switch 2 key that
any row spells as a "Nintendo Switch 2 Edition" is searched on Nintendo
Switch with no year, because IGDB tags the base game Switch 1 only and dates
it years before the upgrade. IGDB's separate Switch 2 Edition entries are
never the target.

The sheet is read through the Sheets API with `GOOGLE_SHEETS_API_KEY`,
because `docs.google.com/robots.txt` disallows the CSV export. Without the
key the registry run records `sheets_not_configured` and everything else
still runs. No error raised by `registry.py` carries a request URL, so the key
never reaches a log.

**`switch2-tracker`** — a cross-check, second to the sheet: the collapse
drops it wherever the sheet speaks for the same region. Keyed by title and
region, never by its shifting `id`. The repository has no licence, so the
fixture is a 30-game excerpt.

**Switch 1 registry** — the r/NSCollectors "Switch Physical Releases" sheet
(`1FNyvbbU64Pb9lheg28gC_5fMalIYJ0aD763T7M1QqF0`), a different spreadsheet from
the Switch 2 one, read by `registry_switch1.py` with `registry.py`'s helpers
(`fetch_properties`, `fetch_tab`, `tab_titles` take a `sheet_id`; `merge` and
this module share `unique_by_ref`). Two tabs, found by gid: Physical Release
Master `2004832329` and CIAB `1406641930`, recorded under
`tests/fixtures/physical/registry_switch1/` (whole, except that the recorder
blanks Master's LP #, Other Info, Verified By and Check cells, which the
parser never reads). Source `nscollectors_ns1` (`physical_editions.source`
is 20 characters), platform 130, **all regions**: the sheet lists every
region and the collapse is region-free (see Formats).
About 4,500 titles in about 10,000 editions: the 2026-10-04 recording has
4,460 Master titles, 4,497 keys and 10,264 editions. A run's `rows_seen`
counts editions, not titles.

- A Master row with a Switch 1 cart ID is a `game_card` at the `registry`
  tier; a row without one is physical with no format. The cart ID pattern is
  `SWITCH_1_CART_ID_PATTERN` in `limits.py`, not the Switch 2 `CART_ID_PATTERN`
  (which matches no Switch 1 ID): `LA-H-XXXXX-RRR`, optionally with a revision
  digit after the region (`LA-H-A5RBA-EUR1`) or an `LB-` prefix
  (`LB-H-BK6RA-CHT`). A cell naming two carts ("A / B") is read as its first.
- A CIAB row marked "CIAB only? = Yes" is a `code_in_box`; "No" adds nothing,
  because its cartridge is already in Master.
- Every Switch 1 cartridge counts as the full game: no source flags the rare
  download-required ones.
- An edition is keyed by title, region, publisher, tab and edition info.
- A row whose region is longer than `physical_editions.region` (4
  characters) is skipped and named in a `region_too_long` warning, rather
  than failing the whole run's flush.
- Its release dates are **not registry dates**. `collapse.REGISTRY_SOURCES`
  deliberately leaves `nscollectors_ns1` out, because the public date rule
  (`next_list.PUBLIC_DATE_SOURCES`) publishes only registry-dated rows and
  nothing from this sheet may reach a public route. Do not add it there.
  (`physical_routes.py` has `STATUS_REGISTRY_SOURCES`, which only decides
  what the status route lists, and does include it; `tests/test_public_outputs.py`
  puts a dated Switch 1 cartridge through a real Radar generate and holds
  `/api/public/next` empty.)
- Its formats feed the collapse only. `sync.py` still writes registry formats
  onto owned Switch 2 copies alone (`KEY_CARD_PLATFORMS`).

`POST /api/physical/refresh-switch1` (the "Refresh Switch 1" button) reads the
sheet, then pages IGDB's whole Switch list by id (`switch1_titles.page_query`:
id, name, first release date and alternative names, 500 per page, one request
per 500 Switch games), both before anything is written: without the title
list every key would fall to Resolve, thousands of searches. `switch1_titles.match` is pure. A key is
looked up in the exact table (each game's name and alternative names through
`normalize_title`) and only if that knows nothing in the stripped one (the
same names through `game_title` first, so "Hades Deluxe Edition" answers
"hades"). One game found is the match; several are told apart by the sheet's
earliest year for the key, exactly one within `YEAR_TOLERANCE` (one year);
anything else is no match. Then `switch1_ingest.record_matches` decides each
open key (no decision yet, or an automatic ignore):

- a match is `AUTO` / `EXACT`;
- no match is `IGNORED` with `match_confidence = UNCERTAIN`, the marker of
  an **automatic ignore**. `resolve.ignore` writes a human's ignore with
  `match_confidence = NULL`, and nothing else writes `IGNORED` + `UNCERTAIN`,
  so the matcher revisits only its own ignores (a title IGDB adds later, or a
  store starts selling) and never a human's, a manual link or any other
  decision. Automatic ignores never enter Needs match; the catalogue page
  counts them ("N Switch 1 titles unmatched", `totals.switch1_unmatched` from
  `count_unmatched`: automatic ignores on 130 that a live `nscollectors_ns1`
  edition still carries) and lists none;
- **the store-listing exception:** a key with no match that a live Switch 1
  store listing carries is not ignored. Its automatic ignore, if any, is
  deleted and Resolve searches it, so a store's game is never hidden by the
  sheet's spelling. This holds after later store refreshes too: the stores
  route (`POST /api/physical/refresh`) calls `release_listed_ignores` before
  its resolve batch.

Matched games get snapshots through `resolve.fill_games`, and `propagate`
copies each key's decision onto the editions. `propagate` protects
`igdb_platform` rows (N64 editions carry ids straight from IGDB) and
deliberately not these: Switch 1 editions carry no id of their own, and a
later manual link in Needs match must be able to override an automatic one.

Switch 1 keys are not in `test_physical_keys.py`'s corpus: that test holds
store and Switch 2 keys to the key-quality rules, and holding about 4,500
community titles to them is separate work.

**Stores** — `STORES` in `stores.py`, as of the 2026-09-25 fixtures:

| Store | Adapter | Currency / region | Collections walked |
|---|---|---|---|
| `limited_run` | Shopify | USD / USA | `coming-soon`, `latest-releases`, `distro`, `the-lr-vault`, `in-stock-switch` |
| `iam8bit` | Shopify (`www.`) | USD / USA | `games`, `nintendo`, `pre-order`, `new`, `restock` |
| `strictly_limited` | Shopify (`www.`) | EUR / EUR | `nintendo-switch-2`, `nintendo-switch`, `pre-order`, `coming-soon`, `in-stock` |
| `premium_edition` | Shopify | USD / USA | `pre-order`, `latest-preorders`, `coming-soon-2`, `in-stock`, `in-stock-partners` |
| `nicalis` | Shopify | USD / USA | `nintendo-switch-2`, `nintendo-switch`, `new` |
| `aksys_us` | Shopify | USD / USA | `preorder-now`, `new-releases`, `switch` |
| `aksys_eu` | Shopify | GBP / EUR | `nintendo-switch™-1`, `nintendo-switch-game`, `pre-order-now`, `buy-now`, `sold-out` |
| `fangamer` | Shopify (`www.`) | USD / USA | `physical-games`, `video-games` |
| `super_rare` | Shopify | GBP / EUR | `switch-2`, `switch`, `srg-store-new-web` |
| `pixelheart` | WooCommerce (`www.`) | EUR / EUR | category 65 |
| `gamefairy` | WooCommerce | USD / USA | category 22 |
| `oneprint` | WooCommerce | USD / USA | category 18 |

Atari is out: since 2026-09-25 its `products.json` answers every client with a
Cloudflare bot challenge, and getting past bot detection is off the table.
Limited Run's `all`, `archive`, `in-production` and `all-in-production` are
never walked. Each store's platform, status and game-filter steps are in its
row, with the reasons beside the odd ones. A platform the codebase has no
verified IGDB id for (SNES, Genesis, Game Boy…) is stored as a label with no
id: known, never resolved, never queued for a match.

**N64** — `platform_policy.py` pages IGDB for N64 games with at least five
ratings (234 on 2026-09-25, every one with a cover) into `igdb_platform`
editions with their ids set directly, and decides their title matches so a
store's N64 listing links without a search. Switch 1 is cartridge-only too,
but IGDB is never a physical source for it, because IGDB cannot tell a
physical Switch game from a digital one (`POST /api/physical/refresh-platform`
refuses platform 130 with a 422, and `test_switch_1_is_never_ingested` holds
it): its candidates come from the stores and the Switch 1 registry above.

## Formats

`format.py` runs the spec's steps in order: strip false positives (a
soundtrack's download code, a bonus game's code in the box, Steam and Teeto
keys); key-card and code-in-a-box phrases; Fangamer's upgrade-pack sentence,
which makes a "Nintendo Switch 2 Edition" a Switch 1 cartridge; full-cartridge
phrases; the store's policy; then the cartridge-only platforms. Silence is
never a cartridge. The policy and the text speak only for the catalogue's
platforms, so a PS5 variant of a Switch game gets no format from text about
the Switch.

`collapse.py` turns a game's rows into one answer (D9): any full cartridge in
the home region wins; otherwise the most useful known format; tiers only break
ties between rows saying the same thing, then source, then region and route,
so the answer never depends on the order the rows arrive in. A cartridge in
another region is a note ("Full game on cartridge in EUR — Super Rare"),
never a relabel.

**Switch 1 is the exception** (`REGION_FREE_PLATFORMS` in `limits.py`, which
holds platform 130): it has no Game-Key Card and no region lock, so a full
cartridge in *any* region makes the game a cartridge, and a home-region row
saying the same is preferred so the answer reads from home when it can. Switch
2 keeps the home-region rule, because a Japanese cartridge and a US Game-Key
Card are different products. `nscollectors_ns1` sits after `nscollectors` in
`SOURCE_ORDER`, and the sheet's dates never become registry dates (see the
Switch 1 registry above).

## Courtesy

Every request carries `USER_AGENT` (the site and a contact address) and is
spaced at two per second per host. Each host's robots.txt is read once per
run and every path is checked by RFC 9309: longest match wins, `Allow` wins a
tie, `*` and `$` are wildcards. `urllib.robotparser` is not used: it applies
the first matching rule, and every Shopify file opens with `Allow: /`. A 4xx
robots.txt means no rules; a 5xx or a network failure means the host is
skipped for the run. Patterns are matched in linear time: a regex joining
the pieces with `.*` backtracks exponentially on a star-heavy pattern, and
robots.txt is third-party text. Redirects are followed only within a store's
own site over https; one that leaves it is recorded as `redirected_off_site`.
A walk stops at a short page, a page that adds nothing new, or `MAX_PAGES`.

## Adding a store

1. Record its handles: add them to `SHOPIFY_STORES` or `WOO_STORES` in
   `scripts/record_physical_fixtures.py`, run it for that store, and commit the
   fixtures.
2. Read the fixtures: product types, option names, SKU shapes, tags, title
   prefixes, what "pre-order" looks like, what counts as merch.
3. Add a `StoreConfig` row to `STORES`: platform steps, status steps, game
   filter, title strips, and a format policy if the store states one.
4. Add tests on the fixture in `test_physical_shopify.py` or
   `test_physical_woocommerce.py`; the coverage test already demands that
   every handle yields a game on a catalogue platform.
5. Check the host's recorded robots.txt allows every path the adapter reads.

No adapter code changes for a store on Shopify or WooCommerce.
