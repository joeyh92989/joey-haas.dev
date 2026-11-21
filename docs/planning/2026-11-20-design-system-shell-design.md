---
status: planned
kind: UI (site shell)
mode: auto
issue: "#529, epic #519"
---

# Design system: site shell

## Problem
The palette and core components are live (#527, #528), but the masthead, nav, More menu, phone sheet, footer, theme toggle, page frame and search still use hand-written CSS. Moving the shell moves every page into the new look at once, with old bodies inside.

## Scope
In: masthead (`RootLayout`, `MastNavLink`), nav with `MoreMenu` and `MobileNavSheet`/`NavSheet`, `AccountMenu`, `SiteFooter`, theme toggle, page frame (1200px measure via `WIDE_ROUTES`/`CONTENT_ROUTES`, prose keeps a readable line), site search (`SearchDialog`, `SearchButton`, ⌘K) on shadcn `Command`/`Dialog`/`Sheet`/`DropdownMenu` as fits. OG card and favicon palette (follow-up from #527).
Out: page bodies, admin shell (#535), `PageHeader` rebuild.

## Look
Mockups (on disk only): `/Users/joey-haas/Developer/joey-haas.dev-worktrees/520-design-system-spike/docs/planning/mockups/2026-11-20-identity/3b1-archive-home.html`, `3b1-archive-shelf.html`. Tokens win over mockup literals. Spec: `docs/planning/2026-11-20-design-system-spike-design.md`.

## My calls
- Behaviour, routes, ids, aria, focus targets and the search index stay exactly as today; only the look and the primitives change.
- Add shadcn components with `npx shadcn add` (command, dialog, sheet, dropdown-menu as needed), restyle in place like #528. Do not add clsx or tailwind-merge. Lazy-load search so the entry chunk does not grow; report entry chunk size vs main.
- Legacy classes stay where other CSS or tests read them until #536.
- Focus ring: every new interactive primitive needs `focus-visible:outline-solid` beside `outline-2` (lesson of #528), with a Playwright assertion that `outlineStyle !== 'none'`.
- Coloured text uses the `-text` tokens; no opacity on text.

## Tasks (Sonnet; worktree `.../529-site-shell`, push `git push origin HEAD:529-site-shell`)
1. Read `frontend/CLAUDE.md`, `docs/design-system.md`, the mockups. Add the shadcn primitives.
2. Masthead, nav, More menu, phone sheet, theme toggle, account menu: new look, tests for keyboard/focus unchanged or extended (Escape, focus return, roving).
3. Footer and page frame; confirm `WIDE_ROUTES`/`CONTENT_ROUTES` behaviour; prose line length unchanged.
4. Search on `Command`; same index, same ⌘K, same results order; existing tests pass.
5. OG card and favicon on the new palette.
6. Verify: lint, format, targeted tests, build, `npm run e2e` and a11y; screenshots of every route class at 1280 and 390 in both themes, no layout breakage. Baselines regenerate on CI afterwards (mine).

## Ship notes
No migration, secrets or render.yaml change. Changelog: one bullet (visitors see the new shell). Smoke: `/`, `/shelf/games`, search opens with ⌘K, both themes; smoke titles unchanged.

## Sources
`docs/planning/2026-11-20-design-system-spike-design.md`, `docs/design-system.md`, `frontend/CLAUDE.md`, shadcn Base UI docs.
