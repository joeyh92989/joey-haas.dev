import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { spine } from '../content/spine.js'
import CoverImage from '../components/CoverImage.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import Stars from '../components/Stars.jsx'
import { apiFetch } from '../lib/api.js'
import { readSnapshot } from '../lib/snapshot.js'
import { STATUS_LABEL } from '../lib/shelf.js'
import { usePageTitle } from '../lib/usePageTitle.js'
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
 * The format in words, or null.
 *
 * A Switch 2 copy with no recorded format says so: it may be a Game-Key
 * Card, so silence would read as a cartridge. Elsewhere no format means
 * nothing to say.
 */
function formatText(item) {
  if (item.physical_format) return FORMAT_LABEL[item.physical_format] ?? null
  return item.platform === 'Nintendo Switch 2' ? 'Format not recorded' : null
}

/**
 * The owner's copy in one line: a different kind of fact from the genre
 * chips -- this copy, not the game -- so it is kept out of them.
 *
 * @returns {string|null} "My copy: Nintendo Switch 2 · Full game on
 *   cartridge · Complete in box", "Wanted for …" / "On my want list" for the
 *   want list, or null when nothing about the copy is known.
 */
function copyLine(item) {
  if (item.wanted) {
    return item.platform ? `Wanted for ${item.platform}` : 'On my want list'
  }
  const parts = [
    item.platform,
    formatText(item),
    COMPLETENESS_LABEL[item.completeness],
  ].filter(Boolean)
  return parts.length > 0 ? `My copy: ${parts.join(' · ')}` : null
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

/**
 * My rating always; the community, length and play history only with the
 * detail response, which the snapshot preview does not have.
 */
function Tiles({ item, detail }) {
  const played = playedRange(item)
  const showPlayed = item.times_completed > 0 || played
  const timeToBeat = timeToBeatText(item.time_to_beat)
  return (
    <dl className="item-tiles">
      <div className="item-tile">
        <dt>My rating</dt>
        {item.rating ? (
          <dd>
            <Stars rating={item.rating} />
            <span className="item-tile-figure">{item.rating} / 10</span>
          </dd>
        ) : (
          <dd className="muted">Not rated</dd>
        )}
      </div>
      {detail && item.community_score != null && (
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
      {detail && timeToBeat && (
        <div className="item-tile">
          <dt>Time to beat</dt>
          <dd>
            <span className="item-tile-figure">{timeToBeat}</span>
          </dd>
        </div>
      )}
      {detail && showPlayed && (
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
 * One public item: `/spine/:id`.
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
 * Under /spine, so it may call the API, and it handles the cold start
 * the same way the shelf does. Both an unknown and a private id come back as
 * 404, and both render NotFound. The session comes from the layout's outlet
 * context; this page never asks the API who is signed in.
 */
function ItemPage({ id }) {
  const { signedIn = false } = useOutletContext() ?? {}
  const [result, setResult] = useState({ state: 'loading', item: null })
  const [preview, setPreview] = useState(null)
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
    let cancelled = false
    const timer = setTimeout(() => setSlow(true), 2000)
    // The card-level fields from the build-time snapshot, painted while the
    // API wakes. The API stays authoritative: its 404 wins over a snapshot
    // taken before the item was unpublished.
    readSnapshot('items').then((items) => {
      const match = items?.find((entry) => entry.id === id)
      if (!cancelled && match) setPreview(match)
    })
    load()
      .then((next) => {
        if (!cancelled) setResult(next)
      })
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id, load])

  const shown = result.state === 'ready' ? result.item : preview
  // Null on a 404, so NotFound's own title stands (see usePageTitle).
  usePageTitle(
    result.state === 'missing'
      ? null
      : shown
        ? `${shown.title} · ${spine.name}`
        : `${spine.name} · Joey Haas`,
  )

  if (result.state === 'missing') return <NotFound />

  if (result.state === 'ready') {
    return (
      <ItemView
        item={result.item}
        detail
        signedIn={signedIn}
        expanded={expanded}
        onToggleDescription={() => setExpanded((current) => !current)}
      />
    )
  }

  if (preview) {
    return (
      <ItemView
        item={preview}
        detail={false}
        signedIn={signedIn}
        note={
          result.state === 'error'
            ? 'More detail could not be loaded. Try again shortly.'
            : null
        }
      />
    )
  }

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

  return (
    <section>
      <p className="admin-error">
        This item could not be loaded. Try again shortly.
      </p>
    </section>
  )
}

/**
 * The page body for one item.
 *
 * `detail` is false for a snapshot preview: a list row, without the
 * description, the similar strip or the detail-only tiles, which appear when
 * the API answers.
 */
function ItemView({
  item,
  detail,
  signedIn,
  note = null,
  expanded = false,
  onToggleDescription,
}) {
  const meta = [item.year, item.creator].filter(Boolean).join(' · ')
  const description =
    detail && item.description ? plainText(item.description) : ''
  const themes = item.themes ?? []
  const otherPlatforms = (item.platforms ?? []).filter(
    (platform) => platform !== item.platform,
  )
  const copy = copyLine(item)
  const chips = [
    // What the game is, then where else it exists. The copy on the shelf
    // has its own line.
    ...item.genres.map((genre) => [`genre-${genre}`, genre, false]),
    ...themes.map((theme) => [`theme-${theme}`, theme, true]),
    ...otherPlatforms.map((platform) => [
      `platform-${platform}`,
      platform,
      true,
    ]),
  ]
  const similar = detail ? (item.similar_in_collection ?? []) : []

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
          {copy && <p className="item-copy">{copy}</p>}
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
            onClick={onToggleDescription}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      )}

      <Tiles item={item} detail={detail} />

      {note && <p className="admin-error">{note}</p>}

      {similar.length > 0 && (
        <section className="item-similar" aria-label="More from this shelf">
          <h2>More from this shelf</h2>
          <PosterGrid
            items={similar}
            size="compact"
            renderCard={(card) => (
              <PosterCard item={card} to={`/spine/${card.id}`} />
            )}
          />
        </section>
      )}
    </article>
  )
}
