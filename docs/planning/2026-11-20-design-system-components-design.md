---
status: planned
kind: UI (shared components), no page layouts
mode: auto
issue: "#528, epic #519"
---

# Design system core components

## Problem

The tokens (#527) are in. Pages still draw buttons, cards, badges, chips and headers from hand-written CSS, so the look cannot spread by itself. This story builds the shared components on shadcn (Base UI, Luma) in the 3b1 "Archive catalogue" look, and rebuilds the five shared components that already do these jobs on top of them without changing their props. Pages are not touched.

## Scope

In:
- shadcn `Button` (flat), `Badge`, `Input`, `Tabs` (underline), `Separator`, `Card` in `src/components/ui/`, restyled to the look.
- Three site components on top: **Record card** (`RecordCard`), **catalogue number** (`CatalogueNumber`), **status mark** (`StatusMark`).
- `PageHeader`, `EmptyState`, `LoadState`, `StatTile` and the chip rows (`FilterChips`) rebuilt on them, props and behaviour unchanged.
- `docs/design-system.md` names the component for each job; `designConsistency.test.js` follows.

Out: page layouts, the shell (#529), Home and later pages, the spine view (#532), admin pages beyond what the five rebuilt components already render, the OG card and favicon.

## The look (spec)

From `docs/planning/2026-11-20-design-system-spike-design.md` ("The look" and "Devices"). Mockups (out of git, on disk only in the 520 spike worktree): `/Users/joey-haas/Developer/joey-haas.dev-worktrees/520-design-system-spike/docs/planning/mockups/2026-11-20-identity/3b1-archive-home.html` and `3b1-archive-shelf.html`. Read both; the implementer matches them, using the site's tokens (not the mockups' literals).

- Flat, quiet, adult. Radii 4 to 6px (`--radius` 6px). No shadows, gradients or texture. 1px outlines in `--line`; lines inside cards `--line-card`.
- **Button:** flat, 1px outline; primary fills with `--accent` and text `--accent-ink`; no shadow. Link buttons use `render={<Link/>}` with `nativeButton={false}` (finding 3 of the foundation).
- **Badge:** small mono label with outline; variants for default, outline, and accent-filled.
- **Tabs:** 3px `--accent` underline on the active tab; keyboard and `aria-selected` from Base UI.
- **Record card:** a `Card` with a mono label strip across the top (catalogue number left, type or status right), a 3px `--accent` left edge, and a flat 1px outline.
- **Catalogue number:** `No. 001`, mono, decorative (`aria-hidden`), on collections only.
- **Status mark:** a small outlined square, filled `--highlight` (ink `--highlight-ink`) when live or finished, always with the word beside it; the colour never carries the meaning alone.
- Text colours: coloured text uses `--accent-text`, `--ok-text`, `--warn-text`, never the plain mark tokens (frontend/CLAUDE.md, Tokens and theme).

## Decisions and tradeoffs

- **Generated, then edited:** run `npx shadcn add button badge input tabs separator card`, then restyle the generated files in place. The files are ours from then on; note in `frontend/CLAUDE.md` that regenerating overwrites the look.
- **Rebuild without changing props:** the five shared components keep their prop APIs and rendered semantics (heading levels, `aria-*`, roles, ids), so no page changes. Their legacy class names stay on the element where other CSS or tests still read them until #536; the new component supplies the look.
- **Legacy `.btn`, `.chip`, `.card` classes stay** for pages not yet migrated. This story adds components, it does not delete legacy CSS.
- **No demo route.** `/ds-spike` must not exist. Before-and-after screenshots come from the real pages that use the five rebuilt components, plus one uncommitted scratch page (not committed, deleted after) that shows the new components for the PR's screenshots.
- `bg-accent` in shadcn means a hover background (`--sh-accent` = `--sunken`); brand fills are `bg-primary`. Do not reintroduce a collision.

## Tasks

Model: Sonnet for all. Work in `/Users/joey-haas/Developer/joey-haas.dev-worktrees/528-design-system-components`; push with `git push origin HEAD:528-design-system-components`; `npm ci` in `frontend/` first; read `frontend/CLAUDE.md` ("Design system setup", "Tokens and theme") and `docs/design-system.md` first.

1. **ui primitives.** Add the six shadcn components, fix the generated `React` import warning per the eslint override, restyle each to the spec, each with a test (renders, variants, keyboard for Tabs, link-as-button without a console warning). A test fails first for each variant or behaviour it pins. *Done when:* lint, format, tests green; a scratch screenshot of each in both themes.
2. **Site devices.** `RecordCard`, `CatalogueNumber`, `StatusMark` in `src/components/`, each with a test (label strip content, accent edge via class, `aria-hidden` on the number, the word beside the mark, mark filled only when `live`/`finished`). *Done when:* tests green; contrast pairs the devices use are asserted in `contrast.test.js` (status mark outline and fill on `--surface` >= 3, text >= 4.5), both themes.
3. **Rebuild the five.** `PageHeader`, `EmptyState`, `LoadState`, `StatTile` (and `StatTiles`), `FilterChips` on the new components, props unchanged. Their existing tests must pass unmodified except where a test pins a legacy class that moved (say which and why). Check admin uses (`AdminPageHeader`, admin chip rows) still render correctly. *Done when:* the full suite passes and the e2e and a11y runs show no new violation.
4. **Rules.** `docs/design-system.md` "One of each": the component for each job (Button, Badge, Input, Tabs, Separator, Card, RecordCard, CatalogueNumber, StatusMark), the use rules (one primary button per view, tabs for sections of one page, status mark always with its word, catalogue number on collections only). Update `designConsistency.test.js` so a page that hand-writes one of these jobs is refused where the existing pattern already enforces its twin (empty state, load error); add only the checks the rules really support. *Done when:* each rule names exactly one component and the test passes.
5. **Verify.** `VITE_DAILY_SALT=local npm run build && npm run e2e`; the real-data a11y pass; screenshots of Home, `/shelf/games`, `/shelf/comics`, an item page, `/stats` and `/admin` at 1280 and 390 in both themes. Baselines regenerate with the `update-visual-baselines` workflow, then an empty commit to start CI.

## Ship notes

No migration, secrets or `render.yaml` change. Changelog: no entry unless a visitor sees a change; the five rebuilt components render on public pages, so one bullet only if screenshots show a visible difference (decide at review). Smoke: `/` and `/shelf/games` in both themes; the smoke script's pinned titles unchanged.

## Smoke check

`./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`, then look at `/shelf/games` (chips, tiles, empty and error states) in both themes.

## Open questions

- None blocking. If the mockup and the token set disagree on a value, the token wins and the difference is recorded in the PR.

## Sources

- `docs/planning/2026-11-20-design-system-spike-design.md`, `docs/design-system.md`, `frontend/CLAUDE.md`
- shadcn Base UI components: https://ui.shadcn.com/docs/components ; Base UI: https://base-ui.com/react/overview/quick-start
