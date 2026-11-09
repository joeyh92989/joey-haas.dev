/**
 * How big a game is, from IGDB's "normally" hours to finish it.
 *
 * Upper bounds in hours, mirroring SIZE_BANDS in backend/picker.py (a game
 * of exactly six hours is Short, one of exactly fifteen is Medium). Keep the
 * two in step: the Size filter, the pill and the daily puzzle's Size column
 * all read this table.
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
 * The band a game falls in, as its label.
 *
 * @param {number | null | undefined} hours Hours to finish, or unknown.
 * @returns {string | null} 'Short', 'Medium' or 'Long', or null when unknown.
 */
export function sizeLabel(hours) {
  const band = sizeBand(hours)
  return band == null ? null : SIZE_LABELS[band]
}
