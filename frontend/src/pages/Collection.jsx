import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import CoverKey from '../components/CoverKey.jsx'
import LoadState from '../components/LoadState.jsx'
import NowPlaying from '../components/NowPlaying.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import ResultBar from '../components/ResultBar.jsx'
import ShelfToolbar from '../components/ShelfToolbar.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import { daily } from '../content/daily.js'
import { spine } from '../content/spine.js'
import { dailyPool } from '../lib/daily.js'
import { formatDate, ownerMonth, ownerYear } from '../lib/formatDate.js'
import { STALE_HOURS } from '../lib/nightly.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import {
  countBy,
  filterItems,
  NO_FILTER,
  readShelfPref,
  searchItems,
  sortItems,
  STATUS_LABEL,
  STATUS_ORDER,
  topFavourites,
  writeShelfPref,
} from '../lib/shelf.js'
import { itemPath } from '../lib/spinePaths.js'
import { bandCounts } from '../lib/next.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'

const TYPES = ['game', 'movie', 'comic', 'boardgame']

const TYPE_LABEL = {
  game: 'Games',
  movie: 'Film & TV',
  comic: 'Comics',
  boardgame: 'Board games',
}

const NARROW = '(max-width: 34rem)'
const COUNT = new Intl.NumberFormat('en')
const copy = spine.shelf
const SIZES = ['comfortable', 'compact']
const FAVOURITES_SHOWN = 4
const SKELETON_CARDS = 12
const NO_ITEMS = []
const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const MONTH_LABEL = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const MONTH_INITIAL = new Intl.DateTimeFormat('en', {
  month: 'narrow',
  timeZone: 'UTC',
})

/**
 * The twelve months ending with the current one, oldest first, as the
 * "YYYY-MM" keys the stats endpoint returns. The current month is the
 * owner's (`ownerMonth`), as the year beside it is.
 */
export function lastTwelveMonths(now = new Date()) {
  const { year, month } = ownerMonth(now)
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (11 - index), 1))
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    return {
      key,
      label: MONTH_LABEL.format(date),
      initial: MONTH_INITIAL.format(date),
    }
  })
}

/** Key-card platforms by IGDB id, as stats.by_format keys them. */
const KEY_CARD_PLATFORM_NAMES = { 508: 'Nintendo Switch 2' }

/**
 * The platform chip group, or null while there is only one platform: a row
 * with one chip filters nothing. Shared with the admin shelf.
 *
 * @param {object[]} items - Shelf rows; those without a platform are ignored.
 * @returns {object|null} A FilterChips group.
 */
export function platformGroup(items) {
  const counts = countBy(
    items.filter((item) => item.platform),
    'platform',
  )
  const platforms = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
  if (platforms.length < 2) return null
  return {
    key: 'platform',
    label: 'Platform',
    options: platforms.map((platform) => ({
      value: platform,
      label: platform,
      count: counts[platform],
    })),
  }
}

/**
 * The key-card platforms' copies: how many are full cartridges, of how many,
 * then what the rest are. Unknowns are stated, never folded into the
 * cartridge count. A stats block like its neighbours, with a heading; it
 * renders only once at least one format has been recorded.
 */
function OnCartridge({ byFormat, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`
  const platforms = Object.entries(byFormat ?? {}).filter(
    ([, counts]) =>
      counts.game_card + counts.game_key_card + counts.code_in_box > 0,
  )
  if (platforms.length === 0) return null
  return (
    <section className="stat-card stat-cartridge" aria-label="On cartridge">
      <Heading>On cartridge</Heading>
      {platforms.map(([platformId, counts]) => {
        const name =
          KEY_CARD_PLATFORM_NAMES[platformId] ?? `Platform ${platformId}`
        const rest = [
          [
            counts.game_key_card,
            counts.game_key_card === 1 ? 'Game-Key Card' : 'Game-Key Cards',
          ],
          [
            counts.code_in_box,
            counts.code_in_box === 1 ? 'code in a box' : 'codes in a box',
          ],
          [counts.unknown, 'not recorded'],
        ]
          .filter(([count]) => count > 0)
          .map(([count, label]) => `${count} ${label}`)
        return (
          <div key={platformId} className="cartridge-platform">
            <p>{`${name} — ${counts.game_card} of ${counts.total}`}</p>
            {rest.length > 0 && <p className="muted">{rest.join(' · ')}</p>}
          </div>
        )
      })}
    </section>
  )
}

/** Whether the catalog was last refreshed over STALE_HOURS ago (or never). */
function isStale(refreshedAt, now) {
  return (
    !refreshedAt || now - Date.parse(refreshedAt) > STALE_HOURS * 3600 * 1000
  )
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Finished and abandoned fade back when dimming is on; the backlog never does. */
export const isDimmable = (item) =>
  item.status === 'finished' || item.status === 'abandoned'

/**
 * A row of headline figures. The shelf passes owned, finished and finished
 * this year; Comics passes its own (spec, S2).
 *
 * @param {object} props
 * @param {{label: string, value: number|string}[]} props.figures
 * @param {boolean} [props.inline] - One line of small figures (the shelf's
 *   totals) instead of the big row Comics uses.
 */
export function HeroNumbers({ figures, inline = false }) {
  return (
    <dl
      className={inline ? 'hero-numbers hero-numbers-line' : 'hero-numbers'}
      data-figures={figures.length}
    >
      {figures.map(({ label, value }) => (
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
 * @param {2|3} [props.headingLevel] - The heading's level: 3 under the
 *   public shelf's Overview, 2 where the row sits straight under the page.
 */
export function FavoritesRow({
  items,
  linkFor,
  placeholders = false,
  headingLevel = 2,
}) {
  const Heading = `h${headingLevel}`
  const all = topFavourites(items)
  const favourites = placeholders ? all : all.slice(0, FAVOURITES_SHOWN)
  if (favourites.length === 0 && !placeholders) return null
  const empty = placeholders
    ? Math.max(FAVOURITES_SHOWN - favourites.length, 0)
    : 0
  const extra = favourites.length - FAVOURITES_SHOWN

  return (
    <section className="favourites" aria-label="Favorites">
      <Heading>Favorites</Heading>
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
          {`${favourites.length} favorites. The public page shows four; remove ${extra}.`}
        </p>
      )}
      {empty > 0 && (
        <p className="muted favourites-hint">
          Pick your favorites with the heart on any card.
        </p>
      )}
    </section>
  )
}

/**
 * One stacked bar of the four statuses, in shelf order, with a legend.
 * Comics passes its own labels and title ("Reading").
 */
export function StatusBar({
  byStatus,
  labels = STATUS_LABEL,
  title = 'Status',
  headingLevel = 2,
}) {
  const Heading = `h${headingLevel}`
  const present = STATUS_ORDER.filter((status) => byStatus[status] > 0)
  return (
    <div className="stat-card stat-status">
      <Heading>{title}</Heading>
      <div className="status-bar">
        {present.map((status) => (
          <span
            key={status}
            className="status-segment"
            data-status={status}
            role="img"
            aria-label={`${labels[status]}: ${byStatus[status]}`}
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
            <span>{labels[status]}</span>
            <span className="stat-count">{byStatus[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Ten bars for ratings 1 to 10 beside the average, with the axis's ends
 * labelled. Each bar is focusable and names its count, and its title repeats
 * that name; the numeral above it shows on hover and on focus alike.
 */
function RatingHistogram({ histogram, average, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`
  const counts = RATINGS.map((rating) => histogram[rating] ?? 0)
  const most = Math.max(...counts, 1)
  return (
    <section className="stat-card stat-ratings" aria-label="Ratings">
      <Heading>Ratings</Heading>
      <div className="stat-figure">
        <div className="bar-column">
          <div className="rating-bars">
            {RATINGS.map((rating, index) => {
              const label = `Rated ${rating}: ${plural(counts[index], 'item')}`
              return (
                <span
                  key={rating}
                  className="rating-bar"
                  role="img"
                  tabIndex={0}
                  aria-label={label}
                  title={label}
                  style={{ '--share': counts[index] / most }}
                >
                  <span className="rating-bar-count">{counts[index]}</span>
                </span>
              )
            })}
          </div>
          <div className="bar-axis" aria-hidden="true">
            <span>1</span>
            <span>10</span>
          </div>
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
function FinishesStrip({
  months,
  byMonth,
  finishedThisYear,
  headingLevel = 2,
}) {
  const Heading = `h${headingLevel}`
  const counts = months.map((month) => byMonth[month.key] ?? 0)
  const most = Math.max(...counts, 1)
  return (
    <section className="stat-card stat-finishes" aria-label="Finishes">
      <Heading>Finishes</Heading>
      <div className="stat-figure">
        <div className="bar-column">
          <div className="month-bars">
            {months.map((month, index) => {
              const label = `${month.label}: ${counts[index]} finished`
              return (
                <span
                  key={month.key}
                  className="month-bar"
                  role="img"
                  tabIndex={0}
                  aria-label={label}
                  title={label}
                  style={{ '--share': counts[index] / most }}
                >
                  <span className="rating-bar-count">{counts[index]}</span>
                </span>
              )
            })}
          </div>
          <div className="bar-axis bar-axis-months" aria-hidden="true">
            {months.map((month) => (
              <span key={month.key}>{month.initial}</span>
            ))}
          </div>
        </div>
        <p className="stat-big">
          <span className="stat-big-label">
            {`${finishedThisYear} in ${ownerYear()}`}
          </span>
        </p>
      </div>
    </section>
  )
}

/**
 * The public shelf at /spine (Spine). The file keeps its pre-rename name.
 *
 * Unlike every other public page, this one calls the API. The free-tier
 * backend sleeps after about fifteen minutes, so the page first paints the
 * build-time snapshot (lib/snapshot.js) and swaps in live data when it
 * arrives. Only without a snapshot does a first load wait on the wake-up,
 * which is announced beside a skeleton grid rather than hidden behind a
 * spinner that would read as broken rather than slow.
 *
 * Filtering and sorting are client-side over the whole public list. Poster
 * size and dimming persist under `shelf.public.*`; the filters and sort do
 * not, so a returning visitor sees the default shelf.
 */
export default function Collection() {
  usePageTitle(`${spine.name} · Joey Haas`)
  // Read here, once: Tonight's title for the links line, the status for the
  // line under Overview.
  const next = useSnapshotThenLive('next').data
  const status = useSnapshotThenLive('status').data
  const itemsRead = useSnapshotThenLive('items')
  const statsRead = useSnapshotThenLive('stats')
  const items = itemsRead.data ?? NO_ITEMS
  const stats = statsRead.data
  const failed = itemsRead.failed
  const liveItems = itemsRead.live
  const retry = () => {
    itemsRead.retry()
    if (statsRead.failed) statsRead.retry()
  }
  const [filters, setFilters] = useState(NO_FILTER)
  // The site search's no-match link lands here as /shelf?q=…, also from
  // /shelf itself, where the page stays mounted: a new q replaces the
  // query. Never written back, so typing does not rewrite the URL.
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

  if (!itemsRead.data) {
    return (
      <section>
        <SpineHeader />
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

  const typeCounts = countBy(items, 'type')
  const statusCounts = countBy(items, 'status')
  const groups = [
    {
      key: 'type',
      label: copy.groupShow,
      options: TYPES.map((type) => ({
        value: type,
        label: TYPE_LABEL[type],
        count: typeCounts[type] ?? 0,
      })),
    },
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

  return (
    <section>
      <SpineHeader />
      <LoadState failed={failed} stale live={liveItems} onRetry={retry} />

      {items.length === 0 ? (
        <p className="muted">Nothing on the shelf yet.</p>
      ) : (
        <>
          <div className="shelf-top">
            {stats && (
              <HeroNumbers
                inline
                figures={[
                  { label: 'Owned', value: stats.owned },
                  { label: 'Finished', value: stats.by_status.finished ?? 0 },
                  {
                    label: `Finished in ${ownerYear()}`,
                    value: stats.finished_this_year,
                  },
                ]}
              />
            )}
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
              <span className="visually-hidden">Search the shelf</span>
              <input
                ref={searchField}
                id="shelf-search"
                type="search"
                placeholder="Search titles"
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
            onClear={() => {
              setFilters(NO_FILTER)
              setQuery('')
              // Clear filters unmounts itself; focus would fall to the body.
              searchField.current?.focus()
            }}
          >
            <CoverKey />
          </ResultBar>

          {visible.length === 0 ? (
            <p className="muted">
              {query.trim()
                ? `Nothing on the shelf matches “${query.trim()}”.`
                : copy.noMatch}
            </p>
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
                    {copy.overviewCharts}
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
