# `physical_sources/` — the physical catalogue's sources

Which games exist physically, and as what, for games the owner does not own:
the r/NSCollectors Switch 2 registry, `switch2-tracker` as a cross-check,
twelve boutique stores and IGDB's N64 catalogue, read into the E7c tables
(migration `0005`). Spec: `docs/planning/2026-09-23-tracker-e7c-design.md`;
the plan's Execution summary records every way the live sources differed from
it.

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
| `tracker.py` | `switch2-tracker`'s `data/games.json` | yes (one GET) |
| `stores.py` | `STORES`, and the interpreters that read a product through its store's config | yes |
| `shopify.py`, `woocommerce.py` | one listing per variant; the Limited Run HTML step | yes (their `list_products`) |
| `collapse.py` | one honest format per game and platform; the item note | yes |
| `catalogue.py` | runs, edition and listing upserts, retire and archive | database |
| `resolve.py` | matching rows to IGDB games; link, ignore, re-key | database |
| `platform_policy.py` | the N64 ingest | database |
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
files, and fix what the new shape breaks. Never edit a fixture by hand.

## The sources

**Registry** — two tabs of the NSCollectors sheet, found by gid (titles
change, gids do not): Switch 2 Release Details `764784245` and Upcoming
Switch 2 Releases `238551450`. Both have the Details layout; each row is one
edition of a title in a region, dated by its own `Release Date`. Neither
summary tab is read. An edition is keyed by title, region, publisher and card
type, because WWE 2K25 EUR has a Game-Key Card and a Code in a Box from one
publisher. `TBC` and a blank upcoming card type mean `is_physical = NULL`.

A row's match key is its base game: `game_title()` in `parse.py` moves the
sheet's trailing ", The" to the front, then `strip_title` cuts "Nintendo
Switch 2 Edition" and everything after it (a bundled expansion, a pack), so
`Legend of Zelda: Breath of the Wild Nintendo Switch 2 Edition, The` keys as
`the legend of zelda breath of the wild` and meets the store listings for it.
Resolve searches IGDB with the same title. The raw title and `source_ref` are
kept, so changing the key updates a row in place. The tracker keys the same
way. Because both go through `strip_title`, a registry or tracker title also
loses an '<label> Edition' phrase (`Shinobi: Art of Vengeance - Deluxe
Edition` keys as `shinobi art of vengeance`), and a store title is cut at the
Switch 2 Edition phrase too. `strip_title` collapses whitespace before any
pattern runs and never returns an empty string: the titles are third-party
text.

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
but is never ingested: its candidates come only from the stores.

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
ties between rows saying the same thing. A cartridge in another region is a
note ("Full game on cartridge in EUR — Super Rare"), never a relabel.

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
