import { useState } from 'react'
import { apiFetch, errorMessage } from '../../lib/api.js'
import AddResults from './AddResults.jsx'

const NO_ANSWER = 'The server did not answer; try again.'

/**
 * Shoot's "Search instead" (spec, Sitting · 1 Shoot): the add bar's search
 * (`GET /api/intake/search` and its results list), but Add puts the chosen
 * result into this sitting (`POST /sittings/{id}/entries` with `chosen`)
 * instead of the shelf, and "keep as typed" adds a typed entry. The entry
 * then goes through Check and the sitting's one commit like a read one.
 *
 * @param {object} props
 * @param {object} props.sitting
 * @param {object[]} props.kinds Every kind, as `GET /api/intake/kinds`.
 * @param {(entry: object) => void} props.onAdded The new entry.
 */
export default function ShootSearch({ sitting, kinds, onAdded }) {
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const areaKinds = kinds.filter(
    (kind) =>
      kind.area === sitting.area &&
      (!sitting.kind || kind.key === sitting.kind),
  )
  const byKey = Object.fromEntries(areaKinds.map((kind) => [kind.key, kind]))

  async function search(event) {
    event.preventDefault()
    const text = query.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    setNotice('')
    try {
      const response = await apiFetch(
        `/api/intake/search?area=${sitting.area}&query=${encodeURIComponent(text)}`,
      )
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      const body = await response.json()
      // A sitting for one kind lists only that kind's results.
      setAnswer({
        query: text,
        results: body.results.filter((row) => byKey[row.kind]),
        sources: body.sources.filter((row) => byKey[row.kind]),
      })
    } catch {
      setError(NO_ANSWER)
    } finally {
      setBusy(false)
    }
  }

  async function add(body, name) {
    setError(null)
    setNotice('')
    try {
      const response = await apiFetch(
        `/api/intake/sittings/${sitting.id}/entries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      onAdded(await response.json())
      setNotice(`${name} added to this sitting.`)
    } catch {
      setError(NO_ANSWER)
    }
  }

  return (
    <div className="intake-shootsearch">
      <form role="search" aria-label="Search instead" onSubmit={search}>
        <input
          type="search"
          aria-label="Search for a title"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="btn" disabled={busy}>
          Search
        </button>
      </form>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      <p className="muted" role="status">
        {notice}
      </p>
      {answer && (
        <AddResults
          query={answer.query}
          results={answer.results}
          sources={answer.sources}
          kinds={byKey}
          onAdd={(result) =>
            add({ kind: result.kind, chosen: result }, result.title)
          }
          onKeepTyped={(kind) =>
            add(
              { kind: kind.key, payload: { title: answer.query } },
              answer.query,
            )
          }
        />
      )}
    </div>
  )
}
