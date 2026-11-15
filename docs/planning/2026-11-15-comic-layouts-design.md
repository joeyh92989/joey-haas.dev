---
status: done
kind: fix
mode: auto
---

# Comic screen layouts (#248)

Brings four comic screens to `docs/planning/mockups/2026-11-13-comics-book/`
(mockups are out of git). Declined, as the issue says they were probably
intended: no check glyph before the number mark in intake Check, no cover
thumbnails in "What this adds", page title stays "Sitting".

| Screen | Change |
|---|---|
| Issue page (c-issue) | The neighbour strip moves below the issue under a visible "Neighboring issues" heading (the list is named by it). Signed in, Edit sits right of the breadcrumb and opens the series' edit page. |
| Comic edit page (d-admin-comic) | Title and kicker sit beside the cover. The gap above Editions goes. On a phone Issues comes before Delete (DOM order, through `useMediaQuery`, so tab order matches). |
| Series page (b1) | The tap hint sits at the right of the Show row. |

Tests: DOM-order assertions for each. Verified in a browser at 393 and 1280
wide, light and dark.
