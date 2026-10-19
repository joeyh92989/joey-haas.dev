/**
 * A year of finishes, worked out from the public items alone (no private
 * field, no API of its own): what Letterboxd, Trakt and StoryGraph call a
 * year in review, for Spine. Pure, so the page and its tests share it.
 */

const TOP_GENRES = 5

/** A game on the shelf, not a want: the year is about games played. */
export function isOwnedGame(item) {
  return item.type === 'game' && !item.wanted
}

/** Whether a row was finished in `year` (a number). */
function finishedIn(item, year) {
  return (
    isOwnedGame(item) &&
    typeof item.finished_at === 'string' &&
    item.finished_at.startsWith(`${year}-`)
  )
}

/**
 * The years with at least one finish, newest first.
 *
 * @param {object[]} items Public items.
 * @returns {number[]}
 */
export function finishYears(items) {
  const years = new Set(
    items
      .filter(
        (item) => isOwnedGame(item) && /^\d{4}-/.test(item.finished_at ?? ''),
      )
      .map((item) => Number(item.finished_at.slice(0, 4))),
  )
  return [...years].sort((a, b) => b - a)
}

/**
 * Everything the year page shows.
 *
 * `hours` sums IGDB's "normally" time to beat over the finishes that have
 * one, and says how many did, since a total over some games is not a total
 * over all of them. `versusCommunity` compares a 1-10 rating with IGDB's
 * 0-100 community score at the same scale.
 *
 * @param {object[]} items Public items.
 * @param {number} year
 */
export function yearInReview(items, year) {
  const finished = items
    .filter((item) => finishedIn(item, year))
    .sort((a, b) => a.finished_at.localeCompare(b.finished_at))

  const rated = finished.filter((item) => item.rating != null)
  const timed = finished.filter((item) => item.time_to_beat_hours != null)

  const byMonth = Array.from({ length: 12 }, () => 0)
  for (const item of finished) {
    byMonth[Number(item.finished_at.slice(5, 7)) - 1] += 1
  }

  const genreCounts = new Map()
  for (const item of finished) {
    for (const genre of item.genres ?? []) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
    }
  }
  const topGenres = [...genreCounts]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, TOP_GENRES)
    .map(([genre, count]) => ({ genre, count }))

  const compared = rated
    .filter((item) => item.community_score != null)
    // Rounded as the page shows it, so "higher" never contradicts the
    // figures printed beside it.
    .map((item) => ({
      item,
      gap: item.rating * 10 - Math.round(item.community_score),
    }))
  const furthest = compared.reduce(
    (best, entry) =>
      best === null || Math.abs(entry.gap) > Math.abs(best.gap) ? entry : best,
    null,
  )

  return {
    year,
    finished,
    count: finished.length,
    averageRating: rated.length
      ? Math.round(
          (rated.reduce((sum, item) => sum + item.rating, 0) / rated.length) *
            10,
        ) / 10
      : null,
    hours: timed.reduce((sum, item) => sum + item.time_to_beat_hours, 0),
    timedCount: timed.length,
    favourites: finished.filter((item) => item.favorite),
    byMonth,
    topGenres,
    versusCommunity: {
      compared: compared.length,
      higher: compared.filter((entry) => entry.gap > 0).length,
      lower: compared.filter((entry) => entry.gap < 0).length,
      furthest,
    },
  }
}
