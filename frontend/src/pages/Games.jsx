import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import CoverKey from '../components/CoverKey.jsx'
import EmptyState from '../components/EmptyState.jsx'
import LoadState from '../components/LoadState.jsx'
import NowPlaying from '../components/NowPlaying.jsx'
import PageHeader from '../components/PageHeader.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import ResultBar from '../components/ResultBar.jsx'
import ShelfToolbar from '../components/ShelfToolbar.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import {
  FavoritesRow,
  FinishesStrip,
  OnCartridge,
  RatingHistogram,
  StatusBar,
  lastTwelveMonths,
} from '../components/ShelfOverview.jsx'
import StatTile, { StatTiles } from '../components/StatTile.jsx'
import { daily } from '../content/daily.js'
import { spine } from '../content/spine.js'
import { dailyPool } from '../lib/daily.js'
import { formatDate, ownerYear } from '../lib/formatDate.js'
import { STALE_HOURS } from '../lib/nightly.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import {
  countBy,
  filterItems,
  isDimmable,
  NO_FILTER,
  platformGroup,
  readShelfPref,
  searchItems,
  sortItems,
  STATUS_LABEL,
  STATUS_ORDER,
  writeShelfPref,
} from '../lib/shelf.js'
import { itemPath } from '../lib/spinePaths.js'
import { bandCounts } from '../lib/next.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'

const NARROW = '(max-width: 34rem)'
const COUNT = new Intl.NumberFormat('en')
const copy = spine.shelf
const games = spine.games
const SIZES = ['comfortable', 'compact']
const SKELETON_CARDS = 12
const NO_ITEMS = []

/** Whether the catalog was last refreshed over STALE_HOURS ago (or never). */
function isStale(refreshedAt, now) {
  return (
    !refreshedAt || now - Date.parse(refreshedAt) > STALE_HOURS * 3600 * 1000
  )
}

/** The three figures over the grid. */
function GamesFigures({ stats }) {
  const fig = games.figures
  const finished = stats.by_status.finished ?? 0
  return (
    <StatTiles>
      <StatTile label={fig.owned} value={stats.owned} />
      <StatTile
        label={fig.finished}
        value={finished}
        detail={
          stats.owned > 0
            ? fig.finishedShare(Math.round((finished / stats.owned) * 100))
            : null
        }
      />
      <StatTile
        label={fig.finishedIn(ownerYear())}
        value={stats.finished_this_year}
      />
    </StatTiles>
  )
}

/**
 * The public Games list at /shelf/games (shelf split, item 3).
 *
 * Unlike every other public page, this one calls the API. The free-tier
 * backend sleeps after about fifteen minutes, so the page first paints the
 * build-time snapshot (lib/snapshot.js) and swaps in live data when it
 * arrives. Only without a snapshot does a first load wait on the wake-up,
 * which is announced beside a skeleton grid rather than hidden behind a
 * spinner that would read as broken rather than slow.
 *
 * The items snapshot holds every public type, so the page keeps the games;
 * its figures and charts read `stats?type=game` (`LIVE_PATHS`). Filtering
 * and sorting are client-side over the games. Poster size and dimming persist
 * under `shelf.public.*`; the filters and sort do not, so a returning visitor
 * sees the default shelf.
 */
export default function Games() {
  usePageTitle(`${games.title} · ${spine.name}`)
  // Read here, once: Tonight's title for the links line, the status for the
  // line under Overview.
  const next = useSnapshotThenLive('next').data
  const status = useSnapshotThenLive('status').data
  const itemsRead = useSnapshotThenLive('items')
  const statsRead = useSnapshotThenLive('stats')
  const allItems = itemsRead.data ?? NO_ITEMS
  const items = allItems.filter((item) => item.type === 'game')
  const stats = statsRead.data
  const failed = itemsRead.failed
  const liveItems = itemsRead.live
  const retry = () => {
    itemsRead.retry()
    if (statsRead.failed) statsRead.retry()
  }
  const [filters, setFilters] = useState(NO_FILTER)
  // The site search's no-match link lands here as /shelf?q=… (redirected to
  // /shelf/games?q=…), also from the page itself, where it stays mounted: a
  // new q replaces the query. Never written back, so typing does not rewrite
  // the URL.
  const [searchParams] = useSearchParams()
  const urlQuery = searchParams.get('q')
  const [query, setQuery] = useState(() => urlQuery ?? '')
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery)
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery)
    if (urlQuery !== null) setQuery(urlQuery)
  }
  const [sort, setSort] = useState({ value: 'added', direction: 'desc' })
  const [seed, setSeed] = useState(() => Date.now())
  const [size, setSize] = useState(() => {
    const stored = readShelfPref('shelf.public.size', 'comfortable')
    return SIZES.includes(stored) ? stored : 'comfortable'
  })
  const [dim, setDim] = useState(() => readShelfPref('shelf.public.dim', false))
  const narrow = useMediaQuery(NARROW)
  const [chartsOpen, setChartsOpen] = useState(false)
  const searchField = useRef(null)
  // Read once, so a re-render never flips the catalog line's warning.
  const [mountedAt] = useState(() => Date.now())

  function changeSize(next) {
    setSize(next)
    writeShelfPref('shelf.public.size', next)
  }

  function changeDim(next) {
    setDim(next)
    writeShelfPref('shelf.public.dim', next)
  }

  const waiting = !itemsRead.data && !failed
  const header = (
    <>
      <SpineHeader />
      <PageHeader title={games.title} lede={games.lede} />
    </>
  )

  if (!itemsRead.data) {
    return (
      <section>
        {header}
        <LoadState loading={waiting} failed={failed} onRetry={retry} />
        {waiting && (
          <ul className="skeleton-grid" aria-hidden="true">
            {Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <li key={index} className="skeleton-card">
                <span className="skeleton-cover" />
                <span className="skeleton-line" />
                <span className="skeleton-line skeleton-line-short" />
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  const statusCounts = countBy(items, 'status')
  const groups = [
    {
      key: 'status',
      label: copy.groupStatus,
      options: STATUS_ORDER.map((status) => ({
        value: status,
        label: STATUS_LABEL[status],
        count: statusCounts[status] ?? 0,
      })),
    },
  ]
  const platforms = platformGroup(items)
  if (platforms) groups.push(platforms)
  const toggles = [
    {
      key: 'wanted',
      label: 'Want',
      count: items.filter((item) => item.wanted).length,
    },
  ]
  const visible = sortItems(
    filterItems(searchItems(items, query), filters),
    sort.value,
    sort.direction,
    seed,
  )
  const filtered =
    query.trim() !== '' ||
    Object.keys(NO_FILTER).some((key) => filters[key] !== NO_FILTER[key])
  const pagingKey = JSON.stringify([filters, query.trim(), sort, seed])
  const tonightTitle = next ? bandCounts(next).tonight : null
  const months = lastTwelveMonths()
  const hasRatings = stats && Object.keys(stats.rating_histogram).length > 0
  const hasRecentFinishes =
    stats && months.some((month) => stats.finishes_by_month[month.key])

  function clearAll() {
    setFilters(NO_FILTER)
    setQuery('')
    // Clear filters unmounts itself; focus would fall to the body.
    searchField.current?.focus()
  }

  return (
    <section>
      {header}
      <LoadState failed={failed} stale live={liveItems} onRetry={retry} />

      {items.length === 0 ? (
        <EmptyState title={games.empty} />
      ) : (
        <>
          {stats && <GamesFigures stats={stats} />}

          <div className="shelf-top">
            <p className="shelf-links">
              <Link to={spine.next.path}>
                {tonightTitle
                  ? `${spine.next.band.tonight} ${tonightTitle}`
                  : spine.next.band.lead}
              </Link>
              {dailyPool(items).length > 0 && (
                <Link to={daily.path}>{daily.entry}</Link>
              )}
              <a href="#overview">{copy.overview}</a>
            </p>
            <label className="shelf-search">
              <span className="visually-hidden">{games.search}</span>
              <input
                ref={searchField}
                id="shelf-search"
                type="search"
                placeholder={games.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <NowPlaying items={items} linkFor={(item) => itemPath(item.id)} />

          <ShelfToolbar
            labelled
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

          <ResultBar
            shown={visible.length}
            total={items.length}
            filtered={filtered}
            noun={games.noun}
            onClear={clearAll}
          >
            <CoverKey />
          </ResultBar>

          {visible.length === 0 ? (
            <EmptyState
              title={
                query.trim() ? games.noMatchSearch(query.trim()) : games.noMatch
              }
            />
          ) : (
            <PosterGrid
              items={visible}
              size={size}
              paged
              resetKey={pagingKey}
              renderCard={(item) => (
                <PosterCard
                  item={item}
                  to={itemPath(item.id)}
                  dimmed={dim && isDimmable(item)}
                />
              )}
            />
          )}

          <section
            className="shelf-overview"
            id="overview"
            aria-labelledby="overview-title"
          >
            <h2 id="overview-title">{copy.overview}</h2>
            <FavoritesRow
              items={items}
              linkFor={(item) => itemPath(item.id)}
              headingLevel={3}
            />
            {stats && stats.total > 0 && (
              <>
                {narrow && (
                  <button
                    type="button"
                    className="disclosure"
                    aria-expanded={chartsOpen}
                    aria-controls={chartsOpen ? 'shelf-charts' : undefined}
                    onClick={() => setChartsOpen((open) => !open)}
                  >
                    {games.overviewCharts}
                  </button>
                )}
                {(!narrow || chartsOpen) && (
                  <div className="shelf-stats" id="shelf-charts">
                    <StatusBar byStatus={stats.by_status} headingLevel={3} />
                    {hasRatings && (
                      <RatingHistogram
                        histogram={stats.rating_histogram}
                        average={stats.average_rating}
                        headingLevel={3}
                      />
                    )}
                    {hasRecentFinishes && (
                      <FinishesStrip
                        months={months}
                        byMonth={stats.finishes_by_month}
                        finishedThisYear={stats.finished_this_year}
                        headingLevel={3}
                      />
                    )}
                    <OnCartridge byFormat={stats.by_format} headingLevel={3} />
                  </div>
                )}
              </>
            )}
            <p className="shelf-behind">
              <span>{copy.behind}</span>{' '}
              {status && (
                <>
                  {copy.behindLine(
                    COUNT.format(status.titles),
                    status.stores_watched,
                    status.refreshed_at
                      ? formatDate(status.refreshed_at)
                      : null,
                    isStale(status.refreshed_at, mountedAt),
                  )}{' '}
                </>
              )}
              <Link to={spine.links.post.to}>{spine.links.post.label}</Link>
            </p>
          </section>
        </>
      )}

      <footer className="attribution">
        <p className="spine-project">
          {spine.projectLine}{' '}
          <Link to={spine.links.post.to}>
            {spine.links.post.label} <span aria-hidden="true">&rarr;</span>
          </Link>{' '}
          <a href={spine.links.source.href}>
            {spine.links.source.label} <span aria-hidden="true">&rarr;</span>
          </a>
        </p>
        <p>
          Game data from{' '}
          <a href="https://www.igdb.com/" rel="noreferrer noopener">
            IGDB
          </a>
          .
        </p>
      </footer>
    </section>
  )
}
