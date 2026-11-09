/**
 * How big a pick is: a game from IGDB's "normally" hours to finish it, a
 * comic from the issues left, a movie from its runtime.
 *
 * Upper bounds in hours, mirroring SIZE_BANDS in backend/picker_items.py (a
 * game of exactly six hours is Short, one of exactly fifteen is Medium). Keep
 * the two in step: the Size filter, the pill and the daily puzzle's Size
 * column all read this table.
 */
export const SIZE_BANDS = [
  [6, 'Short'],
  [15, 'Medium'],
  [Infinity, 'Long'],
]

/** The band labels in order, Short to Long. */
export const SIZE_LABELS = SIZE_BANDS.map(([, label]) => label)

/**
 * The band a game falls in, as an index into SIZE_LABELS (0 Short, 1
 * Medium, 2 Long), so two bands can be compared for adjacency.
 *
 * @param {number | null | undefined} hours Hours to finish, or unknown.
 * @returns {number | null} The band index, or null when the hours are unknown.
 */
export function sizeBand(hours) {
  if (hours == null) return null
  return SIZE_BANDS.findIndex(([high]) => hours <= high)
}

/**
 * Upper bounds per unit, mirroring the strategies' bands in
 * backend/strategies.py (SIZE_BANDS for hours, COMIC_BANDS for issues left,
 * MOVIE_BANDS for minutes): a value on a bound is the smaller band. Keep
 * them in step.
 */
const UNIT_BANDS = {
  hours: SIZE_BANDS,
  issues: [
    [4, 'Short'],
    [12, 'Medium'],
    [Infinity, 'Long'],
  ],
  minutes: [
    [100, 'Short'],
    [140, 'Medium'],
    [Infinity, 'Long'],
  ],
}

/**
 * The band a value falls in, as its label.
 *
 * @param {number | null | undefined} value The amount, or unknown.
 * @param {'hours'|'issues'|'minutes'} [unit] Hours when none is given.
 * @returns {string | null} 'Short', 'Medium' or 'Long', or null when unknown.
 */
export function sizeLabel(value, unit = 'hours') {
  const bands = UNIT_BANDS[unit]
  if (value == null || !bands) return null
  return bands.find(([high]) => value <= high)[1]
}
