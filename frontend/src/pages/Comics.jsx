import {
  ATTRIBUTION,
  CTL_LABEL,
  CTL_ROW,
  CTL_SPLIT,
  SHELF_CONTROLS,
  SHELF_OVERVIEW,
  SHELF_SEARCH,
  SHELF_TOP,
  SHELF_VIEW_CONTROLS,
  STAT_CARD,
  VIEW_LAB,
} from '../components/shelf-classes.js'
import { cx } from '../lib/cx.js'
import {
  BAR,
  BARS,
  BAR_AXIS,
  BAR_AXIS_MONTHS,
  BAR_COLUMN,
  BAR_COUNT_FIGURE,
  SHELF_STATS,
  STAT_COUNT,
  STAT_HEAD,
  STATUS_BAR,
  STATUS_LEGEND,
  STATUS_LEGEND_ITEM,
  STATUS_SEGMENT,
  STATUS_SWATCH,
  statusFill,
} from '../components/overview-classes.js'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import BarList from '../components/BarList.jsx'
import ComicCardRun from '../components/ComicCardRun.jsx'
import ComicFigures from '../components/ComicFigures.jsx'
import EmptyState from '../components/EmptyState.jsx'
import FilterChips from '../components/FilterChips.jsx'
import LoadState from '../components/LoadState.jsx'
import PageHeader from '../components/PageHeader.jsx'
import PosterCard from '../components/PosterCard.jsx'
import LayoutToggle from '../components/LayoutToggle.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import SpineCard from '../components/SpineCard.jsx'
import SpineKey from '../components/SpineKey.jsx'
import { Input } from '../components/ui/input.jsx'
import { SECTION_HEAD } from '../components/prose-classes.js'
import ResultBar from '../components/ResultBar.jsx'
import { RunKey } from '../components/RunLanes.jsx'
import { StatusBar } from '../components/ShelfOverview.jsx'
import SortControl from '../components/SortControl.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import { spine } from '../content/spine.js'
import {
  COMIC_CHIPS,
  COMIC_SORTS,
  chipCounts,
  filterComics,
  publishersByCount,
  searchComics,
  sortComics,
} from '../lib/comics.js'
import { catalogueNumbers } from '../lib/catalogue.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'
import {
  filterByTags,
  hasTagFilter,
  noTags,
  tagChipGroups,
} from '../lib/tags.js'
import { itemPath } from '../lib/spinePaths.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import {
  MONTH_YEAR_LONG as MONTH_LABEL,
  MONTH_NARROW as MONTH_INITIAL,
} from '../lib/formatDate.js'
import { SPINE_PROJECT } from '../components/dailyClasses.js'

const copy = spine.comics
const PUBLISHERS_SHOWN = 3
// What a visitor can filter comics by; Based on is shown, not filtered.
const FILTER_GROUPS = ['genre', 'form']
const SORTS = copy.sorts.map((sort) => ({ ...sort, direction: 'asc' }))

/** Preference keys (spec, S6): the public shelf's namespace, per page. */
const PREF = {
  chip: 'shelf.public.comics.chip',
  sort: 'shelf.public.comics.sort',
}

/** A stored preference, only when it is one of the values on offer. */
function storedPref(key, allowed) {
  const value = readShelfPref(key, allowed[0])
  return allowed.includes(value) ? value : allowed[0]
}

/** "1 Nov 2026"-style month keys ("2026-11-01") as dates. */
function monthDate(month) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1, 1))
}

/** Runs: complete, up to date and gaps as one stacked bar. */
const RUN_ORDER = [
  // The status tokens, already measured at 3:1 against --surface.
  { key: 'complete', fill: 'finished' },
  { key: 'up_to_date', fill: 'active' },
  { key: 'gaps', fill: 'backlog' },
]

function RunsCard({ runs, missing }) {
  const present = RUN_ORDER.filter(({ key }) => runs[key] > 0)
  return (
    <section
      className={`stat-card stat-runs ${STAT_CARD}`}
      aria-label={copy.cards.runs}
    >
      <h3 className={STAT_HEAD}>
        {copy.cards.runs}{' '}
        <span className={cx('stat-count', STAT_COUNT)}>
          {copy.cards.runsMissing(missing)}
        </span>
      </h3>
      <div className={cx('status-bar', STATUS_BAR)}>
        {present.map(({ key, fill }) => (
          <span
            key={key}
            className={cx('status-segment', STATUS_SEGMENT, statusFill(fill))}
            data-status={fill}
            role="img"
            aria-label={`${copy.runStates[key]}: ${runs[key]}`}
            style={{ '--count': runs[key] }}
          />
        ))}
      </div>
      <ul className={cx('status-legend', STATUS_LEGEND)}>
        {present.map(({ key, fill }) => (
          <li key={key} className={STATUS_LEGEND_ITEM}>
            <span
              className={cx('status-swatch', STATUS_SWATCH, statusFill(fill))}
              data-status={fill}
              aria-hidden="true"
            />
            <span>{copy.runStates[key]}</span>
            <span className={cx('stat-count', STAT_COUNT)}>{runs[key]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PublishersCard({ publishers }) {
  return (
    <section
      className={`stat-card ${STAT_CARD}`}
      aria-label={copy.cards.publishers}
    >
      <h3 className={STAT_HEAD}>{copy.cards.publishers}</h3>
      <BarList
        label={copy.cards.publishers}
        rows={publishers.map(({ publisher, count }) => ({
          value: publisher,
          count,
        }))}
      />
    </section>
  )
}

/** Series added to the site per month: created_at, never acquired_at. */
function AddedCard({ months }) {
  const most = Math.max(...months.map((month) => month.count), 1)
  return (
    <section
      className={`stat-card stat-finishes ${STAT_CARD}`}
      aria-label={copy.cards.added}
    >
      <h3 className={STAT_HEAD}>{copy.cards.added}</h3>
      <div className={cx('bar-column', BAR_COLUMN)}>
        <div className={cx('month-bars', BARS)}>
          {months.map(({ month, count }) => {
            const label = `${MONTH_LABEL.format(monthDate(month))}: ${count} added`
            return (
              <span
                key={month}
                className={cx('month-bar', BAR)}
                role="img"
                tabIndex={0}
                aria-label={label}
                title={label}
                style={{ '--share': count / most }}
              >
                <span className={cx('rating-bar-count', BAR_COUNT_FIGURE)}>
                  {count}
                </span>
              </span>
            )
          })}
        </div>
        <div
          className={cx('bar-axis bar-axis-months', BAR_AXIS, BAR_AXIS_MONTHS)}
          aria-hidden="true"
        >
          {months.map(({ month }) => (
            <span key={month}>{MONTH_INITIAL.format(monthDate(month))}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

/** As a shelf card: PosterCard reads the shelf's item fields. */
const asPoster = (row) => ({
  id: row.item_id,
  type: 'comic',
  title: row.title,
  year: row.year,
  creator: row.publisher,
  cover_url: row.cover_url,
  status: row.status,
  caught_up: row.caught_up,
  rating: row.rating,
  row,
})

/** The figures over the grid: the shared row, from the API's stats. */
function ComicsFigures({ stats, rows }) {
  return (
    <ComicFigures
      series={stats.series}
      complete={stats.runs.complete}
      gaps={stats.runs.gaps}
      issues={stats.issues_owned}
      missing={stats.missing}
      readPercent={stats.read_percent}
      books={stats.books_owned}
      volumesMissing={stats.volumes_missing}
      issuesRead={stats.issues_read}
      hasLine={rows.some((row) => row.kind === 'book_line')}
    />
  )
}

/**
 * /shelf/comics: every public series as a run (comics spec, screen 1; shelf
 * split, item 3).
 *
 * Paints the build-time snapshot, then the live API, like What's next.
 * Filtering, search and sorting are client-side over the public list and
 * mirror the API's own order (`lib/comics.js`). The chip and sort persist
 * under `shelf.public.comics.*` (S6); the publisher and the search do not.
 * Out this week lives on What's next, not here.
 */
export default function Comics() {
  usePageTitle(`${copy.title} · ${spine.name}`)
  const { data, live, failed, retry } = useSnapshotThenLive('comics')
  const [chip, setChip] = useState(() => storedPref(PREF.chip, COMIC_CHIPS))
  const [sort, setSort] = useState(() => storedPref(PREF.sort, COMIC_SORTS))
  const [publisher, setPublisher] = useState(null)
  const [picked, setPicked] = useState(() => noTags('comic'))
  const [query, setQuery] = useState('')
  // The spine view lives only in the URL (?view=spines), never stored.
  const [searchParams, setSearchParams] = useSearchParams()
  const layout = searchParams.get('view') === 'spines' ? 'spines' : 'cards'

  function changeLayout(next) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next === 'spines') params.set('view', 'spines')
        else params.delete('view')
        return params
      },
      { replace: true },
    )
  }

  function changeFilters(next) {
    const show = next.show ?? 'all'
    if (show !== chip) {
      setChip(show)
      writeShelfPref(PREF.chip, show)
    }
    setPublisher(next.publisher ?? null)
    setPicked(
      Object.fromEntries(FILTER_GROUPS.map((key) => [key, next[key] ?? null])),
    )
  }

  function changeSort({ value }) {
    setSort(value)
    writeShelfPref(PREF.sort, value)
  }

  const { series = [], stats } = data ?? {}
  const visible = sortComics(
    searchComics(
      filterByTags(filterComics(series, chip, publisher), 'comic', picked),
      query,
    ),
    sort,
  )
  const filtered =
    query.trim() !== '' ||
    chip !== 'all' ||
    publisher !== null ||
    hasTagFilter('comic', picked)
  // Numbered over the whole shelf, so filtering never renumbers a card.
  const numbers = catalogueNumbers(series, (row) => row.item_id)
  const counts = chipCounts(series)
  const publishers = publishersByCount(series)
  // A pressed publisher the rows no longer hold (live data replaced the
  // snapshot) keeps its chip at 0, or the filter could not be undone.
  const publisherOptions =
    publisher && !publishers.some((entry) => entry.publisher === publisher)
      ? [...publishers, { publisher, count: 0 }]
      : publishers
  const groups = [
    {
      key: 'show',
      label: copy.groupShow,
      options: COMIC_CHIPS.filter((value) => value !== 'all').map((value) => ({
        value,
        label: copy.chips[value],
        count: counts[value],
      })),
    },
    ...tagChipGroups('comic', series).filter(({ key }) =>
      FILTER_GROUPS.includes(key),
    ),
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

  function clearAll() {
    changeFilters({})
    setQuery('')
  }

  return (
    <section className="comics-page">
      <SpineHeader />
      <PageHeader title={copy.title} lede={copy.lede} />

      <LoadState
        loading={!data && !failed}
        failed={failed}
        stale={!!data}
        live={live}
        onRetry={retry}
      />

      {!data ? null : series.length === 0 ? (
        <EmptyState title={copy.empty} />
      ) : (
        <>
          <ComicsFigures stats={stats} rows={series} />

          <div className={`shelf-top ${SHELF_TOP}`}>
            <label className={`shelf-search ${SHELF_SEARCH}`}>
              <span className="visually-hidden">{copy.search}</span>
              <Input
                type="search"
                placeholder={copy.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <section
            className={`shelf-toolbar controls ${SHELF_CONTROLS}`}
            aria-label="Filter and sort"
          >
            <FilterChips
              labelled
              groups={groups}
              value={{
                show: chip === 'all' ? null : chip,
                publisher,
                ...picked,
              }}
              onChange={changeFilters}
            />
            <div className={`ctl-row ${CTL_ROW}`}>
              <span className={`ctl-label ${CTL_LABEL}`} aria-hidden="true">
                {spine.shelf.sort}
              </span>
              <div className={`ctl-split ${CTL_SPLIT}`}>
                <SortControl
                  value={sort}
                  direction="asc"
                  seed={0}
                  onChange={changeSort}
                  onShuffle={() => {}}
                  sorts={SORTS}
                  directional={false}
                  select
                  hideLabel
                />
                <div
                  className={`shelf-view-controls ${SHELF_VIEW_CONTROLS}`}
                  role="group"
                  aria-label={spine.shelf.view}
                >
                  <span className={`view-lab ${VIEW_LAB}`} aria-hidden="true">
                    {spine.shelf.view}
                  </span>
                  <LayoutToggle layout={layout} onChange={changeLayout} />
                </div>
              </div>
            </div>
          </section>

          <ResultBar
            shown={visible.length}
            total={series.length}
            filtered={filtered}
            noun={copy.noun}
            plural={copy.nounPlural}
            onClear={clearAll}
          >
            {layout === 'spines' ? <SpineKey /> : <RunKey />}
          </ResultBar>

          {visible.length === 0 ? (
            <EmptyState title={copy.noMatch} />
          ) : (
            <PosterGrid
              items={visible.map(asPoster)}
              size="comfortable"
              layout={layout === 'spines' ? 'spines' : 'records'}
              renderCard={(item) =>
                layout === 'spines' ? (
                  <SpineCard
                    item={item}
                    to={itemPath(item.id)}
                    number={numbers.get(item.id)}
                    statusLabels={{ ...copy.status, caughtUp: copy.caughtUp }}
                  />
                ) : (
                  <PosterCard
                    item={item}
                    to={itemPath(item.id)}
                    number={numbers.get(item.id)}
                    stacked
                    run={<ComicCardRun row={item.row} />}
                    statusLabels={{ ...copy.status, caughtUp: copy.caughtUp }}
                  />
                )
              }
            />
          )}

          <section
            className={`shelf-overview ${SHELF_OVERVIEW}`}
            id="overview"
            aria-labelledby="overview-title"
          >
            <h2 id="overview-title" className={SECTION_HEAD}>
              {spine.shelf.overview}
            </h2>
            <div className={cx('shelf-stats', SHELF_STATS)}>
              <RunsCard runs={stats.runs} missing={stats.missing} />
              <StatusBar
                byStatus={stats.by_status}
                labels={copy.status}
                title={copy.cards.reading}
                headingLevel={3}
              />
              <PublishersCard publishers={stats.publishers} />
              <AddedCard months={stats.added_by_month} />
            </div>
          </section>
        </>
      )}

      <footer className={`attribution ${ATTRIBUTION}`}>
        <p className={`spine-project ${SPINE_PROJECT}`}>
          {spine.projectLine}{' '}
          <Link to={spine.links.post.to}>
            {spine.links.post.label} <span aria-hidden="true">&rarr;</span>
          </Link>{' '}
          <a href={spine.links.source.href}>
            {spine.links.source.label} <span aria-hidden="true">&rarr;</span>
          </a>
        </p>
        <p>
          {copy.attribution.before}{' '}
          <a href="https://comicvine.gamespot.com/" rel="noreferrer noopener">
            {copy.attribution.label}
          </a>
          {copy.attribution.after}
        </p>
      </footer>
    </section>
  )
}
