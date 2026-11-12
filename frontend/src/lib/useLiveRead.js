import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from './api.js'
import { READ_DEADLINE_MS, withDeadline } from './waits.js'

const EMPTY = { data: null, live: false, failed: false }

/**
 * Reads one thing from the API for a page that has no snapshot, with the
 * shared deadline and a retry. Same return shape as `useSnapshotThenLive`.
 *
 * `source` is an API path (read as JSON; a non-OK answer is a failure) or an
 * async function `(signal) => data` (a rejection is a failure). `null` as a
 * path reads nothing. The request is aborted on unmount, when `deps` change
 * and when a retry starts; `deps` should list what `source` depends on
 * (a path string needs none). Changing `deps` forgets the previous answer.
 * A failed retry keeps the data already shown, with `failed: true`.
 *
 * @template T
 * @param {string|null|((signal: AbortSignal) => Promise<T>)} source
 * @param {Array<any>} [deps]
 * @returns {{data: T|null, live: boolean, failed: boolean, retry: () => void}}
 */
export function useLiveRead(source, deps = []) {
  const key = JSON.stringify([typeof source === 'string' ? source : null, deps])
  const [attempt, setAttempt] = useState(0)
  // The key travels with the answer, so an answer for another read is never
  // returned and no state is reset inside the effect.
  const [state, setState] = useState({ key, ...EMPTY })

  useEffect(() => {
    if (source === null) return undefined
    const controller = new AbortController()
    const update = (change) =>
      setState((s) => ({
        ...(s.key === key ? s : { key, ...EMPTY }),
        ...change,
      }))
    const read =
      typeof source === 'function'
        ? source
        : async (signal) => {
            const response = await apiFetch(source, { signal })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.json()
          }
    withDeadline(read, { ms: READ_DEADLINE_MS, signal: controller.signal })
      .then((body) => {
        if (!controller.signal.aborted)
          update({ data: body, live: true, failed: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) update({ failed: true })
      })
    return () => controller.abort()
    // `source` is represented by `key` (a path) or by the caller's `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const retry = useCallback(() => {
    setState((s) => (s.key === key ? { ...s, failed: false } : s))
    setAttempt((a) => a + 1)
  }, [key])

  return { ...(state.key === key ? state : EMPTY), retry }
}
