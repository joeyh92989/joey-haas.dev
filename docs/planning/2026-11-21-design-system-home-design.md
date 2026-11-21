---
status: planned
kind: UI (Home page body)
mode: auto
issue: "#530 (and #525), epic #519"
---

# Design system: Home page

## Problem
The shell is on the new look (#529) with old page bodies inside. Home is the first page every visitor reads, so it moves next.

## Scope
In: `frontend/src/pages/Home.jsx` and the CSS for the hero, At a glance, Work, Experience and contact blocks, rebuilt on the #528 components (`RecordCard`, `CatalogueNumber`, `StatusMark`, `Button`, `Badge`, `Separator`). Matches `3b1-archive-home` at 1280 and 390 in both themes: kicker, headline, lede, buttons, At a glance record card, Work records with catalogue numbers, Experience rows, contact line.
Out: other pages, the shell.

## Look
Mockup (on disk only): `/Users/joey-haas/Developer/joey-haas.dev-worktrees/520-design-system-spike/docs/planning/mockups/2026-11-20-identity/3b1-archive-home.html`. Spec: `docs/planning/2026-11-20-design-system-spike-design.md`. Tokens win over mockup literals.

## My calls
- **Headline (issue #525):** the owner's latest wording in chat is "Building software since 2012." (already shipped in PR #544; it supersedes #525's longer line). #530 says no italic accent phrase, so drop the italic: `profile.headline` becomes a single string, the `<em>` and the visually-hidden duplicate go, and the h1 is plain text. Update Home.test, `docs/voice.md` and the changelog entry for the headline (one bullet). Close #525 with a comment pointing at #544 and this PR.
- Home stays free of API calls; Playing and Latest rows still read the snapshot. Keep ids, aria, links, heading levels and test hooks.
- Catalogue numbers appear on collections only (Work records), decorative `aria-hidden`.
- Focus rings: every new interactive element has `focus-visible:outline-solid`; assert `outlineStyle !== 'none'` in Playwright.
- Coloured text uses the `-text` tokens; no opacity on text. No sideways scroll at 320 to 1440.
- Legacy classes stay where other CSS or tests read them until #536.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, the mockup. Rebuild the hero (plain headline) and buttons.
2. At a glance as a `RecordCard`; Work as record cards with catalogue numbers; Experience rows; contact line.
3. Tests fail first for each pinned behaviour; contrast pairs for anything new in `contrast.test.js`.
4. Verify: lint, format, targeted tests, build, `npm run e2e` with the fixture snapshot; before/after screenshots at 1280 and 390 in both themes. Baselines regenerate on CI afterwards (mine).

## Ship notes
No migration, secrets or render.yaml change. Changelog: one bullet. Smoke: `/` in both themes; smoke titles unchanged.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `docs/design-system.md`, `frontend/CLAUDE.md`.
