import { useEffect, useMemo, useRef, useState } from 'react'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import LoadState from '../components/LoadState.jsx'
import SectionCard from '../components/SectionCard.jsx'
import {
  box,
  btn,
  checkbox,
  field,
  pill,
} from '../components/denverSiteClasses.js'
import SpotFinder from '../components/SpotFinder.jsx'
import SpotForm from '../components/SpotForm.jsx'
import { denver, tagLabel } from '../content/denver.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { formatDate } from '../lib/formatDate.js'
import { localToday } from '../lib/statusMoves.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { READ_DEADLINE_MS, withDeadline } from '../lib/waits.js'
import { adminCopy } from '../content/adminCopy.js'

/** The admin shell's phone breakpoint; the Last visit column drops below it. */
const PHONE = '(max-width: 700px)'

/** The table: cells read as rows, the header as small caps. The wrapper
 *  around it scrolls, so a wide row never widens the page. */
const TABLE =
  'spots-table w-full border-collapse text-sm [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-left [&_td]:align-top [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:tracking-wider [&_thead_th]:text-(color:--text-3) [&_thead_th]:uppercase [&_tbody_th]:font-medium'

/** A refused read or write in words: a 401 or 403 means sign in again. */
async function failureText(response) {
  return response.status === 401 || response.status === 403
    ? denver.admin.sessionEnded
    : errorMessage(response)
}

/** Every spot, returned rather than set: `{spots}` or `{error}`. */
async function fetchSpots() {
  try {
    // The deadline covers the body too.
    const answer = await withDeadline(
      async (signal) => {
        const response = await apiFetch('/api/spots', { signal })
        return response.ok
          ? { spots: await response.json() }
          : { status: response.status }
      },
      { ms: READ_DEADLINE_MS },
    )
    if (answer.spots) return answer
    if (answer.status === 401 || answer.status === 403) return { ended: true }
    return { error: denver.admin.readError }
  } catch {
    return { error: denver.admin.readError }
  }
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
  // The first read's failure, apart from the writes' messages above it.
  const [readError, setReadError] = useState(null)
  // The read was refused for the session: nothing to retry.
  const [readEnded, setReadEnded] = useState(false)
  const [attempt, setAttempt] = useState(0)
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
    fetchSpots().then((result) => {
      if (!live) return
      if (result.ended) setReadEnded(true)
      else if (result.error) setReadError(result.error)
      else setSpots(result.spots)
    })
    return () => {
      live = false
    }
  }, [attempt])

  // After Accept: the new spot comes from the server, slug and all.
  async function rereadSpots() {
    const result = await fetchSpots()
    if (result.spots) setSpots(result.spots)
  }

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
          className={btn('primary')}
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
        <div className={`${box} mb-5 p-4`}>
          <SpotForm
            key={editing === 'new' ? 'new' : editing.id}
            spot={editing === 'new' ? null : editing}
            onSaved={saved}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="finder-layout">
        <SpotFinder
          onAccepted={rereadSpots}
          onRestored={(id) =>
            setSpots((current) =>
              (current ?? []).filter((spot) => spot.id !== id),
            )
          }
        />
        <div className="finder-table min-w-0">
          {spots === null && (
            <LoadState
              loading={!readError && !readEnded}
              failed={!!readError}
              ended={readEnded}
              message={readError ?? undefined}
              onRetry={() => {
                setReadError(null)
                setAttempt((n) => n + 1)
              }}
            />
          )}

          {spots !== null && (
            <SectionCard
              title={denver.admin.panelTitle}
              action={
                <p className="spots-counts m-0 flex gap-2">
                  <span className={pill}>Public {publicCount}</span>
                  <span className={pill}>
                    Private {spots.length - publicCount}
                  </span>
                </p>
              }
            >
              <div className="spots-toolbar mb-4 flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  className={`${field} max-w-sm`}
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
                <div className="relative overflow-x-auto scroll-px-4">
                  <table className={TABLE}>
                    <thead>
                      <tr>
                        <th scope="col">{adminCopy.spots.spot}</th>
                        <th scope="col">{adminCopy.spots.tags}</th>
                        {!phone && (
                          <th scope="col">{adminCopy.spots.lastVisit}</th>
                        )}
                        <th scope="col">{adminCopy.spots.isPublic}</th>
                        <th scope="col">
                          <span className="visually-hidden">
                            {adminCopy.spots.actions}
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((spot) => (
                        <tr key={spot.id}>
                          <th scope="row" className="spots-name">
                            <span className="mr-2 break-words">
                              {spot.name}
                            </span>
                            {spot.anchor && (
                              <span className={pill}>
                                {adminCopy.spots.anchor}
                              </span>
                            )}
                            {spot.neighbourhood && (
                              <span className="spots-hood block text-[0.8125rem] font-normal text-(color:--text-3)">
                                {spot.neighbourhood}
                              </span>
                            )}
                          </th>
                          <td>
                            <ul className="spots-tags m-0 flex list-none flex-wrap gap-x-2 gap-y-1 p-0">
                              {spot.tags.map((tag) => (
                                <li key={tag} className={pill}>
                                  {tagLabel(tag)}
                                </li>
                              ))}
                            </ul>
                          </td>
                          {!phone && (
                            <td className="spots-visit text-[0.8125rem] whitespace-nowrap text-muted-foreground">
                              {spot.last_visit
                                ? formatDate(spot.last_visit)
                                : '—'}
                              {spot.visit_count > 1 && (
                                <span className="spots-hood block text-[0.8125rem] font-normal text-(color:--text-3)">
                                  {spot.visit_count} visits
                                </span>
                              )}
                            </td>
                          )}
                          <td>
                            <input
                              type="checkbox"
                              className={checkbox}
                              checked={spot.is_public}
                              disabled={busy.has(spot.id)}
                              onChange={() => togglePublic(spot)}
                              aria-label={`Public: ${spot.name}`}
                            />
                          </td>
                          <td className="spots-actions">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={btn('plain', 'sm')}
                                onClick={(event) => openForm(event, spot)}
                                aria-label={`Edit ${spot.name}`}
                              >
                                {adminCopy.spots.edit}
                              </button>
                              <button
                                type="button"
                                className={btn('plain', 'sm')}
                                onClick={() => logVisit(spot)}
                                disabled={busy.has(spot.id)}
                                aria-label={`Log a visit to ${spot.name}`}
                              >
                                {adminCopy.spots.logVisit}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}
