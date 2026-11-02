import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import CoverImage from '../components/CoverImage.jsx'
import { apiFetch, errorMessage } from '../lib/api.js'
import { shortDate } from '../lib/comics.js'
import { ACTION_ERROR, LOAD_ERROR, WAKING } from '../content/status.js'

/** Got it and Skip take a whole issue number; "1.5" or "Annual" do not. */
const WHOLE_NUMBER = /^\d+$/

/** A 409's own words: errorMessage words every 409 as a running refresh. */
async function detailOf(response, fallback) {
  const body = await response.json().catch(() => null)
  return typeof body?.detail === 'string' ? body.detail : fallback
}

/** The new-item form, prefilled from a Comic Vine volume (spec, section 4). */
function ownLink(result) {
  if (result.item_id) {
    return {
      to: `/admin/collection/${result.item_id}`,
      label: result.in_shelf ? 'Edit' : 'Own…',
    }
  }
  return {
    to: '/admin/collection',
    label: 'Own…',
    state: {
      prefill: {
        type: 'comic',
        title: result.title,
        year: result.year ?? '',
        external_source: 'comicvine',
        external_id: result.external_id,
        owned_format: 'physical',
        status: 'backlog',
      },
    },
  }
}

/**
 * Series search: Comic Vine volumes, each with Follow, Want and Own…
 * against what the shelf already holds.
 */
function SeriesSearch({ onFollowChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function search(event) {
    event.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch(
        `/api/comics/search?q=${encodeURIComponent(query.trim())}`,
      )
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      setResults(await response.json())
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setBusy(false)
    }
  }

  function update(externalId, fields) {
    setResults((current) =>
      current.map((result) =>
        result.external_id === externalId ? { ...result, ...fields } : result,
      ),
    )
  }

  async function post(result, action) {
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch(`/api/comics/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ external_id: result.external_id }),
      })
      if (!response.ok) {
        const fallback = `Couldn’t ${action} ${result.title}.`
        setError(
          response.status === 409
            ? `${result.title}: ${await detailOf(response, fallback)}`
            : await errorMessage(response),
        )
        return null
      }
      return await response.json()
    } catch {
      setError(ACTION_ERROR)
      return null
    }
  }

  async function toggleFollow(result) {
    const action = result.following ? 'unfollow' : 'follow'
    const state = await post(result, action)
    if (!state) return
    update(result.external_id, {
      following: state.following,
      item_id: state.item_id,
    })
    setMessage(
      state.following
        ? `Following ${result.title}.`
        : `Stopped following ${result.title}.`,
    )
    onFollowChange()
  }

  async function want(result) {
    const state = await post(result, 'want')
    if (!state) return
    update(result.external_id, { wanted: true, item_id: state.item_id })
    setMessage(`${result.title} is on your wants.`)
  }

  return (
    <section className="pull-list-search" aria-labelledby="pull-list-search">
      <h2 id="pull-list-search">Find a series</h2>
      <form className="pull-list-search-form" onSubmit={search}>
        <label htmlFor="series-query">Series name</label>
        <input
          id="series-query"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message ?? ''}
      </p>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {results?.length === 0 && (
        <p className="muted">Comic Vine has no series by that name.</p>
      )}
      {results?.length > 0 && (
        <ul className="next-rows">
          {results.map((result) => {
            const own = ownLink(result)
            return (
              <li key={result.external_id} className="next-row">
                <span className="next-row-link">
                  <span className="next-row-cover">
                    <CoverImage
                      src={result.thumbnail_url}
                      type="comic"
                      alt=""
                    />
                  </span>
                  <span className="next-row-title">{result.title}</span>
                </span>
                <div className="next-row-text">
                  <span className="muted">
                    {[
                      result.publisher,
                      result.year,
                      result.issue_count != null &&
                        `${result.issue_count} issues`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="next-row-actions">
                  <button
                    type="button"
                    aria-pressed={result.following}
                    aria-label={`Follow: ${result.title}`}
                    onClick={() => toggleFollow(result)}
                  >
                    {result.following ? 'Following' : 'Follow'}
                  </button>
                  {!result.in_shelf &&
                    (result.wanted ? (
                      <span className="muted">Wanted</span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Want: ${result.title}`}
                        onClick={() => want(result)}
                      >
                        Want
                      </button>
                    ))}
                  <Link
                    to={own.to}
                    state={own.state}
                    aria-label={`${own.label.replace('…', '')}: ${result.title}`}
                  >
                    {own.label}
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * The pull list: followed series' issues this week and the next three, with
 * Got it and Skip in place, and the series with no store date yet.
 */
export default function AdminPullList() {
  const [list, setList] = useState(null)
  const [state, setState] = useState('loading')
  const [slow, setSlow] = useState(false)
  const [done, setDone] = useState(() => new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  // An answered row drops its buttons, which held focus; the status line
  // that names the answer takes it instead.
  const statusRef = useRef(null)
  // One answer in flight at a time: Got it and Skip on the same issue would
  // otherwise both be sent. A ref, so a second click in the same tick sees it.
  const answeringRef = useRef(false)
  const [answering, setAnswering] = useState(false)

  /** Returns rather than setting state; the effect applies it. */
  const fetchList = useCallback(async () => {
    try {
      const response = await apiFetch('/api/comics/pull-list')
      if (response.status === 401) return { state: 'unauthorized' }
      if (!response.ok) return { state: 'error' }
      return { state: 'ready', list: await response.json() }
    } catch {
      return { state: 'error' }
    }
  }, [])

  const apply = useCallback((result) => {
    setState(result.state)
    if (result.list) setList(result.list)
  }, [])

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => setSlow(true), 3000)
    fetchList()
      .then((result) => {
        if (live) apply(result)
      })
      .finally(() => clearTimeout(timer))
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [apply, fetchList])

  // After an action the list is already on screen: a failed re-read keeps
  // it (and its Refresh) and says so, rather than replacing the page.
  const reload = useCallback(
    () =>
      fetchList().then((result) => {
        if (result.state === 'error') setError(LOAD_ERROR)
        else apply(result)
      }),
    [apply, fetchList],
  )

  async function refresh() {
    setRefreshing(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch('/api/comics/refresh', { method: 'POST' })
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      const body = await response.json()
      const failed = body.errors.map((entry) => entry.title)
      setMessage(
        `Refreshed ${body.refreshed} series.` +
          (failed.length ? ` Couldn’t refresh ${failed.join(', ')}.` : ''),
      )
      await reload()
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setRefreshing(false)
    }
  }

  /** Got it or Skip; every row of the series takes the new owned ranges. */
  async function answer(row, action) {
    const key = `${row.item_id}#${row.number}`
    const name = `${row.title} #${row.number}`
    if (answeringRef.current) return
    answeringRef.current = true
    setAnswering(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch(
        `/api/comics/${row.item_id}/issues/${row.number}/${action}`,
        { method: 'POST' },
      )
      if (!response.ok) {
        setError(
          response.status === 409
            ? await detailOf(response, `Couldn’t ${action} ${name}.`)
            : await errorMessage(response),
        )
        return
      }
      const updated = await response.json()
      setDone((current) => new Set(current).add(key))
      setList((current) => ({
        ...current,
        weeks: current.weeks.map((week) => ({
          ...week,
          rows: week.rows.map((other) =>
            other.item_id === row.item_id
              ? { ...other, owned_text: updated.issues_owned }
              : other,
          ),
        })),
      }))
      setMessage(action === 'got' ? `Got ${name}.` : `Skipped ${name}.`)
      statusRef.current?.focus()
    } catch {
      setError(ACTION_ERROR)
    } finally {
      answeringRef.current = false
      setAnswering(false)
    }
  }

  const header = (
    <AdminPageHeader
      title="Pull list"
      description="New issues of the series you follow, from Comic Vine."
    >
      {state === 'ready' && (
        <button
          type="button"
          className="btn primary"
          disabled={refreshing}
          onClick={refresh}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      )}
    </AdminPageHeader>
  )

  if (state === 'unauthorized') {
    return (
      <section className="pull-list">
        {header}
        <p>
          <Link to="/admin">Sign in</Link> to see the pull list.
        </p>
      </section>
    )
  }

  return (
    <section className="pull-list">
      {header}
      {state === 'loading' && (
        <p className="muted">{slow ? WAKING : 'Loading…'}</p>
      )}
      {state === 'error' && <p className="admin-error">{LOAD_ERROR}</p>}
      <p
        ref={statusRef}
        className="catalogue-progress"
        role="status"
        aria-live="polite"
        tabIndex={-1}
      >
        {message ?? ''}
      </p>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {list && (
        <>
          <p className="muted">
            Following {list.following} series · last refresh{' '}
            {list.last_refresh ? shortDate(list.last_refresh) : 'never'}
          </p>
          {list.weeks.map((week) => (
            <section
              key={week.start}
              className="pull-list-week"
              aria-labelledby={`week-${week.start}`}
            >
              <h2 id={`week-${week.start}`}>
                Week of {shortDate(week.start)}
                {week.this_week && (
                  <span className="next-badge">this week</span>
                )}
              </h2>
              {week.rows.length === 0 ? (
                <p className="muted">Nothing out.</p>
              ) : (
                <ul className="next-rows">
                  {week.rows.map((row) => {
                    const key = `${row.item_id}#${row.number}`
                    const name = `${row.title} #${row.number}`
                    const answered = done.has(key)
                    return (
                      <li
                        key={key}
                        className={
                          answered ? 'next-row pull-row-done' : 'next-row'
                        }
                      >
                        <Link
                          to={`/admin/collection/${row.item_id}`}
                          className="next-row-link"
                        >
                          <span className="next-row-cover">
                            <CoverImage
                              src={row.cover_url}
                              type="comic"
                              alt=""
                            />
                          </span>
                          <span className="next-row-title">{name}</span>
                        </Link>
                        <div className="next-row-text">
                          <span className="muted">
                            {[
                              row.publisher,
                              shortDate(row.store_date),
                              `own ${row.owned_text || 'none'} of ${row.released}`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                        {!answered && WHOLE_NUMBER.test(row.number) && (
                          <div className="next-row-actions">
                            <button
                              type="button"
                              aria-label={`Got it: ${name}`}
                              aria-disabled={answering || undefined}
                              onClick={() => answer(row, 'got')}
                            >
                              Got it
                            </button>
                            <button
                              type="button"
                              aria-label={`Skip: ${name}`}
                              aria-disabled={answering || undefined}
                              onClick={() => answer(row, 'skip')}
                            >
                              Skip
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ))}
          {list.undated.length > 0 && (
            <p className="muted">
              No store date yet:{' '}
              {list.undated.map((series) => series.title).join(', ')}.
            </p>
          )}
        </>
      )}
      <SeriesSearch onFollowChange={reload} />
    </section>
  )
}
