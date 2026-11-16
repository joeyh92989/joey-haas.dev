---
status: done
kind: writing
mode: auto
---
# One set of facts across bio, About, Home and resume notes (#285)

## Problem
Facts differ across `profile.js`, `experience.js`, Home and the resume (issue #285). Decisions by Joey, 2026-11-15:
- **Headline:** keep "Shipping software since 2012" as the one headline claim (8 years product management 2012-2020, 5 years engineering from 2021 are consistent with it).
- **Migration:** the true claim is that Joey **led the ledger's move** to a new eligibility platform (phased cutover, zero rollbacks or incidents, per experience.js). Reword the bio ("one service's side of a company-wide migration") and Home ("the funding side of...") to say so.
- **Name:** already settled by #317 ("Joseph (Joey) Haas" on About). Verify only.
- **Coverage:** add the resume-only items to About: Incident Response, Performance & Load Testing, Security Remediation, the Charter Champion Award, Scrum Alliance / Pragmatic Institute credentials.

## Scope
In: `frontend/src/content/profile.js`, `experience.js`, the Home and About page content/components that render them, tests that pin the changed copy, `docs/planning/2026-09-18-resume-copy-sync-design.md` (record the sync). Out: the resume PDF (Joey's export, not changed here), any other page.

## Decisions
- Copy follows `docs/voice.md`. No "it's not X, it's Y", no "no X, no Y" lists, no trailing comma clauses. Curly apostrophes. Nothing is invented: every added fact is copied from the resume (`frontend/public/resume.pdf` text, or the resume sync doc) or the existing content files, with numbers unchanged.
- New About content lives in `frontend/src/content/` (no inline JSX strings).
- Grep `scripts/smoke.sh`, `frontend/e2e/` and `prerender`/search content for any old text you change (learning from 2026-11-12).

## Acceptance
Bio, About, Home and experience.js tell the migration the same way; the headline claim appears once and agrees with About's 5 and 8 years; About shows the resume-only items; tests, `npm run format:check`, `VITE_DAILY_SALT=local npm run build` pass. The resume sync doc records what changed and notes that the PDF export needs Joey's regeneration if its wording differs.

## Ship notes
Frontend copy only. No migration. Changelog: not a new feature, no entry.
