const DAY = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A date-only ISO string as a UTC Date, so formatting never shifts a day. */
export function utc(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** How a date-only ISO string reads on a card: "Nov 8, 2026". */
export function dayWords(isoDate) {
  return DAY.format(utc(isoDate))
}

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
