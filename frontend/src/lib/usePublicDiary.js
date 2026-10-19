import { useEffect, useState } from 'react'
import { apiFetch } from './api.js'

const PENDING = { sessions: [], settled: false, failed: false }

/**
 * A year of play sessions from /api/public/diary, public games only, with
 * whether the answer has arrived.
 *
 * Live only: the diary has no build-time snapshot, so it appears when the
 * API answers and the page around it never waits for it. A failed or
 * malformed answer is an empty diary marked `failed`, not an error.
 *
 * @param {number|null} year Null asks for nothing and stays unsettled.
 * @returns {{sessions: object[], settled: boolean, failed: boolean}}
 *   Sessions most recent first.
 */
export function usePublicDiaryState(year) {
  // The year travels with the answer, so a slower answer for another year
  // is never shown, and no state is reset inside the effect.
  const [state, setState] = useState({ year, ...PENDING })

  useEffect(() => {
    if (year == null) return undefined
    let cancelled = false
    apiFetch(`/api/public/diary?year=${year}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((body) => {
        if (!cancelled) {
          const ok = Array.isArray(body)
          setState({
            year,
            sessions: ok ? body : [],
            settled: true,
            failed: !ok,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [year])

  return state.year === year ? state : PENDING
}

/**
 * A year of play sessions; see `usePublicDiaryState`. The Year in review
 * page reads complete without it.
 *
 * @param {number|null} year Null asks for nothing.
 * @returns {object[]} The year's sessions, most recent first.
 */
export function usePublicDiary(year) {
  return usePublicDiaryState(year).sessions
}
