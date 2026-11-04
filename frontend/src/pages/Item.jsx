import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { spine } from '../content/spine.js'
import CoverImage from '../components/CoverImage.jsx'
import IssueGrid from '../components/IssueGrid.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import PlaythroughTable from '../components/PlaythroughTable.jsx'
import Stars from '../components/Stars.jsx'
import { apiFetch } from '../lib/api.js'
import { compactRanges, expandRanges, shortDate } from '../lib/comics.js'
import { readSnapshot } from '../lib/snapshot.js'
import { STATUS_LABEL } from '../lib/shelf.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import NotFound from './NotFound.jsx'
import { itemPath } from '../lib/spinePaths.js'
import { LOAD_ERROR, WAKING } from '../content/status.js'

const COMICS = spine.comics
const SERIES = COMICS.series
const COMIC_VINE = 'https://comicvine.gamespot.com/'

const SHORT_MONTH_YEAR = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

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

/** "once", "twice", "3 times". */
function timesWord(count) {
  if (count === 1) return 'once'
  if (count === 2) return 'twice'
  return `${count} times`
}

/**
 * The hero's status line; comics in comic words.
 *
 * "Finished · June 2026", "Finished twice · last Oct 2026", "Paused · since
 * Aug 2026", "Playing · since Oct 24, 2026". A replay in progress says
 * "again" instead of a date: the public `started_at` is the first run's.
 */
function statusInWords(item) {
  const labels = item.type === 'comic' ? COMICS.status : STATUS_LABEL
  const label = labels[item.status] ?? item.status
  const times = item.times_completed ?? 0
  if (item.status === 'finished' && item.finished_at) {
    const when = parseDate(item.finished_at)
    return times > 1
      ? `${label} ${timesWord(times)} · last ${SHORT_MONTH_YEAR.format(when)}`
      : `${label} · ${MONTH_YEAR.format(when)}`
  }
  if (item.status === 'paused' && item.paused_on) {
    return `${label} · since ${SHORT_MONTH_YEAR.format(parseDate(item.paused_on))}`
  }
  if (item.status === 'active') {
    if (times > 0) return `${label} again`
    if (item.started_at) {
      return `${label} · since ${DAY.format(parseDate(item.started_at))}`
    }
  }
  return label
}

/**
 * The Played tile's muted line: "Last Oct 19, 2026 · first Mar 2024" over
 * the dated finishes, "Playing again" while a replay is open, or the date
 * range when nothing was finished.
 */
function playedLine(item) {
  const times = item.times_completed ?? 0
  const finishes = item.finishes ?? []
  if (times > 0 && (item.status === 'active' || item.status === 'paused')) {
    const verb = item.status === 'paused' ? 'Replay paused' : 'Playing again'
    const last = item.finished_at
      ? ` · last finished ${DAY.format(parseDate(item.finished_at))}`
      : ''
    return `${verb}${last}`
  }
  if (finishes.length > 1) {
    const first = SHORT_MONTH_YEAR.format(parseDate(finishes[0]))
    const last = DAY.format(parseDate(finishes[finishes.length - 1]))
    return `Last ${last} · first ${first}`
  }
  return playedRange(item)
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
  const played = playedLine(item)
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
                Finished{' '}
                {item.times_completed === 1
                  ? 'once'
                  : `${item.times_completed} times`}
              </span>
            )}
            {played && <span className="muted">{played}</span>}
          </dd>
        </div>
      )}
    </dl>
  )
}

/** "Comic · Image · 2012 – ongoing": the series page's line above the title. */
function comicKicker(item) {
  const publisher = item.comic?.publisher ?? item.creator
  const year = item.year
    ? `${item.year}${item.comic?.ongoing ? ` – ${SERIES.ongoing}` : ''}`
    : null
  return [SERIES.kicker, publisher, year].filter(Boolean).join(' · ')
}

/**
 * The run in facts. "As of" only for an ongoing series nobody follows: a
 * followed one is refreshed nightly, an ended one cannot drift (spec, 4).
 * Writer is left out: Comic Vine volumes carry no people, only issues do.
 */
function ComicFacts({ comic }) {
  const owned = expandRanges(comic.owned_text).length
  const state = COMICS.runStates[comic.run_state]
  const asOf =
    comic.ongoing && !comic.following && comic.as_of
      ? SHORT_MONTH_YEAR.format(parseDate(comic.as_of))
      : null
  const format = [
    COMICS.formats[comic.shelf_format],
    ...comic.editions.map((edition) => edition.label),
  ]
    .filter(Boolean)
    .join(' · ')
  const unread = comic.read_to ? owned - comic.read : 0
  const next =
    comic.following && comic.next_issue?.store_date ? comic.next_issue : null
  return (
    <dl className="item-facts">
      <div>
        <dt>{SERIES.facts.run}</dt>
        <dd>
          {SERIES.run(owned, comic.released, comic.ongoing)}
          {state && (
            <>
              {' · '}
              <span
                className="series-pill"
                data-ok={comic.run_state === 'gaps' ? undefined : ''}
              >
                {state}
              </span>
            </>
          )}
          {asOf && ` · ${SERIES.asOf(asOf)}`}
        </dd>
      </div>
      {format && (
        <div>
          <dt>{SERIES.facts.format}</dt>
          <dd>{format}</dd>
        </div>
      )}
      <div>
        <dt>{SERIES.facts.readTo}</dt>
        <dd>
          {comic.read_to ? `#${comic.read_to}` : SERIES.notStarted}
          {unread > 0 && ` · ${SERIES.unread(unread)}`}
        </dd>
      </div>
      {next && (
        <div>
          <dt>{SERIES.facts.next}</dt>
          <dd>
            #{next.number} · {shortDate(next.store_date)}
          </dd>
        </div>
      )}
    </dl>
  )
}

/** The issue grid, the editions and About: the comic's three cards. */
function ComicCards({ comic, description, onToggleIssue, saving, saveError }) {
  return (
    <>
      <section className="item-card" aria-labelledby="item-issues">
        <h2 id="item-issues">
          {SERIES.issues}{' '}
          {comic.owned_text && <small>#{comic.owned_text}</small>}
        </h2>
        <IssueGrid detail={comic} onToggle={onToggleIssue} busy={saving} />
        {saveError && (
          <p className="admin-error" role="alert">
            {saveError}
          </p>
        )}
      </section>

      {comic.editions.length > 0 && (
        <section className="item-card" aria-labelledby="item-editions">
          <h2 id="item-editions">{SERIES.editions}</h2>
          <ul className="item-editions">
            {comic.editions.map((edition) => (
              <li
                key={`${edition.kind}-${edition.label}-${edition.from_issue}`}
              >
                <span className="item-edition-kind">{edition.kind}</span>
                <b>{edition.label}</b>
                <span className="muted">
                  {SERIES.collects(edition.from_issue, edition.to_issue)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {description && (
        <section className="item-card" aria-labelledby="item-about">
          <h2 id="item-about">{SERIES.about}</h2>
          <p className="item-description">{description}</p>
          <p className="item-card-source muted">
            {SERIES.from} <a href={COMIC_VINE}>{COMICS.attribution.label}</a>
          </p>
        </section>
      )}

      <p className="item-attribution muted">
        {COMICS.attribution.before}{' '}
        <a href={COMIC_VINE}>{COMICS.attribution.label}</a>
        {COMICS.attribution.after}
      </p>
    </>
  )
}

/**
 * One public item: `/shelf/:id`.
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
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [runs, setRuns] = useState(null)

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

  // The owner's playthroughs come from the admin read, which a visitor
  // cannot make; the public item carries only the dates. Quiet on failure:
  // the table is an aside, and the edit page is where it matters.
  useEffect(() => {
    if (!signedIn) return undefined
    let cancelled = false
    apiFetch(`/api/items/${encodeURIComponent(id)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled) setRuns(body?.playthroughs ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, signedIn])

  /**
   * Owns or unowns one issue from the grid, then reloads the public detail,
   * which recomputes the run. The ranges sent are the owner's own
   * `issues_owned`, read first: the public `owned_text` counts the
   * editions' issues too, and writing it back would bake them in.
   */
  const toggleIssue = useCallback(
    async (issue, owned) => {
      setSaving(true)
      setSaveError(null)
      try {
        const path = `/api/items/${encodeURIComponent(id)}`
        const current = await apiFetch(path)
        if (!current.ok) throw new Error(`GET ${current.status}`)
        const numbers = new Set(
          expandRanges((await current.json()).issues_owned),
        )
        if (owned) numbers.add(issue)
        else numbers.delete(issue)
        const response = await apiFetch(path, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issues_owned: compactRanges(numbers) }),
        })
        if (!response.ok) throw new Error(`PATCH ${response.status}`)
        const next = await load()
        if (next.state === 'ready') setResult(next)
      } catch {
        setSaveError(SERIES.saveError)
      } finally {
        setSaving(false)
      }
    },
    [id, load],
  )

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
        runs={signedIn ? runs : null}
        expanded={expanded}
        onToggleDescription={() => setExpanded((current) => !current)}
        onToggleIssue={signedIn ? toggleIssue : undefined}
        saving={saving}
        saveError={saveError}
      />
    )
  }

  if (preview) {
    return (
      <ItemView
        item={preview}
        detail={false}
        signedIn={signedIn}
        note={result.state === 'error' ? LOAD_ERROR : null}
      />
    )
  }

  if (result.state === 'loading') {
    return (
      <section>
        <p className="muted" role="status">
          {slow ? WAKING : 'Loading…'}
        </p>
      </section>
    )
  }

  return (
    <section>
      <p className="admin-error" role="alert">
        {LOAD_ERROR}
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
  runs = null,
  note = null,
  expanded = false,
  onToggleDescription,
  onToggleIssue,
  saving = false,
  saveError = null,
}) {
  const isComic = item.type === 'comic'
  // The detail's comic block; the snapshot preview has none.
  const comic = detail && isComic ? item.comic : null
  const meta = isComic
    ? ''
    : [item.year, item.creator].filter(Boolean).join(' · ')
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
      <div className="item-hero" />

      <header className="item-head">
        <div className="item-cover">
          <CoverImage src={item.cover_url} type={item.type} alt="" priority />
        </div>
        <div className="item-heading">
          {isComic && <p className="item-kicker">{comicKicker(item)}</p>}
          <h1>{item.title}</h1>
          {meta && <p className="muted">{meta}</p>}
          <p className="item-status" data-status={item.status}>
            {statusInWords(item)}
          </p>
          {copy && <p className="item-copy">{copy}</p>}
          {comic && <ComicFacts comic={comic} />}
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

      {description && !comic && (
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

      {runs && runs.length > 0 && (
        <section className="item-playthroughs" aria-label="Playthroughs">
          <h2>Playthroughs</h2>
          <PlaythroughTable runs={runs} />
          <p className="muted playthroughs-note">
            Dates change on the{' '}
            <Link to={`/admin/collection/${item.id}`}>edit page</Link>.
          </p>
        </section>
      )}

      {comic && (
        <ComicCards
          comic={comic}
          description={description}
          onToggleIssue={onToggleIssue}
          saving={saving}
          saveError={saveError}
        />
      )}

      {note && <p className="admin-error">{note}</p>}

      {similar.length > 0 && (
        <section className="item-similar" aria-label="More from this shelf">
          <h2>More from this shelf</h2>
          <PosterGrid
            items={similar}
            size="compact"
            renderCard={(card) => (
              <PosterCard item={card} to={itemPath(card.id)} />
            )}
          />
        </section>
      )}
    </article>
  )
}
