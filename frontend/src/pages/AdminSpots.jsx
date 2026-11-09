import { useEffect, useMemo, useRef, useState } from 'react'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import Panel from '../components/Panel.jsx'
import SpotForm from '../components/SpotForm.jsx'
import { denver, tagLabel } from '../content/denver.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { formatDate } from '../lib/formatDate.js'
import { localToday } from '../lib/statusMoves.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'

/** The admin shell's phone breakpoint; the Last visit column drops below it. */
const PHONE = '(max-width: 700px)'

/** A refused read or write in words: a 401 or 403 means sign in again. */
async function failureText(response) {
  return response.status === 401 || response.status === 403
    ? denver.admin.sessionEnded
    : errorMessage(response)
}

/** Whether a spot matches the search: its name, neighbourhood or a tag. */
function matches(spot, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    spot.name,
    spot.neighbourhood ?? '',
    ...spot.tags,
    ...spot.tags.map(tagLabel),
  ].some((text) => text.toLowerCase().includes(q))
}

/**
 * The owner's Denver spots, at /admin/spots: one table of every spot with
 * its tags, last visit and public switch; Add by hand and Edit open the
 * spot form above it, and Log a visit records today (the owner's local
 * day). Anchors are spots too, marked in the name column.
 */
export default function AdminSpots() {
  const phone = useMediaQuery(PHONE)
  const [spots, setSpots] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  // null: no form; 'new': adding; a spot: editing it.
  const [editing, setEditing] = useState(null)
  // The ids of the rows with a write in flight; each row waits on its own.
  const [busy, setBusy] = useState(() => new Set())
  // The button that opened the form, given focus back when it closes.
  const opener = useRef(null)

  useEffect(() => {
    let live = true
    apiFetch('/api/spots')
      .then(async (response) => {
        if (!response.ok) throw response
        const body = await response.json()
        if (live) setSpots(body)
      })
      .catch((failure) => {
        if (!live) return
        setError(
          failure?.status === 401 || failure?.status === 403
            ? denver.admin.sessionEnded
            : denver.admin.readError,
        )
      })
    return () => {
      live = false
    }
  }, [])

  const shown = useMemo(
    () => (spots ?? []).filter((spot) => matches(spot, query)),
    [spots, query],
  )
  const publicCount = (spots ?? []).filter((spot) => spot.is_public).length

  function replace(saved) {
    setSpots((current) => {
      const rest = (current ?? []).filter((spot) => spot.id !== saved.id)
      return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  useEffect(() => {
    if (editing !== null || !opener.current) return
    // After the render that closed the form, so Add by hand is enabled
    // again; a row filtered out since has nothing to return to.
    if (opener.current.isConnected) opener.current.focus()
    opener.current = null
  }, [editing])

  function openForm(event, target) {
    opener.current = event.currentTarget
    setNotice(null)
    setEditing(target)
  }

  function saved(spot) {
    replace(spot)
    setEditing(null)
    setNotice(`Saved ${spot.name}.`)
  }

  function markBusy(id, on) {
    setBusy((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function act(spot, request, onOk) {
    markBusy(spot.id, true)
    setError(null)
    setNotice(null)
    try {
      const response = await request()
      if (!response.ok) {
        setError(await failureText(response))
        return
      }
      await onOk(response)
    } catch {
      setError('That didn’t go through. Check your connection.')
    } finally {
      markBusy(spot.id, false)
    }
  }

  function togglePublic(spot) {
    act(
      spot,
      () =>
        apiFetch(`/api/spots/${spot.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_public: !spot.is_public }),
        }),
      async (response) => replace(await response.json()),
    )
  }

  function logVisit(spot) {
    const today = localToday()
    act(
      spot,
      () =>
        apiFetch(`/api/spots/${spot.id}/visits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visited_on: today }),
        }),
      async () => {
        // From the row as it is now, not as it was when clicked: a publish
        // that landed meanwhile stays.
        setSpots((current) =>
          (current ?? []).map((row) =>
            row.id === spot.id
              ? {
                  ...row,
                  last_visit:
                    row.last_visit && row.last_visit > today
                      ? row.last_visit
                      : today,
                  visit_count: row.visit_count + 1,
                }
              : row,
          ),
        )
        setNotice(`Logged a visit to ${spot.name} today.`)
      },
    )
  }

  return (
    <div className="admin-spots">
      <AdminPageHeader
        title={denver.admin.title}
        description={denver.admin.description}
      >
        <button
          type="button"
          className="btn primary"
          onClick={(event) => openForm(event, 'new')}
          disabled={editing === 'new'}
        >
          {denver.admin.add}
        </button>
      </AdminPageHeader>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      <p className="spots-notice" role="status" aria-live="polite">
        {notice}
      </p>

      {editing && (
        <div className="spot-form-wrap">
          <SpotForm
            key={editing === 'new' ? 'new' : editing.id}
            spot={editing === 'new' ? null : editing}
            onSaved={saved}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {spots === null && !error && <p>Loading spots…</p>}

      {spots !== null && (
        <Panel
          title={denver.admin.panelTitle}
          action={
            <p className="spots-counts">
              <span className="spots-pill">Public {publicCount}</span>
              <span className="spots-pill">
                Private {spots.length - publicCount}
              </span>
            </p>
          }
        >
          <div className="spots-toolbar">
            <input
              type="search"
              className="spots-search"
              aria-label={denver.admin.search}
              placeholder={denver.admin.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {spots.length === 0 && <p>{denver.admin.empty}</p>}
          {spots.length > 0 && shown.length === 0 && (
            <p>{denver.admin.noMatch}</p>
          )}
          {shown.length > 0 && (
            <div className="item-table-wrap">
              <table className="item-table spots-table">
                <thead>
                  <tr>
                    <th scope="col">Spot</th>
                    <th scope="col">Tags</th>
                    {!phone && <th scope="col">Last visit</th>}
                    <th scope="col">Public</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((spot) => (
                    <tr key={spot.id}>
                      <th scope="row" className="spots-name">
                        <span>{spot.name}</span>
                        {spot.anchor && (
                          <span className="spots-anchor">Anchor</span>
                        )}
                        {spot.neighbourhood && (
                          <span className="spots-hood">
                            {spot.neighbourhood}
                          </span>
                        )}
                      </th>
                      <td>
                        <ul className="spots-tags">
                          {spot.tags.map((tag) => (
                            <li key={tag}>{tagLabel(tag)}</li>
                          ))}
                        </ul>
                      </td>
                      {!phone && (
                        <td className="spots-visit">
                          {spot.last_visit ? formatDate(spot.last_visit) : '—'}
                          {spot.visit_count > 1 && (
                            <span className="spots-hood">
                              {spot.visit_count} visits
                            </span>
                          )}
                        </td>
                      )}
                      <td>
                        <input
                          type="checkbox"
                          checked={spot.is_public}
                          disabled={busy.has(spot.id)}
                          onChange={() => togglePublic(spot)}
                          aria-label={`Public: ${spot.name}`}
                        />
                      </td>
                      <td className="spots-actions">
                        <button
                          type="button"
                          onClick={(event) => openForm(event, spot)}
                          aria-label={`Edit ${spot.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => logVisit(spot)}
                          disabled={busy.has(spot.id)}
                          aria-label={`Log a visit to ${spot.name}`}
                        >
                          Log visit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
