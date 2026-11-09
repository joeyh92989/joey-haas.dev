import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import FilterChips from '../components/FilterChips.jsx'
import GarmentTable from '../components/GarmentTable.jsx'
import GarmentTile from '../components/GarmentTile.jsx'
import UploadToast from '../components/UploadToast.jsx'
import { LOAD_ERROR, WAKING } from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import {
  CATEGORIES,
  DEFAULT_FILTER,
  MAX_UPLOAD_PHOTOS,
  STATUSES,
  VIEW_PREF,
  chipCounts,
  countsLine,
  filterGarments,
  tagResult,
} from '../lib/closet.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'

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

/**
 * The Closet, at /admin/closet: every garment as a grid of 4:5 tiles or a
 * table with wear meters, filtered by status (Active by default), slot and
 * the Warm and Smart attributes. ＋ Camera uploads a rack of photos at
 * once, each an untagged garment with its thumbnail straight away; the
 * toast offers Tag now, one batch of the queue.
 *
 * The grid/list choice is kept per browser under `shelf.admin.closet.view`.
 */
export default function AdminCloset() {
  const context = useOutletContext() ?? {}
  const setClosetUntagged = context.setClosetUntagged
  const [closet, setCloset] = useState(null)
  const [error, setError] = useState(null)
  const [slow, setSlow] = useState(false)
  const [filter, setFilter] = useState(DEFAULT_FILTER)
  const [view, setView] = useState(() => {
    const stored = readShelfPref(VIEW_PREF, 'grid')
    return stored === 'list' ? 'list' : 'grid'
  })
  const [uploading, setUploading] = useState(false)
  // {added, state: 'idle'|'tagging'|'done', result}, or null for no toast.
  const [toast, setToast] = useState(null)

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

  async function upload(event) {
    const input = event.target
    const files = [...input.files]
    // Cleared at once, so the same photos can be picked again after a refusal.
    input.value = ''
    if (files.length === 0) return
    if (files.length > MAX_UPLOAD_PHOTOS) {
      setError(
        `Upload at most ${MAX_UPLOAD_PHOTOS} photos at a time; ${files.length} were picked.`,
      )
      return
    }
    const body = new FormData()
    for (const file of files) body.append('photos', file)
    setUploading(true)
    setError(null)
    setToast(null)
    try {
      const response = await apiFetch('/api/closet/garments/photos', {
        method: 'POST',
        body,
      })
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      const result = await response.json()
      setToast({ added: result.added, state: 'idle', result: null })
      // Newest first, as the list route orders them.
      setFilter((current) => ({ ...current, status: 'untagged' }))
      await reread()
    } catch {
      setError('The photos did not upload. Check your connection.')
    } finally {
      setUploading(false)
    }
  }

  async function tagNow() {
    setToast((current) => ({ ...current, state: 'tagging' }))
    let result
    try {
      const response = await apiFetch('/api/closet/tag', { method: 'POST' })
      if (response.status === 409) result = 'tagging is already running'
      else if (!response.ok) result = await errorMessage(response)
      else result = tagResult(await response.json())
    } catch {
      result = 'tagging did not start. Check your connection'
    }
    setToast((current) => ({ ...current, state: 'done', result }))
    await reread()
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
          <label className="btn primary closet-camera" data-busy={uploading}>
            <input
              type="file"
              accept="image/*"
              multiple
              aria-label="Add garment photos"
              className="visually-hidden"
              disabled={uploading}
              onChange={upload}
            />
            {uploading ? 'Uploading…' : '＋ Camera'}
          </label>
        </div>
      </div>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {toast && (
        <UploadToast
          added={toast.added}
          state={toast.state}
          result={toast.result}
          onTagNow={tagNow}
          onDismiss={() => setToast(null)}
        />
      )}

      {garments.length === 0 ? (
        <p className="muted">
          Nothing here yet. ＋ Camera adds a rack of photos at once.
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
    </section>
  )
}
