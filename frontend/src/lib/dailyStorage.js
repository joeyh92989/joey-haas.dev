/**
 * Shelfle's memory: today's guesses, the streak and the play count, in
 * `localStorage` under one key. Every read and write is wrapped, so a
 * browser with storage blocked still plays; it just forgets on reload and
 * shows no stats row.
 *
 * Shape (`daily:v1`):
 * `{ lastDay, streak, played, guessesTotal, days: { [day]: { guesses, won } } }`
 * where `guesses` is the list of item ids guessed, in order, and `won` is
 * true, false or null while the day is still open.
 */

export const STORAGE_KEY = 'daily:v1'

/**
 * A fresh, never-played state.
 *
 * @returns {{ lastDay: number | null, streak: number, played: number,
 *   guessesTotal: number, days: Record<string, { guesses: string[], won: boolean | null }> }}
 */
export function emptyState() {
  return { lastDay: null, streak: 0, played: 0, guessesTotal: 0, days: {} }
}

function isState(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.days === 'object' &&
    value.days !== null &&
    Number.isInteger(value.streak) &&
    Number.isInteger(value.played) &&
    Number.isInteger(value.guessesTotal)
  )
}

/**
 * The stored state, or a fresh one when storage is empty, unreadable or
 * holds something else.
 *
 * @returns {ReturnType<typeof emptyState>}
 */
export function readDaily() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return emptyState()
    const value = JSON.parse(raw)
    return isState(value) ? value : emptyState()
  } catch {
    return emptyState()
  }
}

/**
 * Persist the state. A failure is not an error: the page state still holds
 * it until the next reload.
 *
 * @param {ReturnType<typeof emptyState>} state
 */
export function writeDaily(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Unpersisted, not lost: the page state still holds it.
  }
}

/**
 * Today's record, if any.
 *
 * @param {ReturnType<typeof emptyState>} state
 * @param {number} day The day number.
 * @returns {{ guesses: string[], won: boolean | null }}
 */
export function dayRecord(state, day) {
  return state.days[day] ?? { guesses: [], won: null }
}

/**
 * The state with one more guess on a day. Pure: returns a new state.
 *
 * @param {ReturnType<typeof emptyState>} state
 * @param {number} day The day number.
 * @param {string} itemId The guessed item's id.
 */
export function recordGuess(state, day, itemId) {
  const record = dayRecord(state, day)
  return {
    ...state,
    days: {
      ...state.days,
      [day]: { ...record, guesses: [...record.guesses, itemId] },
    },
  }
}

/**
 * The state after a day ends. A win extends the streak when yesterday was
 * also solved, otherwise starts one; a loss resets it to zero. Guesses
 * count toward the average only on a win. Pure: returns a new state.
 *
 * @param {ReturnType<typeof emptyState>} state
 * @param {number} day The day number.
 * @param {boolean} won Whether the day was solved.
 */
export function recordOutcome(state, day, won) {
  const record = dayRecord(state, day)
  if (record.won !== null) return state
  const streak = won ? (state.lastDay === day - 1 ? state.streak + 1 : 1) : 0
  return {
    ...state,
    lastDay: day,
    streak,
    played: state.played + 1,
    guessesTotal: state.guessesTotal + (won ? record.guesses.length : 0),
    days: { ...state.days, [day]: { ...record, won } },
  }
}

/**
 * The stats row's figures, or null before the first finished game.
 *
 * @param {ReturnType<typeof emptyState>} state
 * @returns {{ streak: number, played: number, average: string | null } | null}
 *   `average` is guesses per win to one decimal, null with no win yet.
 */
export function statsFor(state) {
  if (state.played === 0) return null
  const wins = Object.values(state.days).filter(
    (record) => record.won === true,
  ).length
  return {
    streak: state.streak,
    played: state.played,
    average: wins === 0 ? null : (state.guessesTotal / wins).toFixed(1),
  }
}
