---
status: planned
kind: ui
mode: auto
---

# Make "Find contents" findable

## Problem
"Find contents" (#337) lives only in the Contents panel of a book's admin page, two clicks
below the title page. On the title page nothing says so, and a title with no books (a single
issue) looks broken. Joey hunted through three titles before finding it (2026-11-19).

## Scope
In: on the title page's Books panel, a book with no contents entries (`collects_count` 0) shows
"No contents yet" and a "Find contents" link to that book's admin page. Nothing about the
backend changes.
Out: running Metron from the title page; a button on the book page (unchanged); the empty
Books panel's text beyond one added sentence.

## Decisions (my call)
- A link, not a second button: the lookup stays in one place (`MetronFind`) and only the path
  to it is shortened. The link goes to `adminVolumePath(itemId, book.slug)`.
- Only a book with `collects_count === 0` shows it; a book that already has contents is left
  alone (its "N entries" stays the cue).
- The empty-books copy gains: "A single issue has no book, so there are no contents to find."
  Words live in `content/adminVolume.js` (`books`), never inline.

## Tasks (one Sonnet implementer, one PR)
1. `BooksPanel.jsx` `BookRow`: when `collects_count === 0`, render the "No contents yet" text
   and a `Link` "Find contents" to the book page, in the facts line or beside it.
   Acceptance: `BooksPanel.test.jsx` cases: link shown and points at the book path for a book
   with 0 entries; not shown for a book with entries; empty-panel sentence shown.
2. Copy in `content/adminVolume.js` `books`: `noContents`, `findContents`, extended `empty`.
3. `frontend/changelog.md` entry under today's date.
Files owned: `BooksPanel.jsx`, `BooksPanel.test.jsx`, `content/adminVolume.js`,
`frontend/changelog.md`, this doc. Tests: targeted only (`npx vitest run BooksPanel`), plus
the admin copy-scan test (`adminCopyScan.test.js`). The full suite is CI's.

## Ship notes
No migration. Frontend only, deploys on merge. Smoke: the admin title page for a title with an
unfilled book shows the link; the public comics md5 is untouched.
