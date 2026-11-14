---
status: done
kind: feature
mode: auto (Joey approved the tag sets and public-at-once, 13 Nov 2026)
---

# Tags: a curated set per type

Shelf sweep queue, item 7 (`docs/planning/2026-11-12-shelf-sweep-queue.md`).
Rules: `docs/design-system.md`.

## Problem

All 12 comic series have `genres: []`. Comic Vine gives a volume no genre field, and its concepts are imprints and print trivia. Games carry 20 IGDB genres and 20 themes across 107 public rows. Adventure is on 66 of them and the Action theme on 86, so neither narrows anything. The item page's chip row mixes genres and platforms (#184).

## Approved tag sets (Joey, 13 Nov 2026: "Yes and right away")

**Games**, derived from IGDB genres, themes and keywords, with no model involved. Counts are the 13 Nov public counts.

| Group | Tags |
|---|---|
| Play style | Shooter 35 · RPG 28 · Platformer 21 · Open world 21 · Puzzle 16 · Strategy ~15 (Strategy, Tactical, TBS, RTS) · Racing 9 · Simulation 9 · Survival 8 · Party 8 · Beat 'em up 8 · Stealth 7 · Fighting 6 · Card & board 4 · Sports 3 · Story-led 3 (Point-and-click, Visual Novel) · Metroidvania, Roguelike and Soulslike from IGDB keywords |
| Setting | Sci-fi 30 · Fantasy 26 · Horror 16 · Mystery 10 · War 5 · Historical 3 |
| Tone | Comedy 28 · Drama 7 · Family 4 (IGDB "Kids") |

Dropped as filters: Adventure, Action, Indie, Arcade, plus anything not mapped above (Quiz/Trivia, Sandbox, Erotic, Business, Thriller and Non-fiction stay in the raw snapshot only).

**Comics**: one model call per series reads the Comic Vine description, title, publisher and years, and answers only from this closed vocabulary.

| Group | Tags |
|---|---|
| Genre | Horror · Sci-fi · Fantasy · Crime · Action · Comedy · Superhero · War · Western · Romance · Post-apocalyptic |
| Based on | Movie · TV · Game · Original |
| Form | Anthology · Mini-series · Ongoing · One-shot · Pin-up |

Generated tags are public straight away. The owner can change them on the edit page.

## Decisions (my calls)

1. **Stored, not computed on read.** Migration `0018` (additive) adds `items.tags` (JSONB list of `{group, tag}`, NOT NULL, default `[]`) and `items.tags_edited` (boolean, default false). Nothing regenerates tags the owner has edited.
2. **One vocabulary module**, `backend/tags.py` (pure). It holds the groups and tags per type, the IGDB → game-tag mapping, the comic prompt and schema, and validation. The model answers with indices into the vocabulary, as Discover does, so it can never invent a tag. The words live in the frontend's `content/` and match the backend vocabulary by key.
3. **Games:** tags are worked out by the mapping when an item is created or its metadata is refreshed, and by a one-off backfill. A game can get no Play style tag at all, for example one that IGDB only calls "Adventure"; that is allowed.
4. **Comics:** `POST /api/comics/tags/generate?budget=` takes series with no tags and not edited, one `complete_json` call each, inside the free-tier budget (`intake/budget.py`'s remaining count, minus its reserve). It sits in `JOB_ROUTES`, pinned in `test_job_token.py`, and in the nightly right after the comic issue sync, so a new series is tagged the night it arrives. It also runs once by hand after deploy for the 12 existing series. A failed call leaves the series untagged for the next night.
5. **Public:** `tags` goes on the public list and detail models, pinned in `test_public_outputs.py`. Notes and any private value never go through it. It joins the `/api/public/next` fingerprint automatically, because a tag write changes the item row's xmin.
6. **Games page:** labelled chip groups Play style, Setting and Tone replace the raw genre filter. A test fails if any chip matches more than half of the items it's given. **Comics page:** Genre and Form chip groups.
7. **Item page:** labelled groups (Play style, Setting, Tone for games; Genre, Based on, Form for comics), with Platforms as a separate labelled row (#184).
8. **Edit page** (games, and 5c's comic page): a tag picker per group drawn from the vocabulary. Saving sets `tags_edited`.
9. **Reasons:** `facets.facets_of` also reads `items.tags` (mapped onto the same facet names, such as horror and sci-fi), so comics get "why this pick" reasons. Game reasons keep reading IGDB tags as well.

LLM requests: 12 once, then about 1 per new comic series per night. No paid fallback.

## Plan (TDD; one backend pytest run at a time)

1. Migration `0018`, the model and its rehearsal (`tests/test_migrations.py`), plus the `test_schema_check.py` head pin.
2. `tags.py`: vocabulary, the game mapping, the comic prompt, schema and validation. Pure tests, including one over the recorded IGDB fixtures' genres and themes.
3. Game tags written on create, refresh and bulk refresh, plus `POST /api/items/tags/backfill` (admin only, idempotent, skips edited rows).
4. The comic tag job route with budget, a stubbed provider in tests, validation, and skipping of edited and already-tagged rows. Added to `JOB_ROUTES` and to `nightly.yml` after the issue sync. `test_job_token.py` updated.
5. Public outputs and pins. `facets_of` reads tags, with tests that a comic's reasons can name a tag.
6. Frontend: Games and Comics filter groups (including the more-than-half test), item page labelled groups with Platforms separate, and the edit page tag picker for games and comics.
7. Docs: a design-system rule (a tag is a curated word from a type's vocabulary, shown in labelled groups and never mixed with platforms), CLAUDE.md (`tags.py`, `0018`, the job, the nightly order), the changelog, this doc's status, and TODO item 7 ticked.
8. Verify: targeted backend files plus CI's full suite, `npm test`, lint, format, ruff, build, e2e.

Ship: apply `0018` to Neon before merging, merge, then run the game backfill and the comic job once from the signed-in session. Record the per-group counts and the comic tags.

Done when: every public comic series has at least one tag a visitor can read; no filter chip on the Games page matches more than half the shelf; the item page shows genres and platforms as separate, labelled groups.

## Deviations

- **Public pins are in `test_public.py`, not `test_public_outputs.py`.** The list and detail field sets (`LIST_FIELDS`, `DETAIL_FIELDS`, `NEVER_PUBLIC`) live there, so `tags` joined them and `tags_edited` joined `NEVER_PUBLIC`. `test_public_comics.py` pins `tags` on the comics rows (`PublicComicRow`), which the Comics page reads, and `test_public_next_cache.py` holds that a tag write moves the `/api/public/next` fingerprint.
- **The comic job tags public series only.** Private rows (a followed-only series) would spend free-tier calls on tags nobody can see. A series that is published later is tagged the next night.
- **The job's `budget` is a number of series** (1 to 50, default 12), bounded by what `intake/budget.remaining` leaves today. It answers `{tagged, failed, calls, budget, waiting, stopped, series, errors}`. The nightly step has no Jobs-page row.
- **The prompt carries the first-published year and the issue count**, not a year range: Comic Vine's volume record has a start year and a count, and the count is what tells a mini-series from an ongoing one.
- **Tags are keys, not words.** `items.tags` stores `{group: "play_style", tag: "open-world"}`; `content/tags.js` holds the words. `content/tagVocabulary.json` mirrors the keys so a backend test can hold the two together.
- **There was no raw genre filter on the Games page to replace.** The tag groups were added beside Status and Platform. A chip over half the shelf is left out at runtime (`lib/tags.js`, `MAX_SHARE`), and a test holds the e2e fixture shelf to it; the real shelf's counts (Shooter 35 of 107 is the largest) are inside the rule.
- **The item page's Platforms row lists every platform the game is on**, the owned one first-class and the others muted, in place of "Also on", which left the owned one out. Raw IGDB genres and themes no longer show there.
- **`facets_of` reads curated tags for games as well as comics.** A game's tags map onto the facets IGDB already gave it, so nothing new appears until the owner edits a game's tags.
- **The Want route** (`recommendations_routes.py`) tags the game it creates too; it is a create path the plan did not list.
- **Backfill reads stored snapshots** (no IGDB call), so a game whose snapshot predates a keyword IGDB has since added keeps its tags until it is refreshed.
