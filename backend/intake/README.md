# intake

Server half of intake (`docs/planning/2026-11-10-intake-design.md`): one way
in for the shelf and the closet. A *sitting* holds the photos taken in one go
and the entries read from them or typed in.

## Modules

- `budget.py` — the free-tier allowance (spec D3). `UsageRecorder` counts
  every model call per model and **Pacific** day (Google resets the free tier
  at midnight Pacific, not UTC) in `llm_usage`, and marks a model exhausted
  on a per-day 429. `remaining()` is the calls left across models that are
  not exhausted, minus a reserve of `RESERVE` (12) kept for the rest of the
  site; `budget_state()` is what the intake page shows.
- `kinds.py` — the kind registry (spec D11). A `Kind` is data: its area,
  ways in (photo, search, type), metadata source, `FieldSpec`s and a
  `to_row` that turns an entry into the row to write. `register()` adds or
  replaces one; `describe()` is what `GET /api/intake/kinds` serves,
  including `source_state` ("ready", or why the source is not). A kind may
  also carry a `search` hook (see Places below).
- `shelf_kinds.py` — game, movie, comic and board game. `to_row` keeps the
  chosen match's metadata plus the payload's `ItemIn` fields, and records a
  physical copy. Board games are typed only while BGG needs a token.
- `place_kind.py` — the `places` area's one kind, `place` (story #340): its
  search hook over Nominatim, the checks on what is stored, owned-place
  detection and `to_row`. See Places below.
- `volume_plan.py` — a collected comic book as a volume (#328). `book_plan`
  (pure) decides the volume (label, one of the five kinds, number in its
  line) and its contents (the printed range, then the reprint note read by
  `comic_contents.parse_contents`: rules only, no model), each with whether
  it links to the title; `preview` is what Check shows from it;
  `write_volume` writes it once per intake entry (`intake_entry_id`, unique),
  taking a second writer's volume instead of failing. The commit and Check
  both go through `book_plan`, so the preview is what is written.
  A book matched to a series joins that series' title only when
  `comics.shares_title` says so (`unshared_series`, applied by
  `commit._placed`): its title, with volume and format words removed, is the
  series' name and at least 60% of its contents are the series' own.
  Otherwise it is placed as unmatched, on its own manual title, with the
  series' issues kept as text. Rule and thresholds: `backend/CLAUDE.md`.
- `garment_kind.py` — the closet's garment: no source, no details step;
  `to_row` keeps only `GarmentFields` keys. Ways in: photo, type,
  **file** (the seed file below) and **link** (`link_import.py`). Its fields include brand, store colour
  and size.
- `seed_file.py` (pure), `seed_import.py`, `seed_image.py` — the closet's
  **From a file** way in (issue #396, `docs/planning/2026-11-16-closet-products-design.md`
  D3, D5-D8). A seed CSV (UTF-8, header row; columns `n, source, order_id,
  date, date_basis, brand, name, color_name, size, price_usd, category_hint,
  store_item_no, still_owned, image_url`; only `source`, `name`,
  `still_owned` are required; at most 500 lines and 1 MB) becomes one
  `typed` garment entry per piece, with **no model call and no photograph**:
  - A row's fate, in this order: `still_owned` no is **skipped, not
    owned**; a key in `closet_settings["import.not_owned"]` is **skipped,
    marked not owned before**; a row already in `garment_products` (same
    source, item number and size, else the same order line: order, name,
    colour, size) is **already imported**, which is also what makes uploading the
    same file again harmless; a row repeated in the file or already in the
    sitting is a **duplicate**; a line that cannot be read (unknown
    source, no name, a field too long for the closet) is **unreadable**,
    worded for the first five. The counts are kept in
    `intake_settings["file.<sitting id>"]`, reported once by the commit
    as `file_import` (Done's tiles), and removed with the sitting.
  - An entry's payload holds the fields Check edits (name, brand, store
    colour `color_name`, size, category from `category_hint` or none,
    `primary_color` from `closet_colors.colour_family`, `acquired_on`) and
    two keys only the server writes: `seed` (the row, its keys and its
    `image_url`) and `image` (`pending`, `held`, `failed` with
    `image_error`, or `none`). `PATCH` keeps those keys whatever the page
    sends, so a Check edit can never change the address the server fetches.
  - **Photos** are fetched once each, a few per request, by
    `POST /sittings/{id}/seed-images` (the Check page asks until none is
    pending). `seed_image.fetch_image` takes only https on port 443,
    refuses any host that resolves to a non-public address, follows
    redirects by hand and checks every hop, times out at 8 s per request and
    20 s in all, asks for no compression and refuses a compressed answer,
    takes only JPEG, PNG or WebP and stops reading at 6 MB; requests to a host are
    spaced. The result is made 800px (`make_garment_image`) and **held** as
    an `intake_photos` row the entry points at (served by the existing
    `GET /photos/{id}/image`), so nothing reaches the closet before the
    commit. Residual risk: the host is resolved for the check and again to
    connect (DNS rebinding); the route is admin-only and only ever decodes
    the answer as an image.
  - **Commit** writes, for each seed entry, the garment (`untagged`,
    `tag_source` NULL so the tag queue takes it for warmth, formality and
    seasons; `color_name` verbatim with `color_source` vendor; `primary_hex`
    NULL; `acquired_on` the purchase date), its `garment_products` row
    (source, `order_ref`, `store_item_no`, title, price, the row as the
    snapshot, `fetched_at`) and the held photo as its image. A piece
    without a photo (never fetched, or failed) is written anyway and
    counted as `images_missing`. A piece imported since the file was read
    is `already_owned`.
  - **Don't own this** (`POST /entries/{id}/not-owned`) ignores the entry,
    drops its held photo and adds its key (`source|order_id|store_item_no`,
    or `source|order_id|name+colour+size`, lower case) to
    `closet_settings["import.not_owned"]` through
    `seed_import.add_not_owned`, which is also the way to seed the list
    from code. Known limit: two sittings committing the same rows at the
    same instant can write them twice (no unique index backs the "already
    imported" check; one would need a migration). There is no undo route; the list is plain JSON in
    `closet_settings` (`{"keys": [...]}`).
- `closet_product.py` (backend root; issue #399) — the same resolver for a
  garment that already exists, from the garment's edit page (`/admin/closet/:id`),
  outside any sitting. All three routes are in the admin-only closet router:
  - `POST /api/closet/garments/{id}/photo` (multipart `photo`): adds or
    replaces the photo (800px WebP, the upload's size, type and decode
    guards: 415/413/422) and moves `updated_at`, which versions the image
    URL and ETag. It touches no other field, status or source and never
    retags. Answers the `GarmentOut`.
  - `POST /api/closet/garments/{id}/product` `{url}`: reads the link and
    answers `state` `read` (title, brand, currency, colours with sizes and
    price, the garment's current product and whether it has a photo) or
    `refused` with the reason (robots, no product, timeout...), a 200 either
    way. **Writes nothing.**
  - `PATCH /api/closet/garments/{id}/product` `{url, external_id, size,
    replace_brand, replace_color, replace_size, replace_product}` (PATCH because the API's CORS policy
    allows no PUT): reads the link **again** and takes the colour whose
    `external_id` it offers (422 otherwise); a size must be one of that
    colour's (422), or it is left alone. The client never sends a colour
    name, a price or an image address. It sets `color_name` (`color_source`
    vendor; a colour typed by hand is kept unless `replace_color`), `brand`
    (only when empty or `replace_brand`), `size` (an existing size is kept
    unless `replace_size`; a lone size only fills an empty one; `kept` in the
    answer lists `colour` / `size` when the owner's value stood),
    `primary_color` (its `colour_family`, only when empty: a changed vendor
    colour does not update a colour family the tagger or the owner already
    set) and writes the
    garment's one `garment_products` row (source from the host, url, title,
    dollar price, `store_item_no` as `item_ref`, snapshot = the parsed
    product plus `chosen` and `size`). A garment that already has a product
    answers 409 until `replace_product` is sent. No connection is held across
    the network: the garment is looked at, the link and photo are fetched with
    no open transaction, then the garment is locked (`FOR UPDATE`) and read
    again before anything is written, so a photo added meanwhile is never
    overwritten and a garment deleted meanwhile is a 404; a unique-key failure
    at commit is rolled back and answered 409. A garment with no photo gets
    the colour's photo through `seed_image.fetch_image` (guarded again); one
    with a photo keeps it; a failed photo does not fail the attach (`photo`
    `failed`, with `photo_error`). `status` and `tag_source` are untouched.
  A colour typed by hand is `manual`; one sent back unchanged by the edit
  form keeps its source.
- `closet_resolver.py` (backend root), `link_import.py` — the closet's
  **From links** way in (issue #398, design D11). Paste up to 10 product
  addresses (the add bar's **From links**, or one link typed into the bar);
  `POST /sittings/{id}/links` makes one `typed` garment entry per link, with
  **no model call**. `closet_resolver.resolve(url)` reads a link in this
  order and never raises for a store's behaviour:
  1. **Shopify's per-product JSON**, `<origin>/products/<handle>.json` (also
     behind `/collections/x/` or a locale prefix): title, vendor (brand),
     options, variants (id, option values, price, available, image), images.
     Colours are the variants grouped by the `Color` option; a product with
     no such option (Duer lists one product per colour) takes its colour
     from the `color_` tag, else the title after " - "; a size is the other
     option values joined by " / ". Marine Layer and Duer both answer this.
  2. **JSON-LD** `Product` / `ProductGroup` (`hasVariant`, `@graph` arrays):
     name, brand, `color`, `size`, image, `offers.price`, sku, url.
  3. Otherwise the link is **kept as typed** (name from `og:title`/`<title>`
     or the handle) with the link saved.
  Every fetch is guarded as `seed_image.py` (https on 443 only, every
  address public, redirects by hand, 3 MB cap, 20 s in all, no
  compression), a redirect may only stay on the store's own site, requests
  to a host are spaced two a second (`HostThrottle`) and `robots.txt` is
  read per RFC 9309 before any path (`courtesy.robots_for`; an unreachable
  file is a disallow; only the `.json` disallowed falls back to the page).
  A store that refuses (robots, 403/429, timeout, non-https, private
  address, not a product page) leaves an entry with `payload.link.state`
  `kept` and the reason in `payload.link.message`, never a failed sitting.
  - An entry's payload is the seed file's: the fields Check edits, the
    server-only `seed` record (`source` is `marinelayer`/`duer` by host,
    else `link`) and `image`, plus the server-only `link` record
    (`{url, state resolved|kept, via shopify|jsonld, code, message}`).
    `PATCH` of a link piece **merges**: only the keys sent change (a blank
    removes one) and the server's keys stay, so a Check save sent before a
    colour choice cannot put the old colour back (file pieces still replace
    the payload). The product's **colours are the entry's `candidates`**
    (`{external_id, title, color_name, image_url, price, sizes: [{size,
    variant_id, available}]}`). One colour, or the colour and size of a
    `?variant=` in the link, is chosen at once; with several Check's radio
    calls `POST /entries/{id}/choose {external_id}` (row locked; 409 for a
    removed or written piece; only a stored candidate can be picked), which
    sets the store colour verbatim, the family (`closet_colors.colour_family`,
    blank to be asked), the price and the photo (the old held photo is
    dropped; the new one is fetched next). A size the owner typed stays
    unless the new colour lists sizes without it. Size is a select over the
    colour's sizes.
  - **One piece is one product, colour and size.** The store's own ids are
    only unique inside a product (a JSON-LD page with no sku is `c0`
    everywhere), so `store_item_no` is `closet_resolver.item_ref`: host,
    path and colour id, cut to 80 characters and hashed past that. A kept
    link's is its address. The "already imported" key is
    `source|item|<store_item_no>|<size>`, rebuilt **at commit** from the
    payload as Check left it (`link_import.entry_key`); the product's
    snapshot stores the piece's `size` so `imported_keys` rebuilds the same
    string. Another size of one colour is another piece; a repeat is
    counted `already_owned`, never silent. A piece offering several colours
    with none chosen is **refused at commit** (422, field `color_name`).
  - Limits: a paste is 10 links; a sitting holds 100 link pieces (422); all
    the links of a paste share 45 s, after which unanswered ones are kept as
    typed (`timeout`); one link that raises anything is kept as typed
    (`unreadable`), never a 500. A link with control characters or
    whitespace after decoding is not requested. Addresses in
    `64:ff9b::/96` (NAT64) and IPv4-mapped IPv6 are checked or refused with
    the other non-public ones, in `seed_image._public` for both fetchers.
  - **Photos** are the seed file's: `POST /sittings/{id}/seed-images` fetches
    each once through `seed_image.fetch_image` into a held 800 px
    `intake_photos` row. A photo is written only if its address is still the
    entry's (`fetch_pending` re-reads the locked row), so a colour chosen
    while it was coming is not overwritten by the old colour's photo. The
    page runs one loop per sitting (`lib/useSeedImages.js`) that asks until
    nothing is pending.
  - **Commit** is the seed file's (`_seed_garment`): a garment `untagged`,
    `tag_source` NULL, `color_source` vendor, plus its `garment_products`
    row with `url` the link as pasted, `title`, `price`, `snapshot` the
    **parsed product** (never the raw page) and `fetched_at` the read time.
    "Don't own this" is the file's alone (409 for a link piece); a link
    piece is removed from the sitting instead.
  Tests run offline against fixtures recorded by
  `scripts/record_closet_fixtures.py` (`tests/fixtures/closet/`).
- `routes.py` — `create_intake_router()`, admin only, under `/api/intake`.
- `reader.py` — `read_next()`, behind `POST /api/intake/sittings/{id}/read-next`.
  One call claims the sitting's oldest `uploaded` shelf photo in one
  statement (`state='reading'` on `FOR UPDATE SKIP LOCKED`, committed
  before the model call, so two readers never take the same photo) and
  reads it with the photo importer's prompt, `parse_detections` and
  `resolve_detections`; each title becomes an entry in its `matching.py` confidence (`exact`, `probable`,
  `check`), `owned` when a trusted match is already an item, or `reading`
  when its source was busy. `retry_reading()` matches `reading` entries
  again from their `payload.detected_*` fields with the same mapping and
  no model call; `read_next` runs it for its sitting first, the nightly
  for every shelf sitting. The reading copy is dropped once read. A budget
  of zero or less returns `waiting` and changes nothing; a model error
  marks only that photo `failed` (Retry requeues it). A photo removed while it was being read is dropped with its read (`idle`, no error). Closet sittings read
  nothing here: their garments are tagged by the Closet's tag queue.
- `commit.py` — `commit_sitting()`, behind `POST /api/intake/sittings/{id}/commit`
  (spec D8). Shelf entries become items through `items.commit_items`, the
  same create path as `/bulk`, so the rows are the photo importer's: write
  rules, duplicates skipped, playthroughs seeded, private, in INSERTs of at
  most `items.BULK_CHUNK` (500). Answers `{added, already_owned,
  issues_added, series_grew, skipped_kept, photos_empty, photos_waiting, refused}`, and the route adds
  `created` (the new items' ids, which Done publishes). By entry state:
  exact, ready and typed are written; owned is counted once per
  title; ignored is cleared; check, probable (unconfirmed) and reading stay in the sitting. A photo
  not yet read (uploaded, reading or failed) is kept too and counted as
  `photos_waiting`. **Comics merge, never drop:** a comic is one row per
  series, so every comic entry (written or owned) resolving to one
  `(external_source, external_id)` joins its `issues_owned` through
  `comics.union`, the one range parser; other fields follow the first
  written entry. A series not yet an item is one new row (`added` 1). A
  series already in `items` gains the sitting's issues through
  `comics_routes.got_issues`, Got it's own rule (union, never lowered; a
  newly owned number leaves `issues_skipped`; a followed or wanted row
  becomes owned, To read), and `issues_added` counts the issues it gained; a
  shelf format set in Details (the first entry that has one) is saved on that
  existing row too, and not counted as an issue gained;
  collected books set in Details (`payload.books`, rows of kind, label, from,
  to) are volumes, written by the same code as a photographed book
  (`volume_plan.typed_plans`, `commit._write_volumes`): one `vol-<n>` volume
  per book (owned, unread, `edited`; kind mapped by
  `comics.volume_kind_from_edition`, the typed text kept in `kind_raw`), with
  one `typed` collects row linked to the title and the range. They count only
  on a trades or omnibus row of an entry that is not itself a photographed
  book (a photographed book's one volume wins; `books` on it is ignored), so a
  singles row writes none and a stale invalid book on it is never refused. A
  book the write rules refuse (`comic_books.typed_books`) is a refusal on field
  `books`, checked before any item is changed, so a refused sitting writes and
  mutates nothing. The same issues in two books are two books (no
  range-dedupe). Each book is idempotent under
  `volume_plan.typed_key(entry_id, index)` (a uuid5 of the entry id, stored
  in `intake_entry_id`), so a second commit of the entry writes none. An
  entry kept as typed with no series match goes on the title of its name like
  a photographed book with no match. Intake writes nothing to `items.editions` (the column is unmapped, pending its drop in `0025`):
  a non-empty `editions` on an entry, add or patch payload is a 422 (a
  sitting typed before the rename still holds `editions`, which commit reads as
  `books`). A volume's covered range clears the skips it covers (Got it's
  rule), as before.
  One rule counts what a series gains, in a sitting and in the add bar:
  the typed issues not held before the commit (loose or through volumes) are
  written loose as typed (`issues_added`), and the typed books it gains are
  listed apart (`books_added`, `{kind, label, from, to}`; a new series lists them as
  `series_new[].books`). A series gaining neither issues nor a volume is
  `already_owned`; one gaining only a volume is grown, not already owned.
  Each such series is also reported on its own in `series_grew`
  (`SeriesGrew`): `{item_id, title, is_public, cover_url, before: {owned,
  released}, ongoing, added, already, books_added, after_owned_text}`,
  where `added` and `already` split the typed issues against what the row
  held before (loose or in a volume), and `books_added` is the
  typed books it gained, for Done's "Series that grew". An issue already inside
  an owned volume is held, so it is neither gained nor written again as a
  loose single; a refused commit reports `series_grew: []`. Games, movies and board
  games keep the old rule: one row per key, later photos dropped. The
  reader does not read an issue number off a photo (the importer's schema
  has no such field), so issues come from Details' Issues owned.
  The sitting is deleted (photos and all) only once
  nothing is kept. A commit that would change nothing is a 409 in intake's
  words: `NOTHING_TO_ADD` when only entries to check remain,
  `PHOTOS_STILL_WAITING` when no entry is left but photos still wait.
  `commit_one()`, behind `POST /api/intake/add`, is the add bar's single
  add: a transient entry (a chosen result, or none when kept as typed)
  through the same row builders and `commit_items`, so it writes the row a
  sitting would; a typed piece becomes a manual garment as `POST
  /api/closet/garments` makes one. 201 with `created` (or `garment_id`),
  200 with `already_owned: 1` for a title already on the shelf, 422 with
  `refused` and the first message as `detail`, writing nothing. A comic
  series already on the shelf follows the sitting's rule: the typed issues
  go through `got_issues`, and the answer is 200 with `issues_added: N`
  (the add bar says "Added N issues to <title>"); a series gaining nothing
  is `already_owned: 1`, `issues_added: 0`. Every answer carries
  `issues_added` and `series_grew` (that series' report, as a sitting's).
  **Reprint note (#327):** a comic sitting's one request per photo may also
  read a collected book's printed "Collects ..." / "Reprints ..." text
  (`reprint_note` in `importer.COMIC_DETECTION_SCHEMA`, not required, at most
  300 characters, empty when none). `reader._book_payload` stores it on the
  entry payload only when non-empty, so older entries look the same. PATCH
  checks it (`comic_books.edit_book`: a string up to 300 characters, kept
  when a payload omits it). Nothing consumes it at commit yet: story #328
  hands it to `comic_contents.parse_contents` as the volume's collects.
  Before any commit, `series_on_shelf_for()` marks each comic entry whose
  series is already an item (by the commit's own key) with that series'
  run as it stands: every route that answers with entries (the sitting,
  read-next, add entry, PATCH entry) carries it as `on_shelf: {item_id,
  title, cover_url, owned, owned_text, released, ongoing}`, else null, so
  Check can say what an entry adds before it is written.

- `search.py` — `search_area()`, behind `GET /api/intake/search?area=&query=`
  (spec D5), the add bar's search. One query goes to the source of every
  kind in the area at once (`asyncio.gather`), each under its own
  `SEARCH_TIMEOUT` (8 s), so a slow Comic Vine never holds up IGDB. Answers
  `{results, sources}`: each result carries its `kind` and, when its
  `(external_source, external_id)` is already an item, `owned_item_id`;
  each source is `ok`, `not_configured` (with `describe()`'s reason),
  `busy` (rate-limited, down or past the timeout: not a miss) or `failed`.
  A comic result also carries `publisher` and `issue_count` (Comic Vine's;
  null for other kinds), so same-titled series can be told apart.
  The Closet has no source, so its answer is empty both ways.

- `nightly.py` — `run_nightly()`, behind `POST /api/intake/jobs/nightly`
  (spec D4, job token). First `expire_sittings()` deletes sittings nobody
  has touched for `EXPIRE_AFTER` (30 days), photos and entries with them;
  "touched" is the newest `updated_at` of the sitting, its photos or its
  entries. `reset_stale_reading()` puts photos claimed `reading`
  more than `STALE_READING` (10 minutes, by `updated_at`) ago back to
  `uploaded`, so a crashed reader never strands one. Then it retries `reading` entries (`retry_reading()`, no model
  call), then reads waiting shelf photos, oldest first across
  sittings, one `read_next` at a time, re-reading the budget before each,
  until nothing waits, the budget is down to the reserve or 480 seconds
  (`DEADLINE_SECONDS`, inside the workflow's `curl -m 600`) have passed
  with no new photo started (`waiting`), a
  read fails (`stopped`) or no model is configured (`failed`). The summary
  `{at, state, ok, expired, photos_expired, read, waiting, note}` is
  answered and stored as `intake_settings["nightly.last_run"]`, which
  `GET /api/intake/status` serves to the Jobs page's Intake row
  (`frontend/src/lib/nightly.js`).

## Routes

All under `/api/intake`, admin only (`items.require_admin`).

| Route | What it does |
|---|---|
| `GET /kinds` | The kind registry, with each source's state |
| `POST /sittings`, `GET /sittings?area=`, `GET/PATCH/DELETE /sittings/{id}` | Sittings; the list carries `photos`, `photos_waiting` (uploaded or reading) and `entries` (a count per state) for the Add page's meter |
| `POST /sittings/{id}/photos`, `DELETE /sittings/{id}/photos/{photo_id}`, `POST /photos/{id}/retry`, `GET /photos/{id}/image` | Photos. The delete drops the photo and every entry read from it (a closet photo takes its piece too, tagged or not); 409 `SITTING_GONE` on an added or discarded sitting, 409 "This photo is being read; try again in a moment." while the photo is `reading` in the database (the row is locked for the check), 404 for a photo of another sitting; it also touches the sitting's `updated_at`. A single entry is removed by `PATCH` `state: ignored` with no `payload.unticked` (an ignored entry with `unticked` is the skim grid's untick and stays visible) |
| `POST /sittings/{id}/read-next` | Read one waiting photo (the page drives it) |
| `POST /sittings/{id}/entries`, `PATCH /entries/{id}` | Typed and chosen entries |
| `GET /search?area=&query=` | The add bar's search across the area's sources (`search.py`) |
| `POST /add` | One thing from the add bar, through the commit service; an optional `request_id` makes a retried book add write once |
| `POST /sittings/{id}/file` | The closet's From a file: a seed CSV (multipart `file`, at most 1 MB) into the sitting's draft entries; answers this file's counts and `problems`; moves the sitting to Check. 409 for a shelf sitting, 413 over the limit, 422 for a file that is not a seed file |
| `POST /sittings/{id}/seed-images` | Fetch the next few file pieces' photos (once each); answers the entries it changed and `pending` |
| `POST /entries/{id}/not-owned` | Check's Don't own this (file pieces only; 409 otherwise) |
| `POST /entries/{id}/tag-again` | Clothes · Check's Tag again: a piece the tag queue gave up on goes back in it (attempts reset); 409 for a piece tagged or saved by hand |
| `POST /sittings/{id}/places` | Add a place to a `places` sitting: a chosen search result or one typed by hand (see Places) |
| `GET /isbn/{isbn}` | Look an ISBN up (story #336, `isbn_route.py`): Open Library's title, subtitle, volume number, publisher, year, pages and a linked cover, plus `on_shelf` (volumes already holding that ISBN). A miss or a source failure is a 200 with `found: false` and a `reason` (`not_found`, `rate_limited`, `unavailable`, `error`); only a malformed ISBN is a 422, checked before any request. No model call |
| `POST /sittings/{id}/commit` | Write the sitting to the collection |
| `GET /counts`, `GET /budget` | Entries to check or confirm (`check` and `probable`) per area; today's free reads |
| `POST /jobs/nightly` | The nightly step; the **only** intake route the job token opens (`items.JOB_ROUTES`) |
| `GET /status` | The nightly's last run, null before the first |

## Who reads

While Shoot is open the browser drives `read-next` one photo at a time:
a request per photo fits the free tier's slow reads and isolates a
failure. The nightly is the only reader after the tab closes. Its
workflow step (`.github/workflows/nightly.yml`, `call intake 600`) runs
after the Closet's outfit plans and before the registry, so it comes
before Discover, the spot finder and the Closet opinion, which the reserve
of 12 calls is kept for. A spent budget is an ok night, not a failure:
the photos wait for tomorrow.

## Why the recorder has its own sessions

A call is recorded before its request is sent, in a session the recorder
opens and commits itself. A request whose own transaction rolls back (a
reader failure, a 422) still spent the call, so the count must survive it.
Recording never raises: a failed write is logged as a warning and the call
goes ahead, because the budget is advice, not a lock.

## Usage

```python
from intake.budget import UsageRecorder, budget_state

recorder = UsageRecorder(session_factory)  # one per process (main.py)
provider = build_provider(config, recorder)  # Gemini records each attempt
state = await budget_state(session, config)  # {"remaining", "enforced", "resets_at"}
outcome = await read_next(
    session, sitting_id, provider, state["remaining"], registry=registry
)  # status: read/empty/failed/waiting/idle
done = await commit_sitting(session, sitting_id, today=today)  # caller commits
summary = await run_nightly(session, config, provider_factory, registry)
```

```bash
# The nightly step by hand (JOB_TOKEN from the environment):
curl -sS -X POST -H "Authorization: Bearer $JOB_TOKEN" \
  https://api.joey-haas.dev/api/intake/jobs/nightly
```

## Configuration

Nothing of its own. The reader needs a model (`LLM_PROVIDER`, default
`gemini`, and its key, e.g. `GEMINI_API_KEY`); without one a read answers
502 and the nightly records `failed`. The budget is enforced only on
Gemini, and counts `FREE_TIER_DAILY_REQUESTS` for each model in
`llm.GEMINI_MODELS` (six since the fallback chain); a read that Gemini
cannot answer goes to Claude Haiku only when the paid fallback is switched
on (`LLM_PAID_FALLBACK=true` with `ANTHROPIC_API_KEY`; off by default). The nightly needs `JOB_TOKEN` on the API and in the workflow's
secrets, as every nightly step does. Tables: `intake_sittings`,
`intake_photos`, `intake_entries`, `llm_usage` and `intake_settings`
(migration 0015).

## Committing

All or nothing: every row is validated (`ItemIn`, then `items._write_fields`)
before anything is written, so a refusal names its entry and, when one field
alone is at fault, that field. A refused commit answers 422 with the usual
shape plus `detail`, and writes nothing. The sitting row is locked
(`FOR UPDATE`), so a second device committing at the same moment waits and
then gets a 409 in intake's own words (`SITTING_GONE`); a commit that would
change nothing, every entry left still to check, is a 409 too
(`NOTHING_TO_ADD`). The reader's `chosen` is the importer's candidate, whose
cover is `thumbnail_url`: `shelf_kinds.to_row` maps it to `cover_url`.
Garments from photos are already real and are only counted; a typed garment
is created as `POST /api/closet/garments` creates one, and a seed-file entry
is created at commit with its product and photo (see `seed_import.py`
above). The answer also carries `images_missing` and `file_import`
(the seed file's counts, null for a sitting no file was added to). After the commit,
covers and creators are filled in as `/bulk` does (`items._enrich`, best
effort).

## ISBN lookup and typed books (story #336)

A typed collected book (`payload.books[]`: kind, label, from, to) may carry an
`isbn`. `comic_books.typed_books` normalises it to an ISBN-13 (hyphens and
spaces dropped, an ISBN-10 converted, the check digit verified) and a bad one
is a `BookEditError` on field `books`, so `PATCH /entries/{id}` answers 422
and the commit never meets it. `volume_plan.typed_plans` puts it on the
`VolumePlan` and `write_volume` writes `comic_volumes.isbn`; idempotence is
unchanged (`typed_key` per book). Check shows the typed books, ISBN included,
under the entry's `books_preview` (beside `adds`, not in it). No migration: the column exists. A
photographed book carries no ISBN.

**Why a route and not a source in the registry:** the lookup answers "what is
this ISBN", not "find a title", so `sources/openlibrary.py` has no item type
(see `sources/README.md`). `GET /isbn/{isbn}` is a convenience, never a gate:
the Details step's ISBN box fills a blank label and warns of an `on_shelf`
match, and a miss only leaves the box as typed. `on_shelf` compares the
stored text with hyphens and spaces removed, as ISBN-13 or the ISBN-10 form,
since the volume editor stores free text. The add bar's barcode button scans
an ISBN, looks it up here and searches for the book's title.

## Places

The `places` area (story #340, migration `0024`) holds one kind, `place`
(`place_kind.py`). It has two ways in, `search` and `type`, and no photo way: a
photo upload to a `places` sitting is a 409. It writes private Denver spots
(`spots` table) instead of shelf items. The page is `/admin/places/add`. The
Nominatim client, its policy and its fixtures are in
`spot_sources/README.md`.

### The `Kind.search` hook

`search_area` used to run only kinds with a metadata `source`. `Kind` now has
an optional `search: async (query) -> KindSearch`, `None` by default, for a
kind with no source that can still be searched. `KindSearch` is either `rows`
or a `failure` message. A kind with no source and no hook (the Closet) is not
searched. A hook runs inside the same `SEARCH_TIMEOUT` (8 s) as a source and
reports the same states: `ok`, `busy` (timeout), `failed` (the hook's own
`failure` message, or "could not be searched just now" for an exception).
`describe()` reports a hook's kind as `source_state` "ready".

Typing sends nothing; only `GET /search?area=places&query=` calls Nominatim.
Place rows carry optional keys that shelf rows lack (they are absent, not
`null`, on a shelf row): `address`, `lat`, `lng`, `source_id`, `category`,
`map_url`, `owned_spot_id` and `attribution`. `category` is the specific
type humanized ("Train station", from Nominatim's `type`, else its class when
the type is missing or `yes`), and `address` is the short "1701 Wynkoop St,
Denver" built from the address parts (house number and road, then city, town,
village, hamlet or suburb), not Nominatim's full display name. A chosen
address over 200 characters is cut to 200, since it is display-only; every
other over-long field is a 422. `search_area` marks owned places
after the search by the database (`flag_owned`): the spot with the same OSM
`source_id`, else a spot of the same name within 75 m
(`SAME_PLACE_METRES`). A row with `owned_spot_id` cannot be added again.

### Adding a place

`POST /sittings/{id}/places` creates a place entry in a `places` sitting. A
sitting of that area needs a kind (`POST /sittings` is a 422 without one), and
the generic `POST /sittings/{id}/entries` refuses a places sitting with a 422
that names this route. Two shapes:

- **Chosen from search:** `chosen` (the result row) and `result_count`, how
  many results that search returned.
- **Typed:** `name` and `coords` (`spots.parse_coords`; coordinates that do not
  parse are a 422 at creation).

Both take `city` (default `denver`), `neighbourhood`, `blurb`, `tags` (the
canonical six, `spots.TAGS`) and `is_public`. The sitting row is locked
(`FOR UPDATE`) first, so two presses of Add queue and the second sees the
first's entry. A 409 means the place is already a spot (`PLACE_OWNED`) or
already in this sitting (`PLACE_IN_SITTING`).

**What is checked on the way in.** Every value is validated, because the
entry's payload is what the commit later reads.

- `clean_chosen` checks a chosen result like a typed one: a non-empty name of
  at most 200 characters; `lat` and `lng` finite numbers in range (a bool, NaN
  or a string is refused); `address` and `category` text of at most 200
  characters. `source_id` may be absent (then only the name-and-distance rule
  guards duplicates) but, when present, must fullmatch
  `(node|way|relation)/<digits>` and fit 60 characters (the column is
  `String(60)`).
- `map_url` and `attribution` are not the client's: the server rebuilds
  `map_url` from `source_id` (`https://www.openstreetmap.org/<source_id>`) and
  sets `attribution` itself. Owned-ness is re-derived from the database, so a
  client-sent `owned_spot_id` neither blocks nor allows anything.
- `clean_fields` checks the owner's fields: `name`, `city` (lowercased, at
  most 40), `tags` (a list of text, then `spots.canonical_tags`), `blurb`
  (500), `neighbourhood` (100) and `is_public` (a real boolean). A field of
  another name is dropped.
- `clean_position` is the one range check for a position; the commit reuses it.
- The request body caps `tags` at twice the vocabulary and `result_count` at
  100.

### The mark, and why `result_count` is a hint

A chosen result's state comes from the count (`mark_for_count`): one result is
`ready`, none or several are `check`. A typed place is `ready`. No model is
involved. `result_count` comes from the client, so the mark is a hint for the
page, not a trust boundary: the route is admin-only, the owner can only
mislead themselves, and the commit validates the entry again whatever its
mark.

### Editing a place entry

`PATCH /entries/{id}` on a place entry changes the owner's fields only:
`payload` goes through `edit_place`, which merges `clean_fields` over the
stored payload, so `lat`, `lng`, `source_id` and `map_url` can never be
patched. `chosen` in a PATCH is ignored. `state` may only be `ready` or
`check` (a 422 otherwise), and `ready` needs a stored name and a finite
in-range position (`not_ready_reason`). There is no route to delete a single
entry.

### Committing places

`POST /sittings/{id}/commit` and `POST /add` branch on the kind's area
(`commit.py`, `write_places`). A place does not become a shelf item.

1. Every place entry is checked again from what is stored (`_place_fields`):
   `clean_name`, `clean_position`, `clean_fields`, and `clean_chosen` for the
   chosen result. The entry is never trusted. A refusal names the entry and the
   field and the whole commit is a 422 that writes nothing.
2. The public rule: `is_public` with a city other than Denver is refused
   (`PLACE_NOT_DENVER`), since the public `/denver` page is Denver only until
   #343. The page disables the toggle, and the server enforces it.
3. Then `lock_place_commits` takes `pg_advisory_xact_lock(7243000002)` for the
   rest of the transaction (`PLACE_COMMIT_LOCK_KEY`). A second commit waits,
   and its duplicate check, a new statement under READ COMMITTED, sees the
   first's spots.
4. Under the lock each place is checked against the spots table
   (`owned_spot_id`): the same `source_id` with `source = osm`, else the same
   name within 75 m. A typed place has no `source_id`, so it is deduped by name
   and distance alone, and two identical typed entries in one sitting collapse
   to one spot (the loop counts the spots it just wrote).
5. A place not yet owned is built by `spots_routes.build_spot`, the same
   function `POST /api/spots` uses, so the two cannot drift, and written
   private unless it is a public Denver place. A chosen place stores
   `source = osm` and its `source_id`.

The answer gains `spots_new` and `spots_owned`, lists of `{id, name}`; they are
absent from a shelf or closet commit. An owned place counts in `already_owned`
and a new one in `added`. Written entries are deleted from the sitting like
other kinds' are, so the sitting is gone when nothing is left to check, and a
second commit of it is a 409.

### Known limits

- **A race with a by-hand spot.** The advisory lock is taken only by place
  commits. A place commit racing a by-hand `POST /api/spots` for the same place
  is not locked and could make a duplicate. `spots` has no unique
  `(source, source_id)` constraint, so the database does not stop it either.
  Accepted: one owner.
- **Leftover CHECK entries keep their sitting, and the page deletes it.** A
  commit writes the `ready` entries and leaves entries still in `check`
  (`skipped_kept` in the answer is how many), and a sitting with any left
  stays alive. `GET /sittings?area=places` would list it, but the places page
  never calls that list, so nobody would see it. The page therefore deletes
  such a sitting itself with `DELETE /sittings/{id}` (best effort, a failure is
  ignored) when a commit answers `skipped_kept > 0`, and when it drops a
  sitting after a 404 and starts a new one. What remains: a sitting left by a
  closed tab or a failed delete lives until the nightly expiry deletes it
  (`nightly.EXPIRE_AFTER`, 30 days untouched), and its `check` entries count
  under `/api/intake/counts` `places` until then (a leftover with only `ready`
  entries does not count). Checked in the code (`routes.list_sittings`,
  `routes.counts`, `nightly.expire_sittings`) and in the page's tests with a
  fake that keeps these rules; not against a running server.
- **A lost response after a successful commit.** If the commit succeeds but
  its answer never arrives, the page's retry finds the place already owned and
  reports "That place is already on your list". The data is right; only the
  message misleads.
- The advisory lock key is arbitrary and must stay distinct from
  `migration_lock.MIGRATION_LOCK_KEY`.

## Adding a kind

Write a `Kind`, `register()` it in a module `routes.py` imports, and it is
served. `kind` is text in the database, so no migration is needed. A new
*area* is different: `IntakeArea` is the Postgres enum `intake_area`, so it
needs an additive `ALTER TYPE ... ADD VALUE` migration (`0024` is the pattern). Field
keys must be the row's own column names (`platform_id`, not `platform`),
because `to_row` filters the payload by them.

## Gotchas

- Only Gemini is enforced (`enforced` is false for any other provider);
  other providers are built without a recorder.
- The nightly and an open Shoot page can read at the same moment; each
  takes the oldest waiting photo, so the two may read the same one twice.
  At night nobody is shooting, so this is accepted rather than locked.
- Closet sittings are never read here: their garments are real on upload
  and tagged by the Closet's tag queue. They do expire.
- The free-tier ceiling is `llm.FREE_TIER_DAILY_REQUESTS` per model. If
  Google changes it, change it there.
