import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import BarList from '../components/BarList.jsx'
import ComicCardRun from '../components/ComicCardRun.jsx'
import CoverImage from '../components/CoverImage.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import SeriesList from '../components/SeriesList.jsx'
import SortControl from '../components/SortControl.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import { spine } from '../content/spine.js'
import { LOAD_ERROR, WAKING } from '../content/status.js'
import {
  COMIC_CHIPS,
  COMIC_SORTS,
  chipCounts,
  filterComics,
  publishersByCount,
  searchComics,
  shortDate,
  sortComics,
} from '../lib/comics.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'
import { itemPath } from '../lib/spinePaths.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import { HeroNumbers, StatusBar } from './Collection.jsx'

const copy = spine.comics
const VIEWS = ['runs', 'covers']
const PUBLISHERS_SHOWN = 3
const SORTS = copy.sorts.map((sort) => ({ ...sort, direction: 'asc' }))

const MONTH_LABEL = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const MONTH_INITIAL = new Intl.DateTimeFormat('en', {
  month: 'narrow',
  timeZone: 'UTC',
})

/** Preference keys (spec, S6): the public shelf's namespace, per page. */
const PREF = {
  chip: 'shelf.public.comics.chip',
  sort: 'shelf.public.comics.sort',
  view: 'shelf.public.comics.view',
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

/**
 * Out this week: issues from followed series dated this week and the weeks
 * after it, then a Later tile for series whose next issue has no day yet.
 * Renders nothing when no week has an issue (spec: no empty state).
 */
function OutThisWeek({ thisWeek, following }) {
  const rows = thisWeek.weeks.flatMap((week) => week.rows)
  if (rows.length === 0) return null
  const start = (
    thisWeek.weeks.find((week) => week.this_week) ?? thisWeek.weeks[0]
  ).start
  return (
    <section className="comics-strip" aria-labelledby="comics-strip-title">
      <h2 id="comics-strip-title">
        {copy.strip.title}{' '}
        <small>{`${shortDate(start)} · ${copy.strip.from(following)}`}</small>
      </h2>
      <ul className="comics-strip-issues">
        {rows.map((row) => (
          <li key={`${row.item_id}-${row.number}`}>
            <Link to={itemPath(row.item_id)} className="comics-strip-link">
              <span className="comics-strip-thumb">
                <CoverImage src={row.cover_url} type="comic" alt="" />
              </span>
              <span className="comics-strip-title">{`${row.title} #${row.number}`}</span>
              <span className="comics-strip-meta">
                {[row.publisher, shortDate(row.store_date)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </Link>
          </li>
        ))}
        {thisWeek.later.length > 0 && (
          <li className="comics-strip-later">
            <span className="comics-strip-thumb comics-strip-later-box">
              {thisWeek.later.map((row) => row.title).join(', ')}
            </span>
            <span className="comics-strip-title">{copy.strip.later}</span>
            <span className="comics-strip-meta">{copy.strip.laterNote}</span>
          </li>
        )}
      </ul>
    </section>
  )
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
    <section className="stat-card stat-runs" aria-label={copy.cards.runs}>
      <h2>
        {copy.cards.runs}{' '}
        <span className="stat-count">{copy.cards.runsMissing(missing)}</span>
      </h2>
      <div className="status-bar">
        {present.map(({ key, fill }) => (
          <span
            key={key}
            className="status-segment"
            data-status={fill}
            role="img"
            aria-label={`${copy.runStates[key]}: ${runs[key]}`}
            style={{ '--count': runs[key] }}
          />
        ))}
      </div>
      <ul className="status-legend">
        {present.map(({ key, fill }) => (
          <li key={key}>
            <span
              className="status-swatch"
              data-status={fill}
              aria-hidden="true"
            />
            <span>{copy.runStates[key]}</span>
            <span className="stat-count">{runs[key]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PublishersCard({ publishers }) {
  return (
    <section className="stat-card" aria-label={copy.cards.publishers}>
      <h2>{copy.cards.publishers}</h2>
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
    <section className="stat-card stat-finishes" aria-label={copy.cards.added}>
      <h2>{copy.cards.added}</h2>
      <div className="bar-column">
        <div className="month-bars">
          {months.map(({ month, count }) => {
            const label = `${MONTH_LABEL.format(monthDate(month))}: ${count} added`
            return (
              <span
                key={month}
                className="month-bar"
                role="img"
                tabIndex={0}
                aria-label={label}
                title={label}
                style={{ '--share': count / most }}
              >
                <span className="rating-bar-count">{count}</span>
              </span>
            )
          })}
        </div>
        <div className="bar-axis bar-axis-months" aria-hidden="true">
          {months.map(({ month }) => (
            <span key={month}>{MONTH_INITIAL.format(monthDate(month))}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

function Chip({ pressed, label, count, onClick }) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {label}
      {count != null && (
        <>
          {' '}
          <span className="chip-count">{count}</span>
        </>
      )}
    </button>
  )
}

/**
 * The one chip row: the five views of the shelf, then publishers, the top
 * three first and the rest behind More…. A chip with nothing behind it is
 * hidden unless pressed, so a choice can always be undone.
 */
function ComicChips({ rows, chip, onChip, publisher, onPublisher }) {
  const [expanded, setExpanded] = useState(false)
  const counts = chipCounts(rows)
  const counted = publishersByCount(rows)
  // A pressed publisher the rows no longer hold (live data replaced the
  // snapshot) keeps its chip at 0, or the filter could not be undone.
  const publishers =
    publisher && !counted.some((entry) => entry.publisher === publisher)
      ? [...counted, { publisher, count: 0 }]
      : counted
  const shown = expanded
    ? publishers
    : publishers.filter(
        (entry, index) =>
          index < PUBLISHERS_SHOWN || entry.publisher === publisher,
      )
  const hidden = publishers.length - shown.length
  return (
    <div className="chip-rows">
      <div className="chip-row" role="group" aria-label={copy.title}>
        {COMIC_CHIPS.filter(
          (value) => value === 'all' || counts[value] > 0 || value === chip,
        ).map((value) => (
          <Chip
            key={value}
            pressed={chip === value}
            label={copy.chips[value]}
            count={counts[value]}
            onClick={() => onChip(value)}
          />
        ))}
      </div>
      {(publishers.length > 1 || publisher) && (
        <div
          className="chip-row"
          role="group"
          aria-label={copy.chips.publisher}
        >
          {shown.map((entry) => (
            <Chip
              key={entry.publisher}
              pressed={publisher === entry.publisher}
              label={entry.publisher}
              count={entry.count}
              onClick={() =>
                onPublisher(
                  publisher === entry.publisher ? null : entry.publisher,
                )
              }
            />
          ))}
          {(hidden > 0 || expanded) && (
            <button
              type="button"
              className="chip"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {copy.chips.more}
            </button>
          )}
        </div>
      )}
    </div>
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
  rating: row.rating,
  row,
})

/**
 * /shelf/comics: every public series as a run (comics spec, screen 1).
 *
 * Paints the build-time snapshot, then the live API, like What's next.
 * Filtering, search and sorting are client-side over the public list and
 * mirror the API's own order (`lib/comics.js`). The chip, sort and view
 * persist under `shelf.public.comics.*` (S6); the publisher and the search
 * do not.
 */
export default function Comics() {
  usePageTitle(`${copy.title} · ${spine.name}`)
  const { data, failed } = useSnapshotThenLive('comics')
  const [chip, setChip] = useState(() => storedPref(PREF.chip, COMIC_CHIPS))
  const [sort, setSort] = useState(() => storedPref(PREF.sort, COMIC_SORTS))
  const [view, setView] = useState(() => storedPref(PREF.view, VIEWS))
  const [publisher, setPublisher] = useState(null)
  const [query, setQuery] = useState('')
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  function changeChip(next) {
    setChip(next)
    writeShelfPref(PREF.chip, next)
  }

  function changeSort({ value }) {
    setSort(value)
    writeShelfPref(PREF.sort, value)
  }

  function changeView(next) {
    setView(next)
    writeShelfPref(PREF.view, next)
  }

  if (!data) {
    return (
      <section className="comics-page">
        <SpineHeader asLink />
        {failed ? (
          <p className="admin-error" role="alert">
            {LOAD_ERROR}
          </p>
        ) : (
          <p className="muted" role="status">
            {slow ? WAKING : 'Loading…'}
          </p>
        )}
      </section>
    )
  }

  const { series, stats, this_week: thisWeek } = data
  const visible = sortComics(
    searchComics(filterComics(series, chip, publisher), query),
    sort,
  )
  const following = series.filter((row) => row.following).length

  return (
    <section className="comics-page">
      <SpineHeader asLink />
      <h1 className="next-title">{copy.title}</h1>
      <p className="spine-lede">{copy.lede}</p>

      {series.length === 0 ? (
        <p className="muted">{copy.empty}</p>
      ) : (
        <>
          <HeroNumbers
            figures={[
              { label: copy.hero.series, value: stats.series },
              { label: copy.hero.issues, value: stats.issues_owned },
              { label: copy.hero.missing, value: stats.missing },
              {
                label: copy.hero.read,
                value:
                  stats.read_percent == null ? '—' : `${stats.read_percent}%`,
              },
            ]}
          />

          <OutThisWeek thisWeek={thisWeek} following={following} />

          <div className="shelf-stats">
            <RunsCard runs={stats.runs} missing={stats.missing} />
            <StatusBar
              byStatus={stats.by_status}
              labels={copy.status}
              title={copy.cards.reading}
            />
            <PublishersCard publishers={stats.publishers} />
            <AddedCard months={stats.added_by_month} />
          </div>

          <label className="shelf-search">
            <span className="visually-hidden">{copy.search}</span>
            <input
              type="search"
              placeholder={copy.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <ComicChips
            rows={series}
            chip={chip}
            onChip={changeChip}
            publisher={publisher}
            onPublisher={setPublisher}
          />

          <div className="comics-toolbar">
            <SortControl
              value={sort}
              direction="asc"
              seed={0}
              onChange={changeSort}
              onShuffle={() => {}}
              sorts={SORTS}
              directional={false}
            />
            <div className="comics-view" role="group" aria-label="View">
              {VIEWS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  aria-pressed={view === value}
                  onClick={() => changeView(value)}
                >
                  {copy.views[value]}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="muted">{copy.noMatch}</p>
          ) : view === 'covers' ? (
            <PosterGrid
              items={visible.map(asPoster)}
              size="comfortable"
              renderCard={(item) => (
                <PosterCard
                  item={item}
                  to={itemPath(item.id)}
                  stacked
                  run={<ComicCardRun row={item.row} />}
                  statusLabels={copy.status}
                />
              )}
            />
          ) : (
            <SeriesList
              rows={visible}
              linkFor={(row) => itemPath(row.item_id)}
            />
          )}
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
