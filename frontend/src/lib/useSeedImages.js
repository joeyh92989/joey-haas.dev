import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './api.js'

/**
 * Drives the fetching of the photos of a sitting's file or link pieces
 * (`POST .../seed-images`, a few at a time, each photo once) while their
 * cards show, so a photo appears as it arrives. Stops, rather than asking
 * forever, when an answer changes nothing though some still wait.
 *
 * @param {{id: string}} sitting
 * @param {object[]} entries The sitting's live pieces.
 * @param {(entry: object) => void} onEntry An entry the API answered with.
 * @returns {{pending: number, failed: boolean}}
 */
export function useSeedImages(sitting, entries, onEntry) {
  const [failed, setFailed] = useState(false)
  const running = useRef(false)
  const mounted = useRef(true)
  const pending = entries.filter((e) => e.payload.image === 'pending').length

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (pending === 0 || running.current || failed) return
    running.current = true
    ;(async () => {
      try {
        const response = await apiFetch(
          `/api/intake/sittings/${sitting.id}/seed-images`,
          { method: 'POST' },
        )
        if (!response.ok) throw new Error('photos')
        const body = await response.json()
        body.entries.forEach(onEntry)
        if (body.entries.length === 0 && body.pending > 0 && mounted.current) {
          setFailed(true)
        }
      } catch {
        if (mounted.current) setFailed(true)
      } finally {
        running.current = false
      }
    })()
  }, [pending, failed, sitting.id, onEntry])

  return { pending, failed }
}
