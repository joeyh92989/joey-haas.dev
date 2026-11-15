---
status: done
kind: feature
mode: auto
---

# Reading time, updated date, seed notes, accessibility and security.txt (#291, #293)

## #291

- `lib/readingTime.js` (pure): words in the markdown body, fenced code left
  out, at 220 words a minute, rounded up, at least 1. The plugin and
  `scripts/markdown-lib.mjs` both call it, so the site and the build scripts
  agree. The plugin adds `readingMinutes` and optional `updated` (a
  `YYYY-MM-DD`, checked not earlier than `date`) to the frontmatter.
- `PostMeta` shows "N min read" and, when set, "Updated <date>".
- Three TIL notes from `docs/learnings.md`, committed as `draft: true`;
  Joey flips the ones he wants. The changelog gets no entry until one
  publishes. The tag index and related posts wait for four posts (issue).
- Not closed by this PR: "at least three TIL notes published" needs Joey.

## #293

- No new route: the accessibility statement is a Colophon section (as the
  issue's Expected says), so the new-route checklist does not apply.
- Statement claims only what the repo shows: axe in the Playwright e2e on
  every PR, a skip link, keyboard-operable search, contrast ratios recorded
  beside the tokens. No conformance level is claimed. Report by the
  email already on the footer.
- `frontend/public/.well-known/security.txt`: Contact is the footer email,
  Expires within a year. Render serves `public/` files as-is.
- Colophon "Docs and decisions" links the three docs on GitHub.
