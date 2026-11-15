/**
 * Words for the admin pages' empty states, rendered by `EmptyState`
 * (docs/design-system.md → One of each). One sentence, and a next step
 * where there is one.
 */
export const EMPTY = {
  playNext: {
    vibes: 'Nothing on the shelf matches those vibes.',
    withoutVibes: 'Try without vibes',
    backlog: 'Nothing in the backlog right now.',
  },
  analytics: {
    noViews: 'No views yet. The beacon is running. Check back tomorrow.',
    liveSince: (day) => `Live since ${day}.`,
  },
  closetReview: {
    nothing: (nextTurn) => `Nothing to decide. Next season turn: ${nextTurn}.`,
    skipped: (pieces) => `${pieces} skipped for next time.`,
    showSkipped: 'Show skipped',
  },
}
