# Physical-Release Data Sources — stores, Game-Key Card detection, N64

Research conducted 2026-09-22 for the physical-first revision of the tracker
enhancement spec. Every endpoint, label, and quote below was fetched that day;
failures are listed rather than guessed around. Companion to
`2026-09-22-tracker-design-research.md`.

Starting point: the 16 sites in Joey's "Phsyical Games" bookmarks folder,
plus Super Rare Games. Two questions: how to read each catalogue by machine,
and how to tell a full-game cartridge from a Game-Key Card or code-in-a-box.

## 1. The stores

Eleven storefronts are Shopify with the public `/products.json` enabled;
three are WooCommerce with the Store API open; two are PrestaShop (JSON API
locked, HTML only); one is a custom PHP cart; two have no usable physical
catalogue. No store's `robots.txt` disallows the JSON endpoints or sets a
crawl delay, and no FAQ or policy page fetched contained anti-automation
language. Shopify returns `{"products": []}` for an unknown collection
handle, not a 404 — an empty result never proves a handle exists.

| Store | Platform | Catalogue endpoint | Useful collection handles / categories | Platform label lives in | Pre-order signal | Currency |
|---|---|---|---|---|---|---|
| Limited Run Games | Shopify | `/collections/<h>/products.json` | `coming-soon`, `latest-releases` (pre-order), `all-in-production`, `distro`, `the-lr-vault` (in stock), `archive`; no platform handles | option `Platform`; tags `Switch 2`, `Switch`, `PS5`; SKU `NS2-`/`NSW2-`; title "(Switch 2, PS5, Xbox)" | tags `Coming Soon` / `On Sale Now` / `Archive` / `Shipping`; body "PRE-ORDERS CLOSE ON …"; "Estimated Ship Date: Dec 1 - Jan 31 2027" on the HTML page only (a theme block, absent from every JSON endpoint, like the key-card note) | USD |
| iam8bit | Shopify | same | `games`, `nintendo`, `pre-order`, `new`, `restock` | tags `Nintendo Switch 2`, `Physical Edition Game`; option `Platform` or `Style`; SKU `-N2-EE` | tags `pre-order` / `sold-out`; body "Shipping Q4 2026" | USD |
| Strictly Limited Games | Shopify | same | `nintendo-switch-2`, `nintendo-switch`, `pre-order`, `coming-soon`, `in-stock`, `*-in-stock`, `ps5` | product_type "Nintendo Switch 2 Collector's Edition" etc.; tags `NSW2`; title "(Nintendo Switch 2)" | tag `Pre-order` / `Sold Out` (advisory — trust `variants[].available`) | EUR |
| Premium Edition Games | Shopify | same | `pre-order`, `latest-preorders`, `coming-soon-2`, `in-stock`, `in-stock-partners` | product_type "Nintendo Switch Games"; tags | collection membership; body "EST 2026: Coming Soon" | USD |
| Nicalis | Shopify (Hypergun theme) | same | `nintendo-switch-2`, `nintendo-switch`, `playstation-5`, `new` | option `Platform` ("Nintendo Switch™ 2"); tags; SKU `-NSW2-` | tag `Preorder`; body "Release Date: November 19, 2026" | USD |
| Aksys (store.aksysgames.com; EU store separate) | Shopify | same | `preorder-now`, `new-releases`, `switch`, `ps5` | title "- Nintendo Switch™"; SKU `SW-`; option `Platform` when multi | title prefix "PRE-ORDER: "; body "Releasing Fall 2026!" | USD (EU: GBP) |
| Fangamer | Shopify | same | `physical-games`, `video-games`, `games`, `collectors-editions` | tags `platform_Nintendo Switch 2`, `physical game`; option `Edition`; SKU `-NS2` | tag `preorder` | USD |
| Atari | Shopify | same | `games`, `physical-games`, `physical-cartridges` | option `Video game platform`; tags `Nintendo Switch 2`, `physical`, `USONLY` | tag `__pre-order::PRE-ORDER\|#…` | USD |
| Super Rare Games | Shopify | same | `switch-2`, `switch`, `playstation`, `srg-store-new-web`, `low-stock` | product_type `Switch 2` / `Switch`; title "SW2#02: …"; tags | tag `pre-order`; `/pages/shipping-dates` text | GBP |
| PixelHeart | WooCommerce | `/wp-json/wc/store/v1/products?per_page=100&category=<id>` | category `nintendo-switch` (65); no Switch 2 yet | attribute `Platform`; name "SWITCH [EUR] – PXM #17" | `is_on_backorder: true` | EUR |
| GameFairy | WooCommerce | same | category `nintendo-switch` (22) | in the name | none (in stock only) | USD |
| 1Print Games | WooCommerce | same | category `switch` (18) | name "(Nintendo Switch)" | none | USD |
| Red Art Games | PrestaShop | HTML only (`/api/` → 401) | `/49-nintendo-switch-2`, `/18-pre-orders`, facet `?q=Platform-Nintendo+Switch+2` | title "Nintendo Switch 2 Edition™ (Game Card)" | "Release Date: …", "Production 80%" | EUR |
| Pix'n Love | PrestaShop | HTML only (`/api/` → 401) | `/106-pre-orders`, `/100-nintendo-switch` (Switch 2 items live here) | title "… Nintendo Switch 2" | label Pre-order; "Release date: October 2026" | EUR |
| Forever Limited | Quick.Cart (custom PHP) | HTML only | `/games,37.html`, `/new,21.html` (23 games, all Switch 1 at fetch time; no Switch 2 items) | title suffix "EXCL NS" / "LTD NS" | literal "[IN STOCK]" | EUR |
| Team17 | HubSpot + Xsolla | none | — | — | — | digital keys only; skip |
| PM Studios / PANAX | Webflow / Next.js | none (JS-rendered) | — | — | — | skip until it exposes data |

Shopify field notes: `products.json` items carry `id`, `title`, `handle`,
`body_html`, `published_at`, `updated_at`, `vendor`, `product_type`, `tags`,
`options`, `variants[]` (`title`, `option1`, `price`, `sku`, `available`,
`inventory_quantity`), `images[]`. Prices are bare strings with no currency —
the currency is a per-store constant. Paginate with `?limit=250&page=N`;
`/collections/all.atom` is a cheap change-detection feed. Premium Edition's
handles do not match titles (a reused `…-copy` handle) — key rows on `id`.
WooCommerce Store API prices are minor units with `currency_minor_unit`;
`is_on_backorder` is the pre-order flag.

Noise to filter: merch, vinyl, cassettes, trading cards, keychains,
`Shipping` products, Super Rare's zero-priced "Teeto Key" club items (tag
`clubproducts*`), soundtrack download codes.

## 2. Telling a Game Card from a Game-Key Card

Nothing first-party is machine-readable. Nintendo's US product pages list
only a "Digital" edition for third-party titles and carry no key-card text;
the US store's Edition facet has Physical but no key-card value; Nintendo
Europe's search API has a `physical_version_b` flag that was `false` for
three games with physical releases; IGDB's schema has no key-card concept
(only a deprecated physical/digital enum on external store listings);
PriceCharting and MobyGames do not record it. Detection therefore rests on
three community sources, one deterministic tell, and per-store text.

### 2.1 The cart ID (deterministic)

Switch 2 product codes are printed on the cartridge label and on the box:
`LP-` prefix means Game-Key Card; `LB-` is a Switch 2-only full game card;
`LN-` is a Switch 2 Edition card that also runs on Switch 1; `LA-` is an
original Switch card. Corroborated row by row in the NSCollectors sheet
(every `LP-*` row is "Game-Key Card"; every `LB-`/`LN-` row is "Game Card").
Regex: `\bL[PBNA]-[A-Z0-9]{5}-[A-Z0-9]{3}-[0-9A-Z]\b`, branch on the first
two letters. The other visual tell is the white banner on the front of the
case with a key icon, "GAME-KEY CARD", and a QR code, plus small print
"Full game download via internet required." A photo importer can read
either.

### 2.2 Community registries (Switch 2, all publishers)

- **r/NSCollectors "Switch 2 Releases" sheet** — Google Sheet, CSV export
  without auth: `https://docs.google.com/spreadsheets/d/1LEIJUOanvkKq9kv1fSOnD40GdE1Jt5LzSYsg8yAPmb8/export?format=csv&gid=764784245`
  (Release Details; follow the 302 to googleusercontent.com). Header:
  `Master Title, Game Title, Region, Release Date, Card Type, Cart ID,
  Publisher, Editions, NS1 Compatible, LP #, Verified By`. Card Type values:
  `Game Card` / `Game-Key Card` / `Code in a Box`. One row per region (USA,
  EUR, JPN, …). 500+ rows, updated 2026-09-20; `gid=887819792` is the
  Upcoming tab. This is the closest thing to the Switch 2 physical universe,
  retail publishers included.
- **codemaverick-hub/switch2-tracker** — GitHub, `data/games.json` (909
  games): per-game `fmt` (`c` game card, `k` key card, `b` code in box,
  `d` digital, `?` unknown), per-region `formats{}`, publisher, Nintendo EU
  box art URL. Rebuilt daily by GitHub Actions from the sheet plus the
  editorial lists. No licence file — vendor a snapshot rather than
  depending on it live.
- **Deku Deals** — item pages carry a "Switch 2 Game-Key Card" badge and
  "Switch 2 Physical" price rows; `/guides/about-game-key-card-games` and
  `/switch-2-physical-games` are maintained lists. No API (feature request
  open three years). Use for outbound verification links only.
- Editorial lists (Nintendo Life key-card and full-cart guides, Nintendo
  Wire's three-section table, Nintendo Everything's list) are prose or
  JS-rendered; the tracker above already merges them.

### 2.3 Store text patterns (observed, not invented)

No store uses a tag or option for format; it is sentence text, and the
hyphenated Nintendo spelling "Game-Key Card" never appears in product data.

Key-card / not-full-cart signals:
`Game Key Card` (Limited Run, on the HTML product page only — absent from
`products.json` and `.json`/`.js`; the RAIDOU Collector's Edition note reads
"Switch 2 Collector's Edition comes with Game Key Card*"),
`Download code in a box` (Strictly Limited, PC items),
`includes the Nintendo Switch game and the Nintendo Switch 2 Edition upgrade
pack` (Fangamer — a Switch 1 cart plus upgrade, not a native Switch 2 card),
`not included on game media` (Fangamer, DLC).

Full-cartridge signals:
`full game on cartridge`, `full physical cartridge`, `The NSW2 cartridge
includes the full game` (Strictly Limited); `Full game on cartridge (no
download, no patch)`, `is a Game Card. It contains the entire game data on
cartridge`, title suffix `(Game Card)` (Red Art — the best labelling of any
store); `Full game included on cartridge` (Pix'n Love); `Switch and Switch 2
games come on a full game cartridge` (Atari); `Fully assembled Nintendo
Switch 2 game with cartridge` (Super Rare); `game on cartridge, ready to
play out-of-the-box`, `complete on disc/cartridge` (iam8bit);
`region-free physical cart` (Limited Run); `Switch Case and Cartridge`
(GameFairy); `Physical Case and Game` (Premium Edition).

False positives to exclude before matching: `download code for the …
soundtrack` (iam8bit, Fangamer, GameFairy), `code in the box for <bonus
game>` (PixelHeart), `Steam Key` / `Teeto Key` (Super Rare club items).

Store policies worth encoding as defaults: Limited Run's numbered line is
full-cart by stated policy while its `Distro` partner items can be key
cards; Red Art, Strictly Limited, Super Rare, Pix'n Love, iam8bit, and Atari
state full carts explicitly on the items checked; Nicalis, Aksys, most
Fangamer items, and Limited Run Distro items say nothing — those are
"unknown" until the registry or a cart ID settles them. Absence of a
key-card phrase is never evidence of a full cart.

## 3. Aggregators

physicalreleases.com (Nintendo-focused pre-order and price-drop posts on
Blogger; its Atom feed redirect-looped when fetched, unconfirmed),
DiscWatchHQ (boutique price comparison, no feed), SwitchLib (Switch 1 only).
None adds anything the store feeds and the NSCollectors sheet do not.

## 4. Nintendo 64

Catalogue: IGDB platform id 4 (slug `n64`; confirm via `/v4/platforms`);
Wikipedia's list has 388 titles with JP/NA/PAL dates as a wikitable;
MobyGames (379 titles, free non-commercial API, 360 req/hour) for cover
gaps; N64DB on GitHub for cart-level facts (save type, Expansion Pak). IGDB
cover coverage for N64 was not measurable from the sandbox — run
`fields id,cover; where platforms = (4); limit 500;` once and count. Every
N64 release is a cartridge; the format question does not arise, but
completeness (loose / boxed / complete in box / sealed) does.

Pricing: PriceCharting's API and CSV are on the $49/month Legendary tier
only, and its terms forbid showing price data on anything third parties can
access. No free structured alternative was verifiable. Out of scope.

## 5. What was not verifiable

nintendo.com from the sandbox (browser only); Nintendo's current Algolia
index (403); ResetEra and NoisyPixel (403); Wayback (blocked); IGDB's N64
coverage; physicalreleases.com's feed; PANAX's underlying store; whether
Forever Limited and Pix'n Love ship to the US.

## Sources

Store endpoints: `limitedrungames.com` (`/products.json`, `/collections.json`,
`/collections/{coming-soon,latest-releases,distro,the-lr-vault}/products.json`,
`/collections/all.atom`, RAIDOU and Terranigma product pages);
`iam8bit.com`, `strictlylimitedgames.com`, `premiumeditiongames.com`,
`store.nicalis.com`, `store.aksysgames.com`, `store.aksyseurope.com`,
`fangamer.com`, `atari.com`, `superraregames.com` (`/products.json`,
`/collections.json`, platform and pre-order collections, one product `.json`
each); `pixelheart.eu`, `gamefairy.io`, `1printgames.com`
(`/wp-json/wc/store/v1/products`, `/products/categories`); `redartgames.com`
and `pixnlove.com` category and product pages; `forever-limited.com`
category pages; `team17.com`, `store.team17.com`, `pm-studios.com`,
`store.panaxgames.com`; every store's `/robots.txt`.

Key-card sources: nintendo.com US product pages (Street Fighter 6 Y1-2,
Bravely Default HD, Donkey Kong Bananza) and the Switch 2 games listing;
Nintendo UK/AU/MY Game-Key Card pages; Nintendo support answers 68415 and
68355; `searching.nintendo-europe.com` Solr; NSCollectors sheet gids
764784245, 558942722, 887819792; github.com/codemaverick-hub/switch2-tracker
(`data/games.json`, `scripts/scrape.py`); dekudeals.com key-card guide,
`/switch-2-physical-games`, item pages, robots.txt, feedback #44 and #82;
nintendolife.com key-card and full-cart guides and the Limited Run
interview; nintendowire.com physical-games table; nintendoeverything.com
key-card list; nintendosoup.com cart-code guide; GameSpot, Tom's Guide,
PCMag/Yahoo, PowerUp Gaming, lon.tv key-card explainers;
api.igdb.com/v4/igdbapi.proto; mobygames.com/info/api; pricecharting.com
(Switch 2 and N64 consoles, API documentation, Pro tiers, terms);
en.wikipedia.org List of Nintendo 64 games; github.com/DerekTurtleRoe/N64DB;
physicalreleases.com; discwatchhq.com; switchlib.com.
