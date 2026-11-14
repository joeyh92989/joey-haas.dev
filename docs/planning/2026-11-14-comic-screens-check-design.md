# Comic and tag screens: browser check against the mockups (#234)

Status: shipped with this PR. Kind: ui-fix. Mode: auto.

The screens were drawn in a real browser (Playwright against the admin e2e
setup: the built site, a local backend on the `joeyhaas_e2e` database, the
test-login route) with seeded local data: two comic series (one with 14 synced
issues, owned, read, skipped and an edition), four games with and without tags,
and a comic intake sitting covering exact, typed, out-of-run, number-less and
collected books. Each was captured at 400 and 1280 wide in light and dark and
set beside the approved mockups in
`docs/planning/mockups/2026-11-13-comics-book/` (outside git).

## Findings

| Screen | Widths x themes | Result | Action |
|---|---|---|---|
| Tag picker (admin game and comic edit pages) | all four | Mismatch, a bug: `.tag-picker` had no CSS. The fieldset kept the browser border and min-content width, so chips stacked one per line and the legend sat in a box | Fixed: borderless grid across the form, wrapping chip rows |
| Cover wall captions (series page, issue strip, admin wall) | all four | Mismatch: caption read "Mar 31" (day) where the mockup reads "Aug 1997"; a 2012 issue was undated by year | Fixed: `monthYear` in `lib/comics.js`, used by `CoverTile` and `CoverWall` |
| Comic edit page, Delete | all four | Mismatch, a bug: Delete in its panel was an unstyled grey button (`className="danger"` only styles inside `.item-detail-actions`) | Fixed: `btn danger` |
| Cover wall tap hint, Show filter, status | all four | Match (hint sits under the Show row, the mockup puts it right of it) | none |
| Tag chips on admin Games and Comics, item page tag groups | all four | Match the public Games look and the design system | none |
| Intake Check, Done | all four | Structure and fields match. Differences: no check glyph before the mark (the code says "words only; the colour repeats them"), no cover in the "What this adds" rows, page title "Sitting" against the mockup's "Add" | Filed as #248 |
| Issue page | all four | Owner box, source line and facts match. Neighbour strip is above the cover with no heading; the mockup puts it below as "Neighboring issues" | Filed as #248 |
| Comic edit page layout | all four | Header puts title above the cover; the mockup has it beside the cover. Large gap above the Editions panel; Delete sits before Issues on a phone | Filed as #248 |

## My call

- A mismatch is fixed only when it is plainly a bug (missing style) or a
  small formatting gap against the mockup. Layout differences that the 5c
  design moved on purpose (the wall inside the edit page, the issue strip
  placement) are filed, not redrawn.
- Captions use month and year everywhere a cover tile is drawn, including a
  not-yet-out tile ("Dec 2026"), since a year is never wrong on a wall.
- Not added to `npm run shots`: admin screens need a signed-in session and a
  seeded database, which the public shots config does not have. The seed
  script used here is scratch and stays out of git.
