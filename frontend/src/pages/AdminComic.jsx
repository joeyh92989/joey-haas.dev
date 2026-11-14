import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import Breadcrumb from '../components/Breadcrumb.jsx'
import CoverImage from '../components/CoverImage.jsx'
import CoverWall from '../components/CoverWall.jsx'
import { EditionRows } from '../components/ItemForm.jsx'
import MetadataPicker from '../components/MetadataPicker.jsx'
import Panel from '../components/Panel.jsx'
import ShelfConfirm from '../components/ShelfConfirm.jsx'
import { spine } from '../content/spine.js'
import { ACTION_ERROR, LOAD_ERROR, WAKING } from '../content/status.js'
import { apiFetch } from '../lib/api.js'
import { restoreSeries, setMark, toggleSkip } from '../lib/comicEdits.js'
import {
  comicErrorField,
  editionRows,
  expandRanges,
  parseEditionRows,
} from '../lib/comics.js'
import { itemPath } from '../lib/spinePaths.js'
import { setStatus as postStatus, statusMoves } from '../lib/statusMoves.js'
import { adminListPath } from '../lib/shelf.js'

const COPY = spine.comics.admin
const COMIC_VINE = 'https://comicvine.gamespot.com/'

/** The stored row as form state: nulls become empty strings. */
function toForm(item) {
  return {
    title: item.title ?? '',
    rating: item.rating ?? '',
    favorite: Boolean(item.favorite),
    following: Boolean(item.following),
    is_public: Boolean(item.is_public),
    notes: item.notes ?? '',
  }
}

/** Form state as the API wants it. */
function toPayload(form) {
  return {
    title: form.title.trim(),
    rating: form.rating === '' ? null : Number(form.rating),
    favorite: form.favorite,
    following: form.following,
    is_public: form.is_public,
    notes: form.notes === '' ? null : form.notes,
  }
}

/** Only what changed, so Save sends nothing the page did not touch. */
function changedFields(item, form) {
  const before = toPayload(toForm(item))
  const after = toPayload(form)
  return Object.fromEntries(
    Object.keys(after)
      .filter((key) => before[key] !== after[key])
      .map((key) => [key, after[key]]),
  )
}

/** A refusal's own words when the API gave them. */
async function detailOf(response) {
  return response
    .json()
    .then((payload) =>
      typeof payload?.detail === 'string' ? payload.detail : null,
    )
    .catch(() => null)
}

/**
 * The comic edit page, `/admin/shelf/comics/:id`: the admin twin of the
 * public series page. Series fields, the issues as the same cover wall (a
 * tap marks a book), editions, the Comic Vine match and Delete. Owned and
 * read are never typed here: the covers are the one place they are edited.
 *
 * Remounted per id (see App.jsx), so one comic's form never carries to
 * another.
 */
export default function AdminComic() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [item, setItem] = useState(null)
  const [form, setForm] = useState(null)
  const [rows, setRows] = useState([])
  const [wall, setWall] = useState(null)
  const [state, setState] = useState('loading')
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [runBusy, setRunBusy] = useState(false)
  const [editionError, setEditionError] = useState(null)
  const [savingEditions, setSavingEditions] = useState(false)
  const [editionsSaved, setEditionsSaved] = useState(false)
  const [relinking, setRelinking] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [addNumber, setAddNumber] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)

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

  const fetchWall = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/comics/${id}/wall`)
      return response.ok ? await response.json() : null
    } catch {
      return null
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => setSlow(true), 3000)
    Promise.all([fetchItem(), fetchWall()])
      .then(([result, built]) => {
        if (cancelled) return
        setItem(result.item)
        setForm(result.item ? toForm(result.item) : null)
        setRows(result.item ? editionRows(result.item.editions) : [])
        setWall(built)
        setState(result.state)
      })
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [fetchItem, fetchWall])

  /** The stored row and the wall again, after a write that changes both. */
  const reread = useCallback(async () => {
    const [result, built] = await Promise.all([fetchItem(), fetchWall()])
    if (result.item) setItem(result.item)
    if (built) setWall(built)
  }, [fetchItem, fetchWall])

  /** One tap on a cover: the mark route, then everything it changes. */
  const markIssue = useCallback(
    async (n, next, undo = {}) => {
      const result = await setMark(id, n, next)
      if (undo.skip) await toggleSkip(id, n)
      if (undo.restore) await restoreSeries(id, undo.restore)
      await reread()
      return result
    },
    [id, reread],
  )

  /** Owns an issue by number: one Comic Vine does not list, or a series with no match. */
  async function addIssue(event) {
    event.preventDefault()
    setAddError(null)
    const n = Number(addNumber)
    if (!Number.isInteger(n) || n < 1 || n > 9999) {
      setAddError(COPY.addRange)
      return
    }
    setAdding(true)
    try {
      await markIssue(n, 'owned')
      setAddNumber('')
    } catch (failure) {
      setAddError(failure?.message || ACTION_ERROR)
    } finally {
      setAdding(false)
    }
  }

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
        const detail =
          response.status === 409 || response.status === 422
            ? await detailOf(response)
            : null
        setError(detail ?? 'Couldn’t save those changes.')
        return
      }
      const updated = await response.json()
      setItem(updated)
      setForm(toForm(updated))
      setSavedAt(Date.now())
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(status) {
    setError(null)
    setRunBusy(true)
    try {
      const response = await postStatus(item.id, status)
      if (!response.ok) {
        setError((await detailOf(response)) ?? 'Couldn’t change the status.')
        return
      }
      setItem(await response.json())
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setRunBusy(false)
    }
  }

  async function saveEditions() {
    setEditionError(null)
    setEditionsSaved(false)
    const parsed = parseEditionRows(rows)
    if (parsed.error) {
      setEditionError(parsed.error)
      return
    }
    setSavingEditions(true)
    try {
      const response = await apiFetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editions: parsed.editions }),
      })
      if (!response.ok) {
        const detail =
          response.status === 409 || response.status === 422
            ? await detailOf(response)
            : null
        setEditionError(
          detail && comicErrorField(detail) === 'editions'
            ? detail
            : (detail ?? 'Couldn’t save the editions.'),
        )
        return
      }
      const updated = await response.json()
      setItem(updated)
      setRows(editionRows(updated.editions))
      setEditionsSaved(true)
      // Held issues changed with the editions: the wall follows.
      const built = await fetchWall()
      if (built) setWall(built)
    } catch {
      setEditionError(ACTION_ERROR)
    } finally {
      setSavingEditions(false)
    }
  }

  /** Re-reads the series and its issues from Comic Vine. */
  async function refreshComic() {
    setError(null)
    setRefreshing(true)
    try {
      const response = await apiFetch(`/api/comics/${id}/refresh`, {
        method: 'POST',
      })
      if (!response.ok) {
        setError(
          (await detailOf(response)) ?? 'Couldn’t refresh from Comic Vine.',
        )
        return
      }
      await reread()
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setRefreshing(false)
    }
  }

  /**
   * Points the series at a different Comic Vine volume and re-fetches it:
   * the link first, then the refresh route, so the browser never assembles
   * metadata it cannot verify. A failed refresh keeps the link.
   */
  async function relink(candidate) {
    if (relinking) return
    setError(null)
    setRelinking(true)
    try {
      const linked = await apiFetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'comic',
          external_source: candidate.external_source,
          external_id: candidate.external_id,
        }),
      })
      if (!linked.ok) {
        setError('Couldn’t link that record.')
        return
      }
      const refreshed = await apiFetch(`/api/items/${id}/refresh-metadata`, {
        method: 'POST',
      })
      if (!refreshed.ok) {
        setItem(await linked.json())
        setError(
          'Linked, but the metadata couldn’t be fetched. Try refreshing.',
        )
        return
      }
      await reread()
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setRelinking(false)
    }
  }

  async function remove() {
    setError(null)
    try {
      const response = await apiFetch(`/api/items/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        setError('Couldn’t delete that item.')
        return
      }
    } catch {
      setError(ACTION_ERROR)
      return
    }
    navigate(adminListPath('comic'))
  }

  const set = (field) => (event) =>
    setForm((current) => ({
      ...current,
      [field]:
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value,
    }))

  const trail = [
    { label: COPY.shelf, to: '/admin/shelf/games' },
    { label: COPY.comics, to: adminListPath('comic') },
    { label: item?.title ?? COPY.fallbackTitle },
  ]
  const header = (
    <>
      <Breadcrumb trail={trail} />
      <AdminPageHeader
        title={state === 'ready' && item ? item.title : COPY.fallbackTitle}
      >
        {state === 'ready' && item?.is_public && (
          <Link className="btn" to={itemPath(item.id)}>
            {COPY.viewOnSite}
          </Link>
        )}
      </AdminPageHeader>
    </>
  )

  if (state === 'loading') {
    return (
      <section>
        {header}
        <p className="muted">{slow ? WAKING : 'Loading…'}</p>
      </section>
    )
  }
  if (state === 'unauthorized') {
    return (
      <section>
        {header}
        <p className="admin-error">
          Not signed in. <Link to="/admin">Go to admin</Link>.
        </p>
      </section>
    )
  }
  if (state === 'missing') {
    return (
      <section>
        {header}
        <p className="admin-error">No item with that id.</p>
      </section>
    )
  }
  if (state === 'error') {
    return (
      <section>
        {header}
        <p className="admin-error">{LOAD_ERROR}</p>
      </section>
    )
  }
  // A game opened here goes to its own page.
  if (item.type !== 'comic') {
    return <Navigate replace to={`/admin/collection/${id}`} />
  }

  const meta = item.source_metadata ?? {}
  const linked = item.external_source === 'comicvine' && item.external_id
  const skipped = new Set(expandRanges(item.issues_skipped))
  const comic = wall?.comic
  const run = item.comic_run

  return (
    <section className="admin-comic">
      {header}

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      <div className="admin-comic-head">
        <div className="admin-comic-cover">
          <CoverImage src={item.cover_url} type="comic" alt="" />
        </div>
        <p className="muted">
          {[
            COPY.kicker,
            item.creator,
            item.year,
            item.is_public ? COPY.public : COPY.private,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="admin-comic-cols">
        <div>
          <Panel title={COPY.series}>
            <form className="item-detail-form" onSubmit={save}>
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={form.title}
                onChange={set('title')}
                required
              />

              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={item.status}
                disabled={runBusy}
                onChange={(event) => changeStatus(event.target.value)}
              >
                {statusMoves(item).map((entry) => (
                  <option key={entry.status} value={entry.status}>
                    {entry.name}
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

              <label htmlFor="favorite">Favorite</label>
              <input
                id="favorite"
                type="checkbox"
                checked={form.favorite}
                onChange={set('favorite')}
              />

              <label htmlFor="following">Following</label>
              <input
                id="following"
                type="checkbox"
                checked={form.following}
                onChange={set('following')}
              />

              <label htmlFor="is_public">Public</label>
              <input
                id="is_public"
                type="checkbox"
                checked={form.is_public}
                onChange={set('is_public')}
              />

              <label htmlFor="notes">
                Notes <span className="comic-private">{COPY.privateTag}</span>
              </label>
              <textarea
                id="notes"
                rows="3"
                value={form.notes}
                onChange={set('notes')}
              />

              <div className="item-detail-actions">
                <button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : COPY.save}
                </button>
                {savedAt && (
                  <span className="muted" role="status">
                    {COPY.saved}
                  </span>
                )}
              </div>
            </form>
          </Panel>

          <Panel title={COPY.delete}>
            <p className="muted">{COPY.deleteLine}</p>
            <ShelfConfirm
              ids={[id]}
              title={item.title}
              className="danger"
              onConfirm={remove}
            />
          </Panel>
        </div>

        <div>
          <Panel title={COPY.issues}>
            {run && (
              <p className="admin-comic-sum">
                {COPY.issuesLine(
                  run.owned,
                  run.released,
                  comic?.read ?? run.read,
                  run.missing,
                )}
              </p>
            )}
            <form className="admin-comic-add" onSubmit={addIssue} noValidate>
              <label htmlFor="add-issue">{COPY.addLabel}</label>
              <input
                id="add-issue"
                type="number"
                min="1"
                max="9999"
                inputMode="numeric"
                aria-describedby="add-issue-hint"
                value={addNumber}
                onChange={(event) => setAddNumber(event.target.value)}
              />
              <button type="submit" disabled={adding || addNumber === ''}>
                {COPY.add}
              </button>
            </form>
            <p id="add-issue-hint" className="muted comic-hint">
              {COPY.addHint}
            </p>
            {addError && (
              <p className="admin-error" role="alert">
                {addError}
              </p>
            )}
            <p className="muted comic-hint">{COPY.issuesHint}</p>
          </Panel>
          {comic &&
            (wall.wall.issues.length > 0 ||
              comic.released > 0 ||
              (run?.owned ?? 0) > 0) && (
              <CoverWall
                wall={wall.wall}
                detail={{ comic }}
                series={{ id: item.id, title: item.title }}
                skipped={skipped}
                onMark={markIssue}
                linked={Boolean(item.is_public)}
              />
            )}

          <Panel title={COPY.editions}>
            <EditionRows
              rows={rows}
              onChange={(next) => {
                setRows(next)
                setEditionsSaved(false)
              }}
              error={editionError}
              links={{
                itemId: id,
                saved: item.editions ?? [],
                // Only the stored editions change; the rows being typed stay.
                onLinked: (editions) =>
                  setItem((current) => ({ ...current, editions })),
              }}
            />
            <div className="item-detail-actions">
              <button
                type="button"
                disabled={savingEditions}
                onClick={saveEditions}
              >
                {savingEditions ? 'Saving…' : COPY.saveEditions}
              </button>
              {editionsSaved && (
                <span className="muted" role="status">
                  {COPY.saved}
                </span>
              )}
            </div>
          </Panel>

          <Panel title={COPY.match}>
            {linked ? (
              <>
                <p className="match-line">{item.title}</p>
                <p className="muted">
                  {[
                    meta.publisher,
                    item.year,
                    meta.issue_count
                      ? spine.comics.series.issueCount(meta.issue_count)
                      : null,
                    `volume ${item.external_id}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p>
                  <button
                    type="button"
                    disabled={refreshing}
                    onClick={refreshComic}
                  >
                    {refreshing ? 'Refreshing…' : COPY.refresh}
                  </button>
                </p>
              </>
            ) : (
              <p className="muted">{COPY.unlinked}</p>
            )}
            <div className="item-relink">
              <p className="muted">{COPY.relinkLine}</p>
              {relinking && <p className="muted">Re-linking…</p>}
              <MetadataPicker type="comic" onSelect={relink} />
            </div>
          </Panel>
        </div>
      </div>

      <p className="item-attribution muted">
        {spine.comics.attribution.before}{' '}
        <a href={COMIC_VINE}>{spine.comics.attribution.label}</a>
        {spine.comics.attribution.after}
      </p>
    </section>
  )
}
