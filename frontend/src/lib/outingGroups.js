import { history } from '../content/outings.js'
import { MONTH_YEAR_LONG, WEEKDAY_DAY } from './formatDate.js'

/** A stored 'YYYY-MM-DD' as a UTC noon instant, so no zone shifts the day. */
const at = (day) => new Date(`${day}T12:00:00Z`)

/**
 * The period an outing belongs to: its month, or its year for a
 * year-precision outing (stored at January 1st, which sorts it after that
 * year's months, so a year group follows them).
 *
 * @param {{visited_on: string, precision: string}} outing
 * @returns {{key: string, label: string}}
 */
function periodOf(outing) {
  const year = outing.visited_on.slice(0, 4)
  if (outing.precision === 'year') return { key: `y${year}`, label: year }
  return {
    key: outing.visited_on.slice(0, 7),
    label: MONTH_YEAR_LONG.format(at(outing.visited_on)),
  }
}

/**
 * Groups outings, already newest first from the server, into consecutive
 * periods. Pure: no clock is read.
 *
 * @param {object[]} outings
 * @returns {{key: string, label: string, rows: object[]}[]}
 */
export function groupOutings(outings) {
  const groups = []
  for (const outing of outings) {
    const period = periodOf(outing)
    let group = groups[groups.length - 1]
    if (!group || group.key !== period.key) {
      group = { ...period, rows: [] }
      groups.push(group)
    }
    group.rows.push(outing)
  }
  return groups
}

/**
 * When an outing was, at the precision it was logged with, never a made-up
 * day.
 *
 * @param {{visited_on: string, precision: string}} outing
 * @returns {{text: string, loose: boolean}}
 */
export function whenWords(outing) {
  if (outing.precision === 'year')
    return {
      text: history.someTimeInYear(outing.visited_on.slice(0, 4)),
      loose: true,
    }
  if (outing.precision === 'month')
    return {
      text: history.someTimeInMonth(
        MONTH_YEAR_LONG.format(at(outing.visited_on)),
      ),
      loose: true,
    }
  return { text: WEEKDAY_DAY.format(at(outing.visited_on)), loose: false }
}

/** The row's heading: its title, or the place's name when there is none. */
export function headingOf(outing) {
  return outing.title || outing.spot_name
}

/** The place line: neighbourhood and city, led by the name when a title heads the row. */
export function placeLine(outing) {
  const where = [outing.neighbourhood, outing.city].filter(Boolean).join(', ')
  return outing.title
    ? [outing.spot_name, where].filter(Boolean).join(', ')
    : where
}
