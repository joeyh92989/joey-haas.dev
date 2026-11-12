import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from './api.js'
import { READ_DEADLINE_MS, withDeadline } from './waits.js'
import { isValidSnapshot, readSnapshot } from './snapshot.js'

const EMPTY = { data: null, live: false, failed: false }

/**
 * Paints the build-time snapshot, then swaps in the live API's answer
 * (Spine Next spec, C12). Live data wins whenever it arrives; a painted
 * snapshot outranks an error, since stale beats nothing.
 *
 * `failed: true` with `data` present means "stale but showing": the live call
 * failed, before or after the snapshot painted. Changing `name` forgets the
 * previous name's answer at once.
 *
 * @param {string} name A snapshot name; the live path is /api/public/{name}.
 * The live read stops at `READ_DEADLINE_MS` (it then counts as failed).
 * `retry()` re-runs the live read, clears `failed` and keeps any painted data.
 *
 * @returns {{data: any|null, live: boolean, failed: boolean, retry: () => void}}
 */
export function useSnapshotThenLive(name) {
  // The name travels with the answer, so an answer for another name is never
  // returned, and no state is reset inside the effect.
  const [state, setState] = useState({ name, ...EMPTY })
  const [attempt, setAttempt] = useState(0)

  // An update for this name starts from whatever this name has so far.
  const update = useCallback(
    (change) =>
      setState((s) => ({
        ...(s.name === name ? s : { name, ...EMPTY }),
        ...change,
      })),
    [name],
  )

  // The snapshot paints once per name; a retry does not re-read it.
  useEffect(() => {
    let cancelled = false
    // readSnapshot never rejects (it resolves null on any failure), so it
    // needs no catch.
    readSnapshot(name).then((body) => {
      if (cancelled || !body) return
      // Live data that arrived first is never overwritten by a late snapshot.
      setState((s) => {
        const mine = s.name === name ? s : { name, ...EMPTY }
        return mine.live ? mine : { ...mine, data: body }
      })
    })
    return () => {
      cancelled = true
    }
  }, [name])

  useEffect(() => {
    const controller = new AbortController()
    withDeadline(
      async (signal) => {
        const response = await apiFetch(`/api/public/${name}`, { signal })
        return response.ok ? response.json() : null
      },
      { ms: READ_DEADLINE_MS, signal: controller.signal },
    )
      .then((body) => {
        if (controller.signal.aborted) return
        if (isValidSnapshot(name, body)) {
          update({ data: body, live: true, failed: false })
        } else {
          update({ failed: true })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) update({ failed: true })
      })
    return () => controller.abort()
  }, [name, attempt, update])

  const retry = useCallback(() => {
    setState((s) => (s.name === name ? { ...s, failed: false } : s))
    setAttempt((a) => a + 1)
  }, [name])

  return { ...(state.name === name ? state : EMPTY), retry }
}
