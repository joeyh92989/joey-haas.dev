import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import {
  CARTRIDGE_ERA_PLATFORMS,
  COMPLETENESS_OPTIONS,
  FORMAT_OPTIONS,
  PLATFORM_OPTIONS,
} from '../components/ItemForm.jsx'
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
  'platform_id',
  'physical_format',
  'cart_id',
  'region',
  'completeness',
  'acquired_at',
  'release_date',
]

/** A form value as the API wants it: an empty string means "not set". */
const orNull = (value) => (value === '' ? null : value)

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
    platform_id: item.platform_id ?? '',
    physical_format: item.physical_format ?? '',
    cart_id: item.cart_id ?? '',
    region: item.region ?? '',
    completeness: item.completeness ?? '',
    acquired_at: item.acquired_at ?? '',
    release_date: item.release_date ?? '',
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
    platform_id: form.platform_id === '' ? null : Number(form.platform_id),
    physical_format: orNull(form.physical_format),
    cart_id: orNull(form.cart_id.trim()),
    region: orNull(form.region.trim()),
    completeness: orNull(form.completeness),
    acquired_at: orNull(form.acquired_at),
    release_date: orNull(form.release_date),
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
        // A 409 is the server explaining a rule, such as the favourites
        // cap, in words worth showing. The form keeps the unsaved values.
        const detail =
          response.status === 409 || response.status === 422
            ? await response
                .json()
                .then((payload) => payload?.detail)
                .catch(() => null)
            : null
        setError(
          typeof detail === 'string' ? detail : 'Could not save those changes.',
        )
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
    if (relinking) return

    setError(null)
    setSavedAt(null)
    setRelinking(true)

    // Whatever the form has unsaved, so a half-finished correction is not
    // discarded by rebuilding the form from the server's response below.
    const unsaved = Object.keys(changedFields(item, form))

    try {
      const linked = await apiFetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // The type goes with the link, and must. refresh-metadata picks its
          // adapter from the item's *stored* type, while the picker searched
          // using the form's. Sending only the link would let those disagree:
          // pick a film from TMDB on a row still stored as a game, and the
          // server would hand a TMDB id to the IGDB adapter and write whatever
          // game happens to have that number onto the row.
          type: form.type,
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
      // Refreshed values, with the operator's unsaved edits laid back on top.
      // Losing a hand-typed title because the cover was also wrong would be
      // the same data loss the refresh route already refuses to cause.
      setForm({
        ...toForm(updated),
        ...Object.fromEntries(unsaved.map((field) => [field, form[field]])),
      })
      setSavedAt(Date.now())
    } catch {
      setError('Could not reach the API.')
    } finally {
      setRelinking(false)
    }
  }

  /**
   * Applies a server response to the page, keeping unsaved edits on top, as
   * relinking does: a pin changes status and start date, and must not throw
   * away a half-typed correction elsewhere in the form.
   */
  function applyServerItem(updated) {
    // Against the form as it is now, not as it was when the request began: a
    // cold start can hold the request long enough to type into the form.
    setForm((current) => {
      const unsaved = Object.keys(changedFields(item, current))
      return {
        ...toForm(updated),
        ...Object.fromEntries(unsaved.map((field) => [field, current[field]])),
      }
    })
    setItem(updated)
  }

  /** Pins (POST) or unpins (DELETE) this game as Up next. */
  async function setPinned(method) {
    setError(null)
    try {
      const response = await apiFetch(`/api/items/${id}/pin`, { method })
      if (!response.ok) {
        const detail = await response
          .json()
          .then((payload) => payload?.detail)
          .catch(() => null)
        setError(
          typeof detail === 'string' ? detail : 'Could not change Up next.',
        )
        return
      }
      applyServerItem(await response.json())
    } catch {
      setError('Could not reach the API.')
    }
  }

  /** Lets Play Next suggest this game again, then re-reads the item. */
  async function restoreToPlayNext() {
    setError(null)
    try {
      const response = await apiFetch(`/api/picker/events/${id}/never`, {
        method: 'DELETE',
      })
      const reread = response.ok ? await apiFetch(`/api/items/${id}`) : null
      if (!reread?.ok) {
        setError('Could not restore it to Play Next.')
        return
      }
      applyServerItem(await reread.json())
    } catch {
      setError('Could not reach the API.')
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

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {savedAt && <p className="muted">Saved.</p>}

      <div className="play-next-status">
        {item.pinned_at ? (
          <p>
            Up next.{' '}
            <button type="button" onClick={() => setPinned('DELETE')}>
              Unpin
            </button>
          </p>
        ) : (
          <p>
            <button type="button" onClick={() => setPinned('POST')}>
              Pin as Up next
            </button>
          </p>
        )}
        {item.play_next_excluded && (
          <p>
            <span className="muted">Excluded from Play Next.</span>{' '}
            <button type="button" onClick={restoreToPlayNext}>
              Restore
            </button>
          </p>
        )}
      </div>

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

          <label htmlFor="platform_id">Platform</label>
          <select
            id="platform_id"
            value={form.platform_id}
            onChange={set('platform_id')}
          >
            <option value="">unspecified</option>
            {PLATFORM_OPTIONS.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          <label htmlFor="physical_format">Copy format</label>
          <select
            id="physical_format"
            value={form.physical_format}
            onChange={set('physical_format')}
          >
            <option value="">not recorded</option>
            {FORMAT_OPTIONS.map(([format, label]) => (
              <option key={format} value={format}>
                {label}
              </option>
            ))}
          </select>

          {/* The code on a Switch 2 label decides the format; the server
              refuses one that contradicts it. */}
          <label htmlFor="cart_id">Cart ID</label>
          <input
            id="cart_id"
            placeholder="LP-AAC4B-USA-0"
            value={form.cart_id}
            onChange={set('cart_id')}
          />

          <label htmlFor="region">Region</label>
          <input
            id="region"
            placeholder="USA"
            maxLength={4}
            value={form.region}
            onChange={set('region')}
          />

          {CARTRIDGE_ERA_PLATFORMS.includes(Number(form.platform_id)) && (
            <>
              <label htmlFor="completeness">Completeness</label>
              <select
                id="completeness"
                value={form.completeness}
                onChange={set('completeness')}
              >
                <option value="">unspecified</option>
                {COMPLETENESS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}

          <label htmlFor="acquired_at">Acquired</label>
          <input
            id="acquired_at"
            type="date"
            value={form.acquired_at}
            onChange={set('acquired_at')}
          />

          {/* On a linked item a metadata refresh overwrites this: the source
              is the truth for a release date, since announced dates move. */}
          <label htmlFor="release_date">Release date</label>
          <input
            id="release_date"
            type="date"
            value={form.release_date}
            onChange={set('release_date')}
          />

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
