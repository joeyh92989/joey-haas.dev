import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { lastNightly, nightlyWords } from '../lib/nightly.js'

/** The README section that says how to switch the schedule back on. */
const REENABLE_URL = 'https://github.com/joeyh92989/joey-haas.dev#nightly-job'

/** Radar's and Discover's generate times from the store list, or nulls. */
async function generatedAt(response) {
  const none = { radar: null, discover: null }
  if (!response?.ok) return none
  try {
    const body = await response.json()
    return {
      radar: body?.generated_at?.radar ?? null,
      discover: body?.generated_at?.discover ?? null,
    }
  } catch {
    return none
  }
}

/**
 * One line on the admin landing: when the nightly job last refreshed the
 * catalogue, and whether it failed. Muted normally; when it may have stopped,
 * it is an error line with a link to how to re-enable it. Silent when the
 * status cannot be read; the page's other links still work.
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
        const generated = await generatedAt(
          await apiFetch('/api/recommendations/store-list'),
        )
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
    <p className={summary.stale ? 'admin-error' : 'muted'}>
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
