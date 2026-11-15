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

/*
 * The named formats. One locale (en-US, month first) and one place for
 * every Intl date formatter in the app; `dateFormats.test.js` fails on an
 * inline `Intl.DateTimeFormat` or `toLocale*DateString` anywhere else.
 * Date-only strings parse as UTC midnight, so these read in UTC; a call
 * site that holds a real instant says so in its own name.
 */
const utc = (options) =>
  new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' })

/** "Nov 9": a day in the current year, where the year is plain from context. */
export const DAY = utc({ month: 'short', day: 'numeric' })

/** "Nov 9, 2026": a day that could be read in any year. */
export const DAY_YEAR = utc({ month: 'short', day: 'numeric', year: 'numeric' })

/** "Tue, Oct 27". */
export const WEEKDAY_DAY = utc({
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

/** "Monday, Nov 9". */
export const WEEKDAY_LONG_DAY = utc({
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

/** "Nov 2026". */
export const MONTH_YEAR = utc({ month: 'short', year: 'numeric' })

/** "November 2026". */
export const MONTH_YEAR_LONG = utc({ month: 'long', year: 'numeric' })

/** "Nov". */
export const MONTH_SHORT = utc({ month: 'short' })

/** "N", a month's initial for a chart axis. */
export const MONTH_NARROW = utc({ month: 'narrow' })

/** "Tue, Oct 27, 3:04 PM" in the viewer's own zone, for a run's timestamp. */
export const WEEKDAY_DAY_TIME = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** "Nov 9, 2026, 3:04 PM" in the viewer's own zone. */
export const DAY_YEAR_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** "Nov 11, 7:42 PM" in the owner's Denver time. */
export const DENVER_DAY_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Denver',
})

/** "7:42 PM" in the owner's Denver time. */
export const DENVER_TIME = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Denver',
})

/** "3:04 PM" in the viewer's own zone. */
export const TIME = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
})

/**
 * The Denver calendar day, 'YYYY-MM-DD', of an instant; null when it does
 * not parse.
 *
 * @param {string | number | Date} instant
 * @returns {string | null}
 */
export function denverDay(instant) {
  const date = new Date(instant)
  return Number.isNaN(date.getTime()) ? null : ownerDay(date)
}
