---
status: done
kind: feature / fix (one additive migration; one field on an existing form)
mode: auto
---

# Closet picker: graphic tops, a flag and an office penalty (#550)

Story S6 of epic #539. Parent plan: `2026-11-20-closet-picker-week-design.md`
("Graphic detection"). Builds on S4 (#548, the re-tag queue and `tag_scale`) and
S5 (#549, the fill queue). The repo is public: no garment names here, in tests or
in issues.

## Problem

A graphic tee is allowed at the office but the owner tends not to wear one there:
a strong penalty, not a ban. Nothing marks a top as graphic: `pattern` is free
text and the tee in question had none.

## Scope

In: a nullable `garments.graphic` flag (migration 0032, additive); the tagger sets
it from the photo; the owner sets it on the garment form and always wins; `score`
penalises a graphic top for the office; existing pieces get the flag through the
S4/S5 queues.

Out: name matching, any other occasion's ranking, the model's ranking prompt,
penalties for graphic mids or outers, a changelog entry (admin only, as the issue
says).

## Solution

1. **Column.** `garments.graphic boolean NULL` (0032; downgrade drops it). NULL is
   "not known"; a piece with NULL scores as plain.
2. **Tagger.** `ATTRIBUTES_SCHEMA` gains `graphic: boolean` (not required);
   `INSTRUCTIONS`: "graphic: true when a print, picture, slogan or large logo
   covers the front (a band tee, a souvenir tee); false for plain, striped,
   checked or a small chest logo." `clean_attributes` keeps a real bool, else None.
3. **The three queue modes** (S4, S5):
   - *new* writes `graphic` with the rest.
   - *retag*: `SCALE_VERSION` goes to 3 ("formality anchors and the graphic
     flag"); the re-tag writes `formality` and `graphic`. S4 shipped hours before
     this, so few pieces will have been re-tagged at 2 and paid twice.
   - *fill*: the fill queue also takes a `manual` **top** whose `graphic` is NULL;
     the fill writes `graphic = COALESCE(graphic, :new)` beside warmth and
     formality. "Still blank" counts a NULL graphic on a top.
4. **Owner wins.** PATCH accepts `graphic: true | false | null`. A hand save sets
   `tag_source = manual` (as now), so no model write reaches the field again
   except a fill of a NULL, which the owner's explicit value never is.
5. **Form.** AdminGarment gets a select beside Pattern: "Graphic print" with
   "Not set", "Yes", "No". A select, not a checkbox: a checkbox would turn NULL
   into "no" on every save and block the fill. It follows the form's existing
   select markup and classes; no mockup (my call: one field in an existing form,
   the same pattern as its neighbours). Screenshots at 390px and desktop.
6. **Score.** `WEIGHTS["graphic"] = 4.0` (two warmth steps), subtracted only when
   `occasion == "office"`, `category == "top"` and `graphic is True`. `Piece`
   gains `graphic`; the loader passes it through.

## Decisions and tradeoffs

- **Penalty, not a filter.** The issue's call. 4.0 puts a graphic top below a
  plain one a full formality step further from target and below an off-season
  plain top (2.0), so it leads only when nothing else fits.
- **Re-tag again via scale 3** rather than a second queue predicate: one rule
  ("below the current scale is re-tagged") stays true; the cost is a second pass on
  pieces already re-tagged tonight, which is close to none if this ships first.
- **Tops only in the fill queue**: graphic is the top slot's concern; queueing every
  manual piece for a flag that is not used would spend the budget for nothing.

## Sources

`backend/closet.py` (`score`, `WEIGHTS`, `Piece`), `backend/closet_tag.py`,
`backend/closet_routes.py` (queues, PATCH), `backend/closet_schemas.py`,
`backend/models.py`, `frontend/src/pages/AdminGarment.jsx`, issue #550.

## Smoke check

None: admin only.

## Plan

### Task 1: column, model, score (backend)
- Files: migration `0032_garment_graphic.py`, `models.py`, `closet.py` (Piece,
  WEIGHTS, score), the piece loader, `tests/test_closet.py`,
  `tests/test_migrations.py`, `tests/test_schema_check.py` (head 0032).
- Tests: a graphic top ranks below a plain top of equal fit for office, and
  equal for weekend; a NULL graphic scores as plain; a graphic mid is not penalised.

### Task 2: tagger and queues
- Files: `closet_tag.py`, `closet_routes.py`, `closet_schemas.py`,
  `tests/test_closet_tag.py`, `tests/test_closet_response_models.py`.
- Tests: new writes graphic; re-tag at scale 3 writes formality and graphic only;
  a manual top with NULL graphic is filled and keeps set fields; a manual top with
  graphic set by hand is never sent for it; a non-bool graphic is dropped.

### Task 3: PATCH and the form
- Files: `closet_routes.py` (PATCH, garment out), `closet_schemas.py`,
  `frontend/src/pages/AdminGarment.jsx`, `AdminGarment.test.jsx`, `frontend/src/lib/closet.js` if it maps fields.
- Tests: PATCH sets true, false and null; the form shows the select, sends the
  value, and keeps NULL on a save that did not touch it.

### Ship notes
Migration 0032 additive. After deploy the nightly re-tags model pieces at scale 3
and fills NULL graphic on manual tops.
