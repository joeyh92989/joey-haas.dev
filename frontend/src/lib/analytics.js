/**
 * Shared words for the Analytics page and the Dashboard's views tile.
 *
 * The API counts by UTC day and sends each as an ISO date, so dates are
 * formatted in UTC: in the browser's own zone, a day west of Greenwich
 * would read as the one before.
 */

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const WEEKDAY = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/**
 * A UTC day from the API as "12 Oct", or "Mon 12 Oct" with the weekday.
 *
 * @param {string} iso A date, `YYYY-MM-DD`.
 * @param {{weekday?: boolean}} [options]
 */
export function dayLabel(iso, { weekday = false } = {}) {
  const date = new Date(`${iso}T00:00:00Z`)
  return (weekday ? WEEKDAY : DAY).format(date)
}

/** A count with its noun, singular for one: "1 visitor", "3 visitors". */
export function counted(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
