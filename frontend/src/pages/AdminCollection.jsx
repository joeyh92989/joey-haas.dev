import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiFetch } from '../lib/api.js'

const TYPES = ['game', 'movie', 'comic', 'boardgame']
const STATUSES = ['backlog', 'active', 'finished', 'abandoned']

const EMPTY_FORM = { type: 'game', title: '', status: 'backlog', rating: '' }

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

  async function addItem(event) {
    event.preventDefault()
    setError(null)
    const body = {
      ...form,
      title: form.title.trim(),
      rating: form.rating === '' ? null : Number(form.rating),
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
    } catch {
      setError('Could not reach the API.')
      return
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

  if (status === 'loading') {
    return (
      <section>
        <h2>Collection</h2>
        <p className="muted">{slow ? 'Waking the server…' : 'Loading…'}</p>
      </section>
    )
  }

  if (status === 'unauthorized') {
    return (
      <section>
        <h2>Collection</h2>
        <p className="admin-error">
          Not signed in. <Link to="/admin">Go to admin</Link>.
        </p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section>
        <h2>Collection</h2>
        <p className="admin-error">
          Could not reach the API. Try again shortly.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h2>Collection</h2>

      {error && <p className="admin-error">{error}</p>}

      <form className="item-form" onSubmit={addItem}>
        <select
          aria-label="Type"
          value={form.type}
          onChange={(event) => setForm({ ...form, type: event.target.value })}
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          aria-label="Title"
          placeholder="Title"
          required
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <select
          aria-label="Status"
          value={form.status}
          onChange={(event) => setForm({ ...form, status: event.target.value })}
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          aria-label="Rating"
          type="number"
          min="1"
          max="10"
          placeholder="Rating"
          value={form.rating}
          onChange={(event) => setForm({ ...form, rating: event.target.value })}
        />
        <button type="submit">Add</button>
      </form>

      {items.length === 0 ? (
        <p className="muted">Nothing in the collection yet.</p>
      ) : (
        <div className="item-table-wrap">
          <table className="item-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Status</th>
                <th>Rating</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.type}</td>
                  <td>{item.title}</td>
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
                    <button type="button" onClick={() => removeItem(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
