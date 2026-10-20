const RECENT = 4

/**
 * Splits the snapshot's public items into what I am playing and what I
 * finished most recently. Read by /now and by Home's facts table, which both
 * render from the build-time snapshot rather than the API.
 *
 * @param {object[]} items The snapshot's public items.
 * @returns {{playing: object[], finished: object[]}}
 */
export function nowLists(items) {
  // Games only: the shelf also holds films, comics and board games, and
  // "Playing" means a game here.
  const owned = items.filter((item) => item.type === 'game' && !item.wanted)
  return {
    playing: owned.filter((item) => item.status === 'active'),
    finished: owned
      .filter((item) => item.finished_at)
      .sort((a, b) => b.finished_at.localeCompare(a.finished_at))
      .slice(0, RECENT),
  }
}
