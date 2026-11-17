import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './api.js'

/**
 * Drives the fetching of the photos of a sitting's file or link pieces
 * (`POST .../seed-images`, a few at a time, each photo once) while their
 * cards show, so a photo appears as it arrives. One run asks until the
 * server has none pending; it starts again when the set of photos to fetch
 * changes (a colour chosen again). It stops, rather than asking forever,
 * when an answer changes nothing though some still wait.
 *
 * A sitting with file and link pieces must run one of these, not two: the
 * page calls it once for all of them and the cards take `enabled` false.
 *
 * @param {{id: string}} sitting
 * @param {object[]} entries The sitting's live pieces.
 * @param {(entry: object) => void} onEntry An entry the API answered with.
 * @param {boolean} [enabled]
 * @returns {{pending: number, failed: boolean}}
 */
export function useSeedImages(sitting, entries, onEntry, enabled = true) {
  const [failed, setFailed] = useState(false)
  const [round, setRound] = useState(0)
  const running = useRef(false)
  const mounted = useRef(true)
  const latest = useRef('')
  const waiting = entries.filter((e) => e.payload.image === 'pending')
  // What is waiting, by piece and photo: a new photo for a piece is a change
  // though the count is the same.
  const key = waiting
    .map((e) => `${e.id}:${e.payload.seed?.image_url}`)
    .join('|')

  latest.current = key

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || key === '' || running.current || failed) return
    running.current = true
    const started = key
    ;(async () => {
      try {
        for (;;) {
          const response = await apiFetch(
            `/api/intake/sittings/${sitting.id}/seed-images`,
            { method: 'POST' },
          )
          if (!response.ok) throw new Error('photos')
          const body = await response.json()
          body.entries.forEach(onEntry)
          if (body.pending === 0 || !mounted.current) break
          if (body.entries.length === 0) {
            setFailed(true)
            break
          }
        }
      } catch {
        if (mounted.current) setFailed(true)
      } finally {
        running.current = false
        // A photo chosen while this run was ending is picked up by the next.
        if (mounted.current && latest.current !== started) {
          setRound((n) => n + 1)
        }
      }
    })()
  }, [enabled, key, failed, round, sitting.id, onEntry])

  return { pending: waiting.length, failed }
}
