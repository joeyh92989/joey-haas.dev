---
status: shipped-in-pr
kind: chore
mode: auto
---

# Shared components audit (#295 to #298)

Bring pages onto the components `docs/design-system.md` already names, and
add a test that stops them drifting back.

- **#295** Eight admin pages print `LOAD_ERROR` as a bare paragraph. Each
  goes through `LoadState` with a retry (a counter in the load effect's
  dependencies, state reset to loading). Every `admin-error` gets
  `role="alert"`.
- **#296** `CardActionsShell`'s touch variant renders through `Sheet`
  (focus returns to the "..." button). The inline `AddDrawer` aside loses
  `role="dialog"`: it is non-modal, so it is a labelled `aside`.
- **#297** Stats, Travel, Denver and IntakeDemo use `PageHeader`. The
  design doc's gap table lists every remaining hand-written `h1`, and a
  prose-page rule is added.
- **#298** The inline empty boxes become `EmptyState`; its words that were
  inline move to `content/emptyStates.js`. `EmptyState` gains `titleRef`
  (Closet Review moves focus to it).

Test: `frontend/src/designConsistency.test.js` scans `src/` for a bare
`{LOAD_ERROR}`, an `admin-error` without a role, `role="dialog"` outside
`Sheet`, an `h1` outside the allow-list, and a `*-empty` class.
Dead CSS for the removed classes is left for the CSS owner.
