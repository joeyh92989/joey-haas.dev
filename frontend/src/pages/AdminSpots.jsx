import { useEffect, useMemo, useRef, useState } from 'react'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import LoadState from '../components/LoadState.jsx'
import Panel from '../components/Panel.jsx'
import SpotFinder from '../components/SpotFinder.jsx'
import SpotForm from '../components/SpotForm.jsx'
import SpotsAddBar from '../components/places/SpotsAddBar.jsx'
import { denver, tagLabel } from '../content/denver.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import {
  HOME_CITY,
  cityCounts,
  spotCity,
  cityLabel,
  citiesFrom,
} from '../lib/cities.js'
import { spotState, stateCounts } from '../lib/spotState.js'
import { formatDate } from '../lib/formatDate.js'
import { localToday } from '../lib/statusMoves.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { READ_DEADLINE_MS, withDeadline } from '../lib/waits.js'
import { adminCopy } from '../content/adminCopy.js'

/** The admin shell's phone breakpoint; the Last visit column drops below it. */
const PHONE = '(max-width: 700px)'

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
  // The City filter's choice: a city key, or '' for all cities. Page state.
  const [cityPick, setCityPick] = useState('')
  // The Show filter's choice: 'want', 'been', or '' for all places. Page state.
  const [statePick, setStatePick] = useState('')
  // null: no form; 'new': adding; a spot: editing it.
  const [editing, setEditing] = useState(null)
  // The ids of the rows with a write in flight; each row waits on its own.
  const [busy, setBusy] = useState(() => new Set())
  // The button that opened the form, given focus back when it closes.
  const opener = useRef(null)
  // The spot the add bar saved last wears the "New" pill (newId); the row a
  // save or "Show in table" points at is tinted (markedId). Both are client
  // state: a search, a by-hand save or the next bar save moves or clears them.
  const [newId, setNewId] = useState(null)
  const [markedId, setMarkedId] = useState(null)
  // The words the bar carried to Add by hand, for the form's Name field.
  const [handName, setHandName] = useState('')
  // The bar saved a place but the table could not be re-read.
  const [refreshFailed, setRefreshFailed] = useState(false)
  // Bumped by every per-row write result applied to the list, so a re-read
  // that began before one is not allowed to overwrite it.
  const writeSeq = useRef(0)
  const formWrap = useRef(null)
  // A "Show in table" waiting for its row to be on the page.
  const pendingShow = useRef(null)
  const [showTick, setShowTick] = useState(0)

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
  // Resolves true when the list was refreshed. A read that began before a
  // row write landed is dropped and run once more, so the older answer
  // cannot undo the newer write; a second stale read counts as a failure.
  async function rereadSpots() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const start = writeSeq.current
      const result = await fetchSpots()
      if (!result.spots) return false
      if (writeSeq.current === start) {
        setSpots(result.spots)
        return true
      }
    }
    return false
  }

  const counts = useMemo(() => cityCounts(spots), [spots])
  // The filter shows only when the spots hold more than one city, and a pick
  // whose city has left the list (its last spot moved) counts as All cities.
  const manyCities = counts.length > 1
  const cityFilter =
    manyCities && counts.some((c) => c.city === cityPick) ? cityPick : ''
  // The rows the text and City filters let through; the Show counts are
  // taken here, so they always equal the rows under any combination.
  const afterTextCity = useMemo(
    () =>
      (spots ?? []).filter(
        (spot) =>
          matches(spot, query) &&
          (!cityFilter || spotCity(spot) === cityFilter),
      ),
    [spots, query, cityFilter],
  )
  const states = useMemo(() => stateCounts(afterTextCity), [afterTextCity])
  // Shown while the catalogue holds at least one place that is not an anchor.
  const hasStates = useMemo(
    () => (spots ?? []).some((spot) => spotState(spot) !== null),
    [spots],
  )
  const shown = useMemo(
    () =>
      statePick
        ? afterTextCity.filter((spot) => spotState(spot) === statePick)
        : afterTextCity,
    [afterTextCity, statePick],
  )
  // The cities already on saved spots, offered beside Denver; the bar's
  // short fixed list stands until a spot outside Denver exists.
  const cityKeys = useMemo(() => citiesFrom(spots), [spots])
  const cities = cityKeys.length ? cityKeys : undefined
  const publicCount = (spots ?? []).filter((spot) => spot.is_public).length

  // A city line under the name: every city but Denver, and Denver too while
  // the table lists all cities of a catalogue with more than one.
  function showCity(spot) {
    const city = spotCity(spot)
    return city !== HOME_CITY || (manyCities && !cityFilter)
  }

  function replace(saved) {
    writeSeq.current += 1
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

  // Scroll to and focus the row "Show in table" asked for, once per request:
  // keyed on the request only, so a later change to the filter never moves
  // focus. A row that is not drawn is dropped, not kept waiting.
  useEffect(() => {
    const id = pendingShow.current
    if (!id) return
    pendingShow.current = null
    const row = document.getElementById(`spot-${id}`)
    if (!row) return
    row.scrollIntoView?.({ block: 'center' })
    row.focus()
  }, [showTick])

  async function showInTable(id) {
    let list = spots ?? []
    if (!list.some((spot) => spot.id === id)) {
      // Not in the list yet: read once, and show nothing if still absent.
      const result = await fetchSpots()
      if (!result.spots) return
      setSpots(result.spots)
      list = result.spots
    }
    const row = list.find((spot) => spot.id === id)
    if (!row) return
    // A row any filter hides clears all three.
    if (
      !matches(row, query) ||
      (cityFilter && spotCity(row) !== cityFilter) ||
      (statePick && spotState(row) !== statePick)
    ) {
      setQuery('')
      setCityPick('')
      setStatePick('')
    }
    setMarkedId(id)
    pendingShow.current = id
    setShowTick((n) => n + 1)
  }

  async function addedByBar({ id }) {
    setNotice(null)
    setError(null)
    setNewId(id)
    setMarkedId(id)
    const ok = await rereadSpots()
    setRefreshFailed(!ok)
  }

  async function retryRefresh() {
    const ok = await rereadSpots()
    setRefreshFailed(!ok)
  }

  // Add by hand from the bar: never replaces a form that is open (an edit or
  // a half-filled new spot); it moves focus there instead. A form it opens
  // gives focus back to the bar's name box when it closes.
  function addByHand(typedName, focusBar) {
    if (editing !== null) {
      formWrap.current?.querySelector('.spot-form-title')?.focus()
      return
    }
    opener.current = focusBar ? { isConnected: true, focus: focusBar } : null
    setNotice(null)
    setHandName(typedName ?? '')
    setEditing('new')
  }

  function openForm(event, target) {
    opener.current = event.currentTarget
    setHandName('')
    setNotice(null)
    setEditing(target)
  }

  function saved(spot) {
    if (editing === 'new') {
      setNewId(null)
      setMarkedId(null)
    }
    replace(spot)
    // A city the active filter hides would make the saved row vanish.
    if (cityFilter && spotCity(spot) !== cityFilter) setCityPick('')
    if (statePick && spotState(spot) !== statePick) setStatePick('')
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
        writeSeq.current += 1
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
          className="btn"
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
      {refreshFailed && (
        <p className="admin-error" role="alert">
          {denver.admin.savedNotRefreshed}{' '}
          <button type="button" className="btn" onClick={retryRefresh}>
            {denver.admin.refreshRetry}
          </button>
        </p>
      )}
      <p className="spots-notice" role="status" aria-live="polite">
        {notice}
      </p>

      {editing && (
        <div className="spot-form-wrap" ref={formWrap}>
          <SpotForm
            key={editing === 'new' ? `new:${handName}` : editing.id}
            spot={editing === 'new' ? null : editing}
            initialName={editing === 'new' ? handName : undefined}
            cities={cityKeys}
            onSaved={saved}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <SpotsAddBar
        onSaved={addedByBar}
        onAddByHand={addByHand}
        onShowInTable={showInTable}
        cities={cities}
        onSearchStart={() => {
          setNewId(null)
          setMarkedId(null)
        }}
      />

      <div className="finder-layout">
        <SpotFinder
          onAccepted={rereadSpots}
          onRestored={(id) => {
            writeSeq.current += 1
            setSpots((current) =>
              (current ?? []).filter((spot) => spot.id !== id),
            )
          }}
        />
        <div className="finder-table">
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
                {manyCities && (
                  <label className="spots-city-filter">
                    <span>{denver.admin.cityFilter}</span>
                    <select
                      value={cityFilter}
                      onChange={(event) => setCityPick(event.target.value)}
                    >
                      <option value="">{denver.admin.allCities}</option>
                      {counts.map(({ city, count }) => (
                        <option key={city} value={city}>
                          {denver.admin.cityOption(cityLabel(city), count)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {hasStates && (
                  <label className="spots-city-filter">
                    <span>{denver.admin.stateFilter}</span>
                    <select
                      value={statePick}
                      onChange={(event) => setStatePick(event.target.value)}
                    >
                      <option value="">{denver.admin.allPlaces}</option>
                      <option value="want">
                        {denver.admin.stateOption(
                          denver.admin.want,
                          states.want,
                        )}
                      </option>
                      <option value="been">
                        {denver.admin.stateOption(
                          denver.admin.been,
                          states.been,
                        )}
                      </option>
                    </select>
                  </label>
                )}
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
                        <tr
                          key={spot.id}
                          id={`spot-${spot.id}`}
                          tabIndex={-1}
                          className={
                            spot.id === markedId ? 'is-marked' : undefined
                          }
                        >
                          <th scope="row" className="spots-name">
                            {spot.id === newId && (
                              <span className="spots-new">
                                {denver.admin.newMark}
                              </span>
                            )}
                            <span className="spots-name-text">{spot.name}</span>
                            {spot.anchor && (
                              <span className="spots-anchor">
                                {adminCopy.spots.anchor}
                              </span>
                            )}
                            {spot.neighbourhood && (
                              <span className="spots-hood">
                                {spot.neighbourhood}
                              </span>
                            )}
                            {showCity(spot) && (
                              <span className="spots-city">
                                {cityLabel(spotCity(spot))}
                              </span>
                            )}
                            {spotState(spot) && (
                              <span className="spots-state">
                                {spotState(spot) === 'want'
                                  ? denver.admin.want
                                  : spot.last_visit
                                    ? denver.admin.beenOn(
                                        formatDate(spot.last_visit),
                                      )
                                    : denver.admin.been}
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
                              {spot.last_visit
                                ? formatDate(spot.last_visit)
                                : '—'}
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
                              disabled={
                                busy.has(spot.id) ||
                                (!spot.is_public &&
                                  spotCity(spot) !== HOME_CITY)
                              }
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
                              {adminCopy.spots.edit}
                            </button>
                            <button
                              type="button"
                              onClick={() => logVisit(spot)}
                              disabled={busy.has(spot.id)}
                              aria-label={`Log a visit to ${spot.name}`}
                            >
                              {adminCopy.spots.logVisit}
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
      </div>
    </div>
  )
}
