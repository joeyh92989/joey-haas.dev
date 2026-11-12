/**
 * Bounds on a wait for the API. The server can be asleep (about thirty
 * seconds to wake) and then call a model (up to two minutes), so one
 * deadline sits above both and is shared by every page that waits.
 */
export const WAIT_DEADLINE_MS = 165_000

/** What `withDeadline` rejects with when the deadline passes. */
export class WaitTimeout extends Error {
  constructor() {
    super('The wait passed its deadline')
    this.name = 'WaitTimeout'
  }
}

/**
 * Runs `fn(signal)` and gives up after the deadline: the signal is aborted
 * (so a `fetch` given it stops) and the result rejects with `WaitTimeout`,
 * even if `fn` ignores the signal. Put the whole wait inside `fn` -- the
 * fetch and the body read -- so the deadline covers both.
 *
 * A caller's own `signal` (an unmount, say) aborts the work too; that
 * rejects with an `AbortError`, never `WaitTimeout`.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} fn
 * @param {{ms?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<T>}
 */
export function withDeadline(
  fn,
  { ms = WAIT_DEADLINE_MS, signal: outer } = {},
) {
  const controller = new AbortController()
  let timer
  let onOuterAbort
  const cleanup = () => {
    clearTimeout(timer)
    if (onOuterAbort) outer.removeEventListener('abort', onOuterAbort)
  }
  const stop = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new WaitTimeout())
    }, ms)
    if (outer) {
      onOuterAbort = () => {
        controller.abort()
        reject(new DOMException('Aborted', 'AbortError'))
      }
      if (outer.aborted) onOuterAbort()
      else outer.addEventListener('abort', onOuterAbort)
    }
  })
  return Promise.race([fn(controller.signal), stop]).finally(cleanup)
}
