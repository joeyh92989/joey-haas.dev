---
status: planned
kind: UI/UX (small fixes, no new design)
mode: auto
---

# Walkthrough quick fixes (epic #468)

## Problem
The 2026-11-19 blind walkthrough filed 37 issues. About a dozen need no decision from Joey. This plan covers them in four PRs, one at a time.

## Scope
In: #472, #475, #476, #482 (label only), #477 (PR A); #483 (PR B); #489, #491, #503 (PR C); #487, #505 (PR D).
Out: #484-#486 (need Joey), design-heavy issues, #479, #480, #481, #490, #482 Escape item (need repro), #491 City/geocoding, #503 account menu, #487 real-run wiring.

## Decisions (my calls, auto mode)
- Tap-target floor 24px with spacing (WCAG 2.2 AA), not 44px.
- Blog rename keeps the old feed GUID so readers do not re-post.
- Place wording becomes "public map".
- "Run now" links that only navigate are relabeled, not rewired.
- American spelling per docs/voice.md.
- Anything in an issue that does not match the code on read gets reproduced before changing (#489 "stays open", `Active1` spacing).

## Tasks (each PR: tests first, changelog bullet, targeted local tests, CI green, Opus review)
1. PR A `fix/walkthrough-public`: /shelf/daily redirect to /daily; unknown shelf id shows not-found; Tour overflow `minmax(0,1fr)`; Daily legend above board with arrow explanation; theme toggle visible text names the action; footer/standalone link targets >= 24px.
2. PR B `fix/blog-slug-how-my-shelf-works`: rename post, Render redirect, update tests/e2e/docs, keep GUID.
3. PR C `fix/walkthrough-admin-feedback`: add-game form labels, Format required marker, success line, sidebar count refresh; places coordinates required marker and wording; signed-out page message and home link.
4. PR D `fix/walkthrough-admin-labels`: relabel navigate-only "Run now"; spelling; `Active1` spacing; `.job-run` tap target.

Model: Sonnet for all implementers; Opus final review. Shared files (changelog, index.css) are touched by one agent at a time, so PRs are sequential.

## Ship notes
No migrations. PR B changes a route and a Render redirect: smoke check `/blog/how-my-shelf-works` returns 200 and the old slug redirects; feed GUID unchanged.

## Smoke check
Production: /daily, /shelf/daily (redirect), /tour (no horizontal scroll at 390px).
