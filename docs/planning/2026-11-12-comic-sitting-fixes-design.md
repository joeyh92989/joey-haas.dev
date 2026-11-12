---
status: planned
kind: fix
mode: auto
---

# Comic sitting fixes from the 11 Nov walkthrough (design and plan)

Issues: #153, #155, #157, #158, #159, #165 (garment count only), #170 (comic radios only),
#172 (search result still offers Add). Branch `fix/comic-sitting`.

## Problem

The 11 Nov walkthrough found the Comic sitting trusting things it should ask about, losing a
Details value, and counting titles it cannot account for:

- A Probable match arrives ticked in the skim list and is written on commit unasked (#153).
- Shelf format applied in Details is lost on a Comic Vine matched row (#155).
- A search-added or typed title, or an uploaded photo, cannot be removed (#157).
- Two same-day sittings of one kind share a name (#158).
- Shoot's counts leave titles out; Check promises a grid it does not show, and search-added
  titles appear nowhere on Check (#159). A garment sitting counts "titles" (#165).
- Check's candidate radios are named by Comic Vine id (#170).
- A search result keeps offering Add after it was added to the sitting (#172).

## Scope

In: the items above. Out: Comic Vine disambiguation, editions in Details, comic reading words,
item-form fixes (PR B); closet (PR C); intake wait feedback #160 (PR E).

## Solution and decisions (all "my call", auto mode)

1. **#153: Probable is asked, not skimmed.** Probable leaves the skim grid and joins the
   one-at-a-time check, keeping its Probable badge with its candidate preselected. The commit
   stops writing `probable` (moves from `WRITTEN` to `KEPT` in `intake/commit.py`, and from
   `WRITTEN_STATES`/`SKIM_STATES` in `lib/intake.js`); confirming it in Check moves it to the
   same state any confirmed check reaches. *Tradeoff:* one extra tap per probable title,
   against a wrong series silently landing on the shelf. The issue lists both; asking is the
   only option where the server never writes an unconfirmed match.
2. **#155: test first.** The cause is not visible in a static read. Write a failing
   commit test (source-matched row, `shelf_format` set via the Details PATCH), then find the
   root cause by systematic debugging. Leading hypotheses: an existing series row kept by
   `commit_items`' `on_conflict_do_nothing`, or a field dropped in the series merge
   (`_with_issues`).
3. **#157: remove.** An entry is removed by the existing PATCH where possible (state `ignored`
   with no `unticked` note, so it disappears and is never written); a photo gets a
   `DELETE /api/intake/sittings/{id}/photos/{photo_id}` that refuses a committed sitting and
   drops that photo's unwritten entries. Remove controls: Shoot (search/typed titles, photo
   tiles), Check and Details rows. Garment photos get the same control at Shoot and Check.
4. **#158: distinguishable sittings.** New labels carry the start time
   (`Comic · Nov 11, 7:42 PM`, Denver time); Unfinished rows show the start time for older
   labels too; the Collection banner counts sittings when there is more than one rather than
   naming one.
5. **#159: counts add up.** Shoot reads `N titles so far · R ready · C to check · W reading`
   (zero parts dropped, owned shown when present), where every entry lands in exactly one
   part. Check's skim grid also lists search-added and typed titles (`ready`, `typed`), ticked,
   so every title is visible; the grid sentence shows only when the grid has entries.
   Garment sittings count `pieces`.
6. **#170:** each candidate radio's accessible name is the series title and year.
7. **#172:** a search result added to this sitting shows `Added` instead of `Add`.

## Sources

- Research map (comic researcher, 2026-11-12): `frontend/src/components/intake/SkimGrid.jsx:10-32`,
  `CheckStep.jsx:87-93,226-236`, `ShootStep.jsx:10-29`, `CheckOne.jsx:43-54,117-138`,
  `ShootSearch.jsx:49-82`, `lib/intake.js:38-41,121-127`, `backend/intake/commit.py:72`,
  `backend/matching.py:108-116`, `backend/intake/routes.py:352-365,531-545`.
- `backend/intake/README.md` (intake spec summary; update it for the Probable rule).

## Open questions

None blocking. How often Probable mismatches occur on real photos is unknown (#153 note).

## Smoke check

`./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`; the new photo-delete
route answers 401 signed out (not 404).

Plan: `2026-11-12-comic-sitting-fixes-plan.md`.
