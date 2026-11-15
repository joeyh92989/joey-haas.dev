# Comic status follows the read marks (#277)

status: approved (Joey, 2026-11-15) · kind: bug · mode: auto

## Problem
A comic whose owned issues are all read still shows "To read": `items.status`
is a game-shaped field and the marks (5c) never move it.

## Decision
Derive, do not write. One pure function, `comics.shown_status`, maps the stored
status and the marks to the status a page shows:

- stored status other than `backlog` wins (the owner's override).
- no owned issues, or any owned issue unread: `backlog`.
- every owned issue read: `finished` when the run is complete (ended, nothing
  missing, released count known); otherwise still `backlog` with `caught_up`
  true (ongoing, gaps, or the issue count unknown).

Public builders apply it where they already read marks: the comic row, the
shelf's status bar counts, the series page (`status` and `comic.caught_up`),
and the admin wall's comic block (a hint under the Status select; the select
keeps the stored value, the override). Tonight's lanes already drop a series
with nothing left to read (`issues_left`), so they need no change. No migration.

## Tests
Pure function: none owned, partial, all read complete, all read ongoing, gaps,
unknown count, override, skipped and stubs (skips are never owned, stubs count
as owned). Public routes: row, detail, stats.
