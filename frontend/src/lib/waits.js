/**
 * Bounds on a wait for the API, shared by every page that waits: a cold
 * wake (about 30 s) plus the model's whole budget (`llm.TOTAL_BUDGET_SECONDS`
 * in the backend, 150 s) plus a margin of 15 s.
 */
export const WAIT_DEADLINE_MS = 195_000

/** Seconds into a wait after which Tag now and a photo's read own up to a long one. */
export const STILL_WORKING_AFTER_S = 30

/** Seconds into Today's first load after which it says planning takes a while. */
export const STILL_PLANNING_AFTER_S = 20

/** Seconds into a first load after which a first load stops saying plain Loading. */
export const SLOW_LOAD_AFTER_S = 3

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
  // Inside a promise chain, so a synchronous throw from `fn` rejects.
  const work = Promise.resolve().then(() => fn(controller.signal))
  return Promise.race([work, stop]).finally(cleanup)
}
