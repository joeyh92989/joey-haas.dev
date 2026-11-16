---
status: done
kind: chore
mode: auto
---

# Spacing: snap the off-scale values onto `--space-*` (design and plan)

Issue: #213 (follow-up of #203). Branch `design/spacing-snap`. #203's PR 6 added `--space-1 … --space-8`
(0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4 rem) and converted only the values that were exactly a step.
604 padding, margin and gap values in `frontend/src/index.css` are still literals.

## Rule

Every `padding*`, `margin*` and `gap` value is a `--space-*` token or sits on a line carrying
`/* space-exception: <reason> */`. `spaceScale.test.js` fails on any other literal. Out of scope, as
before: negative margins (a deliberate pull) and `scroll-padding*`. `calc()`/`clamp()` values are
not literals the test reads.

## Snap map

Nearest step by rem. A tie goes up under 1rem (keeps touch targets from shrinking) and down from
1rem up (keeps page rhythm from growing).

| Literal (uses)               | Step                |
| ---------------------------- | ------------------- |
| 0.2, 0.3, 0.35, 5px, 3px     | 0.25 (`--space-1`)  |
| 0.375, 0.4, 0.45, 0.55, 0.6, 6px, 7px, 9px | 0.5 (`--space-2`) |
| 0.625, 0.65, 0.7, 0.8, 0.85, 10px, 11px | 0.75 (`--space-3`) |
| 0.875, 0.9, 1.1, 1.125, 1.25, 14px, 18px, 20px | 1 (`--space-4`) |
| 1.4, 1.6, 1.75, 22px, 28px   | 1.5 (`--space-5`)   |
| 1.9, 2.25, 2.5, 36px, 40px   | 2 (`--space-6`)     |
| 2.75, 3.5, 56px             | 3 (`--space-7`)     |
| 3.75                        | 4 (`--space-8`)     |

## Exceptions

- **Hairline and optical offsets** (at most 0.15rem: 1px, 2px, 2.5px, 0.05, 0.1, 0.125, 0.15rem): the
  nearest step (4px) would be a 60 to 400 percent change on a pad that exists to nudge a glyph or a
  border by a pixel or two.
- **Beyond the scale** (above 4rem): none snap; they stay.
- **Relative units** (`12vh`, `0.2em`, `8%`): not steps of the rem scale; one line each.
- **Intake demo spines** (`gap: 3px`, `padding: 6px 3px`): a drawing of tightly packed spines; snapped, a
  12-spine row overflowed a 393px phone by 4px (caught by the overflow check).
- Result: 546 values snapped, 61 left as exceptions (55 hairline, 1 beyond the scale, 3 relative, 2 spines).
- Pre-existing, not caused by this change: `/admin/closet/today` and `/admin/catalogue` scroll sideways on a
  phone against an empty database (451px and 442px wide before, 469px and 440px after). Not fixed here.

## Process

One commit per area of the stylesheet, so a reviewer can bisect. After each commit: build, capture
every public route (plus one of each dynamic kind from `e2e/fixtures`) and the admin routes (empty
`joeyhaas_e2e` database), at 393 and 1280 px, light and dark, diff against the previous commit's
capture, and flag a page that moves more than about 3 percent or gains horizontal overflow,
clipped text or overlapping text. A flagged rule becomes an exception instead of a snap. Contact
sheets (before | after) are outside git.

## Changelog

No entry: a spacing pass is not a shipped feature. Doc: CLAUDE.md's spacing convention is updated to
say the rule is now total.
