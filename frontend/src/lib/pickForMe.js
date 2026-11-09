/**
 * Pick for me's combination keys and choices (Pick for me spec).
 *
 * A key is `<size>|<moods sorted, joined with +>`, `any|` with no mood. The
 * order and spelling must match `combo_key` in backend/picker.py: the band
 * looks its picks up by this string in the table the API precomputes.
 * pickForMe.test.js and backend/tests/test_picker_public_table.py both read
 * src/lib/pick-for-me-keys.json, so the two sides cannot drift.
 */

/** Size choices, in SIZE_BANDS order, with "any" first. */
export const PICK_SIZES = ['any', 'short', 'medium', 'long']

/** Mood choices, in the order the band shows them (MOOD_BUCKETS). */
export const PICK_MOODS = [
  'cozy',
  'story',
  'action',
  'creepy',
  'brainy',
  'chaotic',
]

/** The most moods a visitor can press at once (MAX_PUBLIC_MOODS). */
export const MAX_MOODS = 2

/**
 * The table key for a size and a set of moods.
 *
 * @param {string} size One of PICK_SIZES.
 * @param {string[]} moods At most MAX_MOODS of PICK_MOODS, in any order.
 * @returns {string}
 */
export function pickForMeKey(size, moods) {
  return `${size}|${[...moods].sort().join('+')}`
}

/**
 * Presses or unpresses a mood. A press beyond MAX_MOODS is refused, and the
 * moods come back unchanged.
 *
 * @param {string[]} moods The moods pressed now.
 * @param {string} mood The mood pressed.
 * @returns {{moods: string[], refused: boolean}}
 */
export function toggleMood(moods, mood) {
  if (moods.includes(mood)) {
    return { moods: moods.filter((m) => m !== mood), refused: false }
  }
  if (moods.length >= MAX_MOODS) return { moods, refused: true }
  return { moods: [...moods, mood], refused: false }
}

/**
 * A combination's picks joined to their cards. A pick whose card is missing
 * is dropped rather than drawn blank.
 *
 * @param {object} table A PublicPickForMeOut body.
 * @param {string} key A pickForMeKey.
 * @returns {{pick: object, card: object}[]}
 */
export function picksFor(table, key) {
  return (table.combos[key] ?? [])
    .filter((pick) => Object.hasOwn(table.games, pick.item_id))
    .map((pick) => ({ pick, card: table.games[pick.item_id] }))
}
