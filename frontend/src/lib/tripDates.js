/**
 * How a trip's dates read on the page, honouring its `precision` (D12).
 *
 * A trip dated to the day reads *Sept 2026 · 12 days*; one known only to
 * the month reads *June 2014*, and one known only to the year *2014*. The
 * frontmatter's `date` and `end` are real dates at every precision (they
 * sort the trips), so what is withheld below day precision is withheld
 * here: no day of the month and no day count, either of which would be
 * invented.
 *
 * Every date is a 'YYYY-MM-DD' string read in UTC, for the reason
 * `formatDate` gives.
 */

/** Short months in the house style: *Sept*, not *Sep*; *June*, not *Jun*. */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'June',
  'July',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parts(date) {
  const at = new Date(`${date}T00:00:00Z`)
  return {
    year: at.getUTCFullYear(),
    month: MONTHS[at.getUTCMonth()],
    day: at.getUTCDate(),
    weekday: WEEKDAYS[at.getUTCDay()],
  }
}

/** Inclusive day count from one date to another. */
export function tripDays(from, to) {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86400000) + 1
}

/** *Sept 2026*, or *2026* for a trip dated only to the year. */
export function tripMonth({ date, precision = 'day' }) {
  const { year, month } = parts(date)
  return precision === 'year' ? String(year) : `${month} ${year}`
}

/**
 * The index card's kicker: *Sept 2026 · 12 days* at day precision, the bare
 * month or year below it.
 */
export function tripKicker(frontmatter) {
  const { date, end, precision = 'day' } = frontmatter
  if (precision !== 'day') return tripMonth(frontmatter)
  const days = tripDays(date, end)
  return `${tripMonth(frontmatter)} · ${days} ${days === 1 ? 'day' : 'days'}`
}

/**
 * The facts row's Dates cell: *12–23 Sept 2026*, *28 Sept – 3 Oct 2026*,
 * *June 2014*, *June – July 2014* or *2014*.
 */
export function tripDateRange({ date, end, precision = 'day' }) {
  const a = parts(date)
  const b = parts(end)
  if (precision === 'year') {
    return a.year === b.year ? String(a.year) : `${a.year}–${b.year}`
  }
  if (precision === 'month') {
    if (a.year !== b.year) return `${a.month} ${a.year} – ${b.month} ${b.year}`
    if (a.month !== b.month) return `${a.month} – ${b.month} ${a.year}`
    return `${a.month} ${a.year}`
  }
  if (a.year !== b.year) {
    return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`
  }
  if (a.month !== b.month) {
    return `${a.day} ${a.month} – ${b.day} ${b.month} ${a.year}`
  }
  if (a.day === b.day) return `${a.day} ${a.month} ${a.year}`
  return `${a.day}–${b.day} ${a.month} ${a.year}`
}

/**
 * A day section's kicker: *Day 2 · Sat 13 Sept*, *Day 8–9 · Fri–Sat 19–20
 * Sept*, or a bare *Day 2* when the trip is not dated to the day (the
 * compiled day's `dates` is null then).
 *
 * @param {{first: number, last: number, dates: {from: string, to: string} | null}} day
 */
export function dayKicker({ first, last, dates }) {
  const label = first === last ? `Day ${first}` : `Day ${first}–${last}`
  if (!dates) return label
  const a = parts(dates.from)
  if (dates.from === dates.to) {
    return `${label} · ${a.weekday} ${a.day} ${a.month}`
  }
  const b = parts(dates.to)
  const when =
    a.month === b.month
      ? `${a.day}–${b.day} ${a.month}`
      : `${a.day} ${a.month} – ${b.day} ${b.month}`
  return `${label} · ${a.weekday}–${b.weekday} ${when}`
}
