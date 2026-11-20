---
status: planned
kind: UI/UX
mode: auto
---

# Admin account menu (#503)

## Problem
In the admin, Sign out is a 51x21px link in the sidebar foot (desktop) and at the very bottom of long pages (phone). Nothing shows who is signed in, and there is no obvious way back to the public site. The signed-out page was fixed in PR #510; this is the remaining acceptance item: an account menu with the email, View site and Sign out.

## Scope
In: one `AccountMenu` component in the admin shell; removal of the old sidebar foot / phone foot / rail "View site" arrow it replaces.
Out: any change to the nav itself, to what Sign out does, or to the public site.

## Chosen direction: C, the `jh` mark is the account button
Mockup: `docs/planning/mockups/2026-11-19-admin-account-menu/c-mark-is-the-menu.html` (gitignored; index.html in the same folder has the three directions and the pick). Acceptance includes "matches c-mark-is-the-menu.html at 1440 and 390, light and dark".

Rejected, kept in the folder: A (initial + email in a new top bar row; adds a row above every page header), B (account row at the sidebar foot plus an Account tab on the phone; two patterns for one menu, stays in the corner the walkthrough missed).
My note: C and A both scroll away with the page top on a phone, so "reachable without scrolling" means visible at page load. If always-visible is wanted, B, or make the phone segment row sticky.

## Behavior
- Above the shell's `PHONE_QUERY` (900px): the rail mark becomes a button labelled "Account"; popover opens to the right, 216px wide. At or below: a 44px pill (mark + caret) at the left of the segment row; popover opens below, 288px wide.
- Popover is a plain list: "Signed in as <email>", a "View site" link, a "Sign out" button. No `role="menu"`.
- States: closed, open, signing out ("Signing out…" in place, second press ignored), failed (a `role="alert"` line in the open panel: "Couldn't sign out. Try again in a minute.", wording from `content/status.js`).
- Escape closes and returns focus to the button; a press outside closes; tabbing out closes. No confirm step.
- Button: real `<button>` with `aria-expanded`, `aria-controls`, accessible name "Account, <email>". Focus ring 2px accent. Targets: 44px phone, at least 36px desktop rows.
- Themes: tokens only (`--surface`, `--line-strong`, `--sunken`, `--accent-soft`, `--overlay`).
- Phone segment row: segments size to their words (`flex: 1 0 auto; white-space: nowrap`) so "Add a place" does not wrap. Check Closet (five segments plus a badge) in the build.

## Tasks
1. Write failing tests first: AccountMenu (open/close, Escape + focus return, outside press, signing-out and failed states, accessible name), AdminShell (mark is the button, old foot gone, View site only in the menu), AdminLayout (passes pending/failed into the shell; the failure line no longer drawn in the layout).
2. `frontend/src/components/AccountMenu.jsx` (+ CSS in `index.css` using existing tokens; chevron as a small inline SVG unless the repo has a convention).
3. Wire into `AdminShell.jsx` (rail head and phone segment row; remove sidebar foot, phone foot, rail "View site" arrow) and `AdminLayout.jsx` (hold sign-out state; pass it down).
4. Copy in `frontend/src/content/adminCopy.js`: "Account", "Signed in as", "Signing out…".
5. `docs/design-system.md`: a short rule for the account menu. Changelog bullet. Update admin e2e specs that click Sign out.
6. Screenshots of the built UI at 1440 and 390, light and dark, compared with the mockup (review step).

Model: Sonnet. Ship notes: no migration. Smoke check: sign in locally with test-login, open the menu, Sign out lands on the signed-out page with "You are signed out."
