import { useCallback, useRef, useState } from 'react'
import { apiFetch } from './api.js'

const itemsPreview = (ids) =>
  apiFetch('/api/items/delete-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })

/**
 * Reads what deleting some rows would take with them, when a confirm arms
 * (`POST /api/items/delete-preview`). `arm(ids)` starts a read; the latest
 * one wins, so arming twice never shows an older answer. `load(ids)`
 * returns the response to read; it defaults to the items route, and a
 * caller whose rows are not items (a comic's book) passes its own.
 *
 * @param {(ids: string[]) => Promise<Response>} [load]
 * @returns {{state: {status: 'idle'|'loading'|'ready'|'error', preview: object|null}, arm: (ids: string[]) => Promise<void>}}
 */
export function useDeletePreview(load = itemsPreview) {
  const [state, setState] = useState({ status: 'idle', preview: null })
  const latest = useRef(0)

  const arm = useCallback(
    async (ids) => {
      const seq = ++latest.current
      setState({ status: 'loading', preview: null })
      let next
      try {
        const response = await load(ids)
        next = response.ok
          ? { status: 'ready', preview: await response.json() }
          : { status: 'error', preview: null }
      } catch {
        next = { status: 'error', preview: null }
      }
      if (seq === latest.current) setState(next)
    },
    [load],
  )

  return { state, arm }
}
