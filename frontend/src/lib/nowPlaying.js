/** The most games the Now playing band shows; any more stay in the grid. */
export const NOW_PLAYING_LIMIT = 3

/**
 * When the current run of a game began.
 *
 * The public list carries `playing_since`. The admin list carries every
 * playthrough instead: the open one (no outcome) is the current run. The
 * `started_at` column is the earliest start of any run, so after a replay
 * it is the first run's date: it is read only for a row with no runs.
 *
 * @param {object} item A public or admin item.
 * @returns {string|null} An ISO date, or null when none is known.
 */
export function currentRunStart(item) {
  if (item.playing_since) return item.playing_since
  const runs = item.playthroughs ?? []
  // Only a row with no runs falls back to the column, as the public API
  // does: with runs, an undated open run has no known start.
  if (runs.length === 0) return item.started_at ?? null
  return runs.find((run) => run.outcome == null)?.started_on ?? null
}

/** Later first, null last; 0 when equal. */
function laterFirst(a, b) {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? 1 : -1
}

/**
 * The games I am playing, for the shelf's Now playing band: active, owned
 * games, most recently played first (the public list's `last_played_on`;
 * the admin list has no such field and falls through), then most
 * recently started, undated last, then by title. The same order Tonight's
 * Continue cards take, so the two bands and the cards agree.
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
    .sort(
      (a, b) =>
        laterFirst(
          a.item.last_played_on ?? null,
          b.item.last_played_on ?? null,
        ) ||
        laterFirst(a.since, b.since) ||
        a.item.title.localeCompare(b.item.title),
    )
    .slice(0, NOW_PLAYING_LIMIT)
}
