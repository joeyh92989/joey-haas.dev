import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import MetadataPicker from '../components/MetadataPicker.jsx'
import { apiFetch } from '../lib/api.js'

const TYPES = ['game', 'movie', 'comic', 'boardgame']
const STATUSES = ['backlog', 'active', 'finished', 'abandoned']
const OWNED_FORMATS = [
  'physical',
  'digital',
  'subscription',
  'borrowed',
  'none',
]

/** Fields the form owns. Anything absent here is never sent on save. */
const EDITABLE = [
  'type',
  'title',
  'year',
  'status',
  'rating',
  'owned_format',
  'favorite',
  'times_completed',
  'started_at',
  'finished_at',
  'notes',
  'is_public',
]

/** An item as form state: nulls become empty strings so inputs stay controlled. */
function toForm(item) {
  return {
    type: item.type,
    title: item.title ?? '',
    year: item.year ?? '',
    status: item.status,
    rating: item.rating ?? '',
    owned_format: item.owned_format ?? '',
    favorite: Boolean(item.favorite),
    times_completed: item.times_completed ?? 0,
    started_at: item.started_at ?? '',
    finished_at: item.finished_at ?? '',
    notes: item.notes ?? '',
    is_public: Boolean(item.is_public),
  }
}

/** Form state back to API shape: empty strings become null again. */
function toPayload(form) {
  return {
    type: form.type,
    title: form.title.trim(),
    year: form.year === '' ? null : Number(form.year),
    status: form.status,
    rating: form.rating === '' ? null : Number(form.rating),
    owned_format: form.owned_format === '' ? null : form.owned_format,
    favorite: form.favorite,
    times_completed: Number(form.times_completed) || 0,
    started_at: form.started_at === '' ? null : form.started_at,
    finished_at: form.finished_at === '' ? null : form.finished_at,
    notes: form.notes === '' ? null : form.notes,
    is_public: form.is_public,
  }
}

/**
 * Only what actually changed.
 *
 * PATCH accepts every field, so sending the whole form would work — but it
 * would also overwrite anything the form does not manage with whatever it
 * happened to render, and quietly re-save fields the user never touched.
 */
function changedFields(original, form) {
  const before = toPayload(toForm(original))
  const after = toPayload(form)
  return Object.fromEntries(
    EDITABLE.filter((key) => before[key] !== after[key]).map((key) => [
      key,
      after[key],
    ]),
  )
}

/**
 * One item, fully editable.
 *
 * A separate route rather than inline editing because the collection table
 * already carries six columns, and this page also has to host the metadata
 * picker for re-linking — a search field and a candidate list do not fit in a
 * table row.
 */
export default function AdminItem() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [item, setItem] = useState(null)
  const [form, setForm] = useState(null)
  const [state, setState] = useState('loading')
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [relinking, setRelinking] = useState(false)

  /**
   * Returns rather than setting state, so the effect applies the result in a
   * promise continuation — react-hooks/set-state-in-effect forbids the direct
   * form.
   */
  const fetchItem = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/items/${id}`)
      if (response.status === 401) return { state: 'unauthorized', item: null }
      if (response.status === 404) return { state: 'missing', item: null }
      if (!response.ok) return { state: 'error', item: null }
      return { state: 'ready', item: await response.json() }
    } catch {
      return { state: 'error', item: null }
    }
  }, [id])

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)

    fetchItem()
      .then((result) => {
        setItem(result.item)
        setForm(result.item ? toForm(result.item) : null)
        setState(result.state)
      })
      .finally(() => clearTimeout(timer))

    return () => clearTimeout(timer)
  }, [fetchItem])

  async function save(event) {
    event.preventDefault()
    setError(null)
    setSavedAt(null)

    const changes = changedFields(item, form)
    if (Object.keys(changes).length === 0) {
      setError('Nothing has changed.')
      return
    }

    setSaving(true)
    try {
      const response = await apiFetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (!response.ok) {
        setError('Could not save those changes.')
        return
      }
      const updated = await response.json()
      setItem(updated)
      setForm(toForm(updated))
      setSavedAt(Date.now())
    } catch {
      setError('Could not reach the API.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Points the item at a different source record and re-fetches its metadata.
   *
   * Two requests on purpose. The PATCH stores the link; the refresh route
   * re-fetches cover, creator and the snapshot server-side, so the browser
   * never assembles metadata it cannot verify — the same rule the import path
   * follows. It also leaves the title alone, so a hand-corrected title
   * survives a re-link.
   *
   * A failed refresh is reported but not rolled back: the link is right even
   * when enrichment is briefly unavailable, and refresh-metadata can be
   * retried.
   */
  async function relink(candidate) {
    setError(null)
    setSavedAt(null)
    setRelinking(true)

    try {
      const linked = await apiFetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_source: candidate.external_source,
          external_id: candidate.external_id,
        }),
      })
      if (!linked.ok) {
        setError('Could not link that record.')
        return
      }

      const refreshed = await apiFetch(`/api/items/${id}/refresh-metadata`, {
        method: 'POST',
      })
      if (!refreshed.ok) {
        setItem(await linked.json())
        setError(
          'Linked, but the metadata could not be fetched. Try saving again.',
        )
        return
      }

      const updated = await refreshed.json()
      setItem(updated)
      setForm(toForm(updated))
      setSavedAt(Date.now())
    } catch {
      setError('Could not reach the API.')
    } finally {
      setRelinking(false)
    }
  }

  async function remove() {
    // Deleting is the one irreversible thing this page does.
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`))
      return

    setError(null)
    try {
      const response = await apiFetch(`/api/items/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        setError('Could not delete that item.')
        return
      }
    } catch {
      setError('Could not reach the API.')
      return
    }
    navigate('/admin/collection')
  }

  const set = (field) => (event) =>
    setForm((current) => ({
      ...current,
      [field]:
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value,
    }))

  if (state === 'loading') {
    return (
      <section>
        <h1>Item</h1>
        <p className="muted">{slow ? 'Waking the server…' : 'Loading…'}</p>
      </section>
    )
  }

  if (state === 'unauthorized') {
    return (
      <section>
        <h1>Item</h1>
        <p className="admin-error">
          Not signed in. <Link to="/admin">Go to admin</Link>.
        </p>
      </section>
    )
  }

  if (state === 'missing') {
    return (
      <section>
        <h1>Item</h1>
        <p className="admin-error">
          No item with that id.{' '}
          <Link to="/admin/collection">Back to the collection</Link>.
        </p>
      </section>
    )
  }

  if (state === 'error') {
    return (
      <section>
        <h1>Item</h1>
        <p className="admin-error">
          Could not reach the API. Try again shortly.
        </p>
      </section>
    )
  }

  return (
    <section>
      <p className="muted">
        <Link to="/admin/collection">← Back to the collection</Link>
      </p>

      <h1>{item.title}</h1>

      {error && <p className="admin-error">{error}</p>}
      {savedAt && <p className="muted">Saved.</p>}

      <div className="item-detail">
        <div className="item-detail-cover">
          <CoverImage src={item.cover_url} type={item.type} alt="" />
          <p className="muted item-detail-link">
            {item.external_source ? (
              <>
                Linked to {item.external_source} #{item.external_id}
              </>
            ) : (
              'Not linked to a source'
            )}
          </p>
          {item.creator && <p className="muted">{item.creator}</p>}

          <div className="item-relink">
            <h2>Re-link</h2>
            <p className="muted">
              Wrong match? Search for the right record — the cover, creator and
              metadata are re-fetched from the source.
            </p>
            {relinking && <p className="muted">Re-linking…</p>}
            <MetadataPicker type={form.type} onSelect={relink} />
          </div>
        </div>

        <form className="item-detail-form" onSubmit={save}>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={form.title}
            onChange={set('title')}
            required
          />

          <label htmlFor="type">Type</label>
          <select id="type" value={form.type} onChange={set('type')}>
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <label htmlFor="year">Year</label>
          <input
            id="year"
            type="number"
            min="1880"
            max="2100"
            value={form.year}
            onChange={set('year')}
          />

          <label htmlFor="status">Status</label>
          <select id="status" value={form.status} onChange={set('status')}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <label htmlFor="owned_format">Format</label>
          <select
            id="owned_format"
            value={form.owned_format}
            onChange={set('owned_format')}
          >
            <option value="">unspecified</option>
            {OWNED_FORMATS.map((value) => (
              <option key={value} value={value}>
                {value === 'none' ? 'want (not owned)' : value}
              </option>
            ))}
          </select>

          <label htmlFor="rating">Rating</label>
          <input
            id="rating"
            type="number"
            min="1"
            max="10"
            value={form.rating}
            onChange={set('rating')}
          />

          <label htmlFor="times_completed">Times completed</label>
          <input
            id="times_completed"
            type="number"
            min="0"
            value={form.times_completed}
            onChange={set('times_completed')}
          />

          <label htmlFor="started_at">Started</label>
          <input
            id="started_at"
            type="date"
            value={form.started_at}
            onChange={set('started_at')}
          />

          <label htmlFor="finished_at">Finished</label>
          <input
            id="finished_at"
            type="date"
            value={form.finished_at}
            onChange={set('finished_at')}
          />

          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            rows="3"
            value={form.notes}
            onChange={set('notes')}
          />

          <label htmlFor="favorite">Favourite</label>
          <input
            id="favorite"
            type="checkbox"
            checked={form.favorite}
            onChange={set('favorite')}
          />

          <label htmlFor="is_public">Public</label>
          <input
            id="is_public"
            type="checkbox"
            checked={form.is_public}
            onChange={set('is_public')}
          />

          <div className="item-detail-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="danger" onClick={remove}>
              Delete
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
