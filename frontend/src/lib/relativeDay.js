import { localToday } from './statusMoves.js'
import { dayWords } from './releaseWords.js'

const DAY = 24 * 60 * 60 * 1000

/**
 * A past day in words relative to today: "today", "yesterday", "N days
 * ago". A day after today is not relative at all and reads as its date.
 *
 * Both dates are `YYYY-MM-DD` and compared as calendar days, so the hour of
 * the owner's evening and the viewer's time zone never shift the count.
 *
 * @param {string} iso - The day, `YYYY-MM-DD`.
 * @param {string} [today] - Defaults to the local calendar day.
 * @returns {string}
 */
export function daysAgo(iso, today = localToday()) {
  const days = Math.round((Date.parse(today) - Date.parse(iso)) / DAY)
  if (Number.isNaN(days)) return dayWords(iso)
  if (days < 0) return dayWords(iso)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
