/** The most games the Now playing band shows; any more stay in the grid. */
export const NOW_PLAYING_LIMIT = 3

/**
 * When the current run of a game began.
 *
 * The public list carries `playing_since`. The admin list carries every
 * playthrough instead: the open one (no outcome) is the current run. The
 * `started_at` column is the earliest start of any run, so after a replay
 * it is the first run's date, and it is only the last resort.
 *
 * @param {object} item A public or admin item.
 * @returns {string|null} An ISO date, or null when none is known.
 */
export function currentRunStart(item) {
  if (item.playing_since) return item.playing_since
  const open = (item.playthroughs ?? []).find((run) => run.outcome == null)
  return open?.started_on ?? item.started_at ?? null
}

/**
 * The games I am playing, for the shelf's Now playing band: active, owned
 * games, most recently started first, undated last, then by title.
 *
 * Works on both shelves' rows: a public row says `wanted`, an admin row
 * says `owned_format: 'none'` for the same thing.
 *
 * @param {object[]} items
 * @returns {{item: object, since: string|null}[]}
 */
export function nowPlaying(items) {
  return items
    .filter(
      (item) =>
        item.type === 'game' &&
        item.status === 'active' &&
        !item.wanted &&
        item.owned_format !== 'none',
    )
    .map((item) => ({ item, since: currentRunStart(item) }))
    .sort((a, b) => {
      if (a.since !== b.since) {
        if (a.since === null) return 1
        if (b.since === null) return -1
        return a.since < b.since ? 1 : -1
      }
      return a.item.title.localeCompare(b.item.title)
    })
    .slice(0, NOW_PLAYING_LIMIT)
}
