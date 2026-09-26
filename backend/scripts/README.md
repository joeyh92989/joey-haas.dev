# backend/scripts

One-off tools run by hand. Nothing here is imported by the app.

## record_igdb_fixtures.py

Records live IGDB responses into `tests/fixtures/` so the E7b snapshot parser
is tested against what the API actually returns.

**Why:** the IGDB docs, third-party code and this codebase's own assumptions
disagreed on the fields the snapshot now reads: `game_status` replaced the
deprecated `status`; time to beat is a separate endpoint in seconds; the
Nintendo 64 and Switch 2 platform ids are not in the official docs. A
fixture settles each one.

**Run** from `backend/`. With no arguments it searches IGDB for one
well-known game per platform the snapshot has to handle: Mario Kart World
(Switch 2), Breath of the Wild (Switch), Super Mario 64 (N64). The fixtures
pin the shape of IGDB's answers, and that doesn't depend on whose games they
are. IGDB game ids can be given instead.

```bash
./.venv/bin/python scripts/record_igdb_fixtures.py
```

**Needs** `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in `backend/.env`. It
loads config exactly as the API does, so every other required variable must
be set too. It makes 7 requests, spaced to stay within IGDB's 4-per-second limit.

**Writes**, response bodies only. No token, client id or secret is written or
printed:

| File | Contents |
|---|---|
| `tests/fixtures/igdb_games_e7b.json` | `/v4/games` for the ids, with the E7b field list |
| `tests/fixtures/igdb_time_to_beats.json` | `/v4/game_time_to_beats` for those ids plus ten unrated games, with the requested ids alongside, so a missing game can be told from one never asked about |
| `tests/fixtures/igdb_platforms.json` | `/v4/platforms` for `n64`, `switch-2`, `switch` |

It prints a summary: rows per file, how many unrated games had no time to
beat, and the platform ids. Commit the three files. They are test data, and
contain nothing private.

**Limits:** the unrated games are whatever IGDB returns first, so a rerun may
record different ones. The field list is duplicated from `sources/igdb.py`
`FIELDS` and has to change with it.

## record_physical_fixtures.py

Records the E7c physical-catalogue sources into `tests/fixtures/physical/`,
so every `physical_sources` parser is written against real bytes.

**Why:** the stores rename collection handles, the NSCollectors sheet moves
its header row and adds columns, and `switch2-tracker` changes shape without
notice. The research described each source as it was on one day; a fixture
recorded now shows what it is, and the run's printout is the drift report
compared against the spec's `STORES` table before any parser is written.

**Run** from `backend/`:

```bash
./.venv/bin/python scripts/record_physical_fixtures.py --list
./.venv/bin/python scripts/record_physical_fixtures.py --igdb
```

`--list` prints every request and the file it writes, without fetching.
Source names limit a run to those sources (`limited_run`, `super_rare`,
`registry`, `tracker`, … — `--list` shows them all); `--igdb` adds one page of
IGDB's N64 catalogue.

**Needs:**

- Nothing for the stores, the tracker and `robots.txt`.
- `GOOGLE_SHEETS_API_KEY` in `backend/.env` for the registry. To create it:
  in the Google Cloud project that holds the admin OAuth client, enable the
  Google Sheets API (APIs & Services → Library), then APIs & Services →
  Credentials → Create credentials → API key, and restrict the key to the
  Google Sheets API. A public ("anyone with the link") sheet needs nothing
  else.
- `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` for `--igdb`, which loads config
  exactly as the API does, so every required variable must be set too.

It makes about 59 requests at 2 per second, across every host, with the
tracker's User-Agent, and honours each host's `robots.txt` under
`User-agent: *` (a host without one is allowed).

**Writes**, response bodies only:

| Files | Contents |
|---|---|
| `shopify/<store>/<handle>.p1.json` | page 1 of `products.json` for each handle in the spec's `STORES` table (36), each product's `images` cut to the first |
| `woocommerce/<store>/category-<id>.p1.json` | page 1 of the Store API for each WooCommerce category (3) |
| `shopify/limited_run/product.html` | the first Switch 2 product in Limited Run's `coming-soon`, for the HTML step |
| `registry/properties.json` | the sheet's tab list (`sheets.properties`), mapping each gid to its current title |
| `registry/{details,upcoming_details,upcoming}.json` | the Release Details, Upcoming Releases and Upcoming Release Summary tabs, as `spreadsheets.values.get` returns them |
| `tracker/games.json` | a 30-game excerpt of `switch2-tracker`'s `data/games.json` |
| `robots/<host>.txt` | each host's `robots.txt` |
| `igdb/n64_page1.json` | with `--igdb`: one page of N64 games, id, name, cover and date |

A handle with a non-ASCII character gets an ASCII file name
(`nintendo-switch™-1` → `nintendo-switch-tm-1.p1.json`); the request uses the
percent-encoded handle.

**Credentials never leave the process.** The Sheets key is a query
parameter, so it is in no response body — the recorder checks anyway and
refuses to write a body that contains it. Failures are printed with every
credential masked, and a redirect is reported by host and path only.

**It prints** one line per file: product count and the distinct tag set for
a Shopify page (and a note when page 1 is full); product names for a
WooCommerce category; for the sheet, the tab titles, the header row it found
by content, the optional columns missing and the distinct `Card Type`
values; for the tracker, the fields and which game covers each case the
parser tests need. It exits 1 after the whole run if anything failed —
a non-200, a body that is not JSON, a `robots.txt` refusal, a missing tab —
so a gone handle or a sheet that refuses the key is loud, and the rest is
still recorded.

**The tracker excerpt.** The repository has no licence, so the full file is
never written. The excerpt takes the first game, in file order, for each case
the parser's tests need (per-region formats, `fmt` `c`/`k`/`b`/`d`/`?`, each
date form), then fills to 30 in file order.

**Re-record** when a store's handles change (the spec's `STORES` table and
`physical_sources/stores.py` change with them), when the sheet's columns
move, or when a parser needs a case the fixtures lack. Re-record one source
by name, commit the changed files, and fix any test the new shape breaks —
never edit a fixture by hand.

**Limits:** page 1 only, so a handle with more than 250 products is sampled,
not complete. The store list and User-Agent are duplicated from the spec and
must be kept in step with `physical_sources/stores.py` and `limits.py` once
they exist. The Limited Run product page is whichever Switch 2 product is
first today, so a rerun may record a different one.

**Deliberately not recorded:**

- **Atari.** Since 2026-09-25 its `products.json` answers every client —
  this User-Agent and a plain one alike — with a Cloudflare bot challenge.
  Getting past bot detection is off the table, so the store is out of
  `STORES` until the challenge goes; re-add its handles here and re-record
  if it does.
- **The Release Summary tab** (gid `558942722`). Release Details dates every
  row by region, so the summary adds nothing and is not read.
- **Product galleries.** Only the first image is kept, which is all
  `image_url` uses. The full arrays were a third of the recorded bytes.
