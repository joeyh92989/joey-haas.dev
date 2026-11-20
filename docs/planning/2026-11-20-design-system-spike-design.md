---
status: planned
kind: spike + UI
mode: gated
issue: "#520 (spike), epic #519"
---

# Design system spike: Tailwind v4, shadcn/ui, and the new look

## Problem

The site's design has drifted between pages, and the owner finds the current look only OK. Epic #519 moves the whole site onto Tailwind CSS v4 and shadcn/ui. This spike proves the stack works in this repo, picks the preset and the look, and writes the stories. It builds nothing that ships.

## Scope

In: the build setup, the preset, the look (palette, type, devices), the dark mode, the Shadcnblocks call, the story list.
Out: migrating any page, deleting old CSS, new features, backend changes, the trip journal (being rethought on its own).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Stack | Tailwind v4 (Vite plugin) + shadcn/ui on Base UI, **JavaScript** (no TypeScript) | The frontend is Vite 6 + React 19 in JS. shadcn supports JS with `"tsx": false`. |
| Preset | **Luma** | Chosen by the owner against Vega and Sera on the real Home and Games pages. |
| Look | **3b1 "Archive catalogue"**: a collector's record system on warm paper | Owner: keeps coming back to the cartridge design for its personality, finds it childish and busy; wants the notebook's simplicity and calm colours. 3b1 keeps numbering and the filed-with-care feel and drops the toy styling. Confirmed by the owner on 2026-11-20. |
| Light palette | Warm paper (below) | Owner liked it from the first comparison. |
| Dark palette | **Dark B, graphite** (below) | Owner picked it from three non-blue candidates. Rejected earlier: neutral charcoal ("black leather"), navy, forest, plum, chalk teal. |
| Ledger direction (docs/planning/2026-10-19-site-refresh-design.md) | **Adapt, with two reversals** | Kept: mono kickers and labels, 1px rules, the JH mark, light and dark. Reversed: the warm palette is now wanted, and the serif is used for headings, no longer reserved for two headlines. |
| Shadcnblocks | **Do not buy** | See below. |
| Texture and craft | None. | Grain, tilted cards, tape, a handwriting font and hand-drawn underlines were all tried and rejected. The paper feel comes from colour, type and structure. |

## Build setup (proven on branch 520-design-system-spike)

1. `npm i -D tailwindcss @tailwindcss/vite`; add `tailwindcss()` to the Vite plugins.
2. `jsconfig.json` with `paths: { "@/*": ["./src/*"] }` and a matching `resolve.alias` in `vite.config.js`.
3. `components.json` by hand or `shadcn init -t vite -b base -p luma`, with `"tsx": false`, `"css": "src/tailwind.css"`. The CLI refuses to run unless the CSS file contains a plain `@import "tailwindcss";`, so a comment carrying that text satisfies its check while the real imports stay layered.
4. New dependencies the CLI adds: `@base-ui/react`, `class-variance-authority`, `cn` (shadcn's own package, MIT), `lucide-react`, `tw-animate-css`, `shadcn` (the CSS file imports `shadcn/tailwind.css`). Fonts needed by the look are already installed (Inter, Source Serif 4, JetBrains Mono).
5. `src/tailwind.css` imports only Tailwind's `theme` and `utilities` layers, so **Preflight stays off**.

### Four findings the migration must handle

1. **Layer the old stylesheet.** `index.css` has an unlayered `* { padding: 0 }` that beats every layered Tailwind utility, so cards, badges and buttons rendered with no padding. Fix: `@layer legacy, theme, base, components, utilities;` and `@import './index.css' layer(legacy);`. Unlayered CSS always beats layered CSS, so this ordering is the whole coexistence story. Remove it when the last page moves.
2. **Strip and scope the generated base.** The preset writes `@layer base { * { border-color… } body { background } html { font } }`, which restyles every unmigrated page. Remove it. Its `--accent` and `--radius` also collide with the site's tokens, so during migration the shadcn tokens live on a scope class; the final state maps them onto the site tokens.
3. **Links as buttons.** A Base UI `Button` rendered as a link (`render={<Link/>}`) needs `nativeButton={false}`, or it logs a warning. The old `a { color }` rule needs a one-line `inherit` in the base layer while legacy styles exist.
4. **Lint.** Generated files import an unused `React`, which fails the repo's lint. Delete the import after each `shadcn add`, or ignore `components/ui`.

### Evidence that the existing pages are unchanged

`npm test`: 261 files, 3,550 tests passed. `npm run build`, `npm run lint` and `format:check` clean. The visual baselines (`e2e:visual`) fail on this Mac, but the same 36,154 pixels differ on a clean `main` build, so the difference is macOS-versus-CI rendering and the branch adds none. A CI run on the first migration PR is the real check.

## The look

A collector's record system on warm paper. Serif headings, sans body, mono labels. One accent. Flat, quiet, adult.

Fonts (all installed): headings Source Serif 4, body Inter, labels and numbers JetBrains Mono.

| Token | Light (paper) | Dark (graphite) |
|---|---|---|
| page | `#f1ede6` | `#4e4e4d` |
| card | `#fcfbf9` | `#5a5a59` |
| ink | `#231f1a` | `#f5f4f1` |
| muted | `#57534d` | `#dad9d5` |
| line (outlines, page rules) | `#8c8579` | `#a6a5a2` |
| line inside cards | `#8c8579` | `#b0afac` |
| accent | `#a8321f` (rust) | `#f7a391` (red pencil) |
| text on accent | `#ffffff` | `#2b2b2a` |
| highlighter | `#f3dc6b` | `#ffd84a` |
| text on highlighter | `#231f1a` | `#2b2b2a` |

Radii 4 to 6px. Buttons flat, 1px outline. No shadows, no gradients, no texture.

### Contrast, measured by the designer from the tokens (WCAG)

| Pair | Light | Dark |
|---|---|---|
| Body text on page | 14.0 | 7.6 |
| Body text on card | 15.8 | 6.3 |
| Muted on page | 6.5 | 5.9 |
| Muted on card | 7.4 | 4.9 |
| Primary button text on accent | 6.7 | 7.2 |
| Non-text: card or outline against page | 3.1 | 3.4 |
| Non-text: rules inside cards | 3.5 | 3.15 |
| Non-text: accent edge or underline against page | 5.7 | 4.2 |
| Highlighter fill on card | 1.3 | 5.0 |

Every text pair is 4.5:1 or better and every structural mark 3:1 or better. The light highlighter fill is under 3:1, so it never stands alone: it sits inside an ink outline beside the words "live" or "Finished". These are computed values, so the migration's first token story re-measures them in the browser.

### Devices beyond shadcn plus tokens

1. **Record card**: a Card with a mono label strip across the top (catalogue number left, type or status right) and a 3px accent left edge. Used for Work items, shelf entries and At a glance.
2. **Catalogue number**: `No. 001`, mono, decorative, on collections only (work items, games, comics).
3. **Status mark**: a small outlined square, highlighter-filled when live or finished, always with the word beside it.
4. **Underline tabs**: shadcn Tabs restyled to a 3px accent underline.
5. **Spine view** (3b2): upright spine labels on a rail as an alternative view of a shelf, or a Home preview. Sideways text wraps on long titles and is slow at 109 items, so it is a view, never the default. The owner asked for it to be built (story 8).

## Shadcnblocks: do not buy

Researched on 2026-11-20 (pricing page): Pro $89, Premium $179, Elite $239 one-time with the Black Friday code, regular $149, $299 and $399. Personal sites are allowed. Not worth it: nothing found matches this look, the free parts cover what we need, and the Premium tier's 22 templates are template kits we would restyle anyway. Facade UI and neobrutalism.dev (both MIT, Base UI) were looked at and are not needed. The sale's end date was not stated on the page. Not verified: pack contents beyond the pricing page.

## Copy change decided in this spike

Home headline becomes "Building software since 2012, as a product manager and an engineer." (today: "...as a product manager first and an engineer since 2021."). It lives in `frontend/src/content/profile.js` (`headline`: `lead` and an italic `accent`), shipped yesterday in PR #515, and touches Home's hero, its tests and the link-preview text. It is independent of the look, so it ships first as its own small PR (story 1).

## Stories, in dependency order

Each becomes a sub-issue of #519 once the owner approves this doc.

1. **Home headline copy.** New wording in `profile.js`; update tests and prerendered preview text; changelog entry. *Done when:* Home, `/about` metadata and link previews show the new line, `npm test` and the build pass.
2. **Foundation.** Land Tailwind v4, the layered legacy sheet, `components.json`, `@` alias and the base setup on `main` with no visible change. *Done when:* the four findings above are handled, `shadcn add` works in a clean checkout, lint is clean, CI and the visual baselines pass unchanged, and `README` and `frontend/CLAUDE.md` describe the setup.
3. **Tokens, type and theme.** Map the table above onto shadcn tokens and the site's `data-theme` switch (dark default stays unless the owner changes it); load Source Serif 4 headings; re-measure every contrast pair in the browser; rework `typeScale.test.js` and `spaceScale.test.js` for the new sheet. *Done when:* both themes render the table values, the contrast table is re-measured, and the two scale tests pass against the new tokens.
4. **Core components.** Button (flat), Badge, Input, Tabs (underline), Separator, Card, plus the Record card, catalogue number and status mark; rebuild `PageHeader`, `EmptyState`, `LoadState`, `StatTile` and the chip rows on them; update `docs/design-system.md`. *Done when:* each has a test, `designConsistency.test.js` is updated for the new components, and the rule file names the component for each job.
5. **Site shell.** Masthead, nav and More menu, footer, theme toggle, page frame and the 1200px measure (`WIDE_ROUTES`, `CONTENT_ROUTES`), site search on the shadcn Command. *Done when:* every page shows the new shell in both themes with the old page bodies inside, and the keyboard and focus behaviour of the nav, menu and search is covered by tests.
6. **Home.** The Home page on the new components. *Done when:* it matches the chosen mockup at 1280px and 390px in both themes and the Home baselines are regenerated.
7. **Prose pages.** About, Projects, Now, Colophon, Blog and TIL. *Done when:* each uses the prose page type and the new components, with no hand-written card or header CSS left on them.
8. **Shelf lists.** Games and Comics (Record cards in a grid, underline-tab filters, search, result bar), including a spine view (upright spine labels on a rail) as an alternative to the card grid, as the owner asked for it to be built; it is never the default. *Done when:* both public lists and their admin twins share the components, and the shelf tests and a11y checks pass.
9. **Shelf details.** Item, comic title, volume and issue pages, year and month in review. *Done when:* the detail and sub-detail page types are drawn from the new components.
10. **Tools and data pages.** Stats (Chart, Card), Denver, Daily and Pick for me. *Done when:* charts use the chart tokens and keep their measured contrast.
11. **Admin.** The admin shell and pages (Sidebar, Data Table, forms). Large; the story splits by area when it starts. *Done when:* `ADMIN_AREAS` pages use the new shell and `adminCopyScan` still passes.
12. **Remove the old CSS.** Delete the legacy layer and `index.css`, turn Preflight on, update `CLAUDE.md` and the design doc. *Done when:* no `@layer legacy` remains and the visual suite passes on every page.

Quick wins that can run alongside, not blocking: plain-caption rewrite from the walkthrough (#475) is unrelated and stays where it is.

## Answered by the owner (2026-11-20)

1. **Direction:** 3b1 Archive catalogue.
2. **Dark primary button:** the dark theme's primary, red pencil (`#f7a391`). This is the assistant's reading of the answer "dark primary"; the highlighter yellow is the alternative if it was meant.
3. **Light blue:** none. Rust throughout.
4. **Spine view:** build it (story 8). This is the assistant's reading of "build it".

## Still open

- **Default theme.** Not answered. The site ships dark by default (a decision from the Ledger identity), so the plan keeps dark as the default. Story 3 asks again before it changes anything.
- **The throwaway spike code** on branch 520-design-system-spike (sample pages, palettes, craft and texture CSS, Rough Notation and Caveat dependencies) is a reference only. It is not merged and this PR carries only this document.

## Smoke check

On the foundation PR: `npm run build` passes, `/` and `/shelf/games` render exactly as before, CI's `frontend` and `e2e` jobs are green, and `/ds-spike` does not exist.

## Sources

- Tailwind install and Preflight: https://tailwindcss.com/docs/installation , https://tailwindcss.com/docs/preflight
- shadcn on Vite and presets: https://ui.shadcn.com/docs/installation/vite , https://ui.shadcn.com/docs/changelog/2026-03-cli-v4
- Shadcnblocks pricing and licence: https://www.shadcnblocks.com/pricing , https://www.shadcnblocks.com/license
- Mockups (out of git): `docs/planning/mockups/2026-11-20-identity/` (`compare.html` shows every candidate side by side)
