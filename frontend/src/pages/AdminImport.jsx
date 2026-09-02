import { useState } from 'react'
import { Link } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import { apiFetch } from '../lib/api.js'

const TYPES = ['game', 'movie', 'comic', 'boardgame']
const NO_MATCH = 'none'

const CONFIDENCE_LABEL = {
  exact: 'Exact',
  probable: 'Probable',
  uncertain: 'Check',
}

/** A row's chosen candidate, or null when it is set to "no match". */
function chosenCandidate(row) {
  if (row.chosenKey === NO_MATCH) return null
  return (
    row.candidates.find(
      (candidate) =>
        `${candidate.external_source}:${candidate.external_id}` ===
        row.chosenKey,
    ) ?? null
  )
}

function candidateKey(candidate) {
  return `${candidate.external_source}:${candidate.external_id}`
}

/**
 * Bulk backfill: photograph the shelves, review what was read, commit.
 *
 * The grid is flat rather than photo-by-photo because the point is to get a
 * few hundred physical items in without navigating; every detection from every
 * photo is one list with one Import button.
 *
 * Nothing is stored server-side between upload and commit. Closing the tab
 * loses the batch, and re-uploading the photographs reproduces it.
 */
export default function AdminImport() {
  const [rows, setRows] = useState([])
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function upload(event) {
    event.preventDefault()
    const files = [...event.target.elements.photos.files]
    if (files.length === 0) return

    setState('extracting')
    setError(null)
    setResult(null)

    const body = new FormData()
    files.forEach((file) => body.append('photos', file))

    try {
      const response = await apiFetch('/api/import/photos', {
        method: 'POST',
        body,
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        setError(detail.detail || 'Could not read those photos.')
        setState('idle')
        return
      }
      const { detections } = await response.json()
      setRows(
        detections.map((detection) => ({
          ...detection,
          include: true,
          title: detection.match
            ? detection.match.title
            : detection.detected_title,
          chosenKey: detection.match ? candidateKey(detection.match) : NO_MATCH,
        })),
      )
      setState(detections.length === 0 ? 'empty' : 'reviewing')
    } catch {
      setError('Could not reach the API.')
      setState('idle')
    }
  }

  function updateRow(index, changes) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...changes } : row)),
    )
  }

  async function commit() {
    setState('importing')
    setError(null)

    const payload = rows
      .filter((row) => row.include)
      .map((row) => {
        const candidate = chosenCandidate(row)
        return {
          type: row.media_type,
          title: row.title.trim(),
          status: 'backlog',
          // Everything here came off a physical shelf, which is the whole
          // premise of importing from photographs.
          owned_format: 'physical',
          year: candidate?.year ?? row.detected_year ?? null,
          external_source: candidate?.external_source ?? null,
          external_id: candidate?.external_id ?? null,
        }
      })

    if (payload.length === 0) {
      setError('Nothing is selected to import.')
      setState('reviewing')
      return
    }

    try {
      const response = await apiFetch('/api/items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      if (!response.ok) {
        setError('Could not save those items.')
        setState('reviewing')
        return
      }
      setResult(await response.json())
      setRows([])
      setState('done')
    } catch {
      setError('Could not reach the API.')
      setState('reviewing')
    }
  }

  return (
    <section>
      <h1>Import from photos</h1>
      <p className="muted">
        Photograph your shelves, then check what was read before anything is
        saved. <Link to="/admin/collection">Back to the collection</Link>.
      </p>

      <form className="import-form" onSubmit={upload}>
        <label htmlFor="photos">Shelf photos</label>
        <input
          id="photos"
          name="photos"
          type="file"
          accept="image/*"
          multiple
        />
        <button type="submit" disabled={state === 'extracting'}>
          {state === 'extracting' ? 'Reading photos…' : 'Read photos'}
        </button>
      </form>

      {state === 'extracting' && (
        <p className="muted">
          Reading the titles off your shelves. This takes a moment for several
          photos.
        </p>
      )}

      {error && <p className="admin-error">{error}</p>}

      {state === 'empty' && (
        <p className="muted">
          No titles could be read from those photos. Try a closer or better-lit
          shot.
        </p>
      )}

      {result && (
        <p className="import-result">
          Imported {result.created} {result.created === 1 ? 'item' : 'items'}.
          {result.skipped_duplicates > 0 &&
            ` Skipped ${result.skipped_duplicates} already in the collection.`}{' '}
          <Link to="/admin/collection">See the collection</Link>.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="item-table-wrap">
            <table className="item-table import-table">
              <thead>
                <tr>
                  <th>
                    <span className="visually-hidden">Include</span>
                  </th>
                  <th>Cover</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Match</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const candidate = chosenCandidate(row)
                  return (
                    <tr
                      key={`${row.index}-${row.detected_title}`}
                      data-confidence={row.confidence}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={row.include}
                          aria-label={`Import ${row.detected_title}`}
                          onChange={(event) =>
                            updateRow(index, { include: event.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <CoverImage
                          src={candidate?.thumbnail_url ?? null}
                          type={row.media_type}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Title for ${row.detected_title}`}
                          value={row.title}
                          onChange={(event) =>
                            updateRow(index, { title: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Type for ${row.detected_title}`}
                          value={row.media_type}
                          onChange={(event) =>
                            updateRow(index, { media_type: event.target.value })
                          }
                        >
                          {TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          aria-label={`Match for ${row.detected_title}`}
                          value={row.chosenKey}
                          onChange={(event) =>
                            updateRow(index, { chosenKey: event.target.value })
                          }
                        >
                          <option value={NO_MATCH}>
                            no match — keep as typed
                          </option>
                          {row.candidates.map((option) => (
                            <option
                              key={candidateKey(option)}
                              value={candidateKey(option)}
                            >
                              {option.title}
                              {option.year ? ` (${option.year})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {/* Text, not colour alone: a badge distinguished only
                            by colour is invisible to anyone who cannot see the
                            difference. */}
                        <span
                          className={`confidence confidence-${row.confidence}`}
                        >
                          {CONFIDENCE_LABEL[row.confidence] ?? row.confidence}
                        </span>
                        {row.reason && (
                          <span className="muted import-reason">
                            {' '}
                            {row.reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p>
            <button
              type="button"
              onClick={commit}
              disabled={state === 'importing'}
            >
              {state === 'importing'
                ? 'Importing…'
                : `Import ${rows.filter((row) => row.include).length} items`}
            </button>
          </p>
        </>
      )}
    </section>
  )
}
