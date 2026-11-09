/**
 * Formats a 'YYYY-MM-DD' string for display, as on posts and notes.
 *
 * timeZone 'UTC' is required, not cosmetic: the string parses as UTC midnight,
 * so local formatting renders the previous day anywhere west of Greenwich.
 * A 2026-09-14 post shows as "September 13" in America/Denver without it.
 *
 * @param {string} date A 'YYYY-MM-DD' date.
 * @returns {string} The date as, for example, "September 14, 2026".
 */
export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

const OWNER_MONTH = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'numeric',
  timeZone: 'America/Denver',
})

/**
 * The owner's current year and month (1-12), read in Denver like
 * `ownerYear`.
 *
 * @param {number | Date} [now] The moment to read, by default now.
 * @returns {{ year: number, month: number }}
 */
export function ownerMonth(now = Date.now()) {
  const parts = Object.fromEntries(
    OWNER_MONTH.formatToParts(now).map((part) => [part.type, part.value]),
  )
  return { year: Number(parts.year), month: Number(parts.month) }
}

/**
 * The owner's current calendar year, the one "Finished in" counts. It
 * turns over at midnight in Denver, as `OWNER_TZ` in `backend/public.py`
 * does, not at UTC midnight or in the visitor's own zone.
 *
 * @param {number | Date} [now] The moment to read, by default now.
 * @returns {number}
 */
export function ownerYear(now = Date.now()) {
  return ownerMonth(now).year
}

const OWNER_DAY = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/Denver',
})

/**
 * The owner's current calendar day as 'YYYY-MM-DD', read in Denver like
 * `ownerMonth`: the daily puzzle changes at midnight there, on both sides
 * of a daylight-saving change, not at UTC midnight or in the visitor's zone.
 *
 * @param {number | Date} [now] The moment to read, by default now.
 * @returns {string} The day, for example '2026-11-09'.
 */
export function ownerDay(now = Date.now()) {
  const parts = Object.fromEntries(
    OWNER_DAY.formatToParts(now).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}
