import { useCallback, useEffect, useRef, useState } from 'react'
import { ACTION_ERROR } from '../content/status.js'
import { adminCopy } from '../content/adminCopy.js'
import { apiFetch, errorMessage } from './api.js'

/**
 * Starts one job from the Jobs list and tracks it: idle, running, then done
 * or failed. The routes are synchronous (a comic issue sync can take
 * minutes) and answer 409 while their lock is held, which reads "Already
 * running". The state lives in the caller, a second press while a call is
 * open does nothing, and leaving the page aborts the request and drops its
 * result, so nothing updates an unmounted row.
 *
 * @param {object} options
 * @param {string} options.path POST endpoint, query string included.
 * @param {object} [options.body] Sent as JSON when given.
 * @param {() => void} [options.onSettled] Called after a run ends, either
 *   way, so the page can read the job status again.
 * @returns {{state: 'idle'|'running'|'done'|'failed', error: string|null,
 *   at: number|null, start: () => Promise<void>}}
 */
export function useJobRun({ path, body, onSettled }) {
  const [run, setRun] = useState({ state: 'idle', error: null, at: null })
  const open = useRef(false)
  const controller = useRef(null)
  const settled = useRef(onSettled)

  useEffect(() => {
    settled.current = onSettled
  })

  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )

  const start = useCallback(async () => {
    if (open.current) return
    open.current = true
    const abort = new AbortController()
    controller.current = abort
    setRun({ state: 'running', error: null, at: null })
    let next
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        signal: abort.signal,
        ...(body === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
      })
      next = response.ok
        ? { state: 'done', error: null, at: Date.now() }
        : {
            state: 'failed',
            error:
              response.status === 409
                ? adminCopy.jobRun.conflict
                : await errorMessage(response, { ownConflicts: true }),
            at: null,
          }
    } catch {
      next = abort.signal.aborted
        ? null
        : { state: 'failed', error: ACTION_ERROR, at: null }
    }
    open.current = false
    if (abort.signal.aborted || next === null) return
    setRun(next)
    settled.current?.()
  }, [path, body])

  return { ...run, start }
}
