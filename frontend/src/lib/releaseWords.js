import { dayWords, utc } from '../components/RecommendationCard.jsx'

/** "October 2026": a month as the shelf and Radar group by it. */
export const MONTH = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * A release date as precisely as it is known: "Dec 4, 2026", "October 2026",
 * "Q4 2026", "2026", or "Date not announced" when there is none.
 *
 * @param {{release_date?: string|null, release_precision?: string|null}} row
 * @returns {string}
 */
export function releaseWords(row) {
  if (!row.release_date) return 'Date not announced'
  const date = utc(row.release_date)
  if (row.release_precision === 'year') return String(date.getUTCFullYear())
  if (row.release_precision === 'quarter')
    return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`
  if (row.release_precision === 'month') return MONTH.format(date)
  return dayWords(row.release_date)
}
