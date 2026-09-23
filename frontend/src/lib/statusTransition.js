/**
 * The PATCH body for moving an item to a new status.
 *
 * Only a move to finished carries more than the status. A prior finish is
 * read from the history (`finished_at` set, or `times_completed` above zero)
 * because the status alone cannot say: a replay arrives as active to
 * finished, exactly like a first play. A first finish counts one completion
 * and is dated today; a later one adds a completion and keeps the existing
 * date, filling it with today only when none was recorded. Pure; never
 * mutates `item`.
 *
 * @param {{finished_at: string|null, times_completed: number}} item - The row as the server last returned it.
 * @param {'backlog'|'active'|'finished'|'abandoned'} nextStatus - The status chosen.
 * @param {string} today - The local date as `YYYY-MM-DD`; the column is a date.
 * @returns {object} The body to PATCH to `/api/items/{id}`.
 */
export function statusTransition(item, nextStatus, today) {
  if (nextStatus !== 'finished') return { status: nextStatus }
  const completed = item.times_completed ?? 0
  const priorFinish = item.finished_at != null || completed > 0
  return {
    status: 'finished',
    finished_at: item.finished_at ?? today,
    times_completed: priorFinish ? completed + 1 : 1,
  }
}

/**
 * Today's local calendar date as `YYYY-MM-DD`.
 *
 * Local, not UTC: the owner finishing a game late in the evening finished it
 * on their day, and toISOString would already be reporting tomorrow.
 *
 * @param {Date} [now] - Defaults to the current time.
 * @returns {string} The date.
 */
export function localToday(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
