import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { lastNightly, nightlyWords } from '../lib/nightly.js'

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
 * the catalogue, and whether it failed. Silent when the status cannot be
 * read; the page's other links still work.
 */
export default function LastNightly() {
  const [words, setWords] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [status, radar, discover] = await Promise.all([
          apiFetch('/api/physical/status'),
          apiFetch('/api/recommendations?kind=radar'),
          apiFetch('/api/recommendations?kind=discover'),
        ])
        if (!status?.ok) return
        const body = await status.json()
        // Not a status document: say nothing rather than "may have stopped".
        if (!Array.isArray(body?.sources)) return
        const generated = {
          radar: await generatedAt(radar),
          discover: await generatedAt(discover),
        }
        const summary = lastNightly(body, generated)
        if (live) setWords(nightlyWords(summary))
      } catch {
        // Unreachable API: the landing's other links still work.
      }
    }
    load()
    return () => {
      live = false
    }
  }, [])

  if (!words) return null
  return <p className="muted last-nightly">{words}</p>
}
