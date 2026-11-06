---
status: planned
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

---

# Plan

Tier: **Full** (it touches `render.yaml`, the deploy path). Branch
`feat/til-notes`, worktree `~/Developer/joey-haas.dev-worktrees/feat-til-notes`.

## Where the code differs from the spec (decided here)

| Spec says | Code says | Decision |
|---|---|---|
| Footer: "TIL" next to "Blog" | `SiteFooter` has no Blog link (credit line: Source · Now · Colophon) | TIL goes into the credit line after Now, shown only while a note is published |
| Nothing about rewrites | Every prerendered page needs its own `render.yaml` rewrite, `prerender-lib.test.mjs` enforces it, and a rule for an unbuilt file serves an empty 200 | `/til` plus one rule per published note, in the carve-out milestone |
| "The blog index's rule" between notes | `.row-list` puts a `--line` border between rows | `.note-list` reuses the same token and spacing; no new tokens |
| `/blog` unchanged by adding a note | The Blog index gains its "Shorter things are in TIL" line once | The line shows only while a note is published; after that, adding a note changes nothing under `/blog` (checked with a `dist/` diff) |
| Blog and BlogPost tests "pass unchanged" (task 1) | They mocked `formatDate` from `content/posts.js`, which moved to `lib/formatDate.js` | The mocks went and `Blog.test` asserts the real formatted date ("October 2, 2026"); no behaviour changed |
| `rssFeed({items, urlPrefix, …})` | The channel also needs its own link and self path per feed | Shipped as `rssFeed({entries, title, description, link, itemPrefix, selfPath})`; `scripts/README.md` documents it |
| One real first note | No such note exists yet | Drafted from a quirk the repo already documents (Render serves `dist/x/index.html` at `/x/` and not at `/x`, 2026-10-19). It lands `draft: true` and is published only after Joey approves the wording at the carve-out stop |

Open questions, answered:
- **Shared module now?** Yes. `formatDate` moves to `lib/formatDate.js`,
  and the date-and-tags row becomes `components/PostMeta.jsx`. A second
  consumer is the moment to share them, and `BlogPost` keeps the same markup
  (its test pins that).
- **Nightly workflow?** No change. Notes change only on deploy, and
  `nightly.yml`'s deploy hook rebuilds them anyway.

## Tasks

**1. Shared helpers** (no behaviour change)
- Files: `src/lib/formatDate.js` (+ test), `src/components/PostMeta.jsx`,
  `src/content/posts.js`, `pages/Blog.jsx`, `pages/BlogPost.jsx`, `pages/Home.jsx`.
- AC: every `formatDate` import points at `lib/`. `BlogPost` renders
  through `PostMeta` with the same DOM, and the existing Blog, BlogPost and
  Home tests pass unchanged.

**2. Feed and markdown reading as one library**
- Files: new `scripts/markdown-lib.mjs` (`readPublished(dir)`,
  `rssFeed({items, urlPrefix, title, description, selfPath})`, `escapeXml`),
  `scripts/generate-rss.mjs` (calls them twice: `posts/` → `dist/feed.xml`,
  `notes/` → `dist/til/feed.xml`), `scripts/prerender.mjs` (its
  `readPosts` becomes `readPublished`), `scripts/markdown-lib.test.mjs`,
  `scripts/README.md`.
- AC: `dist/feed.xml` is byte-identical before and after (diffed with a
  build on `origin/main`). A missing or empty `notes/` writes a valid
  empty channel. Drafts are skipped. Item links and GUIDs use the prefix
  passed in.
- Tests: two directories give two feeds from one function. Draft skipped.
  Ordering. Escaping. The `selfPath` atom link.

**3. Notes content module**
- Files: `src/content/notes.js` (+ `notes.test.js`), `frontend/notes/`
  holding the first note as `draft: true`, and `vite-plugin-markdown.js`
  (the slug error says "Filenames", not "Post filenames").
- AC: `notes` is newest first with nulls filtered, and `findNote(slug)`
  works. In dev the draft note shows with the Draft badge, as posts do.
- Tests: ordering and null filtering on a mocked glob, and `findNote`.

**4. `/til` and `/til/:slug`**
- Files: `pages/Til.jsx`, `pages/TilNote.jsx` (+ tests), `App.jsx` routes,
  `index.css` (`.note-list`, built from tokens only).
- AC: as in the spec's `/til` and `/til/:slug` sections. Titles are
  `TIL · Joey Haas` and `<title> · TIL · Joey Haas`. An unknown slug renders
  `NotFound`. Each `h2` links to its permalink. Everything sits in the 45rem
  column (no `WIDE_ROUTES` entry).
- Tests: list order and permalinks, the single note, the `NotFound` case
  and the empty state.

**5. Discovery links**
- Files: `pages/Blog.jsx`, `components/SiteFooter.jsx`, `pages/Colophon.jsx`
  (+ their tests).
- AC: the Blog line and the footer link render only while `notes.length > 0`.
  Colophon links both feeds.

**6. Prerendered heads**
- Files: `scripts/prerender-lib.mjs` (`publicRoutes({posts, notes, items})`,
  a `TIL_FEED` alternate link on the `/til*` heads), `scripts/prerender.mjs`,
  `prerender-lib.test.mjs` (its rewrite check also reads `notes/`).
- AC: `/til` and `/til/<slug>` get `type: article` heads and sitemap
  entries, with the description from `excerpt`, only for published notes.
  `/til` itself is written only while at least one note is published, as
  `/blog` is.

**7. Carve-out: publish the first note** (after the STOP)
- Files: `frontend/notes/<slug>.md` (`draft` removed), `render.yaml` (the
  `/til` and `/til/<slug>` rewrites, ahead of the `/spine` rules and the
  catch-all), `scripts/smoke.sh` (`/til/feed.xml` served as XML with a
  channel), `CLAUDE.md` (notes conventions: one rewrite per published note,
  as for posts).
- AC: the rewrite test passes against the real `notes/`, and the full build
  writes `dist/til/index.html`, `dist/til/<slug>/index.html` and
  `dist/til/feed.xml`.

Parallel-safe: none worth splitting. Each task is small and 4–6 depend on 3.

## Milestones

```
Milestone 1 (auto): tasks 1–6, the note still a draft, so nothing new is public
STOP: carve-out review. Joey approves the note's wording and the render.yaml rules
Milestone 2 (auto): task 7
Finish gate → PR (no migration, no env vars; deploy is merge)
```

## Environment tests

- Local: `npm test`, `npm run lint`, `npm run build`. Then a `dist/` check:
  `feed.xml` and `blog/**` diffed against an `origin/main` build, and
  `til/feed.xml` read for the expected item.
- Browser (`npm run dev`): `/til`, `/til/<slug>` and `/til/nope` in both
  themes, with a code block in the note to check Shiki colours; the footer
  and Blog links; a phone-width pass.
- `npm run preview` with `/til/` and `/til/<slug>/`, to confirm the
  prerendered head (title, description, alternate feed link).
- Post-deploy: `./scripts/smoke.sh`, then the W3C feed validator on
  `https://joey-haas.dev/til/feed.xml`, and `/til` and `/til/<slug>`
  without the slash, to prove the rewrites.
