import { useCallback, useEffect, useState } from 'react'
import { adminCopy } from '../content/adminCopy.js'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import Breadcrumb from '../components/Breadcrumb.jsx'
import CoverImage from '../components/CoverImage.jsx'
import CoverWall from '../components/CoverWall.jsx'
import BooksPanel from '../components/BooksPanel.jsx'
import MetadataPicker from '../components/MetadataPicker.jsx'
import Panel from '../components/Panel.jsx'
import ShelfConfirm from '../components/ShelfConfirm.jsx'
import TagPicker from '../components/TagPicker.jsx'
import { spine } from '../content/spine.js'
import { ACTION_ERROR, WAKING } from '../content/status.js'
import LoadState from '../components/LoadState.jsx'
import {
  ARMED,
  CHECKBOX,
  DANGER,
  FIELD,
  FIELD_AUTO,
  FORM_ACTIONS,
  FORM_GRID,
  LABEL,
  MUTED,
  PLAIN,
  PRIMARY,
  SMALL,
  TEXTAREA,
} from '../components/adminDataClasses.js'
import { apiFetch } from '../lib/api.js'
import { restoreSeries, setMark, toggleSkip } from '../lib/comicEdits.js'
import { expandRanges } from '../lib/comics.js'
import { itemPath } from '../lib/spinePaths.js'
import { kindWord } from '../lib/titleKind.js'
import { setStatus as postStatus, statusMoves } from '../lib/statusMoves.js'
import { adminListPath } from '../lib/shelf.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'

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
    tags: item.tags ?? [],
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
    tags: form.tags,
  }
}

/** Only what changed, so Save sends nothing the page did not touch. */
function changedFields(item, form) {
  const before = toPayload(toForm(item))
  const after = toPayload(form)
  return Object.fromEntries(
    Object.keys(after)
      .filter(
        (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
      )
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
 * tap marks a book), the books (each has its own page), the Comic Vine
 * match and Delete. Owned and
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
  const [wall, setWall] = useState(null)
  const [state, setState] = useState('loading')
  const [tries, setTries] = useState(0)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [runBusy, setRunBusy] = useState(false)
  const [relinking, setRelinking] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [addNumber, setAddNumber] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)
  // One column: Delete follows Issues, in the DOM too, so tab order matches.
  const single = useMediaQuery('(max-width: 900px)')

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
        setWall(built)
        setState(result.state)
      })
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [fetchItem, fetchWall, tries])

  function retry() {
    setState('loading')
    setTries((count) => count + 1)
  }

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
  const ready = state === 'ready' && item
  const viewOnSite = ready && item.is_public && (
    <Link className={PLAIN} to={itemPath(item.id)}>
      {COPY.viewOnSite}
    </Link>
  )
  const header = (
    <>
      <Breadcrumb trail={trail} />
      {!ready && <AdminPageHeader title={COPY.fallbackTitle} />}
    </>
  )

  if (state === 'loading') {
    return (
      <section>
        {header}
        <p className={MUTED}>{slow ? WAKING : 'Loading…'}</p>
      </section>
    )
  }
  if (state === 'unauthorized') {
    return (
      <section>
        {header}
        <p className="admin-error" role="alert">
          {adminCopy.comic.notSignedIn}{' '}
          <Link to="/admin">{adminCopy.comic.goToAdmin}</Link>.
        </p>
      </section>
    )
  }
  if (state === 'missing') {
    return (
      <section>
        {header}
        <p className="admin-error" role="alert">
          {adminCopy.itemMissing}
        </p>
      </section>
    )
  }
  if (state === 'error') {
    return (
      <section>
        {header}
        <LoadState failed onRetry={retry} />
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
  const deletePanel = (
    <Panel title={COPY.delete}>
      <p className={MUTED}>{COPY.deleteLine}</p>
      <ShelfConfirm
        ids={[id]}
        title={item.title}
        className={DANGER}
        armedClassName={ARMED}
        onConfirm={remove}
      />
    </Panel>
  )

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
        <AdminPageHeader
          title={item.title}
          description={[
            COPY.kicker,
            comic ? kindWord(comic) : null,
            item.creator,
            item.year,
            item.is_public ? COPY.public : COPY.private,
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          {viewOnSite}
        </AdminPageHeader>
      </div>

      <div className="admin-comic-cols">
        <div>
          <Panel title={COPY.series}>
            <form className={FORM_GRID} onSubmit={save}>
              <label htmlFor="title" className={LABEL}>
                {adminCopy.comic.title}
              </label>
              <input
                className={FIELD}
                id="title"
                value={form.title}
                onChange={set('title')}
                required
              />

              <label htmlFor="status" className={LABEL}>
                {adminCopy.comic.status}
              </label>
              <select
                className={FIELD}
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
              {comic && comic.status !== item.status && (
                <p className={MUTED}>
                  The public page shows {spine.comics.status[comic.status]}:
                  every issue I own is read.
                </p>
              )}
              {comic && comic.caught_up && (
                <p className={MUTED}>
                  The public page shows {spine.comics.caughtUp}: every issue I
                  own is read, and the run is not complete.
                </p>
              )}

              <label htmlFor="rating" className={LABEL}>
                {adminCopy.comic.rating}
              </label>
              <input
                className={FIELD}
                id="rating"
                type="number"
                min="1"
                max="10"
                value={form.rating}
                onChange={set('rating')}
              />

              <label htmlFor="favorite" className={LABEL}>
                {adminCopy.comic.favorite}
              </label>
              <input
                className={CHECKBOX}
                id="favorite"
                type="checkbox"
                checked={form.favorite}
                onChange={set('favorite')}
              />

              <label htmlFor="following" className={LABEL}>
                {adminCopy.comic.following}
              </label>
              <input
                className={CHECKBOX}
                id="following"
                type="checkbox"
                checked={form.following}
                onChange={set('following')}
              />

              <label htmlFor="is_public" className={LABEL}>
                {adminCopy.comic.isPublic}
              </label>
              <input
                className={CHECKBOX}
                id="is_public"
                type="checkbox"
                checked={form.is_public}
                onChange={set('is_public')}
              />

              <label htmlFor="notes" className={LABEL}>
                {adminCopy.comic.notes}{' '}
                <span className="comic-private">{COPY.privateTag}</span>
              </label>
              <textarea
                className={TEXTAREA}
                id="notes"
                rows="3"
                value={form.notes}
                onChange={set('notes')}
              />

              <TagPicker
                type="comic"
                value={form.tags}
                onChange={(tags) =>
                  setForm((current) => ({ ...current, tags }))
                }
              />

              <div className={FORM_ACTIONS}>
                <button type="submit" className={PRIMARY} disabled={saving}>
                  {saving ? 'Saving…' : COPY.save}
                </button>
                {savedAt && (
                  <span className={MUTED} role="status">
                    {COPY.saved}
                  </span>
                )}
              </div>
            </form>
          </Panel>

          {!single && deletePanel}
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
              <label htmlFor="add-issue" className={LABEL}>
                {COPY.addLabel}
              </label>
              <input
                className={FIELD_AUTO}
                id="add-issue"
                type="number"
                min="1"
                max="9999"
                inputMode="numeric"
                aria-describedby="add-issue-hint"
                value={addNumber}
                onChange={(event) => setAddNumber(event.target.value)}
              />
              <button
                type="submit"
                className={PLAIN}
                disabled={adding || addNumber === ''}
              >
                {COPY.add}
              </button>
            </form>
            <p id="add-issue-hint" className={`${MUTED} comic-hint`}>
              {COPY.addHint}
            </p>
            {addError && (
              <p className="admin-error" role="alert">
                {addError}
              </p>
            )}
            <p className={`${MUTED} comic-hint`}>{COPY.issuesHint}</p>
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

          <BooksPanel itemId={id} />

          <Panel title={COPY.match}>
            {linked ? (
              <>
                <p className="match-line min-w-0 [overflow-wrap:anywhere]">
                  {item.title}
                </p>
                <p className={MUTED}>
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
                    className={SMALL}
                    disabled={refreshing}
                    onClick={refreshComic}
                  >
                    {refreshing ? 'Refreshing…' : COPY.refresh}
                  </button>
                </p>
              </>
            ) : (
              <p className={MUTED}>{COPY.unlinked}</p>
            )}
            <div className="item-relink">
              <p className={MUTED}>{COPY.relinkLine}</p>
              {relinking && (
                <p className={MUTED}>{adminCopy.comic.relinking}</p>
              )}
              <MetadataPicker type="comic" onSelect={relink} />
            </div>
          </Panel>
          {single && deletePanel}
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
