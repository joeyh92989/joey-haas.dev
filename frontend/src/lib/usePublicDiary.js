import { useEffect, useState } from 'react'
import { apiFetch } from './api.js'

/**
 * A year of play sessions from /api/public/diary, public games only.
 *
 * Live only: the diary has no build-time snapshot, so it appears when the
 * API answers and the page around it never waits for it. A failed or
 * malformed answer is an empty diary, not an error: the Year in review
 * page reads complete without it.
 *
 * @param {number|null} year Null asks for nothing.
 * @returns {object[]} The year's sessions, most recent first.
 */
export function usePublicDiary(year) {
  // The year travels with the answer, so a slower answer for another year
  // is never shown, and no state is reset inside the effect.
  const [state, setState] = useState({ year, sessions: [] })

  useEffect(() => {
    if (year == null) return undefined
    let cancelled = false
    apiFetch(`/api/public/diary?year=${year}`)
      .then((response) => (response.ok ? response.json() : []))
      .catch(() => [])
      .then((body) => {
        if (!cancelled) {
          setState({ year, sessions: Array.isArray(body) ? body : [] })
        }
      })
    return () => {
      cancelled = true
    }
  }, [year])

  return state.year === year ? state.sessions : []
}
