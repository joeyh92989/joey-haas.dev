# Tracker E8b — Discover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Spec: `docs/planning/2026-09-27-tracker-e8b-discover-design.md`.

**Goal:** `/admin/discover`: released physical games on the owner's
platforms that the owner doesn't have, pre-scored against their taste,
re-ranked into eight by one Gemini call with reasons naming their own games,
with Want / Not interested / Already own / Skip; plus a Rate-a-few panel and
Radar's Watch renamed to Want.

**Architecture:** `backend/discover.py` is pure (filter, pre-score, seeded
shuffle, prompt, schema, pick validation, fallback) beside `radar.py`, and
reuses `picker.py`, `radar_load.py` and `radar.py`'s reason helpers. The
existing `recommendations_routes.py` gains the Discover kind, `/want`
(replacing `/watch`) and `/own`, calling the model through
`llm.build_provider` as the photo importer does. The frontend extracts
Radar's card into a shared component.

**Tech Stack:** FastAPI, SQLAlchemy async, Postgres 18, `httpx2`, pytest on
a real Postgres; React 19, react-router v8, Vitest + Testing Library.

**Branch:** `tracker-e8b` (worktree
`~/Developer/joey-haas.dev-worktrees/tracker-e8b`, cut from `origin/main`
at `3b15c85`).

## Global Constraints

- Python 3.12 via `backend/.venv`; every commit gated on ruff format, ruff
  check and the full backend suite with `-W error::SyntaxWarning`, exit
  codes captured to a variable (zsh); frontend commits on `npm test`,
  `npm run lint`, `npm run format:check`, `npm run build`.
- `discover.py` is pure (added to `tests/test_physical_imports.py`'s check).
- One model call per generate; the feature never blocks on it; the model
  answers with indices only and never introduces a title.
- No migration. Nothing from `recommendations` is public.
- All `/api/recommendations*` routes admin-only; answers apply only to a
  waiting suggestion (`WAITING`), rows locked as Radar's are.
- Want/Own record a format only when the registry gave it.
- Tokens only in CSS; nothing hover-only; per-card controls named for
  their game; shelf prefs through `readShelfPref`/`writeShelfPref`.
- Commits ≤5 files; never print or commit a credential; the model key is
  never logged.

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `backend/tests/test_public.py` | Discover names out of public models, then responses | 1, 5 |
| `backend/discover.py` (new), `tests/test_discover.py` (new) | pure pipeline | 2 |
| `backend/tests/test_physical_imports.py` | purity check includes `discover` | 2 |
| `backend/radar_load.py`, `tests/test_radar_load.py` | `collection_platforms(session, allowed)` | 3 |
| `backend/recommendations_routes.py`, `tests/test_recommendations_routes.py` | `/want`, `/own` | 4 |
| `backend/recommendations_routes.py`, `backend/main.py`, `tests/test_discover_routes.py` (new) | Discover generate and list | 5 |
| `scripts/smoke.sh`, `tests/test_public.py` | 401s, deep link, leak rows | 6 |
| `frontend/src/components/RecommendationCard.jsx` (new), `pages/AdminRadar.jsx`, `AdminRadar.test.jsx` | shared card; Want wording | 7 |
| `frontend/src/components/RateAFew.jsx` (new), `RateAFew.test.jsx` (new) | the panel | 8 |
| `frontend/src/pages/AdminDiscover.jsx`, `.test.jsx` (new), `App.jsx`, `Admin.jsx`, `index.css` | the page | 9 |
| `CLAUDE.md`, `README.md`, this plan | docs | 10 |

---

## Zone 1 (all tasks; no migration, infra or deploy-path change)

### Task 1: Pin Discover's fields out of the public API

**Parallel-safe:** yes. **Files:** `backend/tests/test_public.py`.

- [ ] Extend `RECOMMENDATION_NAMES` with `"ranked_by"`, `"model_note"`,
  `"based_on_titles"`. Run `tests/test_public.py` (passes: nothing public
  names them).
- [ ] Commit: `test(tracker): pin Discover's fields out of the public API`.

---

### Task 2: `discover.py` — the pure pipeline

**Parallel-safe:** yes.

**Files:** create `backend/discover.py`, `backend/tests/test_discover.py`;
modify `backend/tests/test_physical_imports.py` (`TOP_LEVEL` and the pure
list gain `"discover"`).

**Interfaces:**
- Consumes: `radar.PoolGame`, `radar._picker_item`, `radar._taste_reasons`,
  `radar._window_reason`, `radar.FORMAT_WORDS`, `radar.KEY_CARD_FORMATS`,
  `radar.PLATFORM_WORDS`; `picker.reference_weights`, `attribute_table`,
  `affinity`, `similarity`, `quality`, `_named`.
- Produces:

```python
DISCOVER_WEIGHTS = {"affinity": 0.45, "similarity": 0.35, "quality": 0.20}
POPULARITY_WEIGHT = 15
POPULARITY_SCALE = 2000
BUYABLE_BONUS = 10
UNKNOWN_FORMAT_PENALTY = 10
CANDIDATES = 20
PICKS = 8
PROFILE_SIZE = 10
RECENT_YEARS = 3
POPULARITY_SIGN = {"safe": 1, "balanced": 0, "deep": -1}
PICKS_SCHEMA: dict  # {"type": "object", "properties": {"picks": {...}}, "required": ["picks"]}

@dataclass(frozen=True)
class Candidate:          # a pre-scored game offered to the model
    game: PoolGame
    item: PickerItem
    score: int
    similar_to: PickerItem | None
    buyable: bool

@dataclass(frozen=True)
class Pick:               # what is stored
    candidate: Candidate
    reasons: tuple[str, ...]
    based_on: tuple[str, ...]      # reference item ids
    ranked_by: str                 # "model" | "template"

def released(game: PoolGame, today: date, window: str) -> bool
def buyable(game: PoolGame, today: date) -> bool
def eligible(pool, excluded, today, window, include_key_cards) -> list[PoolGame]
def prescore(pool, profile, popularity, today) -> list[Candidate]   # best first
def shortlist(candidates, seed: int) -> list[Candidate]             # top CANDIDATES, shuffled
def references(profile) -> list[PickerItem]                          # up to PROFILE_SIZE, best first
def build_prompt(shortlist, refs, table) -> str
def validate(payload: dict, shortlist, refs) -> list[Pick]
def fallback(candidates, refs, weights, table, today) -> list[Pick]  # top PICKS, template
```

- [ ] **Step 1: Tests** (`test_discover.py`, pure; build `PoolGame`s with
  helpers like `test_radar.py`'s `_pool`, giving snapshots
  `community_score`/`community_votes`):
  - `released`: a null date and a past date pass; a future date fails;
    `recent` drops a game released four years ago.
  - `eligible`: excluded ids gone; a key card gone unless asked; an unknown
    format kept.
  - `buyable`: an in-stock line or an open pre-order line (closes today or
    later) → true; a closed or sold-out line → false.
  - `prescore`: with equal taste, `safe` ranks a 1,500-vote game above a
    5-vote one and `deep` the reverse, `balanced` ties broken by id; buyable
    adds exactly `BUYABLE_BONUS`; unknown format subtracts
    `UNKNOWN_FORMAT_PENALTY`.
  - `shortlist`: at most 20; the same seed gives the same order; a different
    seed a different order (for 20 candidates).
  - `references`: favourites first, then rated, then finished; at most 10.
  - `build_prompt`: holds every candidate's index and title and every
    reference's number and title, and no other game title from the pool.
  - `validate`: keeps valid picks in the model's order; drops an index
    out of range, a repeated index, an empty reason; drops a `based_on`
    number outside 1..len(refs) but keeps the pick; maps numbers to
    reference ids; `ranked_by == "model"`; caps at `PICKS`; a payload
    without `picks` → `[]`.
  - `fallback`: the top eight by score, `ranked_by == "template"`, each with
    at least one reason.
- [ ] **Step 2: Run, see them fail** (`ModuleNotFoundError: discover`).
- [ ] **Step 3: Implement.** Key parts:

```python
def _popularity(snapshot: dict) -> float:
    votes = snapshot.get("community_votes")
    votes = votes if isinstance(votes, int) and votes > 0 else 0
    return min(1.0, math.log1p(votes) / math.log1p(POPULARITY_SCALE))


def buyable(game: PoolGame, today: date) -> bool:
    """In stock somewhere, or on a pre-order whose window is still open."""
    return any(
        line.availability == "in_stock"
        or (
            line.availability == "preorder"
            and (line.preorder_closes_at is None or line.preorder_closes_at >= today)
        )
        for line in game.candidate.store_lines
    )


def prescore(pool, profile, popularity, today):
    weights = reference_weights(profile)
    refs = [item for item in profile if item.id in weights]
    table = attribute_table(profile, weights) if refs else {}
    sign = POPULARITY_SIGN[popularity]
    found = []
    for game in pool:
        c = game.candidate
        item = _picker_item(c.igdb_id, c.title, game.snapshot, c.platform_id, c.release_date)
        near, similar_to = similarity(item, refs, weights) if refs else (0.0, None)
        taste = affinity(item, table) if refs else 50.0
        value = (
            DISCOVER_WEIGHTS["affinity"] * taste
            + DISCOVER_WEIGHTS["similarity"] * near
            + DISCOVER_WEIGHTS["quality"] * quality(item)
            + sign * POPULARITY_WEIGHT * _popularity(game.snapshot)
        )
        can_buy = buyable(game, today)
        if can_buy:
            value += BUYABLE_BONUS
        if c.physical_format is None:
            value -= UNKNOWN_FORMAT_PENALTY
        found.append(Candidate(game, item, round(value), similar_to, can_buy))
    return sorted(found, key=lambda x: (-x.score, x.game.candidate.igdb_id))


def shortlist(candidates, seed):
    """The top CANDIDATES, shuffled: a model moves late entries up less
    often, so the pre-score's order must not be the prompt's."""
    top = list(candidates[:CANDIDATES])
    random.Random(seed).shuffle(top)
    return top
```

`quality(item)` needs `community_score` on the `PickerItem`: extend the
item built by `_picker_item` with `community_score` from the snapshot
(`dataclasses.replace(item, community_score=...)`) inside `prescore`, so
`radar.py` is untouched.

`PICKS_SCHEMA`:

```python
PICKS_SCHEMA = {
    "type": "object",
    "properties": {
        "picks": {
            "type": "array",
            "maxItems": PICKS,
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer", "minimum": 0, "maximum": CANDIDATES - 1},
                    "reason": {"type": "string"},
                    "based_on": {
                        "type": "array",
                        "items": {"type": "integer", "minimum": 1, "maximum": PROFILE_SIZE},
                    },
                },
                "required": ["index", "reason", "based_on"],
            },
        }
    },
    "required": ["picks"],
}
```

`build_prompt` lines: an instruction paragraph (the spec's §3 wording), "The
owner's games:" numbered `1. Hades ♥ (rated 9, finished)`, "What they like
most: …" (top five genres and themes by table weight), then "Candidates:"
`[0] Title (2019) — genres; themes · Nintendo Switch · cartridge`. Only
titles from `shortlist` and `refs` appear.

`validate(payload, shortlist, refs)`: iterate `payload.get("picks")` if a
list; skip non-dicts; `index` must be an int in range and unseen; `reason`
a non-empty string (stripped, ≤ 300 chars); `based_on` ints in
`1..len(refs)` mapped to `refs[n - 1].id`, deduplicated; stop at `PICKS`.
The reason stored is the model's sentence, then the window and format
reasons from `radar._window_reason` / `FORMAT_WORDS` for the admin card.

- [ ] **Step 4: Run, gate, commit** (3 files):
  `feat(tracker): add Discover's pure pipeline`.

---

### Task 3: Platforms for Discover

**Parallel-safe:** yes. **Files:** `backend/radar_load.py`,
`backend/tests/test_radar_load.py`.

**Produces:** `DISCOVER_PLATFORMS = (130, 508, 4)`;
`async def collection_platforms(session, allowed=RADAR_PLATFORMS) -> tuple[int, ...]`
(the collection's game platforms among `allowed`; `(130, 508)` when none).

- [ ] Test: with a Switch 2 and an N64 item, `allowed=DISCOVER_PLATFORMS`
  gives `(4, 508)` and the default gives `(508,)`.
- [ ] Implement; gate; commit: `feat(tracker): read the collection's
  platforms for Discover, N64 included`.

---

### Task 4: `/want` and `/own`

**Parallel-safe:** no (routes file). **Files:**
`backend/recommendations_routes.py`, `backend/tests/test_recommendations_routes.py`.

- [ ] Tests: the existing watch tests call `/want` (rename); a new
  `test_own_adds_a_private_owned_item`: generate Radar, `POST /{id}/own` →
  201, the item has `owned_format = physical`, `is_public = false`, status
  backlog, and the row is `owned`; a second own → 409; own after dismiss →
  409 (not waiting); the game then leaves every later generation.
- [ ] Implement: rename the route and function to `want`; factor the item
  creation into `async def _add_item(session, row, owned_format, is_public)
  -> Item` used by `want` (none, public) and `own` (physical, private);
  `own` marks the row `OWNED`. Same `WAITING` guard, same 409 for an
  existing item, same registry-only format.
- [ ] Gate; commit: `feat(tracker): answer Want and Already own on a
  suggestion`.

---

### Task 5: Discover generate and list

**Parallel-safe:** no. **Files:** `backend/recommendations_routes.py`,
`backend/main.py`, create `backend/tests/test_discover_routes.py`.

**Interfaces:**
- `create_recommendations_router(factory, registry, lock, provider_factory=None)`;
  `main.py` passes `lambda: build_provider(config)`.
- `GenerateIn` becomes:

```python
class GenerateIn(BaseModel):
    kind: Literal["radar", "discover"]
    platforms: list[Literal[130, 508, 4]] | None = None
    include_key_cards: bool = False
    popularity: Literal["safe", "balanced", "deep"] = "balanced"
    window: Literal["recent", "any"] = "any"
```

  Radar refuses platform 4 with 422 (checked in the handler).
- Discover generate: under the lock; `today`; platforms default
  `collection_platforms(session, DISCOVER_PLATFORMS)`; pool
  `load_pool(session, platforms, today)`; `eligible` → `prescore` →
  `shortlist(seed=batch_id.int % 2**32)`; if the shortlist is empty, store
  nothing and answer `{count: 0, ranked_by: "template", model_note: "Nothing
  in the catalogue fits yet"}`; else `provider_factory()` and
  `await provider.complete_json(build_prompt(...), PICKS_SCHEMA)` inside
  `try/except LLMError` (and any `Exception`, logged, as Radar's lane 3);
  `validate`; if empty → `fallback` with `model_note` naming why
  ("Gemini's daily quota is used up" when the error text says quota, else
  "Gemini did not answer"); upsert rows exactly as Radar's generate does,
  kind `DISCOVER`, `reason_source` MODEL or TEMPLATE, replacing only
  Discover's pending rows on the requested platforms (or all of
  `DISCOVER_PLATFORMS`); `source_metadata` gains `ranked_by`, `model_note`,
  `based_on_titles` (the reference titles), `genres`, `buyable`, store
  lines and the snapshot. Log the model call (provider name, picks kept,
  fallback reason); never the key.
- List `?kind=discover`: pending Discover rows best first (model order, then
  score) with `based_on_titles`, `genres`; plus `generated_at`, `ranked_by`,
  `model_note`, `personalised`.
- Refactor: split the shared upsert into
  `async def _replace_pending(session, kind, platforms, rows: list[dict], batch_id)`
  used by both kinds, so Radar's behaviour is unchanged (its tests are the
  guard).

- [ ] Tests (`test_discover_routes.py`, real Postgres, seeded catalogue as
  Radar's route tests, a `FakeProvider` recording the prompt and returning
  a payload or raising `LLMError`):
  - model success: 8 or fewer rows, `reason_source = model`, reasons are
    the model's sentences, `based_on` item ids, order kept;
  - the prompt holds the candidate titles and no excluded or owned title;
  - invalid payload (bad indices only) → fallback, `ranked_by = template`;
  - `LLMError("... quota ...")` → fallback with the quota note;
  - no provider configured (factory raises `LLMError`) → fallback;
  - a future-dated game never appears; an owned game never appears;
  - regenerate keeps wanted/dismissed/owned, skipped returns;
  - Radar with `platforms: [4]` → 422; Discover with `[4]` accepted;
  - Radar's route tests still pass unchanged (except `/want`).
- [ ] Gate; commit: `feat(tracker): generate Discover with one model call
  and a fallback`.

---

### Task 6: Leak rows and smoke

**Files:** `backend/tests/test_public.py`, `scripts/smoke.sh`.

- [ ] `test_no_public_response_carries_a_discover_row`: a public wanted item
  plus a Discover recommendation with a model reason, `based_on_titles` and
  `ranked_by`; no public response carries those keys or the reason text.
- [ ] `smoke.sh`: 401 for `POST /api/recommendations/<uuid>/want` and
  `/own`; leak grep gains `ranked_by|model_note|based_on_titles`;
  `GET /admin/discover (deep link)` 200.
- [ ] Commit: `test(tracker): pin Discover rows out of public responses and
  smoke`.

---

### Task 7: A shared card; Radar says Want

**Parallel-safe:** no (frontend). **Files:** create
`frontend/src/components/RecommendationCard.jsx`; modify
`frontend/src/pages/AdminRadar.jsx`, `AdminRadar.test.jsx`.

**Produces:** `RecommendationCard({ row, busy, onAnswer, level = 3, actions })`
where `actions` is a list of `[action, label]` pairs, each rendered as a
button with `aria-label={`${label} ${row.title}`}` (Not interested reads
"Not interested in {title}"); shows cover, title, date · platform · format,
the reasons list, "Based on: …" when `row.based_on_titles` is non-empty,
genre chips when `row.genres` is non-empty, and the store lines (window only
on a pre-order line). `StoreLine`, `FORMAT_WORDS`, `releaseWords` move to
the component module and are exported.

- [ ] AdminRadar uses it with `[['want','Want'],['dismiss','Not interested'],['skip','Skip']]`;
  its answer posts `/want`; "Watching" → "Wanted, still to come"; the
  success message "Wanted {title}". Update its tests (names, route,
  heading).
- [ ] Gate; commit: `refactor(tracker): share Radar's card and say Want`.

---

### Task 8: Rate a few

**Parallel-safe:** yes with Task 7. **Files:** create
`frontend/src/components/RateAFew.jsx`, `RateAFew.test.jsx`.

**Produces:** `RateAFew({ items, onRated })`: up to six items with
`type === 'game'`, `status === 'finished'`, `rating == null`, each with its
title and `QuickRate`; a rating PATCHes `/api/items/{id}` with `{rating}`
and removes the game from the panel, then calls `onRated()`; a "Not now"
button hides the panel and `writeShelfPref('discover.rate-a-few', 'hidden')`;
hidden when `readShelfPref('discover.rate-a-few', 'shown') === 'hidden'` or
no game qualifies. Tests: shows only unrated finished games, at most six;
rating PATCHes and removes; Not now hides and persists (clear storage in
`afterEach`); nothing rendered with none.

- [ ] Gate; commit: `feat(tracker): ask for a few ratings on Discover`.

---

### Task 9: `/admin/discover`

**Files:** create `frontend/src/pages/AdminDiscover.jsx`,
`AdminDiscover.test.jsx`; modify `App.jsx` (route), `pages/Admin.jsx`
(link after Radar), `index.css`.

- Fetch `GET /api/recommendations?kind=discover` and `GET /api/items`
  (for Rate a few) with the AdminCatalogue `fetch…` + `apply` pattern.
- Controls: Popularity (radio: Safe / Balanced / Deep, default Balanced),
  Window (Recent / Any, default Any), platform chips (Switch 2, Switch,
  N64; none selected = the collection's), the Game-Key Card checkbox,
  **Generate — uses one of today's Gemini requests**, "Needs match →"
  (`/admin/catalogue`).
- "Ranked by Gemini" or the `model_note`; the anticipation note when not
  `personalised`.
- Picks: `RecommendationCard` with
  `[['want','Want'],['dismiss','Not interested'],['own','Already own'],['skip','Skip']]`;
  an answer drops the card; a 409 shows its detail and drops it.
- Rate a few above the picks.
- Tests: renders picks with Based on and the ranking note; Generate posts
  `{kind:'discover', popularity, window, platforms, include_key_cards}`
  with the chosen values and defaults; Already own posts `/own`; the
  fallback note shows; signed out asks to sign in.

- [ ] Gate; commit: `feat(tracker): add the Discover admin page`.

---

### Task 10: Docs and Execution summary

**Files:** `CLAUDE.md` (E8b done; Discover rules: pipeline, one call,
fallback, weights constants, Want/Own, what is public), `README.md` (route
table), this plan.

- [ ] Commit: `docs(tracker): record E8b Discover`.

## Commit boundaries

| # | Commit | Files |
|---|---|---|
| 1 | public pin | 1 |
| 2 | `discover.py` | 3 |
| 3 | platforms | 2 |
| 4 | want/own | 2 |
| 5 | generate/list | 3 |
| 6 | leak + smoke | 2 |
| 7 | shared card | 3 |
| 8 | rate a few | 2 |
| 9 | page | 5 |
| 10 | docs | 3 |

## Zones

```
Zone 1 (auto): tasks 1–10 (no migration, infra or deploy-path change)
CHECKPOINT — batch review + finish gate (ultra review)
```

(The owner asked for zones to run without stopping unless input is
needed.)

## Automated environment tests

- **Smoke util:** `scripts/smoke.sh`, extended in Task 6; passing is every
  check green.
- **Before merge:** backend suite (real Postgres) and frontend suite, lint,
  format, build.
- **Deploy:** no migration; merge, Render deploys.
- **After deploy (owner presses Generate on `/admin/discover`; I read with
  GET only):** eight picks or fewer, `ranked_by` model or a named fallback,
  every pick with a reason and a `based_on` naming the owner's games, no
  owned or future-dated game; Want one → public on `/collection`;
  `smoke.sh` green; Render's logs (`&q=Traceback`, `&q=ERROR`) clean, and
  one `gemini … -> 200` line per generate.

## Execution summary

Zone 1 ran straight through (tasks 1–10), on `tracker-e8b` from `30ce9db`.

Deviations from the plan, all small:

- `discover.fallback(candidates, profile, today)` takes `today`, and
  `discover.validate(payload, shortlist, refs, today=None)` gained an
  optional `today`: both append the pre-order window and format after the
  reason, as Radar's cards do, and need the date to judge the window.
- Radar's route test that pinned "only radar can be generated" now pins
  what is still refused: an unknown kind, and Radar on N64 (422).
- A failed model call is worded in three ways, not two: "Gemini's daily
  quota is used up", "Gemini did not answer", and, for an answer that
  could not be read at all, "Gemini's answer could not be read (…)"; a
  model answer with no valid pick is "Gemini's picks did not hold up".
- The page styling went in its own commit (card class and `index.css`),
  keeping the page commit at four files.
- The list rows carry no `year`, so the page reads it from `release_date`.

Finish-gate fixes (ultra review: four reviewers, every finding reproduced
by a test that failed on the code before its fix):

- A Discover generate replaces **all** pending Discover picks, not only
  those on the platforms it read (spec §4's route table said the latter;
  its key decision "older pending picks are replaced by each generate"
  wins), so the list is one batch under one ranking note.
- The daily-quota note never fired: it looked for "quota", which
  `llm.py` never writes. Notes now come from `_failure_note`, which reads
  `llm.py`'s wording, and name "the model" except for Gemini's per-day
  limit.
- `validate` survives a non-list `based_on` (was a 500) and collapses a
  reason to one line; Recent survives 29 February; the prompt's "What
  they like most" drops non-positive weights; the list no longer returns
  `buyable`.
- The page keeps an empty generation's reason, says when a batch is
  answered in full, and re-reads after a Rate a few rating; Rate a few
  keeps its list semantics and saves each game independently.
- Not fixed: a pre-existing gap where a 409 on Want/Own leaves the row
  pending until the next generate (shared with Radar; the next generate
  clears it), and WooCommerce permalinks are not scheme-checked
  (pre-existing, React blocks `javascript:`; flagged as its own task).
