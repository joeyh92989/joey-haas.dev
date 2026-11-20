---
status: planned
kind: UI (tokens), no component or page restyling
mode: auto
issue: "#527, epic #519"
---

# Design system tokens, type and theme

## Problem

The look chosen in the spike (3b1 "Archive catalogue": warm paper in light, graphite in dark, rust or red-pencil accent, serif headings) exists only as a table in `docs/planning/2026-11-20-design-system-spike-design.md`. Every later story needs it as tokens. After this story the whole site wears the new palette and type, because old pages read the same tokens; components and layouts do not change.

## Scope

In: the palette in `index.css` (dark `:root`, light `[data-theme='light']`, and the print copy), the shadcn semantic tokens and Tailwind `@theme inline` mappings, Source Serif 4 headings, a contrast guard test, the two scale tests, visual baselines, docs.

Out: restyling any component or page (layout, spacing, borders, radii stay), new font files, the OG card and favicon (they hard-code the old palette; follow-up noted below), the Record card and other devices (#528).

## Solution

Repoint, do not rename. Old pages use `--bg`, `--surface`, `--text`, `--accent`, `--line`. Changing those values moves every page at once.

| Legacy token | New value role | Light | Dark |
|---|---|---|---|
| `--bg` | page | `#f1ede6` | `#4e4e4d` |
| `--surface` | card | `#fcfbf9` | `#5a5a59` |
| `--text` | ink | `#231f1a` | `#f5f4f1` |
| `--text-2`, `--text-3` | muted (both) | `#57534d` | `#dad9d5` |
| `--line`, `--line-strong` | line (outlines, page rules) | `#8c8579` | `#a6a5a2` |
| `--line-card` (new) | line inside cards | `#8c8579` | `#b0afac` |
| `--accent` | accent | `#a8321f` | `#f7a391` |
| `--accent-ink` | text on accent | `#ffffff` | `#2b2b2a` |
| `--highlight` (new) | highlighter | `#f3dc6b` | `#ffd84a` |
| `--highlight-ink` (new) | text on highlighter | `#231f1a` | `#2b2b2a` |
| `--sunken`, `--accent-soft`, `--search-active`, `--skeleton`, `--code-bg` | derived | decided under test, see below | |

Rules for the tokens with no entry in the design table (my call):

- `--sunken`: a step from `--bg` away from `--surface` (light a little darker than page, dark a little darker than page), chosen so `--text`, `--text-2` and `--text-3` clear 4.5:1 on it.
- `--accent-soft`: a tint of `--accent` over `--surface` that keeps `--text` and `--accent` at 4.5:1.
- `--code-bg` and the Shiki palette: unchanged. They were measured as a pair, and a dark code block on paper or graphite reads as intended. Revisit in the prose-pages story if it clashes.
- Data colours (`--ok`, `--warn`, `--chart`, `--chart-2`, `--rating`, `--status-*`, `--run-missing`, redaction and hatch stops, `--gc-*`): keep the hue; move lightness the smallest amount needed to clear 3:1 (marks) or 4.5:1 (text) against the new `--surface`, `--bg` and `--line`. `--gc-*` garment colours are data, so they do not change. Record each moved value in its comment as the file already does.
- Default theme stays dark (the spike left it open; the markup ships `data-theme="dark"`). **My call**, not asked.

The three copies of the palette (`:root`, `[data-theme='light']`, the `@media print` block near the end with the "keep in step" comment) all change together.

shadcn tokens: declared once on `:root` and `[data-theme='light']` in `tailwind.css`, mapped from the same values (`--background` = `--bg`, `--foreground` = `--text`, `--card` = `--surface`, `--primary` = `--accent`, `--primary-foreground` = `--accent-ink`, `--muted-foreground` = `--text-2`, `--border` = `--line`, `--ring` = `--accent`, and so on), with `@theme inline` mapping `--color-*` to them. **Collision:** shadcn's `--accent` means a hover background, the site's means the brand colour. Expose shadcn's through a differently named variable (`--color-accent: var(--sh-accent)`), leave the site's `--accent` alone. `--radius` stays 6px (already redeclared in `@theme`). No `.ds` scope class exists on `main`, so none is removed.

Type: `h1`, `h2`, `h3` base rule uses `var(--font-display)` (Source Serif 4, weight 500, the only cut installed besides its italic); `--font-heading` in `@theme` points to it. Body stays Inter, labels JetBrains Mono. No new font files, so selectors that set serif at 600 or 700 are set to 500 (the browser would synthesise the weight otherwise). `.drawn-map__sea-label`'s `font:` line is pinned by `typeScale.test.js` (EXEMPT); do not edit that line. The stale comment in `main.jsx` (serif "only for the two page-opening headlines") and the matching text in `Colophon.jsx` are corrected; `Colophon.test.jsx` checks font names against `main.jsx`.

## Decisions and tradeoffs

- **Repoint vs rename:** repoint keeps the diff to one stylesheet and gives a site-wide look change that is easy to review and revert. Cost: legacy names (`--bg`) outlive their meaning until the old CSS is removed (#536).
- **Heavier rules:** the design makes outlines and rules 3:1 (`#8c8579`), far stronger than the hairlines today. Pages will look more outlined before their stories restyle them. Accepted; it is the chosen look.
- **Contrast is a test, not a screenshot:** `src/contrast.test.js` parses both theme blocks, resolves `var()` and checks each pair, so a later token edit cannot silently fail AA. The browser check is CI's axe run (`e2e` runs axe with contrast on, on real pages) plus a one-off measured table in the PR.
- **OG card and favicon** keep the old palette (`scripts/og-card.mjs`, `public/favicon.svg`); they are brand assets outside the acceptance criteria. Follow-up for the shell story (#529).

## Tasks

Model: Sonnet for all. Work in `/Users/joey-haas/Developer/joey-haas.dev-worktrees/527-design-system-tokens`; push with `git push origin HEAD:527-design-system-tokens`; `npm ci` in `frontend/` first.

1. **Contrast test, first, shown failing.** `frontend/src/contrast.test.js` (Node environment): parse `:root` and `[data-theme='light']` from `index.css`, resolve `var()` references, compute WCAG ratios. Pairs, both themes: `--text`, `--text-2`, `--text-3` on `--bg`, `--surface`, `--sunken`, `--accent-soft` ≥ 4.5; `--accent` on `--bg` and `--surface` ≥ 4.5; `--accent-ink` on `--accent` ≥ 4.5; `--highlight-ink` on `--highlight` ≥ 4.5; `--line`, `--line-strong`, `--line-card` on `--bg` or `--surface` ≥ 3 (card lines on `--surface`); `--ok`, `--warn`, `--chart`, `--rating`, `--status-*` (except where the file's comment says decorative) on `--surface` ≥ 3. It must fail on today's palette for the new-token pairs (names missing) and pass at the end. *Done when:* shown failing, then passing. Files: that test.
2. **Palette.** Change the three copies in `index.css`; add `--line-card`, `--highlight`, `--highlight-ink`; retune data colours by the rule above; rewrite the measured-ratio comments with the numbers the test computes (`intakeStyles.test.js` asserts ratio strings written in comments, e.g. '--text on --sunken 14.25 dark, 16.15 light': update them and that test together). *Done when:* `contrast.test.js` passes and `npm test` is green.
3. **shadcn tokens and mappings** in `tailwind.css` as above, with `tailwindSetup.test.js` still green (it requires colliding legacy tokens to be redeclared in `@theme`; shadcn's names must not collide with legacy ones except through the renamed accent). *Done when:* the guard passes and `npx shadcn add` of one component in a scratch clone renders with the right colours (discard it).
4. **Type.** Headings use the serif per the section above; fix `main.jsx` and `Colophon.jsx` text; no new font files. *Done when:* `Colophon.test.jsx`, `typeScale.test.js` and `spaceScale.test.js` pass. Rework both scale tests only if they stop enforcing something real: add to `typeScale.test.js` a check that `h1`, `h2`, `h3` use `--font-display` and that no `font-weight` above 500 is set together with `--font-display`; add nothing else.
5. **Visual baselines and a11y.** Build and run `e2e` locally (a11y with real data build per learnings 2026-11-12: `SNAPSHOT_API_URL=https://api.joey-haas.dev VITE_DAILY_SALT=local npm run build && npx playwright test e2e/a11y.spec.js --project=desktop`). Fix any contrast failure at the token. Regenerate the 36 baselines with the repo's `update-visual-baselines` workflow on the branch (a `GITHUB_TOKEN` commit starts no CI: push an empty commit after). Capture before and after screenshots of Home, `/shelf/games`, `/about`, `/stats` and `/admin` at 1280 and 390 in both themes for the PR.
6. **Docs.** `docs/design-system.md` and `frontend/CLAUDE.md`: the token table, the repoint approach, the accent collision, the three-places rule. *Done when:* each token role is documented once.

## Ship notes

No migration, secrets or `render.yaml` change. Changelog: yes, one bullet, because every visitor sees a new look (date today, newest first; the build parses it). Smoke after deploy: `/` and `/shelf/games` render in the new palette in both themes; smoke's pinned titles are unchanged.

## Smoke check

`./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`, then look at Home and Games in both themes.

## Sources

- Palette, contrast table and decisions: `docs/planning/2026-11-20-design-system-spike-design.md`
- WCAG 2.2 contrast minimum and non-text contrast: https://www.w3.org/TR/WCAG22/#contrast-minimum , https://www.w3.org/TR/WCAG22/#non-text-contrast
- Repo: `frontend/src/index.css`, `frontend/index.html` (pre-paint script), `frontend/src/typeScale.test.js`, `frontend/src/spaceScale.test.js`, `docs/learnings.md`
- Mockups (out of git, on disk only in the 520 spike worktree): `docs/planning/mockups/2026-11-20-identity/3b1-archive-home.html`, `3b1-archive-shelf.html`

## Found in review

- Dark --accent (#f7a391, the design table) is 3.49 on the card and 4.21 on the page, so it is a mark colour only. Accent text uses `--accent-text` (dark #fac5b9, light the same as --accent); `--ok-text` and `--warn-text` do the same for --ok and --warn. Decided in auto mode after the dark a11y run flagged accent links.
- Cold review (PR #542) found and fixed: the comic "upcoming" numerals were 2.08 in dark over the light stripe, so the hatch has its own `--hatch-stripe` (dark black, light #848993); `.chip-count`, `.shelfle-hint` and `.pick-hint` faded text with `opacity`; `.cand-src` used `--chart` as text; meter tracks (`.pick-term-bar`, `.review-bar`, `.progress i`) sat on `--line` and are now `--sunken`; light and print never declared `--highlight`; print could drift from light (now a test).
- Left as found: `.tour-bar` draws `--chart` on a `--chart-2` track, already under 3:1 on main. Rows dimmed with opacity while inactive (`.intake-skim li.owned`, `.intake-book[data-off]`) are exempt as inactive components. Dark `--line` on `--surface` is 2.80, so legacy card outlines are under 3:1 until the card components use `--line-card` (#528).
