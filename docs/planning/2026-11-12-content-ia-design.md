---
status: done
kind: fix
mode: auto
---

# Findability and content fixes, part A (design and plan)

Issues: #183, #186, #194, #199, #201 (spelling only). Branch `fix/content-ia`. Backlog:
`2026-11-12-site-review-issues.md`. Research: this session (paths below).

Part A changes structure and wiring only: no new prose. The repo has no `docs/voice.md`, and new
copy waits for Joey to approve one (`sdlc-writing`); part B (Now intro, Denver "coming soon",
the contact line in #196, the naming choices in #201) follows after that.

## Problem

- **#183** `/denver` is public with no spots. The footer link hides on an empty spots snapshot
  (#125), but the page is still prerendered into the sitemap, listed in the search palette
  (`SearchDialog.jsx:8`, `staticPages`), and linked from the changelog (`changelog.md:43`, whose
  line 34 promises links to empty pages stay hidden).
- **#186** Now's "Up next" shows only a hand-pinned game (`Now.jsx:123-133`); the snapshot it
  already reads has Tonight's picks. The RSS line touches the list above it (`Now.jsx:152-155`,
  global margin reset).
- **#194** The changelog has no anchor (`Stats.jsx:164`); Home's "Last shipped" is the newest blog
  post (`Home.jsx:26-61`), not the newest change; `/shelf/intake` is linked from no page.
- **#199** Long posts have no contents list (the markdown plugin emits no heading ids) and the
  back link is only at the bottom (`BlogPost.jsx:39-41`; TIL notes put it on top).
- **#201 (spelling)** British spellings in visible copy against the American policy
  (`spine.js:10-15`): `spine.js:451` "favourites", `:741` and `:783` "Neighbouring",
  `denver.js:44` "neighbourhood".

## Solution and decisions (my call)

1. **Denver hides everywhere the footer does, without touching `render.yaml`.** Changing the
   rewrite list per build would break the rule that every rewrite names a file the build writes
   (`prerender-lib.test.mjs:627-668`), and spots coming back would need another infra change. So
   `/denver` stays prerendered and routable, but when the spots snapshot is written and empty:
   its prerendered head gets `<meta name="robots" content="noindex">`, it is left out of
   `sitemap.xml`, the search palette drops it (`hasSpots` from `lib/snapshotPresence.js`), and the
   changelog renders the Denver bullet's link as plain text (a small "hidden paths" input to
   `renderLine`). The build-side presence comes from `scripts/snapshot-presence.mjs`, as the
   footer's does.
2. **Now's Up next falls back to Tonight's first pick** when nothing is pinned
   (`tonight.up_next ?? tonight.picks[0]`, as `lib/next.js:80-81` already does), labelled the same.
   The RSS line gets a top margin.
3. **Changelog anchor:** `id="changes"` on `/stats`' Changes heading, so `/stats#changes` lands
   on it. **Home's "Last shipped"** reads the newest changelog entry (`CHANGELOG[0]`: its date and
   first bullet's linked page or its text, trimmed) and links to `/stats#changes`; the label stays.
4. **Intake demo** gets a link from How it works' intake stop (the stop that describes photo
   intake) using the page's existing title text (`content/intake.js`), and from the Projects My
   Shelf card's link row, next to "How it works".
5. **Long posts:** the markdown plugin gives every `h2`/`h3` a slug id (a small rehype step, no
   new dependency unless one is already present), and exports the `h2` list. `BlogPost` shows a
   contents list after the meta row when a post has more than four `h2`s (StopIndex is the
   visual precedent), and adds "← All posts" at the top as TIL notes do. Contents label: "On this
   page" (existing UI vocabulary, not prose). Reading time: out (#199 asks for it but it is new
   copy; part B).
6. **Spelling:** the four strings become American ("favorites", "Neighboring", "neighborhood").
   Identifiers and data fields keep their names.

## Scope

In: the items above. Out: everything that needs new prose (part B); `render.yaml`.

## Sources

Research notes (this session): `scripts/fetch-snapshot.mjs:189-191`,
`scripts/snapshot-presence.mjs:17-45`, `lib/snapshotPresence.js:19`, `SiteFooter.jsx:41-45`,
`content/pages.js:86-91,120-121`, `prerender-lib.mjs:176-200,515-527`, `SearchDialog.jsx:8`,
`changelog.md:34,43`, `content/changelog.js:45-66`, `Now.jsx:50-157`, `lib/next.js:80-81`,
`Stats.jsx:164`, `Home.jsx:26-61`, `content/intake.js:24`, `vite-plugin-markdown.js:26-42,238`,
`BlogPost.jsx:27-41`, `TilNote.jsx:22-24`. CLAUDE.md: prerender and rewrites; #125 presence rule;
changelog format; American spelling.

## Smoke check

`npm run build` with an empty spots snapshot: `/denver` absent from `dist/sitemap.xml`, its head has
`noindex`, search palette lacks it; with spots present: all as before. Post-deploy smoke.

## Plan

Preflight per task: `npm run format:check && npm run lint && npm test`; Task 1 also runs the
script tests (`prerender-lib`, `snapshot-presence`) and a build; the last task runs CI-mode e2e and
the real-data a11y run.

### Task 1 — Denver follows its presence (#183)
Files: `scripts/prerender-lib.mjs`, `scripts/prerender.mjs`, `src/components/SearchDialog.jsx`,
`src/content/changelog.js`, tests (`prerender-lib.test.mjs`, `SearchDialog.test.jsx`, changelog
tests). Acceptance: with `spots.json` = `[]`, `/denver` has `noindex`, is out of the sitemap and
search, and the changelog bullet has no link; with spots or no snapshot, nothing changes; the
rewrite test still passes.

### Task 2 — Now, Stats anchor, Home's Last shipped, intake links (#186, #194)
Files: `Now.jsx`, `Stats.jsx`, `Home.jsx`, `HowItWorks.jsx` or `content/spine.js` (the intake stop's
link), `Projects.jsx`/`content/projects.js`, `index.css`, tests. Acceptance: Up next shows the first
pick when nothing is pinned; RSS line spaced; `/stats#changes` lands on the heading; Last shipped
names the newest change and links to it; the intake demo is linked from How it works and
Projects.

### Task 3 — Contents for long posts; spelling (#199, #201)
Files: `vite-plugin-markdown.js`, `BlogPost.jsx`, `index.css`, `content/spine.js`,
`content/denver.js`, tests. Acceptance: a post with more than four `h2`s shows "On this page"
linking to each; "← All posts" at top and bottom; heading ids stable and unique; the four
spellings American; changelog bullet (one, under 2026-11-12) for the visible changes.

## Ship notes

Frontend and build scripts only. No `render.yaml`, migration or env var.
