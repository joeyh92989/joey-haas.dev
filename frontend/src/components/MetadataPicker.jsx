import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 350

/**
 * Type-ahead lookup against the server-side metadata proxy.
 *
 * The proxy exists because source credentials live on the server; this
 * component never sees a key. Selecting a candidate hands the whole record
 * upward and lets the form decide which fields to apply, so adding a field
 * later is a change in one place rather than two.
 *
 * @param {object} props
 * @param {string} props.type - Media type to search, one of the ItemType values.
 * @param {(candidate: object) => void} props.onSelect - Called with the chosen candidate.
 */
export default function MetadataPicker({ type, onSelect }) {
  const [query, setQuery] = useState('')
  // One state object, written only from async callbacks. Setting state
  // synchronously in an effect body is what react-hooks/set-state-in-effect
  // forbids, and carrying the originating query here means a stale result is
  // filtered out at render time instead of needing to be cleared.
  const [result, setResult] = useState({
    query: '',
    state: 'idle',
    candidates: [],
  })
  const requestId = useRef(0)

  const trimmed = query.trim()
  const active = trimmed.length >= MIN_QUERY_LENGTH
  const current = active && result.query === trimmed ? result : null

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) return undefined

    const id = ++requestId.current
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ type, query: trimmed })
      try {
        const response = await apiFetch(`/api/items/search-metadata?${params}`)
        // A slow earlier request must not overwrite a newer result. Typing is
        // faster than the network, so out-of-order replies are normal.
        if (id !== requestId.current) return
        if (response.status === 503) {
          setResult({ query: trimmed, state: 'unavailable', candidates: [] })
          return
        }
        if (!response.ok) {
          setResult({ query: trimmed, state: 'error', candidates: [] })
          return
        }
        setResult({
          query: trimmed,
          state: 'done',
          candidates: await response.json(),
        })
      } catch {
        if (id === requestId.current) {
          setResult({ query: trimmed, state: 'error', candidates: [] })
        }
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [trimmed, type])

  const state = active ? (current ? current.state : 'searching') : 'idle'
  const candidates = current ? current.candidates : []

  return (
    <div className="metadata-picker">
      <label htmlFor="metadata-query">Look up</label>
      <input
        id="metadata-query"
        type="search"
        value={query}
        placeholder="Search for a title…"
        onChange={(event) => setQuery(event.target.value)}
      />

      {state === 'searching' && <p className="muted">Searching…</p>}
      {state === 'unavailable' && (
        <p className="admin-error">
          Lookup unavailable — this source has no API key configured. Enter the
          title manually.
        </p>
      )}
      {state === 'error' && (
        <p className="admin-error">Lookup failed. Enter the title manually.</p>
      )}
      {state === 'done' && candidates.length === 0 && (
        <p className="muted">No matches. Enter the title manually.</p>
      )}

      {candidates.length > 0 && (
        <ul className="candidate-list">
          {candidates.map((candidate) => (
            <li key={`${candidate.external_source}:${candidate.external_id}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(candidate)
                  // Clearing the query is enough: results are matched to the
                  // query that produced them, so they stop being shown.
                  setQuery('')
                }}
              >
                {candidate.thumbnail_url ? (
                  <img src={candidate.thumbnail_url} alt="" loading="lazy" />
                ) : (
                  <span className="candidate-thumb-empty" aria-hidden="true" />
                )}
                <span>
                  {candidate.title}
                  {candidate.year ? ` (${candidate.year})` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
