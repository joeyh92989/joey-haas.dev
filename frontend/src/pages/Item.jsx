import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import Stars from '../components/Stars.jsx'
import { apiFetch } from '../lib/api.js'
import { STATUS_LABEL } from '../lib/shelf.js'
import NotFound from './NotFound.jsx'

const MONTH_YEAR = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const DAY = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A "YYYY-MM-DD" column value as a UTC date, so no day shifts by zone. */
function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * A snapshot description as plain text.
 *
 * Comic Vine descriptions arrive as HTML. Parsing into an inert document and
 * reading its text drops the markup without ever rendering it; nothing here
 * is inserted as HTML.
 */
function plainText(value) {
  if (!value.includes('<')) return value
  const document = new DOMParser().parseFromString(value, 'text/html')
  return (document.body.textContent ?? '').trim()
}

/** "Finished · June 2026", or the status on its own. */
function statusInWords(item) {
  const label = STATUS_LABEL[item.status] ?? item.status
  if (item.status === 'finished' && item.finished_at) {
    return `${label} · ${MONTH_YEAR.format(parseDate(item.finished_at))}`
  }
  return label
}

/** Dates played as "Jan 2, 2026 → Jun 12, 2026", or whichever end exists. */
function playedRange(item) {
  const ends = [item.started_at, item.finished_at]
  if (!ends.some(Boolean)) return null
  return ends.map((end) => (end ? DAY.format(parseDate(end)) : '…')).join(' → ')
}

const FORMAT_LABEL = {
  game_card: 'Full game on cartridge',
  game_key_card: 'Game-Key Card',
  code_in_box: 'Code in a box',
  disc: 'Disc',
}

const COMPLETENESS_LABEL = {
  loose: 'Loose',
  boxed: 'Boxed',
  cib: 'Complete in box',
  sealed: 'Sealed',
}

/**
 * The format chip's text, or null.
 *
 * A Switch 2 copy with no recorded format says so: it may be a Game-Key
 * Card, so silence would read as a cartridge. Elsewhere no format means no
 * chip.
 */
function formatChip(item) {
  if (item.physical_format) return FORMAT_LABEL[item.physical_format] ?? null
  return item.platform === 'Nintendo Switch 2' ? 'Format not recorded' : null
}

/** "≈ 12 h · 18 h to complete", or whichever figure exists. */
function timeToBeatText(timeToBeat) {
  if (!timeToBeat) return null
  const parts = []
  if (timeToBeat.normally != null) {
    parts.push(`≈ ${Math.round(timeToBeat.normally)} h`)
  }
  if (timeToBeat.completely != null) {
    parts.push(`${Math.round(timeToBeat.completely)} h to complete`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Rating, community score, and play history as a row of tiles. */
function Tiles({ item }) {
  const played = playedRange(item)
  const showPlayed = item.times_completed > 0 || played
  const timeToBeat = timeToBeatText(item.time_to_beat)
  return (
    <dl className="item-tiles">
      <div className="item-tile">
        <dt>Your rating</dt>
        {item.rating ? (
          <dd>
            <Stars rating={item.rating} />
            <span className="item-tile-figure">{item.rating} / 10</span>
          </dd>
        ) : (
          <dd className="muted">Not rated</dd>
        )}
      </div>
      {item.community_score != null && (
        <div className="item-tile">
          <dt>Community</dt>
          <dd>
            <span className="item-tile-figure">
              {Math.round(item.community_score)} / 100
            </span>
            {item.community_votes != null && (
              <span className="muted">{item.community_votes} votes</span>
            )}
          </dd>
        </div>
      )}
      {timeToBeat && (
        <div className="item-tile">
          <dt>Time to beat</dt>
          <dd>
            <span className="item-tile-figure">{timeToBeat}</span>
          </dd>
        </div>
      )}
      {showPlayed && (
        <div className="item-tile">
          <dt>Played</dt>
          <dd>
            {item.times_completed > 0 && (
              <span className="item-tile-figure">
                Finished {item.times_completed}{' '}
                {item.times_completed === 1 ? 'time' : 'times'}
              </span>
            )}
            {played && <span className="muted">{played}</span>}
          </dd>
        </div>
      )}
    </dl>
  )
}

/**
 * One public item: `/collection/:id`.
 *
 * Keyed on the id so that following a "More from this shelf" card, which
 * reuses this route, starts from a clean load rather than the last item's
 * state.
 */
export default function Item() {
  const { id } = useParams()
  return <ItemPage key={id} id={id} />
}

/**
 * The item page proper.
 *
 * Under /collection, so it may call the API, and it handles the cold start
 * the same way the shelf does. Both an unknown and a private id come back as
 * 404, and both render NotFound. The session comes from the layout's outlet
 * context; this page never asks the API who is signed in.
 */
function ItemPage({ id }) {
  const { signedIn = false } = useOutletContext() ?? {}
  const [result, setResult] = useState({ state: 'loading', item: null })
  const [slow, setSlow] = useState(false)
  const [expanded, setExpanded] = useState(false)

  /**
   * Loads the item and returns what to show; the effect applies it, since
   * setting state in an effect body is what react-hooks forbids.
   */
  const load = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/api/public/items/${encodeURIComponent(id)}`,
      )
      if (response.status === 404) return { state: 'missing', item: null }
      if (!response.ok) return { state: 'error', item: null }
      return { state: 'ready', item: await response.json() }
    } catch {
      return { state: 'error', item: null }
    }
  }, [id])

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 2000)
    load()
      .then(setResult)
      .finally(() => clearTimeout(timer))
    return () => clearTimeout(timer)
  }, [load])

  if (result.state === 'missing') return <NotFound />

  if (result.state === 'loading') {
    return (
      <section>
        <p className="muted" role="status">
          {slow
            ? 'Waking the server — it sleeps when idle, so this takes about thirty seconds.'
            : 'Loading…'}
        </p>
      </section>
    )
  }

  if (result.state === 'error') {
    return (
      <section>
        <p className="admin-error">
          This item could not be loaded. Try again shortly.
        </p>
      </section>
    )
  }

  const { item } = result
  const meta = [item.year, item.creator].filter(Boolean).join(' · ')
  const description = item.description ? plainText(item.description) : ''
  const themes = item.themes ?? []
  const otherPlatforms = item.platforms.filter(
    (platform) => platform !== item.platform,
  )
  const format = formatChip(item)
  const completeness = COMPLETENESS_LABEL[item.completeness] ?? null
  const chips = [
    // The copy on the shelf first, then what the game is, then where else it
    // exists, then what the copy physically is.
    ...(item.platform ? [[`own-${item.platform}`, item.platform, false]] : []),
    ...item.genres.map((genre) => [`genre-${genre}`, genre, false]),
    ...themes.map((theme) => [`theme-${theme}`, theme, true]),
    ...otherPlatforms.map((platform) => [
      `platform-${platform}`,
      platform,
      true,
    ]),
    ...(format ? [['format', format, false]] : []),
    ...(completeness ? [['completeness', completeness, false]] : []),
  ]

  return (
    <article className="item-page">
      <div className="item-hero" data-empty={!item.cover_url || undefined}>
        {item.cover_url && (
          <img className="item-hero-backdrop" src={item.cover_url} alt="" />
        )}
      </div>

      <header className="item-head">
        <div className="item-cover">
          <CoverImage src={item.cover_url} type={item.type} alt="" />
        </div>
        <div className="item-heading">
          <h1>{item.title}</h1>
          {meta && <p className="muted">{meta}</p>}
          <p className="item-status" data-status={item.status}>
            {statusInWords(item)}
          </p>
          {signedIn && (
            <Link to={`/admin/collection/${item.id}`} className="item-edit">
              Edit
            </Link>
          )}
        </div>
      </header>

      {chips.length > 0 && (
        <ul className="item-chips">
          {chips.map(([key, label, muted]) => (
            <li
              key={key}
              className={muted ? 'item-chip item-chip-muted' : 'item-chip'}
            >
              {label}
            </li>
          ))}
        </ul>
      )}

      {description && (
        <div className="item-description-wrap">
          <p
            className={
              expanded ? 'item-description' : 'item-description clamp-6'
            }
          >
            {description}
          </p>
          {/* Always offered: overflow cannot be measured before layout, and a
              button that changes nothing on a short text is harmless. */}
          <button
            type="button"
            className="link-button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      )}

      <Tiles item={item} />

      {item.similar_in_collection.length > 0 && (
        <section className="item-similar" aria-label="More from this shelf">
          <h2>More from this shelf</h2>
          <PosterGrid
            items={item.similar_in_collection}
            size="compact"
            renderCard={(card) => (
              <PosterCard item={card} to={`/collection/${card.id}`} />
            )}
          />
        </section>
      )}
    </article>
  )
}
