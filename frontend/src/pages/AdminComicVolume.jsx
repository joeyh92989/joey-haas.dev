import { useEffect, useId, useRef, useState } from 'react'
import { WALL_STATUS } from '../components/comicClasses.js'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import Breadcrumb from '../components/Breadcrumb.jsx'
import CollectsEditor from '../components/CollectsEditor.jsx'
import CoverImage from '../components/CoverImage.jsx'
import EditionLinkPicker from '../components/EditionLinkPicker.jsx'
import LoadState from '../components/LoadState.jsx'
import {
  ARMED,
  DANGER,
  FIELD,
  FIELD_AUTO,
  FORM_ACTIONS,
  FORM_GRID,
  LABEL,
  LINK_BTN,
  MUTED,
  PLAIN,
  PRIMARY,
  chipBtn,
  TEXTAREA,
} from '../components/adminDataClasses.js'
import Panel from '../components/Panel.jsx'
import ShelfConfirm from '../components/ShelfConfirm.jsx'
import { KIND_ORDER, volume as COPY } from '../content/adminVolume.js'
import { spine } from '../content/spine.js'
import { apiFetch } from '../lib/api.js'
import { adminListPath } from '../lib/shelf.js'
import { volumePath } from '../lib/spinePaths.js'
import {
  adminVolumePath,
  collectBody,
  deletePreviewResponse,
  deleteVolume,
  factsPayload,
  getVolume,
  listVolumes,
  markVolume,
  moveVolume,
  parseContents,
  replaceBody,
  replaceVolume,
  toFacts,
} from '../lib/volumeEdits.js'
import { TEXT_LINK } from '../components/detail-classes.js'
import {
  ADMIN_COMIC_HEAD,
  ADMIN_VOLUME_BODY,
  ADMIN_VOLUME_MOVE,
  COMIC_FIELD_ERROR,
  COMIC_HINT,
  EDITION_NEIGHBOUR,
  EDITION_NEIGHBOURS,
} from '../components/comicAdminClasses.js'

const KINDS = spine.comics.volume.kinds
const MARKS = [
  ['owned', COPY.status.owned],
  ['read', COPY.status.read],
]

/** The comics on the shelf, for the link and move choosers. */
function useComicTitles(enabled) {
  const [titles, setTitles] = useState({ status: 'loading', list: [] })
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    apiFetch('/api/items?type=comic')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((list) => {
        if (!cancelled) setTitles({ status: 'ready', list })
      })
      .catch(() => {
        if (!cancelled) setTitles({ status: 'error', list: [] })
      })
    return () => {
      cancelled = true
    }
  }, [enabled])
  return titles
}

/** One line under a thing the owner changed: what happened, and Undo. */
function StatusLine({ line, area, error }) {
  return (
    <p className={`wall-status ${WALL_STATUS}`} role="status">
      {error?.area === area ? (
        <span className="admin-error" role="alert">
          {error.text}
        </span>
      ) : line?.area === area ? (
        <>
          {line.text}
          {line.undo && (
            <>
              {' '}
              <button type="button" className={LINK_BTN} onClick={line.undo}>
                {COPY.status.undo}
              </button>
            </>
          )}
        </>
      ) : null}
    </p>
  )
}

/** The previous or next book: the admin sees every book, owned or not. */
function Neighbour({ side, itemId, book }) {
  return (
    <Link
      className={`edition-neighbour ${EDITION_NEIGHBOUR} ${side}`}
      to={adminVolumePath(itemId, book.slug)}
    >
      <span className="tiny">
        {side === 'prev' ? COPY.neighbours.previous : COPY.neighbours.next}
      </span>
      <strong>{book.label}</strong>
      {book.line_number != null && (
        <span className="tiny">
          {spine.comics.volume.number(book.line_number)}
        </span>
      )}
      {!book.owned && <span className="tiny">{COPY.neighbours.notOwned}</span>}
    </Link>
  )
}

/**
 * The admin page of one book, `/admin/shelf/comics/:id/:slug`: the twin of
 * the public Book page. The same parts in the same order (the cover and name,
 * what it is, what it collects, the books either side), each with its
 * controls, then the owner's own tools: move to another title and delete.
 * Owned and read, a contents action and a Comic Vine link save the moment
 * they are made, with a status line and Undo where one is exact; the facts
 * form has its own Save.
 */
export default function AdminComicVolume() {
  const { id, slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const ids = useId()
  const [load, setLoad] = useState('loading')
  const [tries, setTries] = useState(0)
  const [volume, setVolume] = useState(null)
  const [facts, setFacts] = useState(null)
  const [factsError, setFactsError] = useState(null)
  const [factsSaved, setFactsSaved] = useState(false)
  const [savingFacts, setSavingFacts] = useState(false)
  const [busy, setBusy] = useState(false)
  const [line, setLine] = useState(
    location.state?.note ? { area: 'move', text: location.state.note } : null,
  )
  const [error, setError] = useState(null)
  const [target, setTarget] = useState('')
  const loaded = useRef(null)
  const titles = useComicTitles(load === 'ready')

  useEffect(() => {
    // A move already holds the book on its new address.
    if (loaded.current === `${id}/${slug}`) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const book = (await listVolumes(id)).find((row) => row.slug === slug)
        if (!book) return { state: 'missing' }
        return { state: 'ready', volume: await getVolume(book.id) }
      } catch (failure) {
        return { state: failure?.status === 401 ? 'unauthorized' : 'error' }
      }
    })().then((result) => {
      if (cancelled) return
      loaded.current = `${id}/${slug}`
      if (result.volume) {
        setVolume(result.volume)
        setFacts(toFacts(result.volume))
      }
      setLoad(result.state)
    })
    return () => {
      cancelled = true
    }
  }, [id, slug, tries])

  function retry() {
    loaded.current = null
    setLoad('loading')
    setTries((count) => count + 1)
  }

  const here = {
    label: volume?.label ?? COPY.fallbackTitle,
    titleName: volume?.title.title ?? spine.comics.admin.fallbackTitle,
    titleId: volume?.title.id ?? id,
  }
  const trail = [
    { label: spine.comics.admin.shelf, to: '/admin/shelf/games' },
    { label: spine.comics.admin.comics, to: adminListPath('comic') },
    {
      label: here.titleName,
      to: `/admin/shelf/comics/${encodeURIComponent(here.titleId)}`,
    },
    { label: here.label },
  ]

  if (load !== 'ready') {
    return (
      <section>
        <Breadcrumb trail={trail} />
        <AdminPageHeader title={COPY.fallbackTitle} />
        {load === 'loading' && <LoadState loading />}
        {load === 'error' && <LoadState failed onRetry={retry} />}
        {load === 'missing' && (
          <p className="admin-error" role="alert">
            {COPY.missing}
          </p>
        )}
        {load === 'unauthorized' && (
          <p className="admin-error" role="alert">
            {COPY.signIn}{' '}
            <Link className={TEXT_LINK} to="/admin">
              {COPY.adminHome}
            </Link>
            .
          </p>
        )}
      </section>
    )
  }

  const kindWord = KINDS[volume.kind] ?? volume.kind
  const set = (field) => (event) => {
    setFactsSaved(false)
    setFacts((current) => ({ ...current, [field]: event.target.value }))
  }

  /** Runs one write: busy while it is out, the API's words on a refusal. */
  async function write(area, run) {
    setBusy(true)
    setError(null)
    try {
      return await run()
    } catch (failure) {
      setError({ area, text: failure.message || COPY.status.failed })
      return failure
    } finally {
      setBusy(false)
    }
  }

  function toggle(field, what) {
    const was = volume[field]
    return write('shelf', async () => {
      await markVolume(volume.id, { [field]: !was })
      setVolume((current) => ({ ...current, [field]: !was }))
      setLine({
        area: 'shelf',
        text: COPY.status.marked(volume.label, what, !was),
        undo: () =>
          write('shelf', async () => {
            await markVolume(volume.id, { [field]: was })
            setVolume((current) => ({ ...current, [field]: was }))
            setLine(null)
          }),
      })
    })
  }

  async function saveFacts(event) {
    event.preventDefault()
    setFactsError(null)
    setFactsSaved(false)
    const before = JSON.stringify(factsPayload(toFacts(volume)))
    if (before === JSON.stringify(factsPayload(facts))) {
      setFactsError({ message: COPY.facts.nothing, fields: {} })
      return
    }
    setSavingFacts(true)
    try {
      const body = replaceBody(volume, volume.collects.map(collectBody), facts)
      const next = await replaceVolume(volume.id, body)
      setVolume(next)
      setFacts(toFacts(next))
      setFactsSaved(true)
    } catch (failure) {
      setFactsError(failure)
    } finally {
      setSavingFacts(false)
    }
  }

  /** The contents list, written whole; `undo` is the list that puts it back. */
  async function saveCollects(list, text, undoList) {
    const failure = await write('collects', async () => {
      const next = await replaceVolume(volume.id, replaceBody(volume, list))
      setVolume(next)
      setLine({
        area: 'collects',
        text,
        undo: undoList
          ? () =>
              write('collects', async () => {
                setVolume(
                  await replaceVolume(volume.id, replaceBody(next, undoList)),
                )
                setLine(null)
              })
          : undefined,
      })
      return null
    })
    return failure instanceof Error ? failure : null
  }

  /** Reads the contents from the description and the pasted note. The server
   * replaces only entries it read before; the page just shows what it kept. */
  function readContents(note) {
    return write('collects', async () => {
      const result = await parseContents(volume.id, note)
      setVolume((current) => ({
        ...current,
        collects: result.collects,
      }))
      const removed = result.entries_removed ?? 0
      const words = COPY.collects.read
      setLine({
        area: 'collects',
        text:
          result.entries_added > 0
            ? words.added(
                result.entries_added,
                result.entries_replaced + removed,
                result.used_model,
              )
            : removed > 0
              ? words.removed(removed)
              : (words.reasons[result.reason] ?? words.nothingNew),
      })
      return null
    })
  }

  function moveTo(event) {
    event.preventDefault()
    return write('move', async () => {
      const result = await moveVolume(volume.id, target)
      const note = result.slug_kept
        ? COPY.move.kept(result.volume.slug)
        : COPY.move.renamed(result.previous_slug, result.volume.slug)
      loaded.current = `${result.volume.item_id}/${result.volume.slug}`
      setVolume(result.volume)
      setFacts(toFacts(result.volume))
      setTarget('')
      setLine({ area: 'move', text: note })
      navigate(adminVolumePath(result.volume.item_id, result.volume.slug), {
        replace: true,
        state: { note },
      })
    })
  }

  async function remove() {
    const failure = await write('delete', () => deleteVolume(volume.id))
    if (failure instanceof Error) return
    navigate(`/admin/shelf/comics/${encodeURIComponent(volume.item_id)}`)
  }

  const cover = volume.large_url || volume.cover_url
  const fieldError = (name) => factsError?.fields?.[name]
  const describe = (name) => ({
    'aria-invalid': fieldError(name) ? true : undefined,
    'aria-describedby': fieldError(name) ? `${ids}-${name}-error` : undefined,
  })
  const errorFor = (name) =>
    fieldError(name) && (
      <p
        id={`${ids}-${name}-error`}
        className={`admin-error comic-field-error ${COMIC_FIELD_ERROR}`}
        role="alert"
      >
        {fieldError(name)}
      </p>
    )
  const unplaced =
    factsError && Object.keys(factsError.fields ?? {}).length === 0
      ? factsError.message
      : null
  const others = titles.list.filter((row) => row.id !== volume.item_id)
  const titleWord = (row) =>
    row.is_public
      ? row.title
      : `${row.title} (${COPY.privateTag.toLowerCase()})`

  return (
    <section className="admin-volume">
      <Breadcrumb trail={trail} />

      <div className={`admin-comic-head ${ADMIN_COMIC_HEAD}`}>
        <div className="admin-comic-cover">
          <CoverImage
            src={cover}
            type="comic"
            alt={COPY.coverAlt(volume.title.title, volume.label)}
          />
        </div>
        <div className="min-w-0">
          <AdminPageHeader
            title={volume.label}
            description={[
              COPY.kicker,
              kindWord,
              volume.line_number != null
                ? spine.comics.volume.number(volume.line_number)
                : null,
              volume.title.is_public ? COPY.public : COPY.private,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <EditionLinkPicker
            volumeId={volume.id}
            name={volume.label}
            cvId={volume.cv_id}
            onLinked={(linked) => {
              setVolume((current) => ({
                ...current,
                ...linked,
                id: current.id,
              }))
              setFacts((current) => ({
                ...current,
                description: linked.description ?? '',
              }))
            }}
          />
        </div>
      </div>

      <div className={`admin-volume-body ${ADMIN_VOLUME_BODY}`}>
        <Panel title={COPY.status.heading}>
          <div
            className="chip-row"
            role="group"
            aria-label={COPY.status.heading}
          >
            {MARKS.map(([field, word]) => (
              <button
                key={field}
                type="button"
                className={chipBtn}
                aria-pressed={volume[field]}
                disabled={busy}
                onClick={() => toggle(field, word)}
              >
                {word}
              </button>
            ))}
          </div>
          <p className={`${MUTED} comic-hint ${COMIC_HINT}`}>
            {COPY.status.hint}
          </p>
          <StatusLine line={line} area="shelf" error={error} />
        </Panel>

        <Panel title={COPY.facts.heading}>
          <form className={FORM_GRID} onSubmit={saveFacts} noValidate>
            <label htmlFor={`${ids}-label`} className={LABEL}>
              {COPY.facts.label}
            </label>
            <input
              className={FIELD}
              id={`${ids}-label`}
              value={facts.label}
              onChange={set('label')}
              {...describe('label')}
            />
            {errorFor('label')}

            <label htmlFor={`${ids}-kind`} className={LABEL}>
              {COPY.facts.kind}
            </label>
            <select
              className={FIELD}
              id={`${ids}-kind`}
              value={facts.kind}
              onChange={set('kind')}
              {...describe('kind')}
            >
              {KIND_ORDER.map((value) => (
                <option key={value} value={value}>
                  {KINDS[value]}
                </option>
              ))}
            </select>
            {errorFor('kind')}

            <label htmlFor={`${ids}-line_number`} className={LABEL}>
              {COPY.facts.number}
            </label>
            <input
              className={FIELD}
              id={`${ids}-line_number`}
              type="number"
              min="1"
              inputMode="numeric"
              value={facts.line_number}
              onChange={set('line_number')}
              {...describe('line_number')}
            />
            {errorFor('line_number')}

            <label htmlFor={`${ids}-pages`} className={LABEL}>
              {COPY.facts.pages}
            </label>
            <input
              className={FIELD}
              id={`${ids}-pages`}
              type="number"
              min="1"
              inputMode="numeric"
              value={facts.pages}
              onChange={set('pages')}
              {...describe('pages')}
            />
            {errorFor('pages')}

            <label htmlFor={`${ids}-isbn`} className={LABEL}>
              {COPY.facts.isbn}
            </label>
            <input
              className={FIELD}
              id={`${ids}-isbn`}
              value={facts.isbn}
              onChange={set('isbn')}
              {...describe('isbn')}
            />
            {errorFor('isbn')}

            <label htmlFor={`${ids}-description`} className={LABEL}>
              {COPY.facts.description}
            </label>
            <textarea
              className={TEXTAREA}
              id={`${ids}-description`}
              rows="5"
              value={facts.description}
              onChange={set('description')}
              {...describe('description')}
            />
            {errorFor('description')}

            <div className={FORM_ACTIONS}>
              <button type="submit" className={PRIMARY} disabled={savingFacts}>
                {savingFacts ? COPY.facts.saving : COPY.facts.save}
              </button>
              {factsSaved && (
                <span className={MUTED} role="status">
                  {COPY.facts.saved}
                </span>
              )}
            </div>
            {unplaced && (
              <p
                className={`admin-error comic-field-error ${COMIC_FIELD_ERROR}`}
                role="alert"
              >
                {unplaced}
              </p>
            )}
          </form>
        </Panel>

        <Panel title={COPY.collects.heading}>
          <CollectsEditor
            entries={volume.collects}
            titles={titles}
            busy={busy}
            onSave={saveCollects}
            onParse={readContents}
            volumeId={volume.id}
          />
          <StatusLine line={line} area="collects" error={error} />
        </Panel>

        <nav
          aria-label={COPY.neighbours.label}
          className={`edition-neighbours ${EDITION_NEIGHBOURS}`}
        >
          {volume.prev ? (
            <Neighbour side="prev" itemId={volume.item_id} book={volume.prev} />
          ) : (
            <p className="tiny">{COPY.neighbours.first}</p>
          )}
          {volume.next ? (
            <Neighbour side="next" itemId={volume.item_id} book={volume.next} />
          ) : (
            <p className="tiny">{COPY.neighbours.last}</p>
          )}
        </nav>

        <Panel title={COPY.move.heading}>
          <p className={MUTED}>{COPY.move.line}</p>
          {titles.status === 'ready' && others.length === 0 && (
            <p className={MUTED}>{COPY.move.none}</p>
          )}
          {titles.status === 'ready' && others.length > 0 && (
            <form
              className={`admin-volume-move ${ADMIN_VOLUME_MOVE}`}
              onSubmit={moveTo}
            >
              <label htmlFor={`${ids}-move`} className={LABEL}>
                {COPY.move.select}
              </label>
              <select
                className={FIELD_AUTO}
                id={`${ids}-move`}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">{COPY.move.choose}</option>
                {others.map((row) => (
                  <option key={row.id} value={row.id}>
                    {titleWord(row)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className={PLAIN}
                disabled={busy || target === ''}
              >
                {busy ? COPY.move.moving : COPY.move.submit}
              </button>
            </form>
          )}
          <StatusLine line={line} area="move" error={error} />
        </Panel>

        <Panel title={COPY.delete.heading}>
          <p className={MUTED}>{COPY.delete.line}</p>
          <ShelfConfirm
            ids={[volume.id]}
            title={volume.label}
            className={DANGER}
            armedClassName={ARMED}
            source={{
              load: () => deletePreviewResponse(volume.id),
              describe: COPY.delete.detail,
            }}
            onConfirm={remove}
          />
          <StatusLine line={line} area="delete" error={error} />
        </Panel>

        {volume.owned && volume.title.is_public && (
          <p>
            <Link
              className={PLAIN}
              to={volumePath(volume.item_id, volume.slug)}
            >
              {COPY.viewPublic}
            </Link>
          </p>
        )}
      </div>
    </section>
  )
}
