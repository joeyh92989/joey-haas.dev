---
status: planned
kind: fix (small accessibility and visual follow-ups from the design-system migration)
mode: auto
issue: "#598 (part 1 of 2)"
---

# Design-system follow-ups: the small UI and accessibility fixes

## Problem
Epic #519 finished with the old CSS gone. Issue #598 lists small items deliberately left out of the "no visible change" slices. This PR fixes the ones that are real, small and checkable. Read #598 and the bodies of PRs #593 to #597 for each measurement. Design calls are mine (auto mode): fix to the site's existing look, no new visual language.

## Scope: fix these
1. **Prose links** use the browser default focus ring while cards use the accent ring: give prose links (`.post-body`, About, Colophon, prose pages, `prose-classes.js`) the same accent focus ring as other links (`focus-visible:outline-2 outline-offset-2 outline-(--accent)` as `chipClasses.js` does).
2. **`.replay-mark` on dimmed public cards fails axe contrast** (public cards dimmed when out of stock/unavailable; the admin was already fixed): fix the contrast on the dimmed state, keeping the "dimmed" look.
3. **StatTile "Best day" detail is clipped at 320 to 390px:** let it wrap or truncate with an accessible full text; no clipped information.
4. **Quick-rate half-star targets are 9px wide** (WCAG 2.5.8 needs 24px or spacing): make the targets meet 2.5.8 on phone and desktop without changing the look at rest (for example enlarge the hit area with padding or a pseudo-element, or give the halves enough spacing). Show before/after screenshots; if it needs a visible redesign larger than that, do not do it: stop and report the options.
5. **The shell's phone page links are 36px high; JumpNav phone links are 44px block boxes with the text at the top:** make the shell links 44px tall (centre the label) and centre JumpNav's label in its 44px box.
6. **Admin spots table** (list the problem you find in #598's context and the PR #535-series bodies; if the table overflows or is unreadable at 320 to 390, make it fit like the other admin tables in `adminDataClasses.js`) and **`.tour-bar` track contrast** (the bar's track against its background must meet 3:1; use an existing token).
7. **Hovered cards underline:** `a.cover-tile`, Travel cards (`TripCard`), map pins (`DrawnMap`) and Book-page neighbour links underline on hover because the global `a:hover` beat an old `text-decoration: none`: make them not underline on hover.
8. **Code font:** blog and Tour code blocks render in the browser's default monospace. If JetBrains Mono is already loaded on those pages (check `index.html`, `tokens.css`, the font files in `public/`), make `code`/`pre` use `var(--font-mono)`; if it is NOT loaded, do not add a webfont: leave it and say so.
9. **Firefox date fields:** `WRAP_DATE` (`wrapUpClasses.js`) and `PACK_INPUT` (`closetReviewClasses.js`) use +1px vertical padding to compensate for Preflight zeroing `::-webkit-datetime-edit-*`. Firefox has none of those parts, so the fields are 2px taller there. Move the compensation onto the WebKit parts (`[&::-webkit-datetime-edit]:py-px` or the exact pseudo-elements Preflight resets) so it applies only where Preflight removed the padding, and drop the +1px from the input itself. Verify the Chromium height is unchanged.

## Out of scope (decided: close as accepted in #598, no code)
Run lanes' 24px top margin (long-standing, harmless); the global `@utility` classes as per-site constants (low value, high risk); no iOS tap highlight (standard Tailwind default); Preflight's search-decoration in Safari (cannot verify without WebKit).

## Proof
- Each fix: before/after screenshots at 320, 393 and 1280 in light and dark, and a measurement (computed height, axe contrast, outline). Use the computed-style dump (`frontend/e2e/tools/style-dump.mjs`, README) with a new `scenarios/f598.mjs` to prove ONLY the intended elements changed (the diff against a fresh main build must list nothing else).
- Add or extend an e2e check where a behavioural pin fits (tap target sizes, focus ring painting, no sideways scroll, axe on the dimmed card): the repo has `e2e/a11y.spec.js` and the admin specs as models.
- Visual baselines WILL change for the visible fixes: after everything else is green, run `gh workflow run update-visual-baselines.yml --ref 598a-followups-ui`, pull the bot commit, push an empty commit to start CI, and list the baseline images that changed in the PR body (each must be an intended change).
- Final build: lint, format, full `npm test`, build (`VITE_DAILY_SALT=local`), `scripts/check-entry-chunk.mjs`, default-config Playwright single worker, and `e2e:admin` locally (README → Browser tests).
- Write every utility out whole (no `${PREFIX}utility`; `noSplitUtilities.test.js` guards it). Keep class names that tests/e2e/print read. `frontend/CLAUDE.md` and `docs/design-system.md` updated where a rule changes (tap-target sizes, focus ring).

## Changelog
`frontend/changelog.md` only if a change is visible to a visitor (items 1, 3, 4, 5 are): one bullet, "Small accessibility fixes: ...", dated today.

## Ship notes
No migration, secrets or render.yaml change. Smoke: `/`, `/shelf`, `/about`, `/stats`. Closes nothing by itself: the PR says "Part of #598"; the main agent updates the issue checklist after merge.
