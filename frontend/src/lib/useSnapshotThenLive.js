import { useEffect, useState } from 'react'
import { apiFetch } from './api.js'
import { isValidSnapshot, readSnapshot } from './snapshot.js'

/**
 * Paints the build-time snapshot, then swaps in the live API's answer
 * (Spine Next spec, C12). Live data wins whenever it arrives; a painted
 * snapshot outranks an error, since stale beats nothing.
 *
 * @param {string} name A snapshot name; the live path is /api/public/{name}.
 * @returns {{data: any|null, live: boolean, failed: boolean}}
 */
export function useSnapshotThenLive(name) {
  const [state, setState] = useState({ data: null, live: false, failed: false })

  useEffect(() => {
    let cancelled = false
    let live = false
    readSnapshot(name).then((body) => {
      if (!cancelled && !live && body) setState((s) => ({ ...s, data: body }))
    })
    apiFetch(`/api/public/${name}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled) return
        if (isValidSnapshot(name, body)) {
          live = true
          setState({ data: body, live: true, failed: false })
        } else {
          setState((s) => ({ ...s, failed: true }))
        }
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, failed: true }))
      })
    return () => {
      cancelled = true
    }
  }, [name])

  return state
}
