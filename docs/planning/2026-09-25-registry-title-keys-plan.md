# Registry title keys — Fix Plan

A bug fix to E7c, found on the first production Refresh registry
(2026-09-25). No spec: the defect, its root cause and the decision are
recorded here.

**Branch:** `fix-registry-title-keys` (worktree
`~/Developer/joey-haas.dev-worktrees/fix-registry-title-keys`, cut from
`origin/main` at `dd4f843`).

## The defect

Render's logs during the first registry refresh:

```
igdb no igdb results for 'Cast n Chill – Nintendo Switch 2 Edition' on platform 508; retrying unfiltered
```

Registry titles carry a "Nintendo Switch 2 Edition" suffix in five shapes,
all in the recorded fixture (43 of 250 distinct titles):

- `Absolum - Nintendo Switch 2 Edition`
- `Culdcept Begins -Nintendo Switch 2 Edition-`
- `Kirby and the Forgotten Land Nintendo Switch 2 Edition + Star-Crossed World`
- `A-Train Hajimaru Kankou Keikaku - Nintendo Switch 2 Edition - Guidebook Pack`
- `Legend of Zelda: Breath of the Wild Nintendo Switch 2 Edition, The`

A further 12 titles invert their article (`Duskbloods, The`).

## Root cause

- `registry.py` builds `title_normalized` from the raw title, never through
  `strip_title`; `tracker.py` does the same.
- `strip_title`'s edition phrase knows Standard, Deluxe, Limited and the
  rest, but not "Nintendo Switch 2 Edition", so a store title with it keeps it
  too.
- `resolve.pending_keys` searches IGDB with the registry's raw spelling.

So these titles score poorly against IGDB's names and queue for Needs match
instead of matching, and a registry row and a store listing for one game
carry different keys and never collapse into one game.

## Decision

**A — key an edition to its base game** (the owner's call, 2026-09-25). IGDB
lists some Switch 2 Editions as games of their own; the catalogue does not
follow it. The cut runs from "Nintendo Switch 2 Edition" to the end of the
title, so a bundle (`… + Star-Crossed World`) keys as its base game. The raw
title is still stored and shown. No published Switch 2 copy is a Switch 2
Edition (private items unchecked), so no published item's link changes.

`title` and `source_ref` stay raw: an existing row is updated in place by the
next refresh, not duplicated and retired.

## Tasks

| # | Task | Files | Tests |
|---|---|---|---|
| 1 | This plan | `docs/planning/2026-09-25-registry-title-keys-plan.md` | — |
| 2 | `strip_title` cuts a "Nintendo Switch 2 Edition" phrase to the end; `game_title()` moves a trailing ", The/A/An" to the front, then strips | `physical_sources/parse.py`, `tests/test_physical_parse.py` | every shape above; titles without either unchanged |
| 3 | Registry and tracker keys from `game_title()`; `title` and `source_ref` raw | `physical_sources/registry.py`, `physical_sources/tracker.py`, `tests/test_physical_registry.py`, `tests/test_physical_tracker.py` | on the fixtures: no key contains "switch 2 edition"; Breath of the Wild keys as `the legend of zelda breath of the wild`; `source_ref` unchanged |
| 4 | Resolve searches IGDB with `game_title()` of the registry spelling | `physical_sources/resolve.py`, `tests/test_physical_resolve.py` | the fake IGDB receives the stripped title |
| 5 | Needs match lists only pending decisions some unretired row still carries | `physical_routes.py`, its route test | an orphaned pending decision is not listed |
| 6 | Registry section of the package README | `physical_sources/README.md` | — |
| 7 | A refresh that changes a row's key clears its `igdb_id`, so the new key reopens for Resolve (a row's own id, as on an N64 edition, is written back) | `physical_sources/catalogue.py`, `tests/test_physical_catalogue.py` | an edition and a listing linked under an old key are unlinked and pending after re-keying; an unchanged key keeps its id |
| 8 | A key whose raw title carried the Switch 2 Edition phrase is searched on Nintendo Switch with no year | `physical_sources/parse.py`, `physical_sources/resolve.py`, `tests/test_physical_resolve.py` | the fake IGDB receives ("Kirby and the Forgotten Land", None, "Nintendo Switch"); a plain Switch 2 key is still searched on Switch 2 with its year |

Tasks 7 and 8 were added at the batch review (2026-09-25) from two confirmed
findings:

- **C1.** The first production refresh auto-linked BotW, Kirby and Animal
  Crossing to IGDB's separate Switch 2 Edition games (338072, 338074,
  375733). Re-keying kept those ids, and Resolve only opens rows with no id.
- **C3.** Live IGDB: the base game is tagged Switch 1 only, so a Switch 2
  search for the stripped title returns only the Switch 2 Edition entry and
  its DLC; the registry's 2025 year would filter the base game out as well.
  A Switch 2 Edition is by definition an upgrade of a Switch 1 game.

Each task is one commit of at most four files, gated on the backend suite,
`ruff format` and `ruff check`.

**Out of scope:** `Dave the Diver Complete Edition` ("Complete" is not an
edition word `strip_title` removes; it queues for Needs match if it misses).
The decisions the first refresh stored under suffixed keys stay in
`catalogue_matches`, and the Switch 2 Edition games it cached stay in
`catalogue_games`: no row carries or links to them once tasks 5 and 7 land.

## Zones

```
Zone 1 (auto): tasks 1–6
CHECKPOINT — batch review
Zone 1b (auto): tasks 7–8
CHECKPOINT — batch review + finish gate (ultra review)
```

No migration, infra or deploy-path change.

## Automated environment tests

`scripts/smoke.sh` is unchanged and must stay green. After merge and deploy:

1. Refresh registry on `/admin/catalogue` rewrites the keys of existing rows.
2. Render's logs for that request contain no IGDB search for a title with
   "Nintendo Switch 2 Edition".
3. Resolve until 0 remain; Needs match holds no orphan from the first run.

## Execution summary

Tasks 1–8 landed as planned. The finish gate's reviews (two reviewers, an
adversarial verifier, then a re-verification of the fixes) added:

| Commit | Finding |
|---|---|
| `ea20192` | R1: the phrase patterns backtracked for seconds on a long space run in third-party text; the trailing-separator regex was quadratic. Also a title that is only a phrase no longer keys as `""`, and an article before the suffix is uninverted. |
| `6c9fb0c` | C2: the Needs match tile counted orphans the list hid; both read one SQL filter. |
| `77950b1` | `_BRACKETED` (pre-existing) rescanned from every `(`; now innermost brackets only. Every recorded fixture keys exactly as before (2,784 rows compared). |
| `a9d48a9` | Without IGDB, `resolve_batch` returned before `propagate`, so a re-keyed row on a decided key stayed unlinked. |

Checked live against IGDB after task 8: Kirby, Jamboree and Animal Crossing
resolve EXACT to their base games (172427, 306148, 109462); BotW is
UNCERTAIN against IGDB's Master Edition and bundle entries and waits in Needs
match with the base game (7346) as its first candidate.

Kept on purpose: a platform set by hand in Needs match on a listing whose
store states a different platform is overwritten by the next refresh. That
predates this branch and is left for its own fix.
