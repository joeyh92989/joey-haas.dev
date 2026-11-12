---
status: planned
kind: fix
mode: auto
---

# Comic shelf fixes (plan)

Spec: `2026-11-12-comic-shelf-fixes-design.md`.

## Global Constraints

- Repo rules in `CLAUDE.md` apply (Comics section; plain CSS with tokens; `react-router`;
  public outputs pinned by `backend/tests/test_public_outputs.py` — no new private field may
  reach a public route).
- TDD: a failing test first, then the fix.
- Frontend: focused `npm test -- <files>` while working; full `npm test` and `npm run lint`
  before the commit. Backend: `./.venv/bin/ruff check . && ./.venv/bin/ruff format --check .`
  and the affected tests; **one backend pytest run at a time across all worktrees** — check
  `pgrep -f pytest` first.
- No migration. Fixtures are recorded, never edited by hand.
- Conventional commits ending with:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01FurUAQooqsFBEgbmUaVzWS`.

### Task 1: Comic Vine results carry publisher and issue count (#154, backend + intake UI)

- `backend/sources/base.py` `SourceResult`: optional `publisher: str | None` and
  `issue_count: int | None`. `backend/sources/comicvine.py` `_parse_search` fills them from
  `publisher.name` and `count_of_issues`. `backend/importer.py` `_candidate_json` and
  `backend/intake/search.py` (~63) carry them when present.
- Frontend: `components/intake/AddResults.jsx` and `CheckOne.jsx` show
  `· <publisher> · <N> issues` after `Title (year)` when present (`1 issue` singular); the radio
  name (`aria-label`) becomes `Title (year), Publisher` when a publisher is known.
- Acceptance: six same-titled results read differently by publisher/count; other sources
  unchanged.
- Tests: `backend/tests` comicvine parse test on the recorded search fixture; importer/search
  JSON test; CheckOne and AddResults tests.

### Task 2: Same-titled series are distinguishable on /shelf/comics (#154, public list)

- `frontend/src/components/SeriesRow.jsx` / `pages/Comics.jsx` (~468) / `SeriesList.jsx`: when
  two or more rows in a list share a title, each shows its start year (and publisher when
  known) beside the title. Check what `backend/public_comics.py` (~55-70) already sends; use
  only fields already public.
- `frontend/changelog.md`: one bullet under `## 2026-11-12` (create the heading at the top if absent): `The comics shelf now tells same-titled series apart by year and publisher.`
- Acceptance: four `Creepshow` rows read with their years.
- Tests: SeriesList/Comics test with colliding titles.

### Task 3: Words follow the item type (#165)

- `frontend/src/lib/shelf.js`: `statusLabel(status, type)` returning `Reading` for an active
  comic and `STATUS_LABEL[status]` otherwise; a small `runWords(type)` returning
  `{ runs: 'Reads', addPast: 'Add a past read', journalOn: 'Read on' }` for comics and the
  existing game words otherwise.
- Use them in the sitting's status option words (`lib/intake.js` `OPTION_WORDS.status` for a
  comic sitting), the admin item status control, `pages/AdminItem.jsx` (~883 heading),
  `components/PlaythroughTable.jsx` (~156, ~224), `components/PlayJournal.jsx` (~102),
  `pages/Item.jsx` (~785) and `PosterCard.jsx`/`Comics.jsx` where the status shows.
- Acceptance: a comic never shows Playing / Playthroughs / Played on; a game reads as before.
- Tests: `lib/shelf` unit tests; AdminItem and Item tests for a comic.

### Task 4: Comic item form hint and the Comic Vine sentence (#166)

- `components/ItemForm.jsx` (~236-242) and `index.css` (`.comic-hint` ~8458): the hint sits
  under its input in the input column; `Read to` stays level with its input.
- The `Comic Vine lists N out.` sentence (ItemForm ~241, fed from AdminItem ~726/732) shows only
  when the item is linked to Comic Vine (`external_source === 'comicvine'` and an
  `external_id`).
- Acceptance: an unlinked comic with issues 1-2 shows no Comic Vine sentence; a linked one
  still does (`AdminItem.test.jsx` ~769 stays green).
- Tests: AdminItem tests for linked and unlinked.

### Task 5: Collected editions in Details (#156)

- `components/intake/DetailsStep.jsx`: for a comic row whose shelf format is `trades` or
  `omnibus` (check the enum values in `backend/comics.py`), show the edition editor used on the
  item page (`components/ComicEdition.jsx` / `AdminItem.jsx` ~737-741), saving
  `payload.editions` through the existing payload PATCH. A 422 from validation shows beside the
  row. Single issues rows keep `Issues owned` only.
- Confirm `backend/intake/shelf_kinds.py` passes `editions` into the item row and the commit's
  series merge keeps them (add a backend test if not covered).
- Acceptance: a trade row can record its editions in Details and they are on the item after Add.
- Tests: DetailsStep/AdminSitting test; backend commit test for editions on a new series.

## Ship notes

No migration. Public output: Task 2 uses only fields already public. Changelog: one bullet,
`/shelf/comics` tells same-titled series apart.
