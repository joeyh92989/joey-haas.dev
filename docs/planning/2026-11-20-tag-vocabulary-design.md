---
status: planned
kind: feature
mode: auto
---

# Grow the spots tag vocabulary (#351)

Story 12 of epic #339. Brief: `docs/planning/2026-11-15-places-outings-brief.md`, section 3.

## Problem

`spots.TAGS` (`backend/spots.py`) has six tags: coffee, park, food, kid-ok, rainy-day, bike-friendly. Fun things such as a cinema or a zoo have none to wear, so the wider finder pool (#352) has nothing to tag them with.

## Scope

In: 14 new tags appended to `TAGS`, their frontend labels, the tests that pin the vocabulary, a public-output check, and a chip-wrap check at 400px. Out: which OSM tags the finder queries and `CATEGORY_TAGS` (#352), the planner's mood mapping, any change to stored rows.

## Solution

Append, in this order, after the existing six (existing order is kept, so every list that follows `TAGS` order keeps its shape): `cinema`, `theatre`, `ice-cream`, `brewery`, `zoo`, `aquarium`, `mini-golf`, `bowling`, `arcade`, `climbing`, `ice-rink`, `pool`, `nature-reserve`, `trailhead`. Slugs are kebab-case like the existing `kid-ok`. Labels in `frontend/src/content/denver.js` `TAG_LABELS`: Cinema, Theatre, Ice cream, Brewery, Zoo, Aquarium, Mini golf, Bowling, Arcade, Climbing, Ice rink, Pool, Nature reserve, Trailhead.

Everything else derives from `TAGS` (write validation `canonical_tags`, the finder's JSON-schema enum and answer filter `validate`, the length caps `len(spots.TAGS)`, the intake form options, the chips and forms in the frontend). The hand-written literals (`candidates.py` `CATEGORY_TAGS` and its instruction text, `planner.py` outdoor/indoor/rainy sets) are left alone: they belong to #352 and the mood mapping.

## Decisions (my call, auto mode)

1. The brief and issue mention "the agreed grouping"; no grouping is defined anywhere, so the vocabulary stays a flat list of the 14 named tags.
2. Append, never reorder. No migration: tags are JSONB with no enum or CHECK, and no stored row is touched.
3. Retired or unknown stored tags: the outings read already drops them; the public spot body passes stored tags through unfiltered. That is the existing behaviour and stays (no tag is retired here); noted for the end-of-epic follow-ups.
4. No changelog entry in this story: new tags are invisible on `/denver` until a spot wears one (zero-count chips are hidden). The entry comes with the first public use (#352 or later).

## Tasks

### Task 1: The wider vocabulary (backend and frontend)

Model: sonnet. Files: `backend/spots.py`, `frontend/src/content/denver.js`, tests `frontend/src/content/denver.test.js` (it parses `backend/spots.py` and compares the order), `backend/tests/test_spots.py`, `backend/tests/test_candidates.py`, `backend/tests/test_public_outputs.py`, `frontend/src/pages/Denver.test.jsx`, docs (`backend/CLAUDE.md`, `frontend/CLAUDE.md` where they list the six tags).

Acceptance:
- `spots.TAGS` is the six existing tags followed by the 14 new ones in the order above; the tuple keeps the formatting `denver.test.js` parses. `TAG_LABELS` has exactly the labels above and `denver.test.js` fails if a tag lacks a label or the order differs.
- A backend test states the full list literally (so a silent change fails) and that `canonical_tags` accepts each new tag and still rejects an unknown one (`brunch`) with the message naming it.
- The finder's `validate` still drops a tag outside the vocabulary and keeps a new one (test both, using the real schema enum).
- Length caps that use `len(spots.TAGS)` are exercised with a list of more than six tags.
- `test_public_outputs.py` gains a case: a public spot wearing a new tag publishes it, and the public body's field set is unchanged.
- `/denver` and the admin forms (`SpotForm`, `PlaceFields`, `CandidateCard`) show all 20 tags without horizontal overflow at 400px (a frontend test or a screenshot check; chips wrap).
- No existing spot's tags change: no migration, and a test that an existing spot with the old six round-trips unchanged.
- Full backend pytest, ruff, full `npm test`, `format:check`, lint, build, `test_recs_response_models.py` (route pin 35) and `frontend/src/spaceScale.test.js` all pass.

## Ship notes

No migration, no env var, no new outbound call. Smoke: the usual; check `https://api.joey-haas.dev/api/public/spots` still answers and `/denver` renders.
