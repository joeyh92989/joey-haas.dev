import { useCallback, useEffect, useState } from 'react'
import CoverImage from '../components/CoverImage.jsx'
import { apiFetch } from '../lib/api.js'

const TYPES = ['game', 'movie', 'comic', 'boardgame']
const STATUSES = ['backlog', 'active', 'finished', 'abandoned']

const TYPE_LABEL = {
  game: 'Games',
  movie: 'Film & TV',
  comic: 'Comics',
  boardgame: 'Board games',
}

const MONTH_LABEL = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "2026-03" as "Mar 2026", without letting a bare date string shift a day. */
function formatMonth(key) {
  const [year, month] = key.split('-')
  return MONTH_LABEL.format(
    new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
  )
}

/** Rating out of ten, rendered as five stars with halves. */
function Stars({ rating }) {
  if (!rating) return null
  const full = Math.floor(rating / 2)
  const half = rating % 2 === 1
  return (
    <span className="stars" aria-label={`${rating} out of 10`}>
      <span aria-hidden="true">
        {'★'.repeat(full)}
        {half ? '½' : ''}
      </span>
    </span>
  )
}

/**
 * The public collection showcase.
 *
 * Unlike every other public page, this one calls the API. The free-tier
 * backend sleeps after about fifteen minutes, so a first load can take some
 * thirty seconds while it wakes; that is announced rather than hidden behind a
 * spinner, which would read as broken rather than slow.
 */
export default function Collection() {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [state, setState] = useState('loading')
  const [slow, setSlow] = useState(false)
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')

  /**
   * Loads the collection and returns what to show.
   *
   * Returns rather than setting state so the effect can apply the result in a
   * promise continuation: setting state in an effect body is what
   * react-hooks/set-state-in-effect forbids.
   */
  const load = useCallback(async () => {
    try {
      const [itemsResponse, statsResponse] = await Promise.all([
        apiFetch('/api/public/items'),
        apiFetch('/api/public/stats'),
      ])
      if (!itemsResponse.ok) return { state: 'error', items: [], stats: null }
      return {
        state: 'ready',
        items: await itemsResponse.json(),
        stats: statsResponse.ok ? await statsResponse.json() : null,
      }
    } catch {
      return { state: 'error', items: [], stats: null }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 2000)

    load()
      .then((result) => {
        setItems(result.items)
        setStats(result.stats)
        setState(result.state)
      })
      .finally(() => clearTimeout(timer))

    return () => clearTimeout(timer)
  }, [load])

  if (state === 'loading') {
    return (
      <section>
        <h1>Collection</h1>
        <p className="muted">
          {slow
            ? 'Waking the server — it sleeps when idle, so this takes about thirty seconds.'
            : 'Loading…'}
        </p>
      </section>
    )
  }

  if (state === 'error') {
    return (
      <section>
        <h1>Collection</h1>
        <p className="admin-error">
          The collection could not be loaded. Try again shortly.
        </p>
      </section>
    )
  }

  const visible = items.filter(
    (item) =>
      (type === 'all' || item.type === type) &&
      (status === 'all' || item.status === status),
  )

  const recentlyFinished = items.filter((item) => item.finished_at).slice(0, 8)

  return (
    <section>
      <h1>Collection</h1>
      <p className="muted">
        What I own, what I have finished, and what is still waiting. Mostly
        physical media.
      </p>

      {stats && stats.total > 0 && (
        <div className="collection-stats">
          <div className="stat-block">
            <h2>By type</h2>
            <ul>
              {TYPES.filter((key) => stats.by_type[key]).map((key) => (
                <li key={key}>
                  <span>{TYPE_LABEL[key]}</span>
                  <span className="stat-count">{stats.by_type[key]}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="stat-block">
            <h2>By status</h2>
            <ul>
              {STATUSES.filter((key) => stats.by_status[key]).map((key) => (
                <li key={key}>
                  <span>{key}</span>
                  <span className="stat-count">{stats.by_status[key]}</span>
                </li>
              ))}
            </ul>
          </div>

          {Object.keys(stats.rating_histogram).length > 0 && (
            <div className="stat-block">
              <h2>Ratings</h2>
              <ul className="histogram">
                {Object.entries(stats.rating_histogram)
                  .sort((a, b) => Number(b[0]) - Number(a[0]))
                  .map(([rating, count]) => (
                    <li key={rating}>
                      <span>{rating}</span>
                      <span
                        className="histogram-bar"
                        style={{ '--count': count }}
                        aria-hidden="true"
                      />
                      <span className="stat-count">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {Object.keys(stats.finishes_by_month).length > 0 && (
            <div className="stat-block">
              <h2>Finished per month</h2>
              <ul className="histogram">
                {Object.entries(stats.finishes_by_month)
                  .slice(-6)
                  .map(([month, count]) => (
                    <li key={month}>
                      <span>{formatMonth(month)}</span>
                      <span
                        className="histogram-bar"
                        style={{ '--count': count }}
                        aria-hidden="true"
                      />
                      <span className="stat-count">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {recentlyFinished.length > 0 && (
        <>
          <h2>Recently finished</h2>
          <ul className="recent-strip">
            {recentlyFinished.map((item) => (
              <li key={item.id}>
                <CoverImage src={item.cover_url} type={item.type} alt="" />
                <p className="recent-title">{item.title}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="collection-filters">
        <label htmlFor="filter-type">Type</label>
        <select
          id="filter-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="all">All types</option>
          {TYPES.map((key) => (
            <option key={key} value={key}>
              {TYPE_LABEL[key]}
            </option>
          ))}
        </select>

        <label htmlFor="filter-status">Status</label>
        <select
          id="filter-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : visible.length === 0 ? (
        <p className="muted">Nothing matches those filters.</p>
      ) : (
        <ul className="poster-grid">
          {visible.map((item) => (
            <li key={item.id} className={`poster poster-${item.type}`}>
              <CoverImage src={item.cover_url} type={item.type} alt="" />
              <p className="poster-title">
                {item.favorite && (
                  <span title="Favourite" aria-label="Favourite">
                    ♥{' '}
                  </span>
                )}
                {item.title}
              </p>
              <p className="poster-meta muted">
                {item.year ? `${item.year}` : ''}
                {item.year && item.creator ? ' · ' : ''}
                {item.creator ?? ''}
              </p>
              <Stars rating={item.rating} />
            </li>
          ))}
        </ul>
      )}

      <footer className="attribution">
        <p>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.{' '}
          <a href="https://www.themoviedb.org/" rel="noreferrer noopener">
            TMDB
          </a>
        </p>
        <p>
          Game data from{' '}
          <a href="https://www.igdb.com/" rel="noreferrer noopener">
            IGDB
          </a>
          . Comic data from{' '}
          <a href="https://comicvine.gamespot.com/" rel="noreferrer noopener">
            Comic Vine
          </a>
          .
        </p>
      </footer>
    </section>
  )
}
