import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import FilterChips from '../components/FilterChips.jsx'
import GarmentTable from '../components/GarmentTable.jsx'
import GarmentTile from '../components/GarmentTile.jsx'
import AddSection from '../components/intake/AddSection.jsx'
import {
  LOAD_ERROR,
  STILL_TAGGING,
  TAGGING_TIMEOUT,
  WAKING,
  taggingWait,
} from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import {
  CATEGORIES,
  DEFAULT_FILTER,
  MAX_ATTEMPTS,
  STATUSES,
  VIEW_PREF,
  chipCounts,
  countsLine,
  filterGarments,
  tagResult,
} from '../lib/closet.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'
import { useElapsed } from '../lib/useElapsed.js'
import { WaitTimeout, withDeadline } from '../lib/waits.js'

const SESSION_ENDED = 'Your session ended. Sign in again to see the closet.'

/** `GET /api/closet/garments`, returned rather than set. */
async function fetchCloset() {
  try {
    const response = await apiFetch('/api/closet/garments')
    if (response.ok) return { closet: await response.json() }
    return {
      error:
        response.status === 401 || response.status === 403
          ? SESSION_ENDED
          : LOAD_ERROR,
    }
  } catch {
    return { error: LOAD_ERROR }
  }
}

/** A piece the tag queue will still take: untagged, never saved by hand. */
function queued(garment) {
  return (
    garment.status === 'untagged' &&
    garment.tag_source == null &&
    garment.tag_attempts < MAX_ATTEMPTS
  )
}

/**
 * The Closet, at /admin/closet: every garment as a grid of 4:5 tiles or a
 * table with wear meters, filtered by status (Active by default), slot and
 * the Warm and Smart attributes. The add bar types a piece by hand, and its
 * ▤ Photos opens a clothes sitting straight at Shoot, where each photo is
 * an untagged garment at once (intake, AC 7). "N photos waiting · Tag now"
 * runs one batch of the tag queue; Show them, or arriving from a sitting
 * (`state.closetStatus`), shows the untagged pieces.
 *
 * The grid/list choice is kept per browser under `shelf.admin.closet.view`.
 */
export default function AdminCloset() {
  const context = useOutletContext() ?? {}
  const location = useLocation()
  const setClosetUntagged = context.setClosetUntagged
  const [closet, setCloset] = useState(null)
  const [error, setError] = useState(null)
  const [slow, setSlow] = useState(false)
  const [filter, setFilter] = useState(() =>
    location.state?.closetStatus === 'untagged'
      ? { ...DEFAULT_FILTER, status: 'untagged' }
      : DEFAULT_FILTER,
  )
  const [view, setView] = useState(() => {
    const stored = readShelfPref(VIEW_PREF, 'grid')
    return stored === 'list' ? 'list' : 'grid'
  })
  // {state: 'tagging', count} or {state: 'done', result, failed}, or null
  // before Tag now. `count` is how many queued photos the call was sent.
  const [tagging, setTagging] = useState(null)
  const elapsed = useElapsed(tagging?.state === 'tagging')
  // Aborts Tag now's wait on unmount, so nothing is set after it.
  const unmounted = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    unmounted.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => setSlow(true), 3000)
    fetchCloset().then((result) => {
      clearTimeout(timer)
      if (!live) return
      if (result.error) setError(result.error)
      else setCloset(result.closet)
    })
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [])

  // The area badge follows what this page last read.
  useEffect(() => {
    if (closet && setClosetUntagged) setClosetUntagged(closet.counts.untagged)
  }, [closet, setClosetUntagged])

  const garments = useMemo(() => closet?.garments ?? [], [closet])
  const counts = useMemo(() => chipCounts(garments), [garments])
  const waiting = useMemo(() => garments.filter(queued).length, [garments])
  const shown = useMemo(
    () => filterGarments(garments, filter),
    [garments, filter],
  )

  function changeView(next) {
    setView(next)
    writeShelfPref(VIEW_PREF, next)
  }

  async function reread() {
    const result = await fetchCloset()
    if (result.closet) setCloset(result.closet)
  }

  async function tagNow() {
    setTagging({ state: 'tagging', count: waiting })
    const stop = unmounted.current.signal
    let result
    let failed = false
    try {
      result = await withDeadline(
        async (signal) => {
          const response = await apiFetch('/api/closet/tag', {
            method: 'POST',
            signal,
          })
          if (response.status === 409) return 'tagging is already running'
          if (!response.ok) return await errorMessage(response)
          return tagResult(await response.json())
        },
        { signal: stop },
      )
    } catch (failure) {
      if (stop.aborted) return
      if (failure instanceof WaitTimeout) {
        result = TAGGING_TIMEOUT
        failed = true
      } else result = 'tagging did not start. Check your connection'
    }
    if (stop.aborted) return
    setTagging({ state: 'done', result, failed })
    const reply = await fetchCloset()
    if (reply.closet && !stop.aborted) setCloset(reply.closet)
  }

  const header = (
    <AdminPageHeader title="Closet" description={countsLine(closet?.counts)} />
  )

  if (!closet) {
    return (
      <section>
        {header}
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted" role="status">
            {slow ? WAKING : 'Loading…'}
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="closet">
      {header}
      <AddSection area="closet" onAdded={reread}>
        {(waiting > 0 || tagging) && (
          <div className="intake-waiting">
            <span role="status">
              {tagging?.state === 'tagging' ? (
                <>
                  {taggingWait(tagging.count)} · {elapsed} s
                  {elapsed >= 30 && <> {STILL_TAGGING}</>}
                </>
              ) : tagging?.state === 'done' ? (
                tagging.failed ? (
                  tagging.result
                ) : (
                  <>Tag now: {tagging.result}</>
                )
              ) : (
                <>
                  <b>
                    {waiting} {waiting === 1 ? 'photo' : 'photos'} waiting
                  </b>{' '}
                  for tags
                </>
              )}
            </span>
            <span className="intake-waiting-actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setFilter({ ...DEFAULT_FILTER, status: 'untagged' })
                }
              >
                Show them
              </button>
              {waiting > 0 && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={tagging?.state === 'tagging'}
                  onClick={tagNow}
                >
                  Tag now
                </button>
              )}
            </span>
          </div>
        )}
        <div className="closet-toolbar">
          <FilterChips
            groups={[
              {
                key: 'status',
                label: 'Status',
                options: STATUSES.map((s) => ({
                  ...s,
                  count: counts.status[s.value],
                })),
              },
              {
                key: 'category',
                label: 'Slot',
                options: CATEGORIES.map((c) => ({
                  value: c.value,
                  label: c.plural,
                  count: counts.category[c.value],
                })),
              },
            ]}
            toggles={[
              { key: 'warm', label: 'Warm', count: counts.warm },
              { key: 'smart', label: 'Smart', count: counts.smart },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <div className="closet-toolbar-end">
            <div className="chip-row" role="group" aria-label="View">
              {[
                ['grid', 'Grid'],
                ['list', 'List'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  aria-pressed={view === value}
                  onClick={() => changeView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}

        {garments.length === 0 ? (
          <p className="muted">
            Nothing here yet. ▤ Photos adds pieces, one per photo.
          </p>
        ) : shown.length === 0 ? (
          <p className="muted">Nothing matches these chips.</p>
        ) : view === 'list' ? (
          <GarmentTable garments={shown} />
        ) : (
          <ul className="garment-grid">
            {shown.map((garment) => (
              <li key={garment.id}>
                <GarmentTile garment={garment} />
              </li>
            ))}
          </ul>
        )}
      </AddSection>
    </section>
  )
}
