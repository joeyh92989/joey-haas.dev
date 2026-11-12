import { useEffect, useRef, useState } from 'react'
import { apiFetch, errorMessage } from '../lib/api.js'

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

/** A hit as one line: "Saga #1 · Chapter One (2012)". */
function hitName(hit) {
  const name = hit.name ? ` · ${hit.name}` : ''
  const year = hit.year ? ` (${hit.year})` : ''
  return `${hit.volume_name} #${hit.number}${name}${year}`
}

/**
 * The control on a saved edition row of the admin edit page that links it to
 * a Comic Vine issue (its cover and description come from there) or unlinks
 * it. Choosing a hit PUTs its `cv_id`; Unlink PUTs null. The page hands the
 * returned editions to `onLinked`; a refusal is shown in the API's words.
 *
 * @param {object} props
 * @param {string} props.itemId - The series' item id.
 * @param {string} props.slug - The edition's slug (`ed-<from>-<to>`).
 * @param {string} props.name - The edition's label, for the control's name.
 * @param {number|null} props.cvId - The stored link, if any.
 * @param {(editions: object[]) => void} props.onLinked
 * @param {string} [props.disabledReason] - Set for an edition not yet saved.
 */
export default function EditionLinkPicker({
  itemId,
  slug,
  name,
  cvId,
  onLinked,
  disabledReason,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState({ query: '', hits: [], error: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const requestId = useRef(0)

  const trimmed = query.trim()

  useEffect(() => {
    if (!open || trimmed.length < MIN_QUERY_LENGTH) return undefined
    const id = ++requestId.current
    const timer = setTimeout(async () => {
      let next
      try {
        const response = await apiFetch(
          `/api/comics/issues/search?${new URLSearchParams({ q: trimmed })}`,
        )
        next = response.ok
          ? { query: trimmed, hits: await response.json(), error: null }
          : {
              query: trimmed,
              hits: [],
              error: await errorMessage(response),
            }
      } catch {
        next = {
          query: trimmed,
          hits: [],
          error: 'Could not reach Comic Vine. Try again.',
        }
      }
      // Typing outruns the network: only the newest reply counts.
      if (id === requestId.current) setResult(next)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [open, trimmed])

  const active = open && trimmed.length >= MIN_QUERY_LENGTH
  const current = active && result.query === trimmed ? result : null
  const searching = active && !current
  const hits = current ? current.hits : []
  const shownError = error ?? current?.error ?? null

  async function put(value) {
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/comics/${encodeURIComponent(itemId)}/editions/${encodeURIComponent(slug)}/link`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cv_id: value }),
        },
      )
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      const body = await response.json()
      setOpen(false)
      setQuery('')
      setResult({ query: '', hits: [], error: null })
      onLinked(body.editions)
    } catch {
      setError('Could not save that link. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const unavailable = Boolean(disabledReason)
  const fieldId = `edition-link-${slug}`

  return (
    <div className="comic-edition-link">
      {cvId ? (
        <>
          <span>Linked to Comic Vine (issue {cvId})</span>
          <button
            type="button"
            className="link-button"
            aria-label={`Unlink ${name} from Comic Vine`}
            disabled={busy || unavailable}
            onClick={() => put(null)}
          >
            Unlink
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="link-button"
        aria-label={`Link to Comic Vine, ${name}`}
        aria-expanded={open}
        disabled={busy || unavailable}
        onClick={() => setOpen((current) => !current)}
      >
        {cvId ? 'Change link' : 'Link to Comic Vine'}
      </button>
      {unavailable && <span className="muted">{disabledReason}</span>}
      {open && !unavailable && (
        <>
          <label htmlFor={fieldId} className="visually-hidden">
            Search Comic Vine
          </label>
          <input
            id={fieldId}
            type="search"
            placeholder="Saga 1"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {searching && (
            <span className="muted" role="status">
              Searching…
            </span>
          )}
          {hits.length > 0 && (
            <ul className="edition-link-hits">
              {hits.map((hit) => (
                <li key={hit.cv_id}>
                  <button
                    type="button"
                    className="edition-link-hit"
                    disabled={busy}
                    onClick={() => put(hit.cv_id)}
                  >
                    {hit.thumb_url && (
                      <img src={hit.thumb_url} alt="" loading="lazy" />
                    )}
                    <span>{hitName(hit)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {shownError && (
        <p className="admin-error" role="alert">
          {shownError}
        </p>
      )}
    </div>
  )
}
