import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import ConfirmDelete from '../components/ConfirmDelete.jsx'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import CoverImage from '../components/CoverImage.jsx'
import AddSection from '../components/intake/AddSection.jsx'
import ItemForm, {
  EMPTY_COMIC_FIELDS,
  FORMAT_OPTIONS,
  PLATFORM_OPTIONS,
} from '../components/ItemForm.jsx'
import MetadataPicker from '../components/MetadataPicker.jsx'
import PosterCard from '../components/PosterCard.jsx'
import NowPlaying from '../components/NowPlaying.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import ShelfCardActions from '../components/ShelfCardActions.jsx'
import ShelfToolbar from '../components/ShelfToolbar.jsx'
import WrapUpSheet from '../components/WrapUpSheet.jsx'
import StatTile, { StatTiles } from '../components/StatTile.jsx'
import { apiFetch, errorMessage } from '../lib/api.js'
import { comicPayload } from '../lib/comics.js'
import { finishedIn } from '../lib/dashboard.js'
import { ownerYear } from '../lib/formatDate.js'
import {
  countBy,
  filterItems,
  NO_FILTER,
  readShelfPref,
  sortItems,
  STATUS_LABEL,
  STATUS_ORDER,
  writeShelfPref,
} from '../lib/shelf.js'
import {
  isWrapUp,
  pinPath,
  setStatus as postStatus,
  statusMoves,
} from '../lib/statusMoves.js'
import { FavoritesRow, isDimmable, platformGroup } from './Collection.jsx'
import { itemPath } from '../lib/spinePaths.js'
import { ACTION_ERROR, LOAD_ERROR, WAKING } from '../content/status.js'
import { spine } from '../content/spine.js'

const TYPE_LABEL = {
  game: 'Games',
  movie: 'Film & TV',
  comic: 'Comics',
  boardgame: 'Board games',
}

const VIEWS = ['shelf', 'list']
const SIZES = ['comfortable', 'compact']

/** The favourites row's size; the API refuses a fifth (see items.py). */
const FAVORITES_LIMIT = 4
const FAVORITES_FULL = `You already have ${FAVORITES_LIMIT} favorites. Remove one first.`

/** Below this many rated or favourited items, the shelf asks for ratings. */
const NUDGE_BELOW = 5

// The types the bulk metadata refresh covers (items.BULK_REFRESH_SOURCES).
const REFRESH_TYPES = ['game', 'comic', 'movie']

/**
 * The shelf's headline figures, computed from the admin rows: NULL
 * owned_format is owned, and only an explicit `none` is the want list.
 */
function heroFigures(items) {
  return {
    owned: items.filter((item) => item.owned_format !== 'none').length,
    finished: items.filter((item) => item.status === 'finished').length,
    finishedThisYear: finishedIn(items, ownerYear()),
  }
}

/** The shelf's three headline figures, as the admin's stat tiles. */
function HeroTiles({ owned, finished, finishedThisYear }) {
  const year = ownerYear()
  return (
    <StatTiles label="Shelf totals">
      <StatTile label="Owned" value={owned} />
      <StatTile label="Finished" value={finished} />
      <StatTile label={`Finished in ${year}`} value={finishedThisYear} />
    </StatTiles>
  )
}

/** The nudge's sentence, counted live from the rows. */
function nudgeText(unrated) {
  const noun = unrated.every((item) => item.type === 'game') ? 'game' : 'item'
  const subject =
    unrated.length === 1
      ? `1 finished ${noun} has`
      : `${unrated.length} finished ${noun}s have`
  return `${subject} no rating. Rating them is what makes Play Next work.`
}

const EMPTY_FORM = {
  type: 'game',
  title: '',
  status: 'backlog',
  rating: '',
  year: '',
  owned_format: '',
  external_source: null,
  external_id: null,
  ...EMPTY_COMIC_FIELDS,
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
  // The pull list's Own… arrives with the volume to prefill (spec, section 4).
  const { state: arrival, pathname, search } = useLocation()
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...arrival?.prefill,
  }))
  // History keeps location state across a reload, which would prefill the
  // form again after the item was saved; once read, it is cleared.
  useEffect(() => {
    if (arrival?.prefill)
      navigate({ pathname, search }, { replace: true, state: null })
  }, [arrival, navigate, pathname, search])
  // The full form is one click away; the pull list's Own… lands in it open.
  const [fullOpen, setFullOpen] = useState(() => Boolean(arrival?.prefill))
  const fullFormRef = useRef(null)
  const landedPrefilled = useRef(Boolean(arrival?.prefill))
  // Arriving with a prefill, bring the open form into view and focus Title
  // once the page has loaded and the form exists.
  useEffect(() => {
    const details = fullFormRef.current
    if (!landedPrefilled.current || !details) return
    landedPrefilled.current = false
    details.scrollIntoView?.({ block: 'start' })
    details.querySelector('input[aria-label="Title"]')?.focus()
  }, [status])
  const [error, setError] = useState(null)
  // The Wrap up sheet's subject and preselected outcome, or null: Finish,
  // Pause and Abandon open it instead of writing (Tonight continue spec).
  const [wrap, setWrap] = useState(null)
  const [saving, setSaving] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [view, setView] = useState(() => {
    const stored = readShelfPref('shelf.admin.view', 'shelf')
    return VIEWS.includes(stored) ? stored : 'shelf'
  })
  const [filters, setFilters] = useState(NO_FILTER)
  const [sort, setSort] = useState({ value: 'added', direction: 'desc' })
  const [seed, setSeed] = useState(() => Date.now())
  const [size, setSize] = useState(() => {
    const stored = readShelfPref('shelf.admin.size', 'comfortable')
    return SIZES.includes(stored) ? stored : 'comfortable'
  })
  // On by default here, unlike the public shelf: the admin's job is the
  // backlog.
  const [dim, setDim] = useState(() => readShelfPref('shelf.admin.dim', true))
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  // List view: the rows chosen for a bulk set, and what to set on them.
  const [selected, setSelected] = useState(() => new Set())
  const [bulkPlatform, setBulkPlatform] = useState('')
  const [bulkFormat, setBulkFormat] = useState('')
  // The type being refreshed ('game', 'comic', 'movie'), or null.
  const [refreshing, setRefreshing] = useState(null)
  const [refreshResult, setRefreshResult] = useState(null)

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

  // Every save ends in a reload, and two quick saves overlap: only the
  // newest reload may apply, or an older list overwrites a newer one.
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const result = await fetchItems()
    if (seq !== loadSeq.current) return
    setItems(result.items)
    setStatus(result.status)
  }, [fetchItems])

  useEffect(() => {
    // Both the API and the database sleep when idle, so a first load can wake
    // two services. Without this the page looks broken rather than slow.
    const timer = setTimeout(() => setSlow(true), 3000)
    const seq = ++loadSeq.current

    fetchItems()
      .then((result) => {
        if (seq !== loadSeq.current) return
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
    const comic = form.type === 'comic' ? comicPayload(form) : null
    if (comic?.error) {
      setError(comic.error)
      setSaving(false)
      return
    }
    // The comic keys are form state; only comicPayload's version is sent.
    const rest = Object.fromEntries(
      Object.entries(form).filter(([key]) => !(key in EMPTY_COMIC_FIELDS)),
    )
    const body = {
      ...rest,
      ...comic?.fields,
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
        // A 422 names the rule, such as a malformed range; say it.
        setError(
          response.status === 422
            ? await errorMessage(response)
            : 'Couldn’t save that item.',
        )
        return
      }
      // Enrichment is a second call on purpose: the snapshot, cover, and
      // creator are fetched server-side from the linked source rather than
      // trusted from the browser. A failure here leaves a perfectly good
      // item that is simply not enriched yet, so it is not an error.
      if (body.external_source && body.external_id) {
        const created = await response.json()
        // A Comic Vine series reads its issues too, through the comics
        // route; refresh-metadata reads only the volume.
        const refresh =
          body.type === 'comic' && body.external_source === 'comicvine'
            ? `/api/comics/${created.id}/refresh`
            : `/api/items/${created.id}/refresh-metadata`
        await apiFetch(refresh, { method: 'POST' }).catch(() => {})
      }
    } catch {
      setError(ACTION_ERROR)
      return
    } finally {
      setSaving(false)
    }
    setForm(EMPTY_FORM)
    await load()
  }

  /**
   * PATCHes one item and reloads.
   *
   * Never optimistic: on failure the error is reported and the page keeps
   * showing the last state the server confirmed, so a card never claims a
   * rating or a status that was not saved.
   */
  async function patchItem(id, body, failure = 'Couldn’t update that item.') {
    setError(null)
    try {
      const response = await apiFetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        // A 409 is the server explaining a rule, such as the favourites
        // cap, in words worth showing; anything else gets the generic line.
        const detail =
          response.status === 409
            ? await response
                .json()
                .then((payload) => payload?.detail)
                .catch(() => null)
            : null
        setError(typeof detail === 'string' ? detail : failure)
        return
      }
    } catch {
      setError(ACTION_ERROR)
      return
    }
    await load()
  }

  /**
   * Pins or unpins one game as Up next, through its own route rather than a
   * PATCH: a pin clears any other and marks the game in progress, so the
   * reload shows both. A 422 is the server saying why, in words worth
   * showing (a want-list game cannot be pinned).
   */
  async function pinItem(item, pinned) {
    setError(null)
    try {
      const method = pinned ? 'POST' : 'DELETE'
      const response = await apiFetch(pinPath(item.id, method), { method })
      if (!response.ok) {
        const detail =
          response.status === 422
            ? await response
                .json()
                .then((payload) => payload?.detail)
                .catch(() => null)
            : null
        setError(
          typeof detail === 'string' ? detail : 'Couldn’t change Up next.',
        )
        return
      }
    } catch {
      setError(ACTION_ERROR)
      return
    }
    await load()
  }

  /**
   * Changes status through the status route, in both views: the server
   * opens, closes or pauses the playthrough and dates it by the owner's
   * day. A 422 is the server saying why, in words worth showing.
   */
  function openWrapUp(item, preselect = 'finished') {
    setWrap({
      item: {
        id: item.id,
        title: item.title,
        cover_url: item.cover_url,
        type: item.type,
      },
      preselect,
    })
  }

  /** The sheet saved: the shelf reloads; a failed rating is said. */
  async function wrapDone({ ratingFailed }) {
    setWrap(null)
    if (ratingFailed) setError(spine.next.tonight.sheet.ratingFailed)
    await load()
  }

  async function updateStatus(item, nextStatus) {
    setError(null)
    if (isWrapUp(nextStatus) && nextStatus !== item.status) {
      openWrapUp(item, nextStatus)
      return
    }
    try {
      const response = await postStatus(item.id, nextStatus)
      if (!response.ok) {
        const detail =
          response.status === 422
            ? await response
                .json()
                .then((payload) => payload?.detail)
                .catch(() => null)
            : null
        setError(
          typeof detail === 'string' ? detail : 'Couldn’t change that status.',
        )
        return
      }
    } catch {
      setError(ACTION_ERROR)
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
  function updateVisibility(id, isPublic) {
    return patchItem(
      id,
      { is_public: isPublic },
      'Couldn’t change that item’s visibility.',
    )
  }

  function changeView(next) {
    setView(next)
    writeShelfPref('shelf.admin.view', next)
  }

  function changeSize(next) {
    setSize(next)
    writeShelfPref('shelf.admin.size', next)
  }

  function changeDim(next) {
    setDim(next)
    writeShelfPref('shelf.admin.dim', next)
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
      !window.confirm(`Publish all ${items.length} items to My Shelf?`)
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
        setError('Couldn’t change visibility.')
        return
      }
    } catch {
      setError(ACTION_ERROR)
      return
    } finally {
      setBulkBusy(false)
    }
    await load()
  }

  function toggleSelected(id) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === items.length
        ? new Set()
        : new Set(items.map((item) => item.id)),
    )
  }

  /**
   * Sets the chosen platform and/or format on every selected row, in one
   * request that the server applies all or nothing. On a refusal the
   * selection is kept, so it can be adjusted and sent again.
   */
  async function applyBulkSet() {
    const changes = {}
    if (bulkPlatform !== '') changes.platform_id = Number(bulkPlatform)
    if (bulkFormat !== '') changes.physical_format = bulkFormat
    setError(null)
    setBulkBusy(true)
    try {
      const response = await apiFetch('/api/items/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], changes }),
      })
      if (!response.ok) {
        const detail = await response
          .json()
          .then((payload) => payload?.detail)
          .catch(() => null)
        setError(
          typeof detail === 'string' ? detail : 'Couldn’t update those items.',
        )
        return
      }
    } catch {
      setError(ACTION_ERROR)
      return
    } finally {
      setBulkBusy(false)
    }
    setSelected(new Set())
    setBulkPlatform('')
    setBulkFormat('')
    await load()
  }

  /**
   * Re-fetches every linked item of one type: games in batches, comics and
   * movies one request each (Comic Vine at one a second, so comics take the
   * longest). Synchronous on the server, so the counts come back in the
   * same response.
   */
  async function refreshMetadata(type) {
    setError(null)
    setRefreshResult(null)
    setRefreshing(type)
    try {
      const response = await apiFetch(
        `/api/items/refresh-metadata/bulk?type=${type}`,
        { method: 'POST' },
      )
      if (!response.ok) {
        setError(`Couldn’t refresh ${type} metadata.`)
        return
      }
      setRefreshResult(await response.json())
    } catch {
      setError(ACTION_ERROR)
      return
    } finally {
      setRefreshing(null)
    }
    await load()
  }

  async function removeItem(id) {
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
    await load()
  }

  const publicCount = items.filter((item) => item.is_public).length

  /** The shelf view: the public shelf's components, with admin controls. */
  function renderShelf() {
    const rows = items.map((item) => ({
      ...item,
      wanted: item.owned_format === 'none',
    }))
    const typeCounts = countBy(rows, 'type')
    const statusCounts = countBy(rows, 'status')
    const unrated = rows.filter(
      (item) => item.status === 'finished' && item.rating == null,
    )
    const engaged = rows.filter(
      (item) => item.rating != null || item.favorite,
    ).length
    const favoritesFull =
      rows.filter((item) => item.favorite).length >= FAVORITES_LIMIT
    const showNudge =
      !nudgeDismissed && engaged < NUDGE_BELOW && unrated.length > 0
    const visible = sortItems(
      filterItems(rows, filters),
      sort.value,
      sort.direction,
      seed,
    )
    const linkFor = (item) =>
      item.is_public ? itemPath(item.id) : `/admin/collection/${item.id}`

    return (
      <>
        <HeroTiles {...heroFigures(rows)} />

        <NowPlaying
          items={rows}
          linkFor={(item) => `/admin/collection/${item.id}`}
          onWrapUp={openWrapUp}
        />

        <FavoritesRow items={rows} linkFor={linkFor} placeholders />

        {showNudge && (
          <div className="shelf-nudge" role="note">
            <p>{nudgeText(unrated)}</p>
            <button
              type="button"
              className="chip"
              onClick={() => setFilters({ ...NO_FILTER, unrated: true })}
            >
              Show them
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => setNudgeDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        )}

        <ShelfToolbar
          groups={[
            {
              key: 'type',
              label: 'Type',
              options: Object.keys(TYPE_LABEL).map((type) => ({
                value: type,
                label: TYPE_LABEL[type],
                count: typeCounts[type] ?? 0,
              })),
            },
            {
              key: 'status',
              label: 'Status',
              options: STATUS_ORDER.map((value) => ({
                value,
                label: STATUS_LABEL[value],
                count: statusCounts[value] ?? 0,
              })),
            },
            ...[platformGroup(rows)].filter(Boolean),
          ]}
          toggles={[
            {
              key: 'wanted',
              label: 'Want',
              count: rows.filter((item) => item.wanted).length,
            },
            {
              key: 'unrated',
              label: 'Finished, unrated',
              count: unrated.length,
            },
          ]}
          filters={filters}
          onFiltersChange={setFilters}
          sort={sort}
          onSortChange={setSort}
          seed={seed}
          onShuffle={() => setSeed((current) => current + 1)}
          size={size}
          onSizeChange={changeSize}
          dim={dim}
          onDimChange={changeDim}
        />

        {visible.length === 0 ? (
          <p className="muted">Nothing matches those filters.</p>
        ) : (
          <PosterGrid
            items={visible}
            size={size}
            renderCard={(item) => (
              <PosterCard
                item={item}
                to={linkFor(item)}
                dimmed={dim && isDimmable(item)}
                actions={(row) => (
                  <ShelfCardActions
                    item={row}
                    favoritesFull={favoritesFull}
                    onRate={(target, rating) =>
                      patchItem(target.id, { rating })
                    }
                    onFavorite={(target, favorite) => {
                      // Refused here without a round trip; the server
                      // enforces the same rule for every other path.
                      if (favorite && favoritesFull) {
                        setError(FAVORITES_FULL)
                        return
                      }
                      patchItem(target.id, { favorite })
                    }}
                    onStatus={updateStatus}
                    onPublish={(target, isPublic) =>
                      updateVisibility(target.id, isPublic)
                    }
                    onPin={pinItem}
                  />
                )}
              />
            )}
          />
        )}
      </>
    )
  }

  // One header for every state. The bulk controls join it once there are
  // rows: the counts are the point, since publishing a whole collection
  // should be a deliberate act, not an unlabelled button.
  const ready = status === 'ready' && items.length > 0
  const header = (
    <AdminPageHeader
      title="Shelf"
      description={
        ready ? `${publicCount} of ${items.length} public` : undefined
      }
    >
      {ready && (
        <>
          <button
            type="button"
            className="btn sm"
            disabled={bulkBusy || publicCount === items.length}
            onClick={() => setAllVisibility(true)}
          >
            Publish all {items.length}
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={bulkBusy || publicCount === 0}
            onClick={() => setAllVisibility(false)}
          >
            Hide all
          </button>
          {REFRESH_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="btn sm"
              disabled={refreshing !== null}
              onClick={() => refreshMetadata(type)}
            >
              {refreshing === type ? 'Refreshing…' : `Refresh ${type} metadata`}
            </button>
          ))}
          <div className="chip-row" role="group" aria-label="View">
            {[
              ['shelf', 'Shelf'],
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
        </>
      )}
    </AdminPageHeader>
  )

  if (status === 'loading') {
    return (
      <section>
        {header}
        <p className="muted">{slow ? WAKING : 'Loading…'}</p>
      </section>
    )
  }

  if (status === 'unauthorized') {
    return (
      <section>
        {header}
        <p className="admin-error">
          Not signed in. <Link to="/admin">Go to admin</Link>.
        </p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section>
        {header}
        <p className="admin-error">{LOAD_ERROR}</p>
      </section>
    )
  }

  return (
    <section>
      {header}

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      <AddSection area="shelf" onAdded={load}>
        <WrapUpSheet
          subject={wrap}
          onClose={() => setWrap(null)}
          onDone={wrapDone}
        />

        <details
          className="full-add-form"
          ref={fullFormRef}
          open={fullOpen}
          onToggle={(event) => setFullOpen(event.currentTarget.open)}
        >
          <summary>Add with the full form</summary>

          <MetadataPicker type={form.type} onSelect={applyCandidate} />

          <ItemForm
            value={form}
            onChange={setForm}
            onSubmit={addItem}
            busy={saving}
            linkedSource={form.external_source}
            onClearLink={clearLink}
          />
        </details>

        {items.length === 0 ? (
          <p className="muted">Nothing in the collection yet.</p>
        ) : (
          <>
            {refreshResult && (
              <p className="muted" role="status">
                {`Updated ${refreshResult.updated} · skipped ${refreshResult.skipped} · failed ${refreshResult.failed}`}
              </p>
            )}

            {view === 'shelf' ? (
              renderShelf()
            ) : (
              <div className="item-table-wrap">
                {selected.size > 0 && (
                  <div
                    className="bulk-set"
                    role="group"
                    aria-label="Selected items"
                  >
                    <span>{selected.size} selected</span>
                    <label>
                      Set platform
                      <select
                        value={bulkPlatform}
                        onChange={(event) =>
                          setBulkPlatform(event.target.value)
                        }
                      >
                        <option value="">unchanged</option>
                        {PLATFORM_OPTIONS.map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Set format
                      <select
                        value={bulkFormat}
                        onChange={(event) => setBulkFormat(event.target.value)}
                      >
                        <option value="">unchanged</option>
                        {FORMAT_OPTIONS.map(([format, label]) => (
                          <option key={format} value={format}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={
                        bulkBusy || (bulkPlatform === '' && bulkFormat === '')
                      }
                      onClick={applyBulkSet}
                    >
                      Apply
                    </button>
                  </div>
                )}
                <table className="item-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={
                            items.length > 0 && selected.size === items.length
                          }
                          onChange={toggleAll}
                        />
                      </th>
                      <th>
                        <span className="visually-hidden">Cover</span>
                      </th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Rating</th>
                      <th>Public</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.title}`}
                            checked={selected.has(item.id)}
                            onChange={() => toggleSelected(item.id)}
                          />
                        </td>
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
                        <td>{item.platform ?? '—'}</td>
                        <td>
                          <select
                            aria-label={`Status for ${item.title}`}
                            value={item.status}
                            onChange={(event) =>
                              updateStatus(item, event.target.value)
                            }
                          >
                            {statusMoves(item).map((entry) => (
                              <option key={entry.status} value={entry.status}>
                                {entry.label}
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
                          <ConfirmDelete
                            subject={item.title}
                            onConfirm={() => removeItem(item.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </AddSection>
    </section>
  )
}
