import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import ItemForm from '../components/ItemForm.jsx'
import MetadataPicker from '../components/MetadataPicker.jsx'
import { apiFetch } from '../lib/api.js'

const STATUSES = ['backlog', 'active', 'finished', 'abandoned']

const EMPTY_FORM = {
  type: 'game',
  title: '',
  status: 'backlog',
  rating: '',
  year: '',
  owned_format: '',
  external_source: null,
  external_id: null,
}

/**
 * The media collection. Admin-only, like everything under /admin.
 *
 * Both the API and the database sleep when idle — Render after fifteen minutes,
 * Neon after five — so a first load can wake two services. The slow message
 * exists so that reads as slow rather than broken.
 */
export default function AdminCollection() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [slow, setSlow] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  /**
   * Fetches the collection and returns what the UI should show.
   *
   * Deliberately returns rather than setting state, so the effect below can
   * apply the result in a promise continuation. Setting state synchronously
   * from an effect body is what react-hooks/set-state-in-effect forbids.
   */
  const fetchItems = useCallback(async () => {
    try {
      const response = await apiFetch('/api/items')
      if (response.status === 401) return { status: 'unauthorized', items: [] }
      if (!response.ok) return { status: 'error', items: [] }
      return { status: 'ready', items: await response.json() }
    } catch {
      return { status: 'error', items: [] }
    }
  }, [])

  const load = useCallback(async () => {
    const result = await fetchItems()
    setItems(result.items)
    setStatus(result.status)
  }, [fetchItems])

  useEffect(() => {
    // Both the API and the database sleep when idle, so a first load can wake
    // two services. Without this the page looks broken rather than slow.
    const timer = setTimeout(() => setSlow(true), 3000)

    fetchItems()
      .then((result) => {
        setItems(result.items)
        setStatus(result.status)
      })
      .finally(() => clearTimeout(timer))

    return () => clearTimeout(timer)
  }, [fetchItems])

  /**
   * Fills the form from a picked candidate, leaving the title editable.
   *
   * Only the four fields the picker actually returns are set here. Cover art,
   * creator, and the metadata snapshot come from the server after the item
   * exists, so the browser never assembles a snapshot it cannot verify.
   */
  function applyCandidate(candidate) {
    setForm((current) => ({
      ...current,
      title: candidate.title,
      year: candidate.year ?? '',
      external_source: candidate.external_source,
      external_id: candidate.external_id,
    }))
  }

  function clearLink() {
    setForm((current) => ({
      ...current,
      external_source: null,
      external_id: null,
    }))
  }

  async function addItem(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    const body = {
      ...form,
      title: form.title.trim(),
      rating: form.rating === '' ? null : Number(form.rating),
      year: form.year === '' ? null : Number(form.year),
      owned_format: form.owned_format === '' ? null : form.owned_format,
    }
    try {
      const response = await apiFetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        setError('Could not save that item.')
        return
      }
      // Enrichment is a second call on purpose: the snapshot, cover, and
      // creator are fetched server-side from the linked source rather than
      // trusted from the browser. A failure here leaves a perfectly good
      // item that is simply not enriched yet, so it is not an error.
      if (body.external_source && body.external_id) {
        const created = await response.json()
        await apiFetch(`/api/items/${created.id}/refresh-metadata`, {
          method: 'POST',
        }).catch(() => {})
      }
    } catch {
      setError('Could not reach the API.')
      return
    } finally {
      setSaving(false)
    }
    setForm(EMPTY_FORM)
    await load()
  }

  async function updateStatus(id, nextStatus) {
    setError(null)
    try {
      const response = await apiFetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) {
        setError('Could not update that item.')
        return
      }
    } catch {
      setError('Could not reach the API.')
      return
    }
    await load()
  }

  /**
   * Publishes or hides one item.
   *
   * Reloads rather than flipping the checkbox optimistically: showing a row
   * as public when the save failed is worse than showing it as private for
   * the length of a round trip.
   */
  async function updateVisibility(id, isPublic) {
    setError(null)
    try {
      const response = await apiFetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: isPublic }),
      })
      if (!response.ok) {
        setError('Could not change that item’s visibility.')
        return
      }
    } catch {
      setError('Could not reach the API.')
      return
    }
    await load()
  }

  /**
   * Publishes or hides the whole collection in one request.
   *
   * Publishing asks first. It is the most consequential action on this page —
   * it puts every private row on a public website, including any still
   * waiting to be corrected — and it would otherwise be less guarded than
   * deleting a single item, which does ask. Hiding is not gated: it only ever
   * removes things from public view.
   */
  async function setAllVisibility(isPublic) {
    if (
      isPublic &&
      !window.confirm(
        `Publish all ${items.length} items to the public collection page?`,
      )
    ) {
      return
    }

    setError(null)
    setBulkBusy(true)
    try {
      const response = await apiFetch('/api/items/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: isPublic }),
      })
      if (!response.ok) {
        setError('Could not change visibility.')
        return
      }
    } catch {
      setError('Could not reach the API.')
      return
    } finally {
      setBulkBusy(false)
    }
    await load()
  }

  async function removeItem(id) {
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
    await load()
  }

  const publicCount = items.filter((item) => item.is_public).length

  if (status === 'loading') {
    return (
      <section>
        <h1>Collection</h1>
        <p className="muted">{slow ? 'Waking the server…' : 'Loading…'}</p>
      </section>
    )
  }

  if (status === 'unauthorized') {
    return (
      <section>
        <h1>Collection</h1>
        <p className="admin-error">
          Not signed in. <Link to="/admin">Go to admin</Link>.
        </p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section>
        <h1>Collection</h1>
        <p className="admin-error">
          Could not reach the API. Try again shortly.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h1>Collection</h1>

      {error && <p className="admin-error">{error}</p>}

      <p className="muted">
        <Link to="/admin/import">Import from photos →</Link>
      </p>

      <MetadataPicker type={form.type} onSelect={applyCandidate} />

      <ItemForm
        value={form}
        onChange={setForm}
        onSubmit={addItem}
        busy={saving}
        linkedSource={form.external_source}
        onClearLink={clearLink}
      />

      {items.length === 0 ? (
        <p className="muted">Nothing in the collection yet.</p>
      ) : (
        <>
          {/* The counts are the point: publishing a whole collection should
              be a deliberate act, not an unlabelled button. */}
          <div className="bulk-visibility">
            <span className="muted">
              {publicCount} of {items.length} public
            </span>
            <button
              type="button"
              disabled={bulkBusy || publicCount === items.length}
              onClick={() => setAllVisibility(true)}
            >
              Publish all {items.length}
            </button>
            <button
              type="button"
              disabled={bulkBusy || publicCount === 0}
              onClick={() => setAllVisibility(false)}
            >
              Hide all
            </button>
          </div>

          <div className="item-table-wrap">
            <table className="item-table">
              <thead>
                <tr>
                  <th>
                    <span className="visually-hidden">Cover</span>
                  </th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Rating</th>
                  <th>Public</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="item-cover-cell">
                      <CoverImage src={item.cover_url} type={item.type} />
                    </td>
                    <td>{item.type}</td>
                    <td>
                      {/* The row links to the detail view: a wrong match is
                        fixed there, not here. */}
                      <Link to={`/admin/collection/${item.id}`}>
                        {item.title}
                      </Link>
                    </td>
                    <td>
                      <select
                        aria-label={`Status for ${item.title}`}
                        value={item.status}
                        onChange={(event) =>
                          updateStatus(item.id, event.target.value)
                        }
                      >
                        {STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{item.rating ?? '—'}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={item.is_public}
                        aria-label={`Public: ${item.title}`}
                        onChange={(event) =>
                          updateVisibility(item.id, event.target.checked)
                        }
                      />
                    </td>
                    <td>
                      <button type="button" onClick={() => removeItem(item.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
