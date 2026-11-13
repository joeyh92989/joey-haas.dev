import { useCallback, useRef, useState } from 'react'
import { apiFetch } from './api.js'

/**
 * Reads what deleting some rows would take with them, when a confirm arms
 * (`POST /api/items/delete-preview`). `arm(ids)` starts a read; the latest
 * one wins, so arming twice never shows an older answer.
 *
 * @returns {{state: {status: 'idle'|'loading'|'ready'|'error', preview: object|null}, arm: (ids: string[]) => Promise<void>}}
 */
export function useDeletePreview() {
  const [state, setState] = useState({ status: 'idle', preview: null })
  const latest = useRef(0)

  const arm = useCallback(async (ids) => {
    const seq = ++latest.current
    setState({ status: 'loading', preview: null })
    let next
    try {
      const response = await apiFetch('/api/items/delete-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      next = response.ok
        ? { status: 'ready', preview: await response.json() }
        : { status: 'error', preview: null }
    } catch {
      next = { status: 'error', preview: null }
    }
    if (seq === latest.current) setState(next)
  }, [])

  return { state, arm }
}
