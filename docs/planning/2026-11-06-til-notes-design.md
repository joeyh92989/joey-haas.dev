---
status: ready-for-plan
mockups: none
chosen: none
---

# TIL notes: a short-form stream beside the blog — design

Date: 2026-11-06 · Repo: joey-haas.dev · No mockups: the page reuses the blog
index's list styling and the post page's prose styles; the structure is
specified below.

## Problem

The blog has one real post, because a post on this site is a 150-line essay
with a summary, tags and a diagram, and that bar is high enough that small
things never get written down. Most of what is worth recording week to week
is a paragraph: a Render quirk, a Postgres pattern, a Shiki transformer
gotcha. Those have nowhere to go, so they go nowhere, and the site reads as
less active than the work is.

## Scope

**In**

- `frontend/notes/*.md`, compiled by the existing `vite-plugin-markdown`
  pipeline (same frontmatter rules, same draft handling, same Shiki pass).
- `/til`: every note, newest first, rendered in full, each with a permalink.
- `/til/:slug`: one note, for sharing and for the feed's links.
- `/til/feed.xml`, generated the way `/feed.xml` is.
- A "Notes" link from the Blog index and the footer; the masthead is
  unchanged.

**Out**

- Tags pages, pagination (revisit past ~100 notes), comments or reactions,
  cross-posting (POSSE), a combined feed, any change to the blog post
  layout.

## Design

### Authoring

- A note is a markdown file with frontmatter `title`, `date` (`YYYY-MM-DD`),
  optional `tags` and `draft`. No `summary`: the note is its own summary.
- Slug is the filename, as for posts. Notes and posts live in different
  folders, so a slug may repeat across the two without collision.
- `content/notes.js` mirrors `content/posts.js`: a glob over
  `../../notes/*.md`, nulls filtered, sorted by date string descending.

### `/til`

- Heading "TIL", one line of prose ("Short notes on things I learned while
  building this site and the things on it. Longer pieces are on the
  [blog](/blog).").
- Each note: `<article>` with an `h2` title that links to `/til/:slug`, the
  date as `<time>`, the tags as the blog's chips, then the rendered body.
  Notes are separated by the blog index's rule, not cards.
- The 45rem prose column (no `WIDE_ROUTES` entry).
- Code blocks use the existing Shiki dual-theme output; nothing new.

### `/til/:slug`

- The same article alone, with a "← All notes" link above and the blog
  post page's title treatment, and `usePageTitle('<title> · TIL · Joey Haas')`.
- Unknown slug renders `NotFound`, as `/blog/:slug` does.

### Discovery

- Blog index: a line under its heading, "Shorter things are in
  [TIL](/til)." Footer: "TIL" next to "Blog". `/colophon` lists both feeds.
- `prerender.mjs` writes heads for `/til` and each `/til/<slug>/` as it does
  for posts (title, description from the first paragraph via `excerpt`).

### Feed

- `generate-rss.mjs` gains a second output, `dist/til/feed.xml`, from
  `frontend/notes/`, with the same escaping and excerpt rules. Factor the
  post-reading and XML-writing into one function called twice rather than
  copying the file.

### Flow

```mermaid
flowchart LR
  M[notes/*.md] --> V[vite-plugin-markdown]
  V --> C[content/notes.js]
  C --> T[/til]
  C --> S[/til/:slug]
  M --> R[generate-rss.mjs] --> F[dist/til/feed.xml]
  M --> P[prerender.mjs heads]
```

## Key decisions

- **Separate folder and route, same pipeline.** One markdown pipeline is a
  rule in `generate-rss.mjs` already; notes reuse it. A separate folder
  keeps the blog's bar where it is and makes "which kind is this" a
  filesystem fact, not a frontmatter flag.
- **Rejected: a `kind: note` flag on posts in one folder.** Every post
  consumer would need the filter, and the blog index would need to know to
  hide notes; two folders need no filter anywhere.
- **Rejected: notes without their own pages (anchors only).** A feed entry
  needs a URL that renders the note alone, and a shared link to `/til#slug`
  scrolls past everything newer.
- **Rejected: one combined feed.** Subscribers to `/feed.xml` chose essays;
  turning that into a firehose changes what they signed up for. Linking both
  from `/colophon` is enough.
- **Rejected: a masthead tab.** The masthead is full; the notes are a
  side door off the blog, and the palette (if `2026-11-06-site-search-design.md`
  lands) reaches them by title.

## Component inventory

- New: `pages/Til.jsx`, `pages/TilNote.jsx`, `content/notes.js`,
  `frontend/notes/` with one real first note (not an example file).
- Existing: `vite-plugin-markdown`, the blog's tag chips and date
  formatting (`formatDate` from `content/posts.js`, moved to `lib/` if it is
  shared), `usePageTitle`, `NotFound`, `generate-rss.mjs`, `prerender.mjs`
  and `prerender-lib.mjs` (`SITE_URL`, `excerpt`).

## Acceptance criteria

- Adding `frontend/notes/2026-11-06-example.md` and building shows it on
  `/til` and `/til/2026-11-06-example`, in `dist/til/feed.xml`, and in the
  prerendered head for its slug; `draft: true` removes it from all four in
  a production build.
- `/blog` and `/feed.xml` are byte-for-byte unchanged by adding a note.
- `/til` renders in the 45rem column with the blog's rule between notes;
  code blocks are highlighted in both themes with no raw hex in the CSS.
- `/til/not-a-note` renders `NotFound`.
- Feed validates (W3C feed validator) and its item links open the single
  note page.
- Tests: `content/notes.js` ordering and draft filtering, the two routes,
  and `generate-rss.mjs` producing two files from one function.

## Open questions for Code

- Whether `formatDate` and the chip markup should move to a shared module
  now or stay duplicated for one more feature; the plan decides.
- Whether the nightly snapshot workflow needs to know about `/til` (it
  should not: notes change only on deploy).
