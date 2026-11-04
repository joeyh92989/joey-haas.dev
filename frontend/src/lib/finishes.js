/**
 * A public item's finishes, one row per finished playthrough.
 *
 * The API sends `finishes` (every dated finish, ascending) beside
 * `finished_at` (the last one). A snapshot written before playthroughs has
 * only `finished_at`, so that is read as one finish. Pure; shared by Now,
 * Month and Year in review and the feed.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The item's dated finishes, ascending.
 *
 * @param {{finishes?: string[], finished_at?: string|null}} item
 * @returns {string[]}
 */
export function finishDates(item) {
  const dates = Array.isArray(item.finishes)
    ? item.finishes
    : item.finished_at
      ? [item.finished_at]
      : []
  return dates.filter((value) => typeof value === 'string' && DATE.test(value))
}

/**
 * One row per dated finish: the item with `finished_at` set to that finish,
 * `finish_number` (1 for a first finish), `again` (a replay), `finish_tag`
 * and `finish_key` (both unique across an item's finishes).
 *
 * The tag is the date, which the feed's GUIDs were first published under;
 * only a second finish on the same day adds its number, so no published
 * GUID changes and two finishes in a day never share one.
 *
 * Numbers count dateless earlier completions too: `times_completed` 3 with
 * two dated finishes makes them the second and third.
 *
 * @param {object} item A public item.
 * @returns {object[]}
 */
export function finishRows(item) {
  const dates = finishDates(item)
  const total = Math.max(item.times_completed ?? 0, dates.length)
  return dates.map((date, index) => {
    const number = total - (dates.length - 1 - index)
    const tag = dates.indexOf(date) === index ? date : `${date}-${number}`
    return {
      ...item,
      finished_at: date,
      finish_number: number,
      again: number > 1,
      finish_tag: tag,
      finish_key: `${item.id}-${tag}`,
    }
  })
}

const ORDINALS = [
  null,
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
]

/**
 * "second time" for 2; a number past ten reads "11th time".
 *
 * @param {number} number
 */
export function timeWord(number) {
  if (ORDINALS[number]) return `${ORDINALS[number]} time`
  const tens = number % 100
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] ?? 'th')
  return `${number}${suffix} time`
}
