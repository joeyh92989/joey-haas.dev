# /denver with no spots (#278)

status: approved (Joey, 2026-11-15) · kind: bug · mode: auto

## Decision
Keep `/denver` live. It is already `noindex` and out of the sitemap while the
spots snapshot is written and empty (`hiddenPathsFor`, #125), so there is no
route or sitemap change. The empty list said "Coming soon", which promises a
list; it now says "Nothing here yet." with one plain line, drawn by the shared
`EmptyState` (docs/design-system.md), which also closes that row of the gap
table.

## Tests
`Denver.test.jsx`'s empty case checks the `EmptyState` title and line.
