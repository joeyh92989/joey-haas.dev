import { ownedFinishes } from './yearInReview.js'

/**
 * One month of the play journal, worked out from the public items and the
 * public diary: the games finished that month and the sessions logged in
 * it. Pure, so the page and its tests share it.
 */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

const NAME = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * A `yyyy-mm` string as numbers, or null when it is not a month.
 *
 * @param {string|null|undefined} value
 * @returns {{year: number, month: number}|null}
 */
export function parseMonth(value) {
  const match = MONTH.exec(value ?? '')
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null
}

/**
 * "October 2026" for `2026-10`.
 *
 * @param {string} value A valid `yyyy-mm`.
 */
export function monthName(value) {
  const { year, month } = parseMonth(value)
  return NAME.format(new Date(Date.UTC(year, month - 1, 1)))
}

/**
 * The `yyyy-mm` a date string falls in, or null when it has none.
 *
 * @param {unknown} value
 */
export function isoMonth(value) {
  return typeof value === 'string' && MONTH.test(value.slice(0, 7))
    ? value.slice(0, 7)
    : null
}

/**
 * The months with at least one finish, newest first.
 *
 * @param {object[]} items Public items.
 * @returns {string[]} `yyyy-mm` months.
 */
export function finishMonths(items) {
  const months = new Set(
    ownedFinishes(items).map((row) => isoMonth(row.finished_at)),
  )
  return [...months].sort().reverse()
}

/**
 * Everything the month page shows.
 *
 * `previous` and `next` are the nearest months with a finish or a session.
 * The diary is fetched a year at a time, so sessions only count for the
 * years passed in: the page passes the month's year, and the neighbouring
 * year's sessions as `nearby` in January and December. Finishes count for
 * every year.
 *
 * @param {object[]} items Public items.
 * @param {object[]} sessions Public diary rows ({item_id, title, played_on, minutes}).
 * @param {string} month `yyyy-mm`.
 * @param {object[]} [nearby] More diary rows that count only as neighbours.
 */
export function monthInReview(items, sessions, month, nearby = []) {
  const parsed = parseMonth(month)
  if (!parsed) return null

  // One row per finish: a replay in the month is listed, marked `again`.
  const finishes = ownedFinishes(items)
  const finished = finishes
    .filter((row) => isoMonth(row.finished_at) === month)
    .sort((a, b) => a.finished_at.localeCompare(b.finished_at))

  const inMonth = sessions.filter((row) => isoMonth(row.played_on) === month)
  const byDay = new Map()
  for (const row of inMonth) {
    if (!byDay.has(row.played_on)) byDay.set(row.played_on, [])
    byDay.get(row.played_on).push(row)
  }
  const days = [...byDay]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => ({ date, sessions: rows }))

  const months = new Set(
    [
      ...finishes.map((row) => isoMonth(row.finished_at)),
      ...[...sessions, ...nearby].map((row) => isoMonth(row.played_on)),
    ].filter(Boolean),
  )
  const sorted = [...months].sort()

  return {
    month,
    year: parsed.year,
    finished,
    days,
    sessionCount: inMonth.length,
    timedSessions: inMonth.filter((row) => row.minutes != null).length,
    minutes: inMonth.reduce((sum, row) => sum + (row.minutes ?? 0), 0),
    previous: sorted.filter((other) => other < month).at(-1) ?? null,
    next: sorted.find((other) => other > month) ?? null,
  }
}

const SHORT = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })

/**
 * The twelve months of a year for the journal's index: how many games were
 * finished in each, and whether a session was logged. Built from the same
 * items and diary rows the month page already holds.
 *
 * @param {object[]} items Public items.
 * @param {object[]} sessions Public diary rows for that year.
 * @param {number} year
 * @returns {{month: string, short: string, name: string, finished: number, played: boolean}[]}
 */
export function monthIndex(items, sessions, year) {
  const finishes = ownedFinishes(items).map((row) => isoMonth(row.finished_at))
  const played = new Set(sessions.map((row) => isoMonth(row.played_on)))
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`
    return {
      month,
      short: SHORT.format(new Date(Date.UTC(year, index, 1))),
      name: monthName(month),
      finished: finishes.filter((other) => other === month).length,
      played: played.has(month),
    }
  })
}
