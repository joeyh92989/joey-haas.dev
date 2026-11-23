---
status: planned
kind: UI fix (admin Jobs in one place, readable rows, steady navigation)
mode: auto
issue: "#488, #492 (epic #366, batch 3)"
---

# Backlog batch 3: admin Jobs in one place, with purpose and run times

## Problem
Two walkthrough items from the November blind audit (`docs/planning/2026-11-19-blind-walkthrough-issues.md`, raw logs in `docs/planning/walkthrough-2026-11/`); read `gh issue view 488` and `gh issue view 492` and the walkthrough logs for the evidence. The design system migration (epic #519) rebuilt the admin since, and a triage of main (c7446475) says both are still open, from CODE only. **Verify each acceptance line against the running admin first** (see Proof) and record which parts are already fixed.

- **#488:** the Jobs list has no purpose line, no last-run or next-run columns, no headers; "Intake", "Closet opinions" and "Public snapshot" are opaque; "how to re-enable it" leaves the site for a GitHub readme with no warning; the first column is wide and empty. Acceptance: each row has a one-line purpose and last-run and next-run columns with headers; the empty first column collapses; external links are marked; the list lives in one place.
- **#492:** the Jobs list appears on Admin Home (`pages/Admin.jsx`) AND on `/admin/jobs` (`pages/AdminJobs.jsx`); opening Jobs from Site highlights Home in the rail and shows the Home sidebar; rail glyphs are cryptic with tiny labels; "Denver" is not an obvious name for places, weekend and outings; "Site" hides analytics and jobs; sidebar counts are inconsistent (Games has one, Comics and Closet none) and stale after an add. Acceptance: Jobs has one home and the highlight never changes under the user; section names say what is inside; counts are shown everywhere or nowhere, and update.

Files to start from: `frontend/src/components/JobsList.jsx`, `JobStatusRow.jsx`, `lib/nightly.js` (`JOB_RUNS`, the copy), `pages/Admin.jsx`, `pages/AdminJobs.jsx`, `components/adminAreas.js`, the admin shell/rail components (`AdminLayout`, `adminShellClasses.js`), `content/adminCopy.js`. The shared job status comes from `GET /api/comics/status` and similar (CLAUDE.md "Jobs page is the first place to look at a nightly step"): do not change what the backend reports unless an acceptance line truly needs a field (then say so and keep it additive).

## Scope
In: the Jobs list and its rows, where it lives, the admin rail and sidebar highlight and counts, section names and the rail glyph labels, and the copy for each job's purpose. 
Out: new jobs, backend job logic, the Closet picker epic (#539) pages and files (do not touch `closet*.py`, Closet pages, or Closet strings except where the rail lists the area), glyph redesign beyond making labels readable (#495 is a separate batch and owns toolbar glyphs).

## My calls (auto mode: the designer is me; no mockup step for a list/table fix, follow `docs/design-system.md` and the existing admin look)
- **One home:** Jobs lives at `/admin/jobs` only. Admin Home shows a compact summary (for example "N jobs, M need attention" with a link to Jobs) instead of the full list; the rail highlights Jobs while on `/admin/jobs` and never Home; the Jobs page uses its own sidebar or none.
- **Rows:** a table with headers (Job, What it does, Last run, Next run, Status); the empty first column collapses; each row has a purpose sentence written in plain words (check `docs/voice.md` and `~/.claude/references/writing-rules.md`); times are rendered relative with the absolute time on a title/tooltip-free visible secondary line (no hover-only info); external links carry an "opens GitHub" marker and `rel`/`target` consistent with the site's other external links. On a phone the table becomes stacked rows (no sideways scroll at 320).
- **Names:** rename admin sections so they say what is inside (for example "Site" to "Site and jobs"? pick the clearest after reading the rail; "Denver" to "Places"? check what is inside it first). Keep route paths unchanged.
- **Counts:** show a count in the rail for every area that has a list, or for none: pick whichever the data supports without extra requests (a count that needs a new API call per area is not worth it: choose "none" and say so). If kept, they update after an add.
- Writing copy: run it through the `sdlc-writing` rules (plain, specific, no AI tells).

## Proof
1. **Re-verify first:** run the admin locally against the mocked fixtures the repo's admin e2e uses (`e2e/admin-*.fixtures.js`, `e2e:admin` README → Browser tests) and screenshot the CURRENT Jobs page, Admin Home and the rail at 320, 393 and 1280, light and dark. List which acceptance lines already hold. Anything that already holds is not touched.
2. After the change: the same screenshots, side by side; the computed-style dump is NOT needed (this changes visible UI on purpose), but add or extend `e2e/admin-*.spec.js` pins: Jobs appears once; the rail highlight on `/admin/jobs` is Jobs; no sideways scroll at 320/390/1280/1440 (the existing admin specs already have this pattern); headings and table headers exist; axe is clean on Home and Jobs in both themes; tap targets 44px on phone; external links marked.
3. Unit tests (`*.test.jsx`) for the rows, the summary and the section names.
4. Visual baselines WILL change: at the END, once everything else is green, run `gh workflow run update-visual-baselines.yml --ref 366b3-admin-jobs`, pull the bot commit, push an empty commit to start CI, and list every changed baseline image in the PR body; each must be an intended change. If the admin pages are not in the visual baselines, say so.
5. Final build: lint, format, full `npm test`, build (`VITE_DAILY_SALT=local`), `scripts/check-entry-chunk.mjs`, default-config Playwright single worker, and `e2e:admin` locally. CI now runs `e2e` and `e2e-admin` as matrix shards (read `.github/workflows/README.md`); if you add a new spec file it is picked up by the `rest` shard automatically.
6. Write every utility out whole (no `${PREFIX}utility`; `noSplitUtilities.test.js` guards it). Keep class names that tests/e2e/print read. Update `frontend/CLAUDE.md` and `docs/design-system.md` where a rule changes.

## Changelog and docs
`frontend/changelog.md` is the PUBLIC changelog: admin changes do not belong in it; add nothing. Update `docs/learnings.md` only if something non-obvious bit you.

## Ship notes
No migration, secrets or render.yaml change. Smoke: `/`, `/admin` is auth-gated (smoke does not cover it): verify with the e2e runs. PR body says "Closes #488" and "Closes #492" ONLY for the parts that are done; if a part is left (for example counts), say which and do not claim the close.
