import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import ComicCardRun from '../components/ComicCardRun.jsx'
import EmptyState from '../components/EmptyState.jsx'
import FilterChips from '../components/FilterChips.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import ResultBar from '../components/ResultBar.jsx'
import { RunKey } from '../components/RunLanes.jsx'
import SortControl from '../components/SortControl.jsx'
import StatTile, { StatTiles } from '../components/StatTile.jsx'
import { ACTION_ERROR, LOAD_ERROR, WAKING } from '../content/status.js'
import { spine } from '../content/spine.js'
import { apiFetch } from '../lib/api.js'
import {
  COMIC_SORTS,
  chipCounts,
  filterComics,
  publishersByCount,
  searchComics,
  sortComics,
} from '../lib/comics.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'
import { itemPath } from '../lib/spinePaths.js'
import { useElapsed } from '../lib/useElapsed.js'
import { SLOW_LOAD_AFTER_S } from '../lib/waits.js'

const copy = spine.comics
const PUBLISHERS_SHOWN = 3
const SORTS = copy.sorts.map((sort) => ({ ...sort, direction: 'asc' }))

/** Preference keys: the admin shelf's namespace, per page. */
const PREF = {
  chip: 'shelf.admin.comics.chip',
  sort: 'shelf.admin.comics.sort',
}

/** The chips the public page has, and the one only the owner can use. */
const ADMIN_CHIPS = ['following', 'gaps', 'unread', 'want', 'private']

/** A stored preference, only when it is one of the values on offer. */
function storedPref(key, allowed, fallback) {
  const value = readShelfPref(key, fallback)
  return allowed.includes(value) ? value : fallback
}

/**
 * One admin item as the row the public comics page draws, so the card, the
 * lanes and the filters are the same code on both sides. `comic_run` is the
 * API's own summary of the run (`comics.row_run`).
 */
function asRow(item) {
  const run = item.comic_run ?? {}
  return {
    item_id: item.id,
    title: item.title,
    publisher: item.creator,
    year: item.year,
    cover_url: item.cover_url,
    status: item.status,
    rating: item.rating,
    following: Boolean(item.following),
    wanted: item.owned_format === 'none',
    ongoing: Boolean(run.ongoing),
    owned: run.owned ?? 0,
    released: run.released ?? 0,
    missing: run.missing ?? 0,
    run_state: run.state ?? null,
    segments: run.segments ?? [],
    read: run.read ?? 0,
    read_to: item.read_to,
    read_next: run.read_next ?? null,
    next_issue: null,
    is_public: item.is_public,
    external_id: item.external_id,
    external_source: item.external_source,
  }
}

/** The figures, over every series the owner holds. */
function figures(rows) {
  const held = rows.filter((row) => !row.wanted)
  const owned = held.reduce((sum, row) => sum + row.owned, 0)
  const read = held.reduce((sum, row) => sum + row.read, 0)
  return {
    series: held.length,
    complete: held.filter((row) => row.run_state === 'complete').length,
    gaps: held.filter((row) => row.run_state === 'gaps').length,
    owned,
    missing: held.reduce((sum, row) => sum + row.missing, 0),
    readPercent: owned > 0 ? Math.round((read / owned) * 100) : null,
  }
}

/** The card's owner controls, a sibling of its link. */
function ComicActions({ row, onFollow, onPublish }) {
  return (
    <div
      className="comic-actions"
      role="group"
      aria-label={`Actions for ${row.title}`}
    >
      {row.external_source === 'comicvine' && (
        <button
          type="button"
          className="chip"
          aria-pressed={row.following}
          onClick={() => onFollow(row, !row.following)}
        >
          Follow
        </button>
      )}
      <label>
        <input
          type="checkbox"
          checked={row.is_public}
          aria-label={`Public: ${row.title}`}
          onChange={(event) => onPublish(row, event.target.checked)}
        />
        <span aria-hidden="true">Public</span>
      </label>
      {row.is_public && (
        <Link to={itemPath(row.item_id)}>
          {row.missing > 0
            ? `Cover wall · ${row.missing} missing`
            : 'Cover wall'}
        </Link>
      )}
      <Link to={`/admin/collection/${row.item_id}`}>Edit</Link>
    </div>
  )
}

/**
 * The Comics list at /admin/shelf/comics, the admin twin of /shelf/comics
 * (shelf split, item 3): the public page's parts, built from the same
 * pieces, with the owner's controls on each card. One series is one row
 * here and on the public page, and a comic is on no Games list.
 *
 * It reads `GET /api/items`, which carries each series' run (`comic_run`).
 * The per-series sync state is not on that read (`issues_synced_on` is not
 * in `ItemOut`), so the card says nothing about it rather than guess; that
 * is written down for the comics sweep item (queue item 5).
 */
export default function AdminComics() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [chip, setChip] = useState(() =>
    storedPref(PREF.chip, ['all', ...ADMIN_CHIPS], 'all'),
  )
  const [sort, setSort] = useState(() =>
    storedPref(PREF.sort, COMIC_SORTS, 'title'),
  )
  const [publisher, setPublisher] = useState(null)
  const [query, setQuery] = useState('')
  const loadSeq = useRef(0)
  const waiting = status === 'loading'
  const seconds = useElapsed(waiting)

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

  // Every write ends in a reload; only the newest may apply.
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const result = await fetchItems()
    if (seq !== loadSeq.current) return
    setItems(result.items)
    setStatus(result.status)
  }, [fetchItems])

  useEffect(() => {
    let live = true
    fetchItems().then((result) => {
      if (!live) return
      setItems(result.items)
      setStatus(result.status)
    })
    return () => {
      live = false
    }
  }, [fetchItems])

  /** A write that reports its own failure in words and reloads on success. */
  async function write(request, failure) {
    setError(null)
    setBusy(true)
    try {
      const response = await request()
      if (!response.ok) {
        setError(failure)
        return
      }
    } catch {
      setError(ACTION_ERROR)
      return
    } finally {
      setBusy(false)
    }
    await load()
  }

  function setPublic(row, isPublic) {
    return write(
      () =>
        apiFetch(`/api/items/${row.item_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_public: isPublic }),
        }),
      'Couldn’t change that series’ visibility.',
    )
  }

  function setFollowing(row, follow) {
    return write(
      () =>
        apiFetch(`/api/comics/${follow ? 'follow' : 'unfollow'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ external_id: row.external_id }),
        }),
      follow
        ? 'Couldn’t follow that series.'
        : 'Couldn’t unfollow that series.',
    )
  }

  /**
   * Publishes or hides every comic series in one request, by id: the bulk
   * route would otherwise take every type. Publishing asks first.
   */
  async function setAllVisibility(isPublic) {
    if (
      isPublic &&
      !window.confirm(`Publish all ${rows.length} comic series to My Shelf?`)
    ) {
      return
    }
    await write(
      () =>
        apiFetch('/api/items/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            is_public: isPublic,
            ids: rows.map((row) => row.item_id),
          }),
        }),
      'Couldn’t change visibility.',
    )
  }

  async function refreshMetadata() {
    setError(null)
    setRefreshResult(null)
    setRefreshing(true)
    try {
      const response = await apiFetch(
        '/api/items/refresh-metadata/bulk?type=comic',
        { method: 'POST' },
      )
      if (!response.ok) {
        setError('Couldn’t refresh comic metadata.')
        return
      }
      setRefreshResult(await response.json())
    } catch {
      setError(ACTION_ERROR)
      return
    } finally {
      setRefreshing(false)
    }
    await load()
  }

  const rows = items.filter((item) => item.type === 'comic').map(asRow)
  const publicCount = rows.filter((row) => row.is_public).length
  const ready = status === 'ready' && rows.length > 0

  const header = (
    <AdminPageHeader
      title={copy.title}
      description={
        ready ? `${publicCount} of ${rows.length} public` : undefined
      }
    >
      <Link to={copy.path}>
        View {copy.path} <span aria-hidden="true">↗</span>
      </Link>
      <Link to="/admin/collection/add" className="btn sm">
        Add comics
      </Link>
      {ready && (
        <>
          <button
            type="button"
            className="btn sm"
            disabled={busy || publicCount === rows.length}
            onClick={() => setAllVisibility(true)}
          >
            Publish all {rows.length}
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={busy || publicCount === 0}
            onClick={() => setAllVisibility(false)}
          >
            Hide all
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={refreshing}
            onClick={refreshMetadata}
          >
            {refreshing ? 'Refreshing…' : 'Refresh comic metadata'}
          </button>
        </>
      )}
    </AdminPageHeader>
  )

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
  if (waiting) {
    return (
      <section>
        {header}
        <p className="muted" role="status">
          {seconds >= SLOW_LOAD_AFTER_S ? WAKING : 'Loading…'}
        </p>
      </section>
    )
  }
  if (rows.length === 0) {
    return (
      <section>
        {header}
        <EmptyState title={copy.empty} />
      </section>
    )
  }

  const fig = figures(rows)
  const counts = {
    ...chipCounts(rows),
    private: rows.filter((row) => !row.is_public).length,
  }
  const visibleRows = sortComics(
    searchComics(
      chip === 'private'
        ? rows.filter((row) => !row.is_public)
        : filterComics(rows, chip, null),
      query,
    ).filter((row) => publisher == null || row.publisher === publisher),
    sort,
  )
  const filtered = query.trim() !== '' || chip !== 'all' || publisher !== null
  const publishers = publishersByCount(rows)
  const publisherOptions =
    publisher && !publishers.some((entry) => entry.publisher === publisher)
      ? [...publishers, { publisher, count: 0 }]
      : publishers
  const groups = [
    {
      key: 'show',
      label: copy.groupShow,
      options: ADMIN_CHIPS.map((value) => ({
        value,
        label: copy.chips[value],
        count: counts[value],
      })),
    },
    {
      key: 'publisher',
      label: copy.chips.publisher,
      limit: PUBLISHERS_SHOWN,
      options: publisherOptions.map((entry) => ({
        value: entry.publisher,
        label: entry.publisher,
        count: entry.count,
      })),
    },
  ]

  function changeFilters(next) {
    const show = next.show ?? 'all'
    if (show !== chip) {
      setChip(show)
      writeShelfPref(PREF.chip, show)
    }
    setPublisher(next.publisher ?? null)
  }

  function clearAll() {
    changeFilters({})
    setQuery('')
  }

  return (
    <section>
      {header}

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {refreshResult && (
        <p className="muted" role="status">
          {`Updated ${refreshResult.updated} · skipped ${refreshResult.skipped} · failed ${refreshResult.failed}`}
        </p>
      )}

      <StatTiles label="Comic totals">
        <StatTile
          label={copy.figures.series}
          value={fig.series}
          detail={copy.figures.runs(fig.complete, fig.gaps)}
        />
        <StatTile label={copy.figures.issues} value={fig.owned} />
        <StatTile label={copy.figures.missing} value={fig.missing} />
        <StatTile
          label={copy.figures.read}
          value={fig.readPercent == null ? '—' : `${fig.readPercent}%`}
          detail={fig.readPercent == null ? null : copy.figures.readOf}
        />
      </StatTiles>

      <div className="shelf-top">
        <label className="shelf-search">
          <span className="visually-hidden">{copy.search}</span>
          <input
            type="search"
            placeholder={copy.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <section className="shelf-toolbar controls" aria-label="Filter and sort">
        <FilterChips
          labelled
          groups={groups}
          value={{ show: chip === 'all' ? null : chip, publisher }}
          onChange={changeFilters}
        />
        <div className="ctl-row">
          <span className="ctl-label" aria-hidden="true">
            {spine.shelf.sort}
          </span>
          <SortControl
            value={sort}
            direction="asc"
            seed={0}
            onChange={({ value }) => {
              setSort(value)
              writeShelfPref(PREF.sort, value)
            }}
            onShuffle={() => {}}
            sorts={SORTS}
            directional={false}
            select
            hideLabel
          />
        </div>
      </section>

      <ResultBar
        shown={visibleRows.length}
        total={rows.length}
        filtered={filtered}
        noun={copy.noun}
        plural={copy.nounPlural}
        onClear={clearAll}
      >
        <RunKey />
      </ResultBar>

      {visibleRows.length === 0 ? (
        <EmptyState title={copy.noMatch} />
      ) : (
        <PosterGrid
          items={visibleRows.map((row) => ({
            id: row.item_id,
            type: 'comic',
            title: row.title,
            year: row.year,
            creator: row.publisher,
            cover_url: row.cover_url,
            status: row.status,
            rating: row.rating,
            is_public: row.is_public,
            row,
          }))}
          size="comfortable"
          renderCard={(item) => (
            <PosterCard
              item={item}
              to={
                item.is_public
                  ? itemPath(item.id)
                  : `/admin/collection/${item.id}`
              }
              stacked
              run={<ComicCardRun row={item.row} />}
              statusLabels={copy.status}
              actions={() => (
                <ComicActions
                  row={item.row}
                  onFollow={setFollowing}
                  onPublish={setPublic}
                />
              )}
            />
          )}
        />
      )}
    </section>
  )
}
