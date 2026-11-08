import { STATUS_LABEL } from './shelf.js'

/**
 * Finishes in a year, counted from the admin rows: finished playthroughs,
 * so a replay that year counts again, as the public stats count them. A
 * row without playthroughs (an older response) counts its last finish.
 *
 * @param {object[]} items Every row.
 * @param {number} year
 * @returns {number}
 */
export function finishedIn(items, year) {
  const prefix = `${year}-`
  return items.reduce(
    (sum, item) =>
      sum +
      (item.playthroughs
        ? item.playthroughs.filter(
            (run) =>
              run.outcome === 'finished' && run.finished_on?.startsWith(prefix),
          ).length
        : item.finished_at?.startsWith(prefix)
          ? 1
          : 0),
    0,
  )
}

/**
 * The Dashboard's figures, counted from `GET /api/items` (the rows the
 * admin layout already loads). Owned matches the Shelf: any row whose
 * format is not "none", so a row with no format recorded counts.
 *
 * @param {object[]} items Every row.
 * @param {number} year The owner's current year (`ownerYear`).
 */
export function dashboardCounts(items, year) {
  const owned = items.filter((item) => item.owned_format !== 'none')
  const ownedPublic = owned.filter((item) => item.is_public).length
  const finished = items.filter((item) => item.status === 'finished')
  const ratings = finished
    .map((item) => item.rating)
    .filter((rating) => rating != null)
  return {
    owned: owned.length,
    ownedPublic,
    ownedHidden: owned.length - ownedPublic,
    finished: finished.length,
    finishedThisYear: finishedIn(items, year),
    averageRating: ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
    // The pool Rate a few draws from on Discover.
    unrated: finished.filter(
      (item) => item.type === 'game' && item.rating == null,
    ).length,
  }
}

/**
 * The newest item edits and nightly runs, newest first. There is no change
 * log, so an edit says only that the row changed and what it is now.
 *
 * @param {object[]} items Every row.
 * @param {ReturnType<typeof import('./nightly.js').nightlyJobs>} jobs
 * @param {number} [limit]
 * @returns {Array<{key: string, title: string, to: string, change: string, at: number}>}
 */
export function recentChanges(items, jobs, limit = 6) {
  const edits = items
    .map((item) => ({ item, at: Date.parse(item.updated_at) }))
    .filter(({ at }) => !Number.isNaN(at))
    .map(({ item, at }) => ({
      key: `item-${item.id}`,
      title: item.title,
      to: `/admin/collection/${item.id}`,
      change: STATUS_LABEL[item.status]
        ? `Edited · ${STATUS_LABEL[item.status]}`
        : 'Edited',
      at,
    }))
  const runs = jobs
    .filter((job) => job.runNow && job.at !== null)
    .map((job) => ({
      key: `job-${job.key}`,
      title: job.label,
      to: job.runNow,
      change: job.state === 'failed' ? job.summary : 'Ran',
      at: job.at,
    }))
  return [...edits, ...runs].sort((a, b) => b.at - a.at).slice(0, limit)
}
