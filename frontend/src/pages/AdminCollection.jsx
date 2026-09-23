import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import ItemForm, {
  FORMAT_OPTIONS,
  PLATFORM_OPTIONS,
} from '../components/ItemForm.jsx'
import MetadataPicker from '../components/MetadataPicker.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import ShelfCardActions from '../components/ShelfCardActions.jsx'
import ShelfToolbar from '../components/ShelfToolbar.jsx'
import { apiFetch } from '../lib/api.js'
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
import { localToday, statusTransition } from '../lib/statusTransition.js'
import {
  FavoritesRow,
  HeroNumbers,
  isDimmable,
  platformGroup,
} from './Collection.jsx'

const STATUSES = STATUS_ORDER

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
const FAVORITES_FULL = `You already have ${FAVORITES_LIMIT} favourites. Unfavourite one first.`

/** Below this many rated or favourited items, the shelf asks for ratings. */
const NUDGE_BELOW = 5

/**
 * The shelf's headline figures, computed from the admin rows: NULL
 * owned_format is owned, and only an explicit `none` is the want list.
 */
function heroFigures(items) {
  const year = new Date().getUTCFullYear()
  return {
    owned: items.filter((item) => item.owned_format !== 'none').length,
    finished: items.filter((item) => item.status === 'finished').length,
    finishedThisYear: items.filter((item) =>
      item.finished_at?.startsWith(`${year}-`),
    ).length,
  }
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
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
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
  const [refreshing, setRefreshing] = useState(false)
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
    const body = {
      ...form,
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
        setError('Could not save that item.')
        return
      }
      // Enrichment is a second call on purpose: the snapshot, cover, and
      // creator are fetched server-side from the linked source rather than
      // trusted from the browser. A failure here leaves a perfectly good
      // item that is simply not enriched yet, so it is not an error.
      if (body.external_source && body.external_id) {
        const created = await response.json()
        await apiFetch(`/api/items/${created.id}/refresh-metadata`, {
          method: 'POST',
        }).catch(() => {})
      }
    } catch {
      setError('Could not reach the API.')
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
  async function patchItem(id, body, failure = 'Could not update that item.') {
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
      setError('Could not reach the API.')
      return
    }
    await load()
  }

  /**
   * Changes status through statusTransition, in both views, so a finish
   * counts a completion and dates itself wherever it is made.
   */
  function updateStatus(item, nextStatus) {
    return patchItem(item.id, statusTransition(item, nextStatus, localToday()))
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
      'Could not change that item’s visibility.',
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
      !window.confirm(
        `Publish all ${items.length} items to the public collection page?`,
      )
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
        setError('Could not change visibility.')
        return
      }
    } catch {
      setError('Could not reach the API.')
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
          typeof detail === 'string' ? detail : 'Could not update those items.',
        )
        return
      }
    } catch {
      setError('Could not reach the API.')
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
   * Re-fetches every IGDB-linked game. Synchronous on the server and a few
   * requests long, so the counts come back in the same response.
   */
  async function refreshGames() {
    setError(null)
    setRefreshResult(null)
    setRefreshing(true)
    try {
      const response = await apiFetch(
        '/api/items/refresh-metadata/bulk?type=game',
        { method: 'POST' },
      )
      if (!response.ok) {
        setError('Could not refresh game metadata.')
        return
      }
      setRefreshResult(await response.json())
    } catch {
      setError('Could not reach the API.')
      return
    } finally {
      setRefreshing(false)
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
      item.is_public ? `/collection/${item.id}` : `/admin/collection/${item.id}`

    return (
      <>
        <HeroNumbers {...heroFigures(rows)} />

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
                  />
                )}
              />
            )}
          />
        )}
      </>
    )
  }

  if (status === 'loading') {
    return (
      <section>
        <h1>Collection</h1>
        <p className="muted">{slow ? 'Waking the server…' : 'Loading…'}</p>
      </section>
    )
  }

  if (status === 'unauthorized') {
    return (
      <section>
        <h1>Collection</h1>
        <p className="admin-error">
          Not signed in. <Link to="/admin">Go to admin</Link>.
        </p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section>
        <h1>Collection</h1>
        <p className="admin-error">
          Could not reach the API. Try again shortly.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h1>Collection</h1>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      <p className="muted">
        <Link to="/admin/import">Import from photos →</Link>
        {' · '}
        <Link to="/admin/play-next">Play Next →</Link>
      </p>

      <MetadataPicker type={form.type} onSelect={applyCandidate} />

      <ItemForm
        value={form}
        onChange={setForm}
        onSubmit={addItem}
        busy={saving}
        linkedSource={form.external_source}
        onClearLink={clearLink}
      />

      {items.length === 0 ? (
        <p className="muted">Nothing in the collection yet.</p>
      ) : (
        <>
          {/* The counts are the point: publishing a whole collection should
              be a deliberate act, not an unlabelled button. */}
          <div className="bulk-visibility">
            <span className="muted">
              {publicCount} of {items.length} public
            </span>
            <button
              type="button"
              disabled={bulkBusy || publicCount === items.length}
              onClick={() => setAllVisibility(true)}
            >
              Publish all {items.length}
            </button>
            <button
              type="button"
              disabled={bulkBusy || publicCount === 0}
              onClick={() => setAllVisibility(false)}
            >
              Hide all
            </button>
            <button type="button" disabled={refreshing} onClick={refreshGames}>
              {refreshing ? 'Refreshing…' : 'Refresh game metadata'}
            </button>
            {refreshResult && (
              <span className="muted" role="status">
                {`Updated ${refreshResult.updated} · skipped ${refreshResult.skipped} · failed ${refreshResult.failed}`}
              </span>
            )}
          </div>

          <div className="view-toggle chip-row" role="group" aria-label="View">
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
                      onChange={(event) => setBulkPlatform(event.target.value)}
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
                          {STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {value}
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
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
