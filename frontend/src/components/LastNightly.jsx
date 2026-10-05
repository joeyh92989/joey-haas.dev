import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { lastNightly, nightlyWords } from '../lib/nightly.js'

/** The README section that says how to switch the schedule back on. */
const REENABLE_URL = 'https://github.com/joeyh92989/joey-haas.dev#nightly-job'

/** A generate time from a recommendations response, or null if unreadable. */
async function generatedAt(response) {
  if (!response?.ok) return null
  try {
    return (await response.json()).generated_at ?? null
  } catch {
    return null
  }
}

/**
 * One muted line on the admin landing: when the nightly job last refreshed
 * the catalogue, and whether it failed; when it may have stopped, a link to
 * how to re-enable it. Silent when the status cannot be read; the page's
 * other links still work.
 */
export default function LastNightly() {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const status = await apiFetch('/api/physical/status')
        if (!status?.ok) return
        const body = await status.json()
        // Not a status document: say nothing rather than "may have stopped".
        if (!Array.isArray(body?.sources)) return
        const [radar, discover] = await Promise.all([
          apiFetch('/api/recommendations?kind=radar'),
          apiFetch('/api/recommendations?kind=discover'),
        ])
        const generated = {
          radar: await generatedAt(radar),
          discover: await generatedAt(discover),
        }
        if (live) setSummary(lastNightly(body, generated))
      } catch {
        // Unreachable API: the landing's other links still work.
      }
    }
    load()
    return () => {
      live = false
    }
  }, [])

  if (!summary) return null
  return (
    <p className="muted">
      {nightlyWords(summary)}
      {summary.stale && (
        <>
          {' · '}
          <a href={REENABLE_URL}>how to re-enable it</a>
        </>
      )}
    </p>
  )
}
