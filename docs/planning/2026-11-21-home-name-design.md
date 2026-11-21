---
status: planned
kind: UI (Home hero) + writing (one heading)
mode: gated (the owner chose direction B and asked for it in this run)
issue: "#589, epic #519"
---

# Design system: Home shows my name

## Problem
A visitor landing on Home does not see the owner's name. The only name on the page is a small bold "Joey Haas" beside the "JH" box in the masthead, which reads as a logo. The hero starts with a muted job-title line and the headline "Building software since 2012." The owner asked for the name on the landing page.

## Scope
In: `frontend/src/pages/Home.jsx` (the hero heading and a new subline), `frontend/src/content/profile.js` (the `headline` comment), their tests (`Home.test.jsx`, `e2e/home.spec.js`, and anything else that pins the old h1: grep), `docs/voice.md` (the hero sample), `frontend/changelog.md` (one plain bullet).
Out: other pages, the masthead, the résumé PDF, the page title and meta description (they already lead with the name and stay as they are).

## Solution (direction B, chosen by the owner on 2026-11-21)
Mockup: `docs/planning/mockups/2026-11-21-name-on-home/b-name-as-h1.html` (out of git; published read-only at https://claude.ai/code/artifact/3866989c-d8ea-4ca2-a3c8-6eca6e7045e8). Rejected: A (name in the kicker: still 14px, too quiet) and C (name plate: +40px on a phone and two large serif lines competing). Name form: "Joey Haas" (matches the masthead and the page title); "Joseph (Joey) Haas" wraps below 393 and would disagree with the masthead.

- The h1 renders `profile.name` ("Joey Haas"), serif 500 at the hero size (`--fs-56`, `--fs-40` on a phone).
- `profile.headline` ("Building software since 2012.") moves to a `<p>` under the h1: serif 500 (`--fs-28`, `--fs-24` on a phone), then the lede. It is not a heading (heading order stays h1, then the h2s). Plain text, no italic.
- The kicker line ("Senior software engineer · Denver, Colorado") stays above the h1, as in the mockup.
- One new class `hero-sub` beside `hero-title` (utilities on the element; the old stylesheet is being retired under #536, so do NOT add rules to `index.css`; use utilities or the existing hero class strings in `Home.jsx`).
- Phone cost: hero 5px shorter on a 393x852 viewport; the six buttons stay above the fold at 320, 360 and 393.

## My calls
- The h1's old visually-hidden duplicate is already gone (#530); the h1 is plain text `profile.name`.
- `profile.js`: no value changes; reword the `headline` comment ("Home's hero") to say it is the subline under the name.
- The `docs/voice.md` hero sample becomes: "Joey Haas" then "Building software since 2012." (two lines).
- Changelog bullet, plain: "Home now opens with my name." Dated today.
- Heading order: confirm `Home.test.jsx` has a heading-level check and keep it passing.

## Tasks (Sonnet)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, `docs/voice.md`, `frontend/src/pages/Home.jsx`, `Home.test.jsx`, `e2e/home.spec.js`, the mockup B file. Grep the whole repo (src, e2e, scripts, docs, `frontend/scripts` prerender, `scripts/smoke.sh`, public, .github) for the old h1 text "Building software since 2012" and for anything that reads Home's h1 (link preview text, search index entries, prerendered head/body, the OG card script): list each and update only what pinned the h1.
2. Tests first (run against old code, say which failed): h1 is exactly "Joey Haas"; the subline paragraph reads "Building software since 2012." and is not a heading; heading levels unchanged; the kicker stays. Update `e2e/home.spec.js`.
3. Implement; match the mockup at 393 and 1280 in both themes (screenshots, view them all and say how many); no overflow or clipping at 320, 360, 393, 1280, 1440 (Playwright assertion naming the offender); measure the buttons' top/bottom at 393x852 vs main and report.
4. Verify: lint, format, full `npm test` once, build, `check-entry-chunk.mjs`, `e2e/home.spec.js` and the a11y spec for `/` single-worker (own port; do not use or kill other processes' previews). Do NOT regenerate visual baselines (I do that on CI afterwards).

## Ship notes
No migration, secrets or render.yaml change. Changelog: one bullet. Smoke: `/` shows "Joey Haas" in both themes; the smoke script does not pin the headline (checked). The Home visual baselines change (expected): regenerate on CI, then an empty commit.

## Sources
Mockup B and its README; `docs/design-system.md`; `docs/voice.md`; issue #589.
