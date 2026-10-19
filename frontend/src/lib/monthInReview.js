import { isOwnedGame } from './yearInReview.js'

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

function isoMonth(value) {
  return typeof value === 'string' && MONTH.test(value.slice(0, 7))
    ? value.slice(0, 7)
    : null
}

/**
 * Everything the month page shows.
 *
 * `previous` and `next` are the nearest months with a finish or a session.
 * The diary is fetched a year at a time, so sessions only count for the
 * months of the year they were fetched for; finishes count for every year.
 *
 * @param {object[]} items Public items.
 * @param {object[]} sessions Public diary rows ({item_id, title, played_on, minutes}).
 * @param {string} month `yyyy-mm`.
 */
export function monthInReview(items, sessions, month) {
  const parsed = parseMonth(month)
  if (!parsed) return null

  const owned = items.filter(isOwnedGame)
  const finished = owned
    .filter((item) => isoMonth(item.finished_at) === month)
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
      ...owned.map((item) => isoMonth(item.finished_at)),
      ...sessions.map((row) => isoMonth(row.played_on)),
    ].filter(Boolean),
  )
  const sorted = [...months].sort()

  return {
    month,
    year: parsed.year,
    finished,
    days,
    minutes: inMonth.reduce((sum, row) => sum + (row.minutes ?? 0), 0),
    previous: sorted.filter((other) => other < month).at(-1) ?? null,
    next: sorted.find((other) => other > month) ?? null,
  }
}
