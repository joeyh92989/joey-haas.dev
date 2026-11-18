# Backend conventions

Moved from the root CLAUDE.md. Rules for `backend/`; shared and deploy rules stay in the root file.

## Denver spots, test login

- Denver spots: the public `/denver` map and list,
  `/admin/spots` (finder and spot list) and `/admin/weekend` (planner),
  backed by `spots_routes.py`, `spots_candidates_routes.py` and
  `spots_weekend_routes.py`, with the sources in `backend/spot_sources/`
  (read its README first). The map drawing in `content/maps/denver.js` is
  generated from OpenStreetMap by `frontend/scripts/draw-denver-map.mjs`
  and is ODbL: keep its header, and keep the visible attribution `SpotMap`
  draws from it, linking https://www.openstreetmap.org/copyright. Settings, last-run summaries
  (`weather.last_run`, `candidates.last_run`) and each week's plan
  (`plan:<iso-week>`) are rows in `spot_settings` (one JSONB value per
  key), never new columns. The public field for a spot's line is `blurb`,
  because `test_public_outputs.py` forbids `note` at any depth, and
  `PublicSpot` carries `spot_id` and no anchor, visit or distance. The
  Dashboard's Weekend forecast and Spot finder rows read
  `GET /api/spots/status`.
- **Places through intake (story #340, epic #339).** `IntakeArea` now has
  `places` (a Postgres enum value added by migration `0024`; copy its
  `autocommit_block` plus `ADD VALUE IF NOT EXISTS` pattern for the next one,
  and note a downgrade cannot drop the value). The `place` kind
  (`intake/place_kind.py`) searches Nominatim (`spot_sources/nominatim.py`)
  through the optional `Kind.search` hook and is added from
  `/admin/places/add`; the commit writes a private spot through
  `spots_routes.build_spot`, the one function the by-hand route shares.
  Read `intake/README.md` ("Places") and `spot_sources/README.md` first. When
  editing: validate what is stored (`clean_chosen`, `clean_fields`,
  `clean_position`) and let the commit never trust an entry, so it re-checks
  everything and re-runs the owned check under `lock_place_commits`; the
  server rebuilds `map_url` and ignores a client's `owned_spot_id`; and a
  place is public only when its city is Denver (the public page is Denver
  only until #343), enforced at commit as a 422. The Nominatim client sends
  `NOMINATIM_USER_AGENT`, never the catalogue's `USER_AGENT`.
- `POST /api/auth/test-login` (`backend/e2e_login.py`) is mounted only with
  `E2E_TEST_LOGIN=1` on an http://localhost `FRONTEND_URL` (config refuses to
  boot otherwise), is never set on Render, and `smoke.sh` checks it answers
  404. The admin suite runs against its own `joeyhaas_e2e` database, never the
  pytest one. CI covers one page per dynamic shelf route from
  `frontend/e2e/fixtures/` (synthetic; keep in step with `fetch-snapshot.mjs`
  and the issue/volume endpoints).

## Closet

- **Review's flags are data; the model only comments.** The cull is
  `closet.flags_for` / `closet.deck` (pure): unworn, condition, rare,
  duplicate, and out of season only while a season turn is open, each
  with the sentence the card shows. `closet_opinion.py` (pure, in
  `test_physical_imports.py`'s purity list) is a second pass over the deck:
  the model answers with card numbers, so an opinion attaches only to a
  piece already flagged and never adds one. It is shown last, labelled
  "Opinion:". A failed Sunday run keeps last week's `opinion.batch` and
  writes the reason to `opinion.last_run` (the Jobs page's Closet opinions
  row reads it through `GET /api/closet/status`).
- **Review writes go through `closet_review_routes.py`**: one
  `garment_decisions` row per outcome, and one level of undo under
  `closet_settings["review.undo"]` that puts back exactly what the last
  write changed. A stale token gets a 409 whose `detail` the page shows
  itself, because `errorMessage` words every 409 as the catalogue lock.
  Dismissing the season-turn banner closes the turn on the server, and with
  it the out-of-season flags; One by one and Skip are client-only.
- **The Closet badge is the review count** (`tiles.flagged`), loaded by
  `AdminLayout` on sign-in and again on the way into `/admin/closet*`
  (a nightly opinion or a season turn changes it), and kept current by the
  Review page through `setClosetReview`; Home's Closet card shows To review
  and Untagged.
- **A garment can be a real product (epic #392).** `garments.color_name` is
  the store's own wording, verbatim; `primary_color` stays the plain colour
  family that filters and `closet.duplicate_clusters` key on, derived from
  the store name by `closet_colors.colour_family` (pure keyword table, no
  model; no match leaves it empty and Check asks). `color_source`
  (`vendor`, `manual`, `model`) says who set the colour: a hand edit sets
  `manual` only when the colour actually changed, and the tag job keeps a
  vendor or manual colour, hexes, a set brand and a vendor name while it
  still fills warmth, formality and seasons. `garment_products` is one row per
  garment (source, url, order reference, item number, title, price, a JSONB
  snapshot of the parsed product, `fetched_at`); `size` is per garment and
  wins over the profile size on the Sell checklist.
- **Intake areas.** `IntakeArea` is `shelf`, `closet` or `places`. The commit
  (`commit_sitting`, `commit_one`) and the photo route branch on the kind's or
  sitting's area: a `places` sitting commits to private spots and its photo
  route answers 409 ("A places sitting takes no photos."); the closet never
  reads photos and shelf entries become items. `GET /api/intake/counts`
  includes `places`.
- **Garment photos are 800px** (`closet_images.GARMENT_LONG_EDGE`; shelf and
  Match-this photos stay 400). `GET /api/closet/garments/{id}/image?size=thumb`
  makes the 400px rendition on read, with its own ETag; older garments stay
  at 400 until re-uploaded.
- **Ways into the closet that carry a product**, all through the intake
  sitting and Check, none making a model call: the **seed file**
  (`intake/seed_file.py`, `seed_import.py`; CSV columns in
  `intake/README.md`) and **pasted links** (`closet_resolver.py`: Shopify
  per-product JSON, then JSON-LD `Product`/`ProductGroup`, then kept as
  typed; a candidate is a colour, not a variant). A garment is created at
  commit, never at upload; the piece's photo is held in `intake_photos`
  until then. Imported garments arrive `untagged` with `tag_source` NULL so
  the nightly tag queue fills the rest. "Don't own this" is remembered in
  `closet_settings["import.not_owned"]` (`{"keys": [...]}`), and the
  duplicate and not-owned keys carry size and colour, so a re-export never
  asks twice. The server-only payload keys (`seed`, `link`, `image`,
  `image_error`) are never taken from a client (`keep_server_keys`).
- **Every server-side fetch of an address goes through `intake/seed_image.py`'s
  guard** (https on 443, no userinfo, every resolved address public, NAT64
  refused, redirects followed by hand and re-checked, total deadline, no
  compression, byte cap); robots and the per-host throttle come from
  `physical_sources`. DNS rebinding is an accepted limit (admin-only routes).
- **On an existing garment** (`closet_product.py`): `POST
  /garments/{id}/photo` adds or replaces the photo and touches no field;
  `POST /garments/{id}/product` reads a link and writes nothing; `PATCH
  /garments/{id}/product` (PATCH, because CORS allows no PUT) re-resolves the
  link itself and takes only the chosen colour id and size, so the client
  cannot send a price, colour or image address. A hand-set colour, size or
  brand is kept unless its `replace_*` flag is sent, and an existing photo is
  never overwritten. The network work runs first and the write runs after a
  `FOR UPDATE` on the garment.
- **Ranking can send thumbnails** (`closet_rank.image_picks`, at most 4 per
  slot, under the 20 MB payload ceiling, each tied to its garment number), but
  only while `closet_settings["rank.images"]` is `{"enabled": true}`. It is off:
  nothing flips it from the app. A refused payload retries once text-only,
  then falls back as before. Run `scripts/closet_rank_images_probe.py` (see
  `scripts/README.md`) on a local database with photos before turning it on
  (#400).
- **Purchase history stays out of the repo.** Seed files live in
  `~/Developer/closet-seed/`; test fixtures are synthetic, or recorded from
  public product pages by `scripts/record_closet_fixtures.py` and never
  edited by hand. The Stitch Fix export script that makes the seed file is
  `frontend/scripts/closet/` (item fields only).

## Media tracker
- **Migrations are applied to Neon by the Deploy API workflow when a PR merges**, before the API is
  deployed (by hand is break-glass only: `backend/scripts/migrate_neon.py current` then `upgrade`;
  worktrees have no `.env`, the script reads the main checkout's). `schema_check` refuses to boot
  behind the schema, which is it working, not failing. A database *ahead* of the code boots with a
  warning, because the deploy order is migrate-then-deploy; that is only safe because **migrations
  are additive**: add tables and columns, never rename or drop in the same release (see
  `backend/migrations/README.md`). The list of revisions is `backend/migrations/versions/`.
- **Copy fields are decided in one place: `backend/formats.py`.** Every
  write path (PATCH, create, bulk create, bulk set) passes through
  `apply_copy_fields`. `platform` and `format_source` are derived there and
  never accepted from a request; a cart ID decides the format and refuses a
  contradicting one rather than overriding it. The frontend's platform list
  in `ItemForm.jsx` mirrors `PLATFORM_NAMES` in `sources/igdb.py`, which is
  the authority.
- **The physical catalogue** lives in `backend/physical_sources/` (read its
  README first) with routes in `physical_routes.py`, all admin-only. Its
  parsers are pure and a test holds them to it: no FastAPI or SQLAlchemy in
  their import graph, which is why `formats.py` imports its shared constants
  from `physical_sources/limits.py`. **Fixtures first**: nothing reads a store
  or the sheet until its real response is recorded by
  `backend/scripts/record_physical_fixtures.py` and a test runs on it;
  re-record when a store's handles change, never edit a fixture. `STORES` in
  `stores.py` is data: eleven stores (Atari is behind a bot challenge and
  out; GameFairy was dropped on 2026-11-10 for persistent 503s, and a
  refresh archives a dropped store's listings). robots.txt is honoured per RFC 9309, not `urllib.robotparser`, whose
  first-match rule lets Shopify's leading `Allow: /` allow everything.
- **The collapse rule** (`collapse.py`): any full cartridge in the home region
  makes a game a cartridge, because the registry row and a boutique listing
  usually describe different editions; otherwise the most useful known
  format; tiers only break ties between rows saying the same thing, and the
  sheet always beats `switch2-tracker` for its region. A cartridge elsewhere
  is a note, never a relabel. **Switch 1 is the exception:** it is region-free
  (`REGION_FREE_PLATFORMS` in `limits.py`; no Game-Key Card, no region lock),
  so a full cartridge in any region makes the game a cartridge. Switch 2
  keeps the home-region rule.
- **The registry writes formats in exactly one way:**
  `formats.apply_registry_format`, which raises for a format the owner
  recorded (`manual`, `cart_id`, `photo`). The sync after each registry
  refresh writes only unprotected owned Switch 2 copies; the rest are
  disagreements, shown on `/admin/catalogue` and the edit page, where "Use
  registry value" PATCHes `edition_id`. The registry's cart ID is never
  copied: `items.cart_id` means "printed on my copy".
- **The Switch 1 registry** is the r/NSCollectors "Switch Physical
  Releases" sheet (a different spreadsheet from the Switch 2 one), read by
  `physical_sources/registry_switch1.py` into `nscollectors_ns1` editions on
  platform 130, all regions, and bulk-matched by `switch1_ingest.py` against
  IGDB's Switch list paged by name (`switch1_titles.py`, pure). One exact
  match is AUTO/EXACT; anything else is IGNORED with `match_confidence`
  UNCERTAIN, the automatic-ignore marker (`resolve.ignore` writes a human's
  with NULL; only the matcher and `release_listed_ignores` revisit
  automatic ones), unless a live Switch 1 store listing carries the key,
  which is left to Resolve, also after later store refreshes. Automatic
  ignores never enter Needs match: `/admin/catalogue` shows "N Switch 1
  titles unmatched" (`totals.switch1_unmatched`) and lists none. IGDB is
  still never a physical source for Switch 1 (`refresh-platform` refuses
  130). The sheet's dates are never registry dates
  (`collapse.REGISTRY_SOURCES` leaves it out), so none of them is public: a
  Radar row known only from the sheet is listed on `/api/public/next`
  undated, under Later. Keep it out. Its keys are not in
  `test_physical_keys.py`'s corpus. No migration: after deploy, press
  Refresh Switch 1 once on `/admin/catalogue`; expect `rows_seen` near
  10,000 (editions, not titles), and check the run's errors, since IGDB
  pages beyond the first are first walked there.
- **The store list** (`/admin/store-list`) reads
  `GET /api/recommendations/store-list`: What's next's sections from
  `next_list.sections` in admin mode, over pending rows only, so an answer
  leaves it at once. Got it is Already own
  (`POST /api/recommendations/{id}/own`). **The public What's next is
  frozen to the batch** (Spine Next spec, S9): `load_next(public=True)`
  adds the answered rows of the latest generation (Discover per kind,
  Radar per platform) while it still has a pending row, so an answer
  changes `/api/public/next` only at the next generation. The private-title
  scan is lifted only for an owned frozen row the page renders, selected by
  identity (never by a title alone) and only while the item still carries
  that rendered row's title (`next_load.taste_sparing_owned`).
- IGDB fixtures for the snapshot are recorded from the live API with
  `backend/scripts/record_igdb_fixtures.py` (see `backend/scripts/README.md`);
  re-record when `FIELDS` changes.
- Metadata sources live in `backend/sources/`, one module per API behind a
  common interface — read that package's README before adding one. Their
  credentials are optional config checked lazily, so a missing key disables
  one media type rather than stopping the service; `main.py` logs which
  sources are configured at startup.
- `/shelf*` and `/stats` are public and **do** call the API, unlike every
  other public page; `/shelf/next` reads `/api/public/next`. `/api/public/picks` and
  `/api/public/radar` are retired (404, pinned by `smoke.sh`). `/shelf*`
  pages paint the build-time snapshot first
  (`frontend/public/snapshot/*.json`, written by
  `frontend/scripts/fetch-snapshot.mjs` on Render and refreshed nightly at
  00:17 UTC by `.github/workflows/nightly.yml` through a deploy hook, after
  its refreshes), then swap in live data; "Waking the server" shows only
  when there is no snapshot. The snapshot is gitignored and never committed.
  See README → Collection snapshot.
- **Items are private when created.** `is_public` defaults to false, including
  for photo imports, so nothing reaches `/shelf` until it is published
  from the admin collection page — per row, or with the bulk publish control.
  This was missing at first: the public API, page and filter all shipped
  without a way to set the flag, so the showcase was unreachable.
- **Playthroughs** (migration `0011`, `note` from `0012`) are one row per
  run of a game, written only by `backend/playthroughs.py`. Every status
  change goes through `POST /api/items/{id}/status` (`apply_status`;
  create, bulk create, the pin route and the comics Got it call it too),
  and every hand edit through the edit page's playthrough table. The
  route's `today` is the owner's local day (tolerance and the misclick
  rule); the optional `on` backdates a Finished, Paused or Abandoned move
  (never after today, never before the run's start) and `note` (≤ 500) is
  the one line written on the run it touches, both refused on other
  moves. On the shelf those three moves open the Wrap up sheet
  (`WrapUpSheet`, `statusMoves.isWrapUp`) instead of writing at once. Each write ends in `sync`,
  which recomputes the cached item columns in the same transaction:
  `started_at` the earliest start, `finished_at` the last finish,
  `times_completed` the finished runs. Readers keep using those columns, so
  PATCH refuses status and the three columns (422). Paused keeps the run
  open with `paused_on`; Replay and Try again open a new run. A **misclick**
  (a run opened today, never paused, no journal day, closed back to its
  previous outcome) is deleted, not recorded. Publicly an item carries
  `paused_on` and `finishes` (dated finishes, ascending); the item page's
  `started_at` is run 1's start, not the column (with run 1 undated the
  column would be a replay's), and `playing_since` is the open run's start
  on an active or paused game only, which before playthroughs was what
  `started_at` said. The admin row names its moves through
  `lib/statusMoves.js`. Status moves and the pin route take the owner's
  local `today`. The backfill counts a finish date as a finish whatever
  `times_completed` says, and gives a backlog or abandoned game with a date
  one abandoned run. **Deploy order:** apply `0011` to Neon, then merge, and
  change no status between the two: the old code's status writes skip
  `playthroughs`. A code rollback needs the schema at `0010` first, since
  the old code does not know the `paused` status. `migrate_neon.py` has no
  downgrade command: run `alembic downgrade 0010` by hand from `backend/`
  with `DATABASE_URL_DIRECT` set from the main checkout's `.env`. It drops
  `playthroughs` (the replay history goes with it) and moves paused games
  back to active, so take a Neon restore point first (see
  `backend/migrations/README.md` → Restore).
- **Favourites are capped at four**, the size of the favourites row. The
  API refuses a fifth with a 409 on PATCH, create and bulk create
  (`FAVORITES_LIMIT` in `items.py`); unfavouriting is never refused. Rows
  favourited before the cap are kept, not trimmed: the admin row lists them
  all with a note until they are, and the public row shows the top four.
- **Radar** (E8c) is `backend/radar.py` (pure: sections, score, reasons,
  caps), `backend/radar_load.py` (the catalogue, items and past answers as
  views) and `backend/recommendations_routes.py` (admin only). It reuses
  Play Next's profile: score = 0.55 affinity + 0.35 similarity + 10 × hype
  (taste-led, the owner's choice) + 15 when a pre-order closes within 30
  days; the tuning points are `TASTE_WEIGHTS`, `URGENCY_BONUS` and
  `URGENCY_DAYS`. Generate **regenerates only** — it
  never walks the stores (that is `/admin/catalogue`) — and shares one
  write lock with the catalogue (`main.py`), so the two never overlap.
  Lane 3 ("Digital so far") reads IGDB `release_dates` per platform, never
  `first_release_date` (the earliest date on any platform), and drops
  cancelled and Switch 2 patch releases; its fixture is recorded with
  `backend/scripts/record_igdb_fixtures.py --upcoming`. A dismissed, wanted or
  owned game is out of Radar and Discover for good; a skipped one returns
  at the next generation, and an answered suggestion takes no second
  answer. Only an **open** pre-order (window not closed, or no window and
  the game not out) counts as one. **Radar and Discover rows reach the
  public only as `PublicNextRow`s on `/api/public/next`** (Spine Next spec,
  B5): title, platform, format, release date and precision, cover, IGDB
  link, reasons, `top_pick`, `new`, and `item_id` on Wanted rows only.
  Never a store, price, stock, pre-order window, score, rank, lane or
  recommendation id. A date shows only when its `release_source` is in
  `next_list.PUBLIC_DATE_SOURCES` (the registry); a store's, IGDB's or the
  Switch 1 sheet's date is withheld and the cartridge goes undated to the
  end of Later (cut first by its cap). Links are igdb.com only
  (`IGDB_URL_PREFIX`). Reasons are rebuilt over public games; Discover's
  model sentence passes only `next_list.public_reasons_for`'s gates (cited,
  all-public, no private title, not second or third person), and the
  stored store lines never do. The rows
  are frozen to the batch (S9, see the store list).
  `tests/test_public_outputs.py` pins the fields (`NEXT_ROW_FIELDS`) and
  walks the body for `FORBIDDEN` keys. Want creates an ordinary item (no
  owned copy, backlog, public), shown in What's next's Wanted list; Already
  own creates a private one with a physical copy. Both record a format only
  when the registry decided it.
- **Discover** (E8b) is `backend/discover.py` (pure: released filter,
  pre-score, seeded shuffle, prompt, schema, validation, fallback) behind
  the same router, loader and lock as Radar; `kind` tells them apart. A
  Radar generate replaces its pending rows on the platforms it covered; a
  Discover generate replaces **all** of Discover's pending picks, so its
  list is always one batch under one ranking note. Pre-score = 0.45 affinity + 0.35 similarity + 0.20 quality
  ± 15 × popularity by mode (safe +, balanced 0, deep −), +10 buyable
  now, −10 unknown format; the tuning points are `DISCOVER_WEIGHTS`,
  `POPULARITY_WEIGHT`, `BUYABLE_BONUS` and `UNKNOWN_FORMAT_PENALTY`. The
  top twenty are shuffled with a seed from the batch id (position bias)
  and sent in **one** `complete_json` call per generate; the model answers
  with **indices** into that list, so it can never introduce a title, and
  `validate` drops bad or repeated indices and foreign `based_on`
  numbers. Any model failure (quota, timeout, unreadable answer, no
  provider) or no valid pick falls back to the deterministic top eight
  with template reasons, and the reason is stored as `model_note`: the
  feature never blocks on Gemini. `_failure_note` words the reason from
  `llm.py`'s own messages ("used up" for Gemini's per-day 429, "rate
  limit" for the rest); change one and the other has to follow — the
  route test builds its errors with `_quota_message` to catch that. Everything dated after today belongs to
  Radar, never Discover; "after today" means the release's whole period
  (a "Q4 2026" game is upcoming until 31 December). For catalogue releases,
  out, upcoming and open pre-order are decided only in
  `physical_sources/release_rules.py` (owner-typed item dates carry no
  precision and compare by day).
- **Play Next** scoring lives in `backend/picker.py`, pure and tested without
  a database; `picker_routes.py` only loads rows and records events. The
  tuning points are `PICKER_WEIGHTS` and `MOOD_BUCKETS`. The buckets hold
  exact IGDB strings taken from the collection's own snapshots (genres and
  themes capitalised, keywords lower-case) — never typed from memory. Shown
  events are written at most once per game per UTC day, with the slot they
  were offered in (`pick_events.slot`, migration `0009`; NULL before it).
  The second pick is "Change of pace", a strong game that contrasts with
  the last finish (size band or genre), and "Short and sweet" only when
  none does; the third is "Overdue classic" until acquired dates span 90
  days, then "Waited longest". Sizes are `SIZE_BANDS` (short up to 6 hours,
  medium up to 15, long beyond) on IGDB's "normally", shared by the Size
  filter and the pill; a finish counts for more while it is recent
  (`RECENCY_BONUS`, halving every `RECENCY_HALF_LIFE` days).
  Pinning is its own route (`POST /api/items/{id}/pin`) because it clears
  the previous pin and records an event in one transaction.
  **The public picks are live** (recommendation engine spec,
  `docs/planning/2026-11-09-recommendation-engine-design.md`):
  `backend/public_picks.py` builds `tonight.picks` (three games),
  `tonight.read_next` (two comics) and `tonight.watch_next` (two movies),
  `LANE_SIZES`, as a pure function of public rows of every type with their
  play records, the "never" events dated before today's UTC midnight, and
  the UTC day. The profile is public rows only, so a reason can name
  nothing private; each type's pool comes from its strategy
  (`strategies.py`, facets from `facets.py`) and is scored on
  `LANE_TERMS` (no waiting, which reads the private `acquired_at`; jitter
  seeded by the day). No shown, skipped or pinned event is read, so using
  Play Next changes nothing public and finishing something does, at the
  next refetch; `generated_at` no longer dates the picks. The pool is
  public, owned, backlog or paused, unpinned and not in hand (a game being
  played leads Tonight as its Continue card); a comic with nothing left
  to read is out. Best fit leads; Change of pace is labelled only when the
  last public finish exists and the contrast reason has something to say
  (that reason leads; a later private finish changes nothing, since
  withholding the label would say one exists); Overdue
  classic is the oldest release at or above the median affinity ("Out
  since 1999" leads). Waited longest and Pick it back up read private data
  and are never public. A card carries `size` {unit, value} and
  `progress` {read, of} (comics). Signed in, Tonight pins with the pin
  route and answers "Not tonight" with `POST /api/picker/events` (Play
  Next's own record); Read and Watch this tonight is a status move to
  Active. `tonight.last_finish` is the "Just finished" chip: the most recent
  *public* finish within `JUST_FINISHED_WINDOW` (60 days), else null --
  never hidden because a later finish is private, which its absence would
  hint at. Both finish queries count a NULL `owned_format` as owned, as
  picker does. Hours go out unrounded, so the page's size band is
  picker's. Reasons are first person everywhere ("which I rated 9").
- **Pick for me** (`/shelf/next#pick-for-me`, README → `GET
  /api/public/pick-for-me`) is `picker.public_pick_table` (pure, no model)
  served by `public_pick_for_me.py` through a second `PublicNextCache` on
  `/next`'s fingerprint, so anything new it reads must join that
  fingerprint too. All 88 size and mood combinations are precomputed; the
  band only looks one up. It publishes `score` and `terms` and nothing else
  `/next` forbids. `frontend/src/lib/pick-for-me-keys.json` is the key
  contract both test suites read: regenerate it when `combo_keys` changes.
- **Comics** are ordinary `items` rows of type `comic`, one per series
  (Comic Vine volume), never one per issue: `items` has no issue rows. Issue
  detail lives in the separate `comic_issues` table (below).
  Migration `0010` adds `issues_owned` and `issues_skipped` (range text,
  "1–54, 60"), `editions` (JSONB, `[{kind, label, from, to}]`), `read_to`,
  `shelf_format` (`comic_shelf_format`) and `following`.
  **`backend/comics.py` is the one range parser** (spec, D7): every write
  path canonicalises through it and answers a bad range with a 422 the
  form shows beside its field; `lib/comics.js` only expands the canonical
  text and checks an edition row's shape. The pull list's short
  Comic Vine snapshot (10 issues) per followed series lives in
  `source_metadata.issues` (`sources/comicvine.py` `fetch_issues`, one call
  per series; an answer naming another volume is refused whole); every
  issue of every series lives in `comic_issues`, not there. The pull list (`comics_routes.py`, admin only) groups
  issues into weeks of Wednesday to Tuesday in UTC days (D4); Got it adds
  the number to `issues_owned`, Skip to `issues_skipped`, and Skip refuses
  an owned issue; every item write path refuses it too
  (`comics.check_skips`, a 422 from `apply_comic_fields`, which reads the
  stored row for whichever field a request leaves out). **Only public
  series are shown publicly** (D5): a series reaches
  `/api/public/comics`, Out this week and `comics_this_week` on
  `/api/public/next` only when its row is public
  (owned and published, or a Want). Following alone is private, and so is
  every skip: `public_comics.py` never emits `issues_skipped`, a price or a
  store. **A run is drawn one way everywhere** (comic series display
  spec, `docs/planning/2026-11-11-comic-series-display-design.md`): the
  pure `lib/comicRun.js` derives per-issue state (held = a single or in an
  edition, counted once; read; missing; skipped in admin only) from the
  ranges, `editions` and `read_to`, and three views draw it: `RunLanes`
  (Run and Read on one axis, a fixed-width hatched tail while ongoing; the
  card and Runs row draw them from `segments`), `RunBox` (a book per
  edition, a cell per issue, a bundle for 12 or more same-state issues
  outside an edition, opening on a tap; no issue cap) and the admin's
  `ComicRunEditor` (tap modes Owned, Read to here, Skip over the box). The
  card's "read next" is the public `read_next`. Missing is hollow (a
  `--run-missing` outline) and the tail `--hatch`, chosen on measured
  contrast (3.30 dark, 3.25 light on `--surface`, 3.50 and 3.17 on `--bg`;
  `--line-strong` measured 1.73 and 1.66 and was refused): changing either
  means measuring again. The public `owned_text` already merges editions,
  so only the admin can tell an issue held twice. Intake draws the same
  cells for a series it adds to: every entry the intake routes answer
  with carries `on_shelf` (the matched series' run now, or null), Check
  lists those under "Already on the shelf · adds issues"
  (`SeriesGrewRow`, `comicRun.seriesGrowth` and `nearCells`), and Done's
  "Series that grew" reads the commit's `series_grew`. **A comic sitting
  (`kind = 'comic'`) reads books, not titles** (comics item 5a,
  `docs/planning/2026-11-13-comics-book-design.md`): `intake/reader.py`
  sends `importer.COMIC_EXTRACTION_PROMPT` and `COMIC_DETECTION_SCHEMA`
  (still one request per photo) and makes one entry per book, never merged
  by series, with `issue_number` (whole numbers 1 to 9999 only; "#4", "No. 4"
  and "4 of 4" read as 4, and #0, ½ and annuals as none: `importer.
  normalise_issue_number`), `number_source` (`read` when the model says it
  saw the number, `typed` once an edit changes it, else `none`), `format`
  (`single`, `collected`, `unknown`) and, for a collected book, its
  `collects_from`/`collects_to`, `edition_kind` (one of the five volume
  kinds `trade`, `hardcover`, `omnibus`, `compendium`, `ogn`; the model reads
  it from `COMIC_DETECTION_SCHEMA`'s enum, default `trade`, still one request
  per photo), `reprint_note` and `line_number`. A
  mixed sitting keeps the shelf prompt. A series whose best match is not
  exact and whose title ends ": <story>" is searched again without it
  (`reader._without_story`). The mark under a number is `number_check` on
  the entry (`intake/comic_books.py`, pure): in the run, not in the run,
  read, typed or none, from the match's Comic Vine `issue_count` or the
  highest issue the series on the shelf has (`on_shelf.issue_max`); never
  the model's opinion. `PATCH /api/intake/entries/{id}` validates a comic
  entry's number, format, edition kind and range (422) and a changed number
  becomes `typed`; `line_number` (the book's number in its line, typed at
  Check) is a whole number 1 to 9999 or blank, and an `edition_kind` outside
  the five is a 422. **The commit turns a single into an issue and a
  collected book into a volume** (story #328, `intake/volume_plan.py`).
  A single: `issue_number` becomes `issues_owned` (unioned per series,
  `got_issues` for a series on the shelf), as before. A collected book never
  writes `items.editions`: it is a `comic_volumes` row (owned, unread,
  `edited` true so the editions shim leaves it alone; label = the detected
  title up to 80 characters, `kind` = `edition_kind` or `trade`, `line_number`,
  slug `vol-<n>` with the smallest unused n, position last) on a title: the
  matched series (on the shelf, or made from the match as before), or, with
  no usable match, a title with no external ids: an existing one of the same
  name (`volume_plan.title_key`: case, a leading "The" and punctuation do not
  count; the oldest by `created_at`, `id`) is **reused**, so books of one
  name land on one title across sittings and add-bar adds, and only when
  there is none is a new **private** one made with the detected name. Books
  of one name in a sitting share it, and their Details `editions` all merge
  onto it. A collected book with no match is never an error, and one marked
  `owned` with no match writes nothing (counted as already owned). Its contents are `photo` collects
  entries: the printed `collects_from`/`collects_to` as `#a-b` (or `#n`),
  linked to the title when the series is matched and the range is 1 to
  9999, then the entries `comic_contents.parse_contents` reads from
  `reprint_note` (rules only, never the model), skipping any that repeat the
  range, linked only by the contents route's rule (own title, one plain range
  within the known issue count, a bracketed year that is the title's, else
  text only). The links are what make the marks derive: `sync_marks` runs for
  every touched title, and a linked range takes its issues out of the
  title's skipped ones. **The same issues in two books are two books**: the
  old "a photo of a book already recorded" skip by `(from, to)` is gone.
  **Idempotent:** a volume carries `intake_entry_id` (migration `0023`, no
  foreign key, a partial unique index), so committing the same entry again
  (a retry, a second device) finds its volume and writes nothing; a second
  writer that wins the unique index is read back, not an error. The add bar
  (`commit_one`) writes a book the same way (its `entry_id` argument is the
  idempotence key, a fresh one per call by default). The answer gains
  `volumes_new` (`id, slug, label, kind, line_number, title, title_id,
  title_created`) and `titles_created` (`id, title`) beside the unchanged
  `series_new` (which also lists `volumes`) and `series_grew`. **Check's
  preview** is built by the same `volume_plan.book_plan` the commit uses: every
  comic entry the intake routes answer with gains `adds` (`{kind: "issue",
  issue_number}` or `{kind: "volume", label, edition_kind, line_number,
  title, title_id}`) and `title_will_be_created`, and a collected book
  `contents_preview` (`[{series_name, issue_text, will_link}]`, exactly the
  entries the commit writes) and `already_held` (null, or `{volume_id, slug,
  label}` of an owned volume of the same title and kind that already links
  the same range: a warning only, the commit still writes the second book);
  `title_will_be_created` is false when a same-named title will be reused;
  no model call, no network. **Known limit:** an add-bar retry has no
  idempotence key (`/add` sends none), so a repeated request makes a second
  volume. The `editions` a
  row carries from Details (a typed list) are the old path and still merge.
  **Which title a matched book goes to (#330, `comics.shares_title`; the
  commit, the add bar and Check's preview all decide it in `commit._placed`):**
  a book that matched a series joins its title only when BOTH hold: (a) its
  title (`detected_title`, else `title`; the series' name if neither) with
  volume and format words removed (`Vol`, `Volume`, `Book`, `Deluxe`,
  `Edition`, `Omnibus`, `Compendium`, `Hardcover`, `TPB`, `Trade`, `Paperback`
  anywhere; `one`..`twelve`, numerals and roman numerals up to XII when they
  trail; `HC` is a format word) equals the series' name under `comic_contents.normalize_name`
  (case, `&`, a bracketed year, a leading "The"), punctuation ignored; and
  (b) when its contents are known (the printed range plus the reprint note's
  entries), at least `SHARE_MIN_FRACTION = 0.6` of their issues (a range counts
  its length, an entry with no number counts 1) are the series' own by
  normalised name; empty contents leave (a) alone to decide. A title of ONLY
  volume and format words ("Vol. 1", "HC", "Compendium One") names nothing, so
  (a) holds vacuously: the match wins and (b) still applies as stated. "Saga Book Two",
  "Saga Compendium" and "Batman Vol. 3" share; "Batman: Year One" and "Saga:
  The Complete Collection" do not (extra words are not on the list). 5 of 8
  issues shares, 4 of 8 does not. A book that fails is placed as unmatched: it
  goes to its own manual title (the reuse-by-name path above), its series
  issues recorded as text (`series_name` = the series, no link, since the
  volume is not on that series' title); the preview agrees (`adds`,
  `title_will_be_created`, `will_link` false). **No existing volume moves**
  (no migration): the rule only places new books.
  The answer's `series_new` lists a created series' issues for Done. The comic `issues_owned` field
  is `in_details: false`, so Details does not ask for it (the add bar still
  does). Check lists the books (`ComicBooks`, `lib/comicBooks.js`, words in
  `content/comicIntake.js`) and holds Next until every kept single book has
  a number. **Deploy order:** apply
  `0010` to Neon, merge, follow series on `/admin/pull-list`, then Refresh
  followed once (or wait for the nightly).
- **The play journal** (migration `0007`, `play_sessions`) is logged on the
  admin item page (`components/PlayJournal.jsx`, `journal_routes.py`): one
  row per day played, optional minutes, a private note. The public diary,
  `GET /api/public/diary?year=`, carries only public games and never the
  note (`PublicDiaryEntry`, pinned in `test_public.py`); Year in review
  reads it live (no snapshot) and reads complete without it. **Deploy
  order:** apply `0007` to Neon, then merge.
- The Games page reads `GET /api/public/stats?type=game` (the `stats`
  snapshot is that same games-only read, `LIVE_PATHS` in
  `lib/useSnapshotThenLive.js`); `test_public_outputs.py` pins the type filter
  (same fields, no comic in `?type=game`, no private row either way).
- Editing lives at `/admin/collection/:id`. A wrong external match is fixed
  there by re-linking through the metadata picker, which re-fetches cover,
  creator and the snapshot server-side. Deleting and re-adding is not
  necessary. **Delete and Redo** are on a card's panel (Games and Comics,
  `CardActionsShell`), on each List row, and on the edit page (Delete);
  the List view's selection bar has Delete N. Every one is a `ShelfConfirm`
  that reads `POST /api/items/delete-preview` when it arms and names the
  row and its playthroughs, journal days and issue records before it will
  go ahead (nothing deletes unconfirmed, and nothing uses a browser
  dialog). `POST /api/items/bulk-delete` is all or nothing (an unknown id
  is a 404 and deletes nothing); both are POST paths because `DELETE
  /{item_id}` would shadow a `/bulk`. `POST /api/items/{id}/redo` deletes
  the row and leaves one intake entry (state `check`, the item's match as
  `chosen`) in the newest shelf sitting of that kind (never a mixed one), or a new one, opened on Check, with the old match listed as a candidate; the
  page then opens that sitting. None of the three is in `JOB_ROUTES`. A
  lone unfinished sitting's line on the shelf has Discard.
- The photo importer sends images to the model and keeps nothing after the
  request (Starlette spools an upload over 1 MB to a temp file until the
  request ends). Each photo is capped at `MAX_PHOTO_BYTES` before it is read.
  Confidence is computed from string distance, never self-reported by the
  model — see `backend/matching.py`.
- **The importer sends one photo per request.** Three in one request took
  seven to eight minutes with no feedback. Nothing was timing out — Render
  allows 100 minutes, and IGDB resolution measured ~25s of it — so this is
  about progress and failure isolation, not a limit. It also keeps each
  payload under Gemini's 20MB inline ceiling.
- Source attribution is required by IGDB's, TMDB's and Comic Vine's terms,
  not decoration: Games credits IGDB and Comics credits Comic Vine, on the page
  that shows their data. The TMDB line (verbatim) comes back with a Film & TV
  page; there is no film on the shelf today, so no page carries it.
- **Comic issue pages** (migration `0016`, additive: the
  `comic_issues` table, keyed `(item_id, number)`, `ON DELETE CASCADE`, and
  `items.issues_synced_on`). `comic_issues.sync_series` pages a linked
  series' every issue from Comic Vine (`sort=id:asc`, one request per 100
  issues, descriptions included) and sets `issues_synced_on` only when the
  last page was reached; a partial run leaves the series stalest and the
  next one restarts at offset 0 (upserts make that idempotent).
  `POST /api/comics/issues/sync?budget=` is in `JOB_ROUTES`: stalest series
  first, budget 1 to 190 requests (default 120). The same sync runs on
  Follow and Want create and on "Refresh from Comic Vine" (budget 1: one page of up to 100 issues, the
  nightly finishes longer runs). Each run of the
  sync is a `catalogue_runs` row (source `comic_issues`), read by `GET
  /api/comics/status` (admin only, not in `JOB_ROUTES`) for the Jobs page's
  Comic issues row. The followed refresh (`comic_refresh`) and the tag job
  (`comic_tags`, partial when the budget or time ran out with series left,
  failed on a model stop, no model or an exception) are recorded the same
  way, and the same read returns `issues.last_run`, `refresh.last_run` and
  `tags.last_run` for the Comic refresh, Comic issues and Comic tags rows. An
  edition links to its Comic Vine issue by `cv_id` (`GET
  /api/comics/issues/search`, `PUT /api/comics/{id}/editions/{slug}/link`);
  an edit that changes the edition's range changes its slug and unlinks it.
  Public reads: `GET /api/public/items/{id}/issues`, `/issues/{n}`,
  `/volumes/{slug}`, and `GET /api/public/comic-issues` (the snapshot the
  build prerenders from). Frontend routes `/shelf/<id>/<n>/` and
  `/shelf/<id>/<slug>/` (`ed-<from>-<to>` or `vol-<n>`; `ComicVolume.jsx`); the cover wall replaces `RunBox` on the
  public series page when issue rows exist (no toggle there; `RunBox` is
  unchanged otherwise); the owner's range edits are shared in
  `lib/comicEdits.js`. **Deploy order:** apply `0016` to Neon, merge, then
  run the sync once by hand (`POST /api/comics/issues/sync` with the job
  token) or wait for the nightly.
- **Comic volumes** (migration `0021`, book-first epic #323, design
  `docs/planning/2026-11-17-comics-book-first-design.md`): `comic_volumes` is
  one book of a title (an `items` row), `ON DELETE CASCADE`, with `slug`
  (unique per title; `ed-<from>-<to>` for rows copied from `items.editions`,
  `vol-<n>` for new ones), `kind` (check: trade, hardcover, omnibus,
  compendium, ogn) beside `kind_raw` (the original free text), `line_number`,
  `isbn`, `pages`, `owned`, `read`. `comic_volume_collects` lists its
  contents (`series_name`, `issue_text`, `source` migrated/typed/parsed/photo,
  an optional link `item_id` SET NULL + `from_number`/`to_number`). The
  migration copied every `editions` entry into a volume plus one collects row;
  `items.editions` is untouched until a later, destructive drop.
  **Volumes are the source of the marks (#326):** `comics.sync_marks` counts a
  row's loose singles plus the linked ranges (`collects.item_id` = the row,
  both bounds set) of every OWNED volume, a cross-series link marking the
  other title's issues; a volume with `read` marks those issues read; text-only
  or unlinked collects mark nothing. `comics.load_holds` is the one query,
  `held_ranges` turns it into the `{from, to, label}` entries the pure
  functions always took for editions, and `held_through(session, item_id,
  number)` lists the owned volumes covering an issue. **The public issue page body** (`GET /api/public/items/{id}/issues/{n}`, #332) has no single-edition `held_as`/`edition` fields; it carries `held_single` (the number is in `issues_owned`, so the page can say single only, volumes only or both) and `also_in`, a list (empty when none) of every OWNED volume, of any PUBLIC title (`items.is_public`), that has a LINKED collects entry (`item_id` = this title, `from_number <= n <= to_number`), as `{slug, label, kind, line_number, title_id, title, same_title}`: one query in `public_issues._also_in` (it needs the volume's kind and title, which `load_holds` does not carry), each volume once, same title first, then title name, `line_number` nulls last, position. A text-only or unlinked entry, an unowned volume and a private title's volume never appear, and the private title's id and name never leak; no skip, intake id, `edited`, `source`, position or collects text is in the body. The links go to `/shelf/<title_id>/<slug>/`. **The compat
  shim** `comics.sync_volumes_from_editions` runs first inside `sync_marks`
  (every writer of `editions` ends in it) and mirrors `items.editions` into
  the edition-origin (`ed-*`) volumes and their one `migrated` collects row; it
  never touches another slug, never resets `owned` or `read` on an existing
  volume, and writes only what differs. `PATCH /api/comics/volumes/{id}`
  `{owned?, read?}` is the volume's own write: it re-syncs every title the
  collects touch and keeps `read_to` in step. `shown_status` takes
  `volumes_owned`/`volumes_read` (owned unread volumes are never caught up;
  `comics.volume_counts`); only the admin wall passes them until #329. Admin
  surfaces (`_state`, the pull list, the item list's `comic_run`) count the
  owned volumes (`load_holds_many`); the public wall and issue
  page still read `items.editions`, the mirror; the volume page and the index
  read the volumes only, so an un-owned `ed-*` volume no longer shows on a book
  page. **Known limits (follow-ups):** (1) un-reading a volume keeps issues that are singles or read
  through another volume, but `read_to` cannot protect them (it is derived from
  the marks). `comics.title_kind(volumes, issues)` derives a
  title's kind (`run`, `book_line`, `single_book`, `both`); it is never stored.
  **Public title kind and slots (#330, PR 7a):** `PublicComicDetail` (the
  item page's `comic` block, and `GET /api/comics/{id}/wall`'s, which shares
  the model and also serves private titles) gains `kind` (`title_kind` of the
  OWNED volume count and the loose issues: `issues_owned` held singles; the
  issue marks are not used because they also mark what a volume links),
  `volumes` (owned only, line order: numbered by number, then position; each
  `{slug, label, kind, line_number, cover_url, read}`), `volumes_owned` and
  `slots` (only for a `book_line`: `[{number, slug|null}]` for 1..the highest
  owned `line_number`, null where nothing owned has the number; `[]` when no
  owned book is numbered, never a size beyond the highest owned number). Each
  `PublicComicRow` of `GET /api/public/comics` gains `kind`,
  `volumes_owned` and (#331) `volume_numbers` (the line numbers 1..9999 of the
  OWNED books that have one, ascending, each once; never the line's size;
  one grouped query, `owned_volume_shelf`, for the whole shelf, no N+1). The
  admin item read's `comic_run` carries the same three keys (`comics.title_shape`,
  from the row's own owned volumes), so the admin shelf says the same words, and each
  `comic-issues` index row gains `kind` (what the build's prerender reads; it
  does not read comics.json). Never published: non-owned volumes, intake ids,
  `edited`, source, `kind_raw`, position, collects, skips, following.
  `scripts/audit_comics.py` is the read-only pre-migration report.
  **Admin volume editor (#334, PR 4a, migration `0022`):** `comic_volumes.edited`
  (default false) is set by every hand edit (create, replace, move, link). The
  shim (`sync_volumes_from_editions`) never writes, repositions or deletes an
  `edited` volume, and an edition whose volume is edited makes no second volume
  under the same slug; un-edited `ed-*` volumes follow `items.editions` exactly
  as before (intake commit still writes editions until #328). Routes in
  `comics_routes.py`, all admin-only with response models: `GET
  /{item_id}/volumes` (the Books panel: a title's books in line order, owned
  or not, each `id, slug, label, kind, line_number, owned, read, edited,
  collects_count, cover_url`; 404 for an unknown title), `GET
  /volumes/{id}` (full view, private titles included: `edited`, title with
  `is_public`, collects with `link {item_id, title, from/to, is_public}`,
  `prev`/`next` in the line owned or not, `held_issues`), `POST
  /{item_id}/volumes` (slug `vol-<smallest free n>`, position max+1), `PUT
  /volumes/{id}` (fields plus the whole collects list; an entry sent back by
  `id` unchanged keeps its source, a new or changed one is `typed`, an unknown
  id is a 422; 422 `detail` is FastAPI-shaped, `loc` `["body","collects",i,...]`),
  `POST /volumes/{id}/move` (keeps the slug unless the new title has it;
  answers `slug_kept`/`previous_slug`; marks the volume edited, because an
  unedited `ed-*` volume on a title with no matching edition would be deleted
  by the shim), `GET /volumes/{id}/delete-preview` (`issues_unheld` per title,
  `read_marks_lost`), `DELETE /volumes/{id}`, `PUT /volumes/{id}/link`
  (Comic Vine cover and description fetched server-side, never from the
  client). Every write locks the touched `items` rows first in sorted id
  order, then the volume, runs the shim on each touched title, and ends in
  `sync_marks` for every touched title (old and new title, old and new link
  targets) plus the `read_to` follow-up, in one commit. **Mirror removal:**
  deleting or moving any `ed-*` volume, edited or not, also removes its
  entry from the old title's `items.editions` (the entry `edition_slugs` gives
  its slug over the current list; none matching is a no-op), or the shim would
  recreate it; a `PUT` that changes `kind` clears `kind_raw`; the old `PUT /{id}/editions/{slug}/link` and the
  `editions` PATCH keep working until a later PR drops them.
  **Contents parse (#327, PR 5, no migration):** `comic_contents.py` (pure,
  in `test_physical_imports.py`'s purity list) turns a description or reprint
  note into `Entry{series_name, issue_text, year}`. `parse_contents` is rules
  only and never guesses: it needs a trigger (collects, reprints, includes,
  contains, originally published in) and reads `#1-6`, lists, "issues 1-5",
  "No.", "Vol. N" (dropped from the series), a bracketed year (kept on the
  entry, not the name), en/em dashes, `&`/and/commas/semicolons between runs
  and `Annual`/`Special` (kept as issue text, one entry per range element). A
  clause with anything that is not a title before a number (a stray `/`, a
  bare year), or prose after it ("#1 sold 1 million"), is dropped whole; an
  unnamed run ("Collects issues #1-5") counts only when nothing else is said
  in the clause ("of Aquaman", "plus Hellboy #3" drop it). Caps: 20 entries,
  series 120, issue text 200. `normalize_name` ignores case, `&`, a bracketed
  year and a leading "the" on both sides of every comparison; the displayed
  name keeps its "The". `POST /api/comics/volumes/{id}/contents/parse`
  `{note?: <=2000}` (admin): text = description + note; rules, then ONLY if
  they find nothing, the text is non-empty and `intake/budget.remaining` > 0,
  one `complete_json` call on the Gemini-only provider (`provider_factory`,
  40 s, `CONTENTS_CALL_SECONDS`, usage recorded by the provider's recorder
  like the tag job's; no retry). The model sees `model_source` (note FIRST,
  then the description, cut to 4000) and its answer is checked against that
  same text by `comic_contents.validate_model`: every clause of an issue text
  must be reproducible from it (the exact `#1-6`/`#7`/`Annual #2`, or "1 to
  6"/"issue 7" for a plain range or number; numbers merely being present is
  not enough), no backwards range, nothing over 9999, a series name that is in
  the text, an empty one only when the text has a contents phrase; one bad
  entry discards the whole answer. Model entries are TEXT ONLY, never linked.
  Response `{entries_added, entries_replaced, entries_removed, used_model,
  reason: null|budget|no_match|model_error|no_text, collects}`. No provider
  or a model error is `model_error`, a spent budget `budget` (model not
  called). The model call runs before any row lock; the write then locks
  items, then the volume (`_lock_volume`). `_apply_parsed` reconciles only
  this volume's `parsed` entries: typed, migrated and photo are never touched,
  a new entry equal to one of them is skipped, a parsed entry found again keeps
  its row and position, one no longer found is deleted (`entries_removed` is
  those with nothing replacing them), the rest are appended, and a parse that
  finds nothing deletes nothing. An empty series takes the title's name. A
  RULES entry is linked to the title only when its normalised series equals
  the title's, its text is one plain range or number 1..9999 **within the
  title's known issue count** (`source_metadata.issue_count`; unknown or 0
  means no link), and any bracketed year equals the title's year (unknown
  title year means no link): the only auto-link (marks then derive through
  `sync_marks`). A parse does NOT set `edited`. `PUT /volumes/{id}/link` runs
  the same with RULES ONLY on the copied description (never the model, never
  budget), in a savepoint so a failure cannot fail the link or leave a partial
  write. `sync_marks` inserts its stub rows in chunks of `INSERT_CHUNK` (1000)
  so a large range cannot pass asyncpg's bind limit. **Reprint note from a
  photo:** the comic intake schema's optional `reprint_note` (<=300 chars)
  lands in a collected book's entry payload when non-empty; PATCH checks it
  (`comic_books.edit_book`) and keeps it when a payload omits it. Nothing
  consumes it at commit yet: story #328 will pass it to `parse_contents` and
  write the entries with source `photo`. **Known limits:** a no-trigger
  description that the rules cannot read costs one model call on every click
  (no memo of `no_match`); the 12-call reserve protects intake, and two tabs
  clicking at once can overspend the budget by one.
  **Public read (#335 book-page slice, #329):** `GET
  /api/public/items/{id}/volumes/{slug}` (`public_issues.build_volume_page`)
  serves one OWNED volume of a PUBLIC comic title, `ed-*` slugs included (old
  URLs keep working); a private title, an unknown slug and a volume not owned
  are the same 404 body. Collects come in order with `series_name` and
  `issue_text` as written; `link` is `{item_id, from_number, to_number}` only
  when the entry is linked to a public comic and both bounds are set, and its
  range is clamped to the numbers whose issue page exists (`_page_numbers`:
  held, released or the next dated issue) AND that Comic Vine has synced (a
  `comic_issues` row with a `cv_id`): `from_number`/`to_number` are the first
  and last such numbers inside the entry's range, and no such number means
  null (plain text). A skip is deliberately not read, so it changes no link
  (a skipped number's page is a plain "missing"); the entry's `source` and any private title's id never leave. `prev`/
  `next` walk the title's owned volumes by `line_number` (null last), then
  `position`. `description` is paragraphs (split on a blank line). `GET
  /api/public/comic-issues` rows carry `volumes` (owned volumes of a public
  title: slug, label, kind, line_number, cover_url) and no `editions`; the old
  `GET /api/public/items/{id}/editions/{slug}` endpoint is gone (#329 PR 3b),
  because migrated `ed-*` volumes keep their slug and serve the same URLs (it
  also ignored `comic_volumes.owned`). The prerender reads `volumes`. The wall
  (`/issues`) still lists `editions` for its book tiles. Both tables join the
  `/api/public/next` fingerprint (`public_next_cache`). `analytics.py`
  counts `/shelf/<id>/vol-<n>` (the `vol-[1-9][0-9]{0,3}` part, beside `ed-*`,
  in `_PATTERNS` and `ITEM_PATH`); App.jsx must accept the same part when the
  page ships. `test_public_issues.py` checks every new key against
  `scripts/smoke.sh`'s `PRIVATE_KEYS`.
- **Issue marks** (migration `0017`, comics-book design 5b): each
  `comic_issues` row carries `owned`, `read` and `skipped`, and a row with a
  null `cv_id` is a stub, a held or skipped book Comic Vine has not synced.
  `comics.sync_marks(session, item)` is the one writer of the marks: from the
  ranges, `editions` and `read_to` it sets every row (owned = single or in an
  edition; read = owned and at or below `read_to`; skipped = in
  `issues_skipped` and not held), inserts stubs, and clears rows no longer
  held. It runs in the same transaction as every comic write: item create,
  bulk create and PATCH (`items.py`), Got it, Skip and the edition link
  (`comics_routes.py`), and intake's commit. `sync_series` never touches the
  marks and fills a stub when the issue arrives; `load_issues` hides stubs
  unless `include_stubs`, so Check and the build's index ignore them. From 5c
  the public wall and issue page read owned and read from these rows (a held
  stub is a numbered blank cover; a skipped one is no page) and `skipped`
  stays private. **After deploy:** `POST
  /api/comics/marks/backfill` once, signed in (not a job route): it answers
  `{series, rows_marked, stubs_added, rows_changed, mismatches, errors}`;
  `mismatches` empty means the marks agree with the ranges. Idempotent.
- **The marks are the record (5c, comics-book design).** Read is per
  book: a tap sets one issue's mark, and `sync_marks` keeps every `read`
  mark of a row that stays owned unless the write set `read_to`
  (`from_read_to`, item PATCH) or names the reads (`reads`, the mark
  route); a number newly held reads as `read_to` says. `issues_owned` (the
  singles) and `read_to` (the highest owned issue with every owned issue up
  to it read, what Read next and the lanes mean) are kept in step from the
  marks by the mark route; the API still accepts them, and an explicit
  `read_to` marks every owned issue up to it read and clears those above.
  **`POST /api/comics/{id}/issues/{n}/mark`** `{state: missing | owned |
  read, to?}` is the one write behind every tap (series page wall, issue
  page, admin comic page, the book page's Read to the end with `to`):
  owned adds the single and clears a skip, read is owned plus read, missing
  removes the single and its read mark; a book held only in an edition
  can't go missing (409 "In <volume label>. Edit the volume to change it.",
  the cycle there is owned and read). Admin only, not in `JOB_ROUTES`;
  Undo posts the previous state; the answer's `previous` names what a first
  tap moved on a Want (owned format, status) so Undo can restore it. Skip keeps `POST .../skip` (and the issue
  page's PATCH to un-skip) and stays private. `GET /api/comics/{id}/wall`
  (admin) serves the wall and comic block for any comic, private too, with
  the public builders. Public bodies gain `owned` and `read` on the wall and
  issue page and `issue_count` (Comic Vine's `count_of_issues`, stored as
  `issue_count`) on the comic block; the series read count follows the
  marks. **The comic edit page is `/admin/shelf/comics/:id`**
  (`AdminComic.jsx`: Series, Issues as the same `CoverWall` with taps,
  Editions, Comic Vine match, Delete); `/admin/collection/:id` is games
  only and redirects a comic there client-side. No range text field, read-to
  field or run cells (`ComicRunEditor` is gone). The public series page is
  its mirror minus edit controls and private fields.
- **Tags** (shelf sweep item 7; migration `0018`, additive: `items.tags`, a
  JSONB list of `{group, tag}` NOT NULL default `[]`, and `items.tags_edited`,
  boolean default false). `backend/tags.py` (pure) is the one vocabulary:
  games get Play style, Setting and Tone, comics Genre, Based on and Form
  (`VOCABULARY`, keys only; the words people read are in the frontend's
  `content/tags.js`, and `tests/test_tags.py` holds `content/tagVocabulary.json`
  to the same keys). **Games** are tagged by `IGDB_GAME_MAP` from the
  snapshot's genres, themes and keywords, no model: on create, bulk create,
  intake's commit, Want, refresh and bulk refresh (`items._apply_detail`),
  and by `POST /api/items/tags/backfill` (admin only, not in `JOB_ROUTES`,
  idempotent, skips `tags_edited` rows; answers `{games, changed,
  skipped_edited, untagged, by_tag}`). **Comics** are tagged by
  `POST /api/comics/tags/generate?budget=` (in `JOB_ROUTES`): public series
  with no tags and not edited, one `complete_json` call each with the model
  answering indices into the numbered vocabulary (`tags.comic_prompt`,
  `COMIC_SCHEMA`, `comic_tags_from`), at most `budget` (1 to 50, default 12)
  and never past `intake/budget.remaining`; the row is re-read under lock
  before the write, so an edit made during the call wins; a model error
  stops the run and is never a strike. An unusable answer adds a strike
  (`items.tag_attempts`, migration `0019`, never public): at
  `TAG_ATTEMPT_LIMIT` (3) the series leaves the queue and the summary's
  `gave_up` lists it; the Jobs row says "N series given up on" from a live
  count in `GET /api/comics/status`. Saving tags, and a Comic Vine refresh
  that changes the description, reset the count to 0.
  The owner saves tags with `PATCH /api/items/{id}` `{tags: [...]}`, checked
  against the type's vocabulary (422 otherwise), which sets `tags_edited`.
  `tags` is on `PublicItemOut` (so the item list, the detail and, through the
  items row's xmin, the `/api/public/next` fingerprint) and on
  `PublicComicRow`; `tags_edited` is never public. `facets_of` reads the
  curated tags as facets too (`("curated", "group/tag")` pairs from
  `facets.snapshot_tags`) for a comic always, and for a game only when
  `tags_edited` (IGDB stays an unedited game's source), so a comic's "why
  this pick" reasons can name one. The comic job builds a Gemini-only
  provider (`llm.build_free_provider`), gives each call 40 s, stops after
  480 s (`stopped: "time"`), and answers `ok: false` when it stopped on
  `"model error"` or `"no model"`.
  **After deploy:** apply `0018` to Neon before merging, then
  `POST /api/items/tags/backfill` once and `POST /api/comics/tags/generate`
  once, signed in (or with the job token for the second), or wait for the
  nightly for the comics.
- **Job token:** `require_admin` accepts `Bearer JOB_TOKEN` only on
  `items.JOB_ROUTES`, matched on the routed template, and
  `tests/test_job_token.py` is the point of it: it pins the whitelist
  exactly, so a new route cannot become reachable by the token unnoticed.
- **Nightly order:** the followed comics' refresh
  (`POST /api/comics/refresh`, in `JOB_ROUTES`; early because it is cheap
  and the catalogue steps can run the job into its timeout), then the
  comic issue sync (`POST /api/comics/issues/sync?budget=120`, also in
  `JOB_ROUTES`, right after the refresh so a followed series' new issues
  land the same night), then the comic tags
  (`POST /api/comics/tags/generate?budget=12`, in `JOB_ROUTES`, one model
  call per untagged public series inside the free-tier budget), then the
  weekend forecast, then the Closet's tag queue
  (`POST /api/closet/jobs/tag`), then tomorrow's outfit plans
  (`POST /api/closet/jobs/plan`), then registry,
  then the WooCommerce stores on Render, then the Shopify stores walked on the runner
  (`backend/scripts/walk_stores.py`, posting each to
  `/api/physical/stores/{key}/ingest`: Shopify rate-limits Render's IP), then Switch 1
  (Sunday evenings in Denver), then resolve (up to 5 rounds), then Radar,
  then Discover (Sunday evenings), then the spot finder (Sunday evenings),
  then the Closet's Review opinion (`POST /api/closet/jobs/opinion`, Sunday
  evenings, or any night started by hand with `closet_opinion`), then the
  page-view rollup, then the snapshot compare and the deploy hook.
  The weekend forecast (`POST /api/spots/weather/refresh`) runs right after
  the comics, every night. There is no picks step: the public picks are
  computed live, and `POST /api/picker/next` is out of `JOB_ROUTES`.
- **`next_list.py`** (pure, with `next_load.py` loading the rows) is the one
  sectioning authority for `/api/public/next` and
  `/api/recommendations/store-list`. In public mode only registry dates
  count. Public reasons are rebuilt over public games, and Discover model
  text must pass both the id check (every cited game public) and the title
  scan (no private game named, numeral and edition variants included).
  `/shelf/next` paints `/snapshot/next.json` when present; `fetch-snapshot`
  writes it as an optional snapshot.
- **`/api/public/next` is cached on a data fingerprint**
  (`backend/public_next_cache.py`, one entry per app); admin routes are not,
  and the store list stays live. The fingerprint is the UTC day, a count and
  an `(id, xmin)` digest of every `items`, `recommendations`,
  `playthroughs`, `play_sessions` and `comic_issues` row (Tonight's comic
  progress counts read marks) (the Continue card reads the open
  run and its journal, which touch neither the item's xmin nor its
  updated_at), the
  catalogue's finished runs, and the windowed shown and skipped pick events
  dated before midnight, for a Play Next commit that spans it. xmin, not `max(updated_at)`: SQL written by hand
  skips the ORM's `onupdate`, and an earlier transaction can commit after a
  later one. Anything new the body reads must join the fingerprint, or the
  page serves it stale. A restored "never" shows at the next UTC midnight.
