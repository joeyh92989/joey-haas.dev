---
status: done
kind: fix
mode: auto
---

# Closet fixes from the 11 Nov walkthrough (design)

Issues: #163, #164, #167, #170 (Garment start button), #172 (closet bullets). Branch
`fix/closet-walkthrough`. Plan: `2026-11-12-closet-walkthrough-plan.md`.

## Problem

- The add-by-hand panel's two-column fields overlap and spill past the panel (#163).
- Today keeps showing a plan built around a garment that was deleted (#164).
- Review's "added" date is the UTC date, so an evening add reads as tomorrow (#167).
- The Garment start button on `/admin/closet/add` was reported without an accessible name (#170).
- The add bar keeps its text after an add; a new untagged upload is hidden by the default
  Active filter, so the Closet reads "Nothing matches these chips" beside "1 photo waiting" (#172).

## Scope

In: the above. Out: wait feedback on Tag now and Today (#160, its own PR); comic sitting.

## Solution and decisions ("my call", auto mode)

1. **#163:** form controls inside `.intake-field` take the cell's width (`width: 100%`,
   `min-width: 0`, `box-sizing: border-box`); below the drawer's comfortable width the fields
   stack to one column. Checked by screenshot at 1440px and 390px.
2. **#164: Today re-checks its plan on read.** `GET /api/closet/today` re-plans when the stored
   plan names a garment that is no longer active (deleted, packed, listed, gone). *Why on read
   rather than on every garment write:* one place covers every way a piece leaves (delete,
   PATCH status, Review's pack/sold), including future ones; the cost is one indexed lookup of
   a handful of ids per read. The re-plan uses the existing `make_plan` path.
3. **#167:** `deckStat` turns `created_at` into the Denver date (`America/Denver`), matching
   the backend's `OWNER_TZ`.
4. **#170:** pin the accessible name with `getByRole('button', {name: /Garment/})`; the code
   appears to name it by text, so find what the walkthrough saw (e.g. an empty label from the
   closet kind, or an image-only render) and fix that, or record that the test proves it named.
5. **#172:** the add bar clears after a successful add. The default filter keeps untagged
   pieces visible alongside Active (they are new, not hidden), so a fresh upload is shown with
   its "Untagged · add details" line; pressing a chip still filters strictly.

## Sources

Closet code map (researcher, 2026-11-12): `frontend/src/index.css:1392-1414,2265-2270,2957-3002`,
`backend/closet_today_routes.py:292,497-554`, `frontend/src/components/ReviewDeck.jsx:13-21`,
`backend/closet_review_routes.py:109`, `frontend/src/components/intake/KindTile.jsx:14-37`,
`frontend/src/components/intake/AddSection.jsx:190-258`, `frontend/src/lib/closet.js:156-172`.

## Open questions

None.

## Smoke check

`./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`; signed in, `/admin/closet/today`
no longer names the deleted walkthrough jacket.
