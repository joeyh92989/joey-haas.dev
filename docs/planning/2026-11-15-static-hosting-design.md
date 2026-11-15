---
status: done
kind: chore
mode: auto
---

# Static hosting: cache, security headers, favicon, soft 404 (#262, #263, #261, #260)

## Plan

- **#262** `render.yaml` header rule for `/assets/*` (and `/travel/*`):
  `Cache-Control: public, max-age=31536000, immutable`. HTML is untouched.
- **#263 (site half)** HSTS (`max-age=31536000`, no subdomains, no preload),
  `Referrer-Policy`, `Permissions-Policy`, and a CSP shipped as
  `Content-Security-Policy-Report-Only` with the theme script hashed. The
  enforced `frame-ancestors` stays. Not closed by this PR: the API middleware
  half is backend work, and enforcing the CSP is a production-settings change
  that needs Joey's go after a report-only period.
- **#261** `public/favicon.svg` (light/dark via `prefers-color-scheme`),
  `favicon.ico`, 180px `apple-touch-icon.png`, links in `index.html`. The
  prerender only strips title/description/og/twitter/canonical, so the links
  survive (tested).
- **#260** Render's static `/*` rewrite always answers 200, and a rewrite to
  a missing file serves an empty 200, so a true 404 is not achievable. `NotFound`
  injects `<meta name="robots" content="noindex">` on mount and removes it on
  leave; README documents the limit.
