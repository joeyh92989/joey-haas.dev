---
status: planned
kind: fix
mode: auto
---

# Comic shelf fixes from the 11 Nov walkthrough (design)

Issues: #154, #156, #165 (comic wording), #166. Branch `fix/comic-shelf`.
Plan: `2026-11-12-comic-shelf-fixes-plan.md`. Builds on #174 (comic sitting fixes, merged).

## Problem

- Comic Vine lists every volume, reprint and translation as its own series; the sitting's
  search results and Check candidates show only title and year, so six `Paper Girls` cannot be
  told apart; `/shelf/comics` shows four `Creepshow` rows alike (#154).
- Details offers Trade paperbacks and Omnibus but records only single issues, so each trade
  needs a later visit to its item page (#156).
- A comic's status reads `Playing`; its item page has Playthroughs, Add a past playthrough and a
  journal `Played on` (#165).
- On a comic's item form the issues hint sits in the label column and pushes `Read to` out of
  line; an unlinked comic says `Comic Vine lists 2 out.` (#166).

## Scope

In: the above. Out: the garment count of #165 (shipped in #174); intake wait feedback (#160).

## Solution and decisions ("my call", auto mode)

1. **#154: carry what tells series apart.** `sources/comicvine.py` `_parse_search` keeps
   `publisher` and `count_of_issues` (the response has both; the fixture already records them);
   `SourceResult` gains optional `publisher` and `issue_count`, carried by `importer._candidate_json`
   and `intake/search.py`. Search results and Check candidates read
   `Paper Girls (2015) · Image · 30 issues`; the radio's accessible name stays `Title (year)`
   plus the publisher. On `/shelf/comics`, rows whose titles collide show their start year and
   publisher (the row already has the fields; make sure they render when titles repeat).
   *Why not more fields:* publisher and count are what a person uses to pick a volume; the
   description would bloat every row.
2. **#156: editions in Details.** When a row's shelf format is Trade paperbacks or Omnibus,
   the Details row shows the same edition editor the item page uses (`ComicEdition`), writing
   `payload.editions` in the shape `comics.validate_editions` accepts; the commit already passes
   `editions` through. Validation errors show beside the row.
3. **#165: words follow the type.** A status's display name depends on the item type:
   comics read `Reading` (active); the item page's Playthroughs becomes `Reads`, `Add a past
   read`, and the journal's `Played on` becomes `Read on` for comics. One helper in
   `lib/shelf.js` (`statusLabel(status, type)` and the section words) used by the sitting,
   the admin item page, the public item page and the cards. Games keep their words.
4. **#166:** the issues hint renders under its input in the field's input column (CSS grid
   placement), and the `Comic Vine lists N out.` sentence shows only for a series linked to
   Comic Vine (`external_source === 'comicvine'` with an id). The backend's `released`
   fallback for unlinked rows is left alone; the sentence gate is the fix.

## Sources

Comic code map (researcher, 2026-11-12): `backend/sources/comicvine.py:217-227,263-306`,
`backend/sources/base.py:74-80`, `backend/importer.py:124-131`, `backend/intake/search.py:63`,
`frontend/src/components/intake/CheckOne.jsx:117-138`, `components/SeriesRow.jsx:16`,
`pages/Comics.jsx:468`, `components/intake/DetailsStep.jsx`, `pages/AdminItem.jsx:675,726-741,883`,
`components/ComicEdition.jsx`, `components/PlaythroughTable.jsx:156,224`,
`components/PlayJournal.jsx:102`, `lib/shelf.js:19-26`, `components/ItemForm.jsx:236-242,291-297`,
`frontend/src/index.css:8458`, `backend/comics.py:371-400`.

## Open questions

None.

## Smoke check

`./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`; `/shelf/comics` renders.
