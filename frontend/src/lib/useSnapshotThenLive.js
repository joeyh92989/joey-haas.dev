import { useEffect, useState } from 'react'
import { apiFetch } from './api.js'
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
 * @returns {{data: any|null, live: boolean, failed: boolean}}
 */
export function useSnapshotThenLive(name) {
  // The name travels with the answer, so an answer for another name is never
  // returned, and no state is reset inside the effect.
  const [state, setState] = useState({ name, ...EMPTY })

  useEffect(() => {
    let cancelled = false
    let live = false
    // An update for this name starts from whatever this name has so far.
    const update = (change) =>
      setState((s) => ({
        ...(s.name === name ? s : { name, ...EMPTY }),
        ...change,
      }))

    // readSnapshot never rejects (it resolves null on any failure), so it
    // needs no catch.
    readSnapshot(name).then((body) => {
      if (!cancelled && !live && body) update({ data: body })
    })
    apiFetch(`/api/public/${name}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled) return
        if (isValidSnapshot(name, body)) {
          live = true
          update({ data: body, live: true, failed: false })
        } else {
          update({ failed: true })
        }
      })
      .catch(() => {
        if (!cancelled) update({ failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [name])

  return state.name === name ? state : EMPTY
}
