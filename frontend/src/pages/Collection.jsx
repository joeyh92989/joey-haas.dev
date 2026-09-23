import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
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

const TYPES = ['game', 'movie', 'comic', 'boardgame']

const TYPE_LABEL = {
  game: 'Games',
  movie: 'Film & TV',
  comic: 'Comics',
  boardgame: 'Board games',
}

const SIZES = ['comfortable', 'compact']
const FAVOURITES_SHOWN = 4
const SKELETON_CARDS = 12
const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const MONTH_LABEL = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * The twelve months ending with the current one, oldest first, as the
 * "YYYY-MM" keys the stats endpoint returns. UTC, like the server's year.
 */
function lastTwelveMonths(now = new Date()) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - index), 1),
    )
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    return { key, label: MONTH_LABEL.format(date) }
  })
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Finished and abandoned fade back when dimming is on; the backlog never does. */
export const isDimmable = (item) =>
  item.status === 'finished' || item.status === 'abandoned'

/**
 * The shelf's headline figures: owned, finished, finished this year. Shared
 * with the admin shelf, which computes them from its own rows.
 *
 * @param {object} props
 * @param {number} props.owned
 * @param {number} props.finished
 * @param {number} props.finishedThisYear
 */
export function HeroNumbers({ owned, finished, finishedThisYear }) {
  const year = new Date().getUTCFullYear()
  const figures = [
    ['Owned', owned],
    ['Finished', finished],
    [`Finished in ${year}`, finishedThisYear],
  ]
  return (
    <dl className="hero-numbers">
      {figures.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Up to four favourite covers, highest rated first, then by title. Shared
 * with the admin shelf.
 *
 * Public renders nothing without a favourite. Admin passes `placeholders`,
 * which always renders the row with empty slots and a hint, because picking
 * favourites is part of the job there. Admin also shows every favourite when
 * there are more than four -- rows favourited before the API capped them --
 * with a note, so the extras can be found and trimmed.
 *
 * @param {object} props
 * @param {object[]} props.items - Every shelf row; favourites are chosen here.
 * @param {(item: object) => string} props.linkFor - Where a cover links.
 * @param {boolean} [props.placeholders] - Always render, padding with slots.
 */
export function FavoritesRow({ items, linkFor, placeholders = false }) {
  const all = sortItems(
    items.filter((item) => item.favorite),
    'rating',
    'desc',
    0,
  )
  const favourites = placeholders ? all : all.slice(0, FAVOURITES_SHOWN)
  if (favourites.length === 0 && !placeholders) return null
  const empty = placeholders
    ? Math.max(FAVOURITES_SHOWN - favourites.length, 0)
    : 0
  const extra = favourites.length - FAVOURITES_SHOWN

  return (
    <section className="favourites" aria-label="Favourites">
      <h2>Favourites</h2>
      <ul className="favourites-row">
        {favourites.map((item) => (
          <li key={item.id}>
            <Link to={linkFor(item)} className="favourite-link">
              <CoverImage src={item.cover_url} type={item.type} alt="" />
              <span className="visually-hidden">{item.title}</span>
            </Link>
          </li>
        ))}
        {Array.from({ length: empty }, (_, index) => (
          <li key={`empty-${index}`} className="favourite-empty" />
        ))}
      </ul>
      {extra > 0 && (
        <p className="muted favourites-hint">
          {`${favourites.length} favourites. The public page shows four; unfavourite ${extra}.`}
        </p>
      )}
      {empty > 0 && (
        <p className="muted favourites-hint">
          Pick your favourites — the heart on any card.
        </p>
      )}
    </section>
  )
}

/** One stacked bar of the four statuses, in shelf order, with a legend. */
function StatusBar({ byStatus }) {
  const present = STATUS_ORDER.filter((status) => byStatus[status] > 0)
  return (
    <div className="stat-card stat-status">
      <h2>Status</h2>
      <div className="status-bar">
        {present.map((status) => (
          <span
            key={status}
            className="status-segment"
            data-status={status}
            role="img"
            aria-label={`${STATUS_LABEL[status]}: ${byStatus[status]}`}
            style={{ '--count': byStatus[status] }}
          />
        ))}
      </div>
      <ul className="status-legend">
        {present.map((status) => (
          <li key={status}>
            <span
              className="status-swatch"
              data-status={status}
              aria-hidden="true"
            />
            <span>{STATUS_LABEL[status]}</span>
            <span className="stat-count">{byStatus[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Ten bars for ratings 1 to 10 beside the average. Each bar is focusable and
 * names its count; the numeral above it shows on hover and on focus alike.
 */
function RatingHistogram({ histogram, average }) {
  const counts = RATINGS.map((rating) => histogram[rating] ?? 0)
  const most = Math.max(...counts, 1)
  return (
    <section className="stat-card stat-ratings" aria-label="Ratings">
      <h2>Ratings</h2>
      <div className="stat-figure">
        <div className="rating-bars">
          {RATINGS.map((rating, index) => (
            <span
              key={rating}
              className="rating-bar"
              role="img"
              tabIndex={0}
              aria-label={`Rated ${rating}: ${plural(counts[index], 'item')}`}
              style={{ '--share': counts[index] / most }}
            >
              <span className="rating-bar-count">{counts[index]}</span>
            </span>
          ))}
        </div>
        {average != null && (
          <p className="stat-big">
            <span className="stat-big-number">{average.toFixed(1)}</span>
            <span className="stat-big-label">Average</span>
          </p>
        )}
      </div>
    </section>
  )
}

/** Twelve months of finishes, the current month at the right. */
function FinishesStrip({ months, byMonth, finishedThisYear }) {
  const counts = months.map((month) => byMonth[month.key] ?? 0)
  const most = Math.max(...counts, 1)
  return (
    <section className="stat-card stat-finishes" aria-label="Finishes">
      <h2>Finishes</h2>
      <div className="stat-figure">
        <div className="month-bars">
          {months.map((month, index) => (
            <span
              key={month.key}
              className="month-bar"
              role="img"
              aria-label={`${month.label}: ${counts[index]} finished`}
              style={{ '--share': counts[index] / most }}
            />
          ))}
        </div>
        <p className="stat-big">
          <span className="stat-big-label">
            {`${finishedThisYear} in ${new Date().getUTCFullYear()}`}
          </span>
        </p>
      </div>
    </section>
  )
}

/**
 * The public collection showcase.
 *
 * Unlike every other public page, this one calls the API. The free-tier
 * backend sleeps after about fifteen minutes, so a first load can take some
 * thirty seconds while it wakes; that is announced beside a skeleton grid
 * rather than hidden behind a spinner, which would read as broken rather than
 * slow.
 *
 * Filtering and sorting are client-side over the whole public list. Poster
 * size and dimming persist under `shelf.public.*`; the filters and sort do
 * not, so a returning visitor sees the default shelf.
 */
export default function Collection() {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [state, setState] = useState('loading')
  const [slow, setSlow] = useState(false)
  const [filters, setFilters] = useState(NO_FILTER)
  const [sort, setSort] = useState({ value: 'added', direction: 'desc' })
  const [seed, setSeed] = useState(() => Date.now())
  const [size, setSize] = useState(() => {
    const stored = readShelfPref('shelf.public.size', 'comfortable')
    return SIZES.includes(stored) ? stored : 'comfortable'
  })
  const [dim, setDim] = useState(() => readShelfPref('shelf.public.dim', false))

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

  function changeSize(next) {
    setSize(next)
    writeShelfPref('shelf.public.size', next)
  }

  function changeDim(next) {
    setDim(next)
    writeShelfPref('shelf.public.dim', next)
  }

  if (state === 'loading') {
    return (
      <section>
        <h1>Collection</h1>
        <p className="muted" role="status">
          {slow
            ? 'Waking the server — it sleeps when idle, so this takes about thirty seconds.'
            : 'Loading…'}
        </p>
        <ul className="skeleton-grid" aria-hidden="true">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <li key={index} className="skeleton-card">
              <span className="skeleton-cover" />
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line-short" />
            </li>
          ))}
        </ul>
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

  const typeCounts = countBy(items, 'type')
  const statusCounts = countBy(items, 'status')
  const groups = [
    {
      key: 'type',
      label: 'Type',
      options: TYPES.map((type) => ({
        value: type,
        label: TYPE_LABEL[type],
        count: typeCounts[type] ?? 0,
      })),
    },
    {
      key: 'status',
      label: 'Status',
      options: STATUS_ORDER.map((status) => ({
        value: status,
        label: STATUS_LABEL[status],
        count: statusCounts[status] ?? 0,
      })),
    },
  ]
  const toggles = [
    {
      key: 'wanted',
      label: 'Want',
      count: items.filter((item) => item.wanted).length,
    },
  ]
  const visible = sortItems(
    filterItems(items, filters),
    sort.value,
    sort.direction,
    seed,
  )
  const months = lastTwelveMonths()
  const hasRatings = stats && Object.keys(stats.rating_histogram).length > 0
  const hasRecentFinishes =
    stats && months.some((month) => stats.finishes_by_month[month.key])

  return (
    <section>
      <h1>Collection</h1>
      <p className="muted">
        What I own, what I have finished, and what is still waiting. Mostly
        physical media.
      </p>

      {items.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <>
          {stats && (
            <HeroNumbers
              owned={stats.owned}
              finished={stats.by_status.finished ?? 0}
              finishedThisYear={stats.finished_this_year}
            />
          )}

          <FavoritesRow
            items={items}
            linkFor={(item) => `/collection/${item.id}`}
          />

          {stats && stats.total > 0 && (
            <div className="shelf-stats">
              <StatusBar byStatus={stats.by_status} />
              {hasRatings && (
                <RatingHistogram
                  histogram={stats.rating_histogram}
                  average={stats.average_rating}
                />
              )}
              {hasRecentFinishes && (
                <FinishesStrip
                  months={months}
                  byMonth={stats.finishes_by_month}
                  finishedThisYear={stats.finished_this_year}
                />
              )}
            </div>
          )}

          <ShelfToolbar
            groups={groups}
            toggles={toggles}
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
                  to={`/collection/${item.id}`}
                  dimmed={dim && isDimmable(item)}
                />
              )}
            />
          )}
        </>
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
