import { apiFetch } from './api.js'
import { runWords, STATUS_ORDER, statusLabel } from './shelf.js'

/**
 * The status control's entries for one admin row, and the call that makes
 * a move. The server decides what a move records (`backend/playthroughs.py`
 * opens, closes, pauses or deletes a playthrough); this file only names the
 * moves, so the card menu, the touch sheet and the list `<select>` agree.
 */

const MONTH = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** The playthrough a new run would take: one past the highest. */
function nextNumber(item) {
  const numbers = (item.playthroughs ?? []).map((run) => run.number)
  return numbers.length
    ? Math.max(...numbers) + 1
    : (item.times_completed ?? 0) + 1
}

function openRun(item) {
  return (item.playthroughs ?? []).find((run) => run.outcome == null) ?? null
}

/**
 * Whether this move undoes a Replay or Try again made by mistake, which the
 * server answers by deleting the open run rather than closing it
 * (`playthroughs.is_misclick`): the run opened today, never paused, has no
 * journal day, and the run before it ended as `target`.
 *
 * "Before it" is the highest closed number here. The server orders by when
 * runs were written, so a past run added after the replay would differ; the
 * hint can be wrong in that one case, the move never is.
 */
function undoesToday(item, target) {
  const current = openRun(item)
  if (!current || current.started_on !== localToday()) return false
  if (current.paused_on || (current.journal_days ?? 0) > 0) return false
  const closed = (item.playthroughs ?? []).filter((run) => run.outcome != null)
  if (closed.length === 0) return false
  const previous = closed.reduce((a, b) => (b.number > a.number ? b : a))
  return previous.outcome === target
}

/**
 * The verb and hint for moving from the item's status to `target`, when
 * that is a move out of the current state the design names; null keeps the
 * plain label.
 */
function move(item, target) {
  const from = item.status
  const words = runWords(item.type)
  if (target === 'active' && (from === 'finished' || from === 'abandoned')) {
    return {
      verb: from === 'finished' ? words.replay : 'Try again',
      hint: `starts ${words.run} ${nextNumber(item)}`,
    }
  }
  if (target === 'active' && from === 'paused') {
    const pausedOn = openRun(item)?.paused_on
    return {
      verb: 'Resume',
      hint: pausedOn
        ? `since ${MONTH.format(new Date(`${pausedOn}T00:00:00Z`))}`
        : null,
    }
  }
  if (from === 'active' && undoesToday(item, target)) {
    return {
      verb: target === 'finished' ? 'Finish' : statusLabel(target, item.type),
      hint: `undoes today’s ${target === 'finished' ? words.replay : 'Try again'}`,
    }
  }
  if (from === 'active' && target === 'finished') {
    return { verb: 'Finish', hint: 'dated today' }
  }
  if (from === 'active' && target === 'paused') {
    return { verb: 'Pause', hint: 'keeps the date' }
  }
  return null
}

/**
 * Every status as a menu entry, in the shelf's order.
 *
 * `label` is the verb for a named move, else the status name; `name` is the
 * accessible name, verb and hint together ("Replay, starts playthrough 3").
 *
 * @param {{status: string, type?: string, playthroughs?: object[], times_completed?: number}} item
 * @returns {Array<{status: string, label: string, hint: string|null, name: string, current: boolean}>}
 */
export function statusMoves(item) {
  return STATUS_ORDER.map((status) => {
    const named = move(item, status)
    const label = named?.verb ?? statusLabel(status, item.type)
    const hint = named?.hint ?? null
    return {
      status,
      label,
      hint,
      name: hint ? `${label}, ${hint}` : label,
      current: status === item.status,
    }
  })
}

/**
 * The one-tap move to Playing for a shelf card, or null when the item is
 * already Playing.
 *
 * Resume, Replay and Try again are the status menu's own entries, so the
 * button and the menu cannot disagree; only a start from Backlog gets
 * wording of its own, since the menu calls that move plain "Playing".
 *
 * @param {{status: string, type?: string, playthroughs?: object[], times_completed?: number}} item
 * @returns {{label: string, hint: string|null, name: string}|null}
 */
export function playMove(item) {
  if (item.status === 'active') return null
  const named = move(item, 'active')
  const label =
    named?.verb ?? (item.type === 'comic' ? 'Start reading' : 'Start playing')
  const hint = named ? named.hint : 'dated today'
  return { label, hint, name: hint ? `${label}, ${hint}` : label }
}

/**
 * The moves the Wrap up sheet makes: the ones that close or set aside a
 * run, and so take a date and a note (`playthroughs.WRAP_UP`). The card
 * menu and the list `<select>` open the sheet for these instead of writing.
 */
export const WRAP_UP_STATUSES = ['finished', 'paused', 'abandoned']

/** Whether choosing `status` is a Wrap up rather than a plain write. */
export function isWrapUp(status) {
  return WRAP_UP_STATUSES.includes(status)
}

/**
 * Moves an item to `status` through the status route, dated by the owner's
 * local day. `extras` ride in the body: the sheet's `on` (the date a
 * finish or pause is stamped with instead of today) and `note`.
 *
 * @param {string} id
 * @param {string} status
 * @param {{on?: string, note?: string}} [extras]
 * @returns {Promise<Response>}
 */
export function setStatus(id, status, extras = {}) {
  return apiFetch(`/api/items/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, today: localToday(), ...extras }),
  })
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

/**
 * The pin route for one game, carrying the owner's local today on a pin.
 *
 * A pin opens a playthrough, and the run is dated by the owner's day, not
 * the server's UTC one; an unpin opens nothing and needs no date.
 *
 * @param {string} itemId
 * @param {'POST'|'DELETE'} [method]
 * @returns {string} The path.
 */
export function pinPath(itemId, method = 'POST') {
  const path = `/api/items/${itemId}/pin`
  return method === 'POST' ? `${path}?today=${localToday()}` : path
}
