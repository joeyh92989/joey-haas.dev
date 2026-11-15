---
status: in-progress
kind: fix
mode: auto
---

# Browser verification of #273, #275, #276, #287 and #263's report-only CSP

Branch `fix/browser-verify`. Those items merged with unit tests only. This adds
`frontend/e2e/verify.spec.js` (Playwright against the built site) and fixes what it finds.

Checks, each on the built `dist`:

- #273/#275: post prose links are underlined; every scrollable `pre` is focusable (blog post, `/shelf/how`, 400px).
- #276: target height at 400px for header, shelf chips, sub-nav, jump links and inline CTAs. Floor is 44px
  (the repo's `min-height: 2.75rem` convention); WCAG 2.5.8's 24px is the hard floor.
- #287: hero Resume and Email buttons inside the first viewport at 400px and 1280px; search finds Resume and Contact.
- #263: pages loaded with render.yaml's `Content-Security-Policy-Report-Only` value attached; collect
  `securitypolicyviolation` events. Report-only stays report-only (Joey: not yet).

Fixes: CSS tokens only, minimal. Anything that needs a second attempt is left open and reported.
