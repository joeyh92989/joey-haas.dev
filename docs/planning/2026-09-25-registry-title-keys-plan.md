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

Each task is one commit of at most four files, gated on the backend suite,
`ruff format` and `ruff check`.

**Out of scope:** `Dave the Diver Complete Edition` ("Complete" is not an
edition word `strip_title` removes; it queues for Needs match if it misses).
The automatic decisions the first refresh stored under suffixed keys stay in
`catalogue_matches`: no row carries those keys, and nothing reads them.

## Zones

```
Zone 1 (auto): tasks 1–6
CHECKPOINT — batch review + finish gate (ultra review: 11 files)
```

No migration, infra or deploy-path change.

## Automated environment tests

`scripts/smoke.sh` is unchanged and must stay green. After merge and deploy:

1. Refresh registry on `/admin/catalogue` rewrites the keys of existing rows.
2. Render's logs for that request contain no IGDB search for a title with
   "Nintendo Switch 2 Edition".
3. Resolve until 0 remain; Needs match holds no orphan from the first run.
