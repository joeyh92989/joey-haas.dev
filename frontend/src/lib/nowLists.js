const RECENT = 4

/**
 * Splits the snapshot's public items into what I am playing, what I have
 * set aside, and what I finished most recently. Read by /now and by Home's
 * facts table, which both render from the build-time snapshot rather than
 * the API.
 *
 * Playing is `active` only: Paused is its own list, newest pause first. A
 * finish is a game's last one; `again` and `finish_number` say when it was
 * a replay ("again", "second time").
 *
 * @param {object[]} items The snapshot's public items.
 * @returns {{playing: object[], paused: object[], finished: object[]}}
 */
export function nowLists(items) {
  // Games only: the shelf also holds films, comics and board games, and
  // "Playing" means a game here.
  const owned = items.filter((item) => item.type === 'game' && !item.wanted)
  return {
    playing: owned.filter((item) => item.status === 'active'),
    paused: owned
      .filter((item) => item.status === 'paused')
      .sort((a, b) => (b.paused_on ?? '').localeCompare(a.paused_on ?? '')),
    finished: owned
      .filter((item) => item.finished_at)
      .sort((a, b) => b.finished_at.localeCompare(a.finished_at))
      .slice(0, RECENT)
      .map((item) => {
        const number = Math.max(item.times_completed ?? 0, 1)
        return { ...item, finish_number: number, again: number > 1 }
      }),
  }
}
