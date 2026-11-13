import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { spine } from '../content/spine.js'
import LoadState from '../components/LoadState.jsx'
import Breadcrumb from '../components/Breadcrumb.jsx'
import CoverImage from '../components/CoverImage.jsx'
import CoverWall from '../components/CoverWall.jsx'
import RunBox from '../components/RunBox.jsx'
import RunLanes, { RunKey } from '../components/RunLanes.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import PlaythroughTable from '../components/PlaythroughTable.jsx'
import Rating from '../components/Rating.jsx'
import { apiFetch } from '../lib/api.js'
import { expandRanges, shortDate } from '../lib/comics.js'
import { toggleOwned } from '../lib/comicEdits.js'
import {
  laneSpans,
  lanesLabel,
  runModel,
  runSentence,
} from '../lib/comicRun.js'
import { readSnapshot } from '../lib/snapshot.js'
import { runWords, STATUS_LABEL } from '../lib/shelf.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import NotFound from './NotFound.jsx'
import { itemPath } from '../lib/spinePaths.js'
import { useLiveRead } from '../lib/useLiveRead.js'
import { SAVED_NOT_REFRESHED } from '../content/status.js'
import { useRefreshAfterWrite } from '../lib/useRefreshAfterWrite.js'

const COMICS = spine.comics
const SERIES = COMICS.series
const ITEM = spine.item
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
    // The open run's start: after Try again, not the abandoned run's.
    const since = item.playing_since ?? item.started_at
    if (since) return `${label} · since ${DAY.format(parseDate(since))}`
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
    const verb =
      item.status === 'paused'
        ? `${runWords(item.type).replay} paused`
        : runWords(item.type).again
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

/** Hours as a tile figure, or null when IGDB has none. */
function hours(value) {
  return value == null ? null : `${Math.round(value)} h`
}

/** Main story and To complete as labelled figures; a missing one is omitted. */
function timeToBeatFigures(timeToBeat) {
  if (!timeToBeat) return []
  const main = hours(timeToBeat.normally)
  const full = hours(timeToBeat.completely)
  return [
    main && [ITEM.mainStory, `≈ ${main}`],
    full && [ITEM.toComplete, full],
  ].filter(Boolean)
}

/**
 * My rating always; the community, length and play history only with the
 * detail response, which the snapshot preview does not have.
 */
function Tiles({ item, detail }) {
  const played = playedLine(item)
  const showPlayed = item.times_completed > 0 || played
  const timeToBeat = timeToBeatFigures(item.time_to_beat)
  return (
    <dl className="item-tiles">
      <div className="item-tile">
        <dt>My rating</dt>
        {item.rating ? (
          <dd>
            <Rating rating={item.rating} size="large" />
            <span className="muted" aria-hidden="true">
              {ITEM.outOfTen}
            </span>
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
      {detail && timeToBeat.length > 0 && (
        <div className="item-tile">
          <dt>Time to beat</dt>
          <dd>
            {timeToBeat.map(([label, figure]) => (
              <span className="item-ttb" key={label}>
                <span className="muted">{label}</span>
                <span className="item-tile-figure">{figure}</span>
              </span>
            ))}
          </dd>
        </div>
      )}
      {detail && showPlayed && (
        <div className="item-tile">
          <dt>{runWords(item.type).tile}</dt>
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

/**
 * The trail above the title. A comic series sits under Comics, as its issue
 * pages' trail does; a game sits directly under the shelf.
 *
 * @param {string|null} title - Null while nothing is known yet.
 * @param {boolean} comic
 */
function itemTrail(title, comic) {
  const trail = [{ label: spine.name, to: spine.path }]
  if (comic) {
    trail.push({ label: spine.tabs.comics.label, to: spine.tabs.comics.to })
  }
  if (title) trail.push({ label: title })
  return trail
}

/** "Comic · Image · 2012 – ongoing": the series page's line above the title. */
function comicKicker(item) {
  const publisher = item.comic?.publisher ?? item.creator
  const year = item.year
    ? `${item.year}${item.comic?.ongoing ? ` – ${SERIES.ongoing}` : ''}`
    : null
  return [SERIES.kicker, publisher, year].filter(Boolean).join(' · ')
}

/** A comic's run model from the public detail. Skips are never public. */
function publicRun(item) {
  const comic = item.comic
  return runModel({
    singles: comic.owned_text,
    editions: comic.editions,
    readTo: comic.read_to,
    released: comic.released,
    ongoing: comic.ongoing,
    nextIssue: comic.next_issue?.store_date ? comic.next_issue : null,
    wanted: item.wanted,
  })
}

/** "58 of 72+" and its pill, then the format and the "as of" note. */
function ComicSummary({ comic, model }) {
  if (model.held === 0) return null
  const pill =
    model.state === 'gaps'
      ? SERIES.pill.gaps(model.missing)
      : SERIES.pill[model.state]
  // "As of" only for an ongoing series nobody follows: a followed one is
  // refreshed nightly, an ended one cannot drift (comics spec, 4).
  const asOf =
    comic.ongoing && !comic.following && comic.as_of
      ? SERIES.asOf(SHORT_MONTH_YEAR.format(parseDate(comic.as_of)))
      : null
  const notes = [COMICS.formats[comic.shelf_format], asOf].filter(Boolean)
  return (
    <p className="comic-sum">
      <b>{SERIES.count(model.held, model.released, model.ongoing)}</b>{' '}
      <span
        className="series-pill"
        data-ok={model.state === 'gaps' ? undefined : ''}
      >
        {pill}
      </span>
      {notes.length > 0 && (
        <span className="muted"> · {notes.join(' · ')}</span>
      )}
    </p>
  )
}

/**
 * What's next, in the order a reader asks: what to read, what to buy, what
 * to wait for. Next out shows only when the API returns a dated issue. A
 * want or a run with no issues recorded says so in a dashed box instead.
 */
function WhatsNext({ model }) {
  if (model.state === 'want') {
    return (
      <div className="comic-hero-next">
        <p className="comic-empty">
          {SERIES.empty.want(model.released, model.ongoing)}
        </p>
      </div>
    )
  }
  if (model.state === 'unrecorded') {
    return (
      <div className="comic-hero-next">
        <p className="comic-empty">{SERIES.empty.unrecorded}</p>
      </div>
    )
  }
  const N = SERIES.next
  const tiles = []
  if (model.readNext) {
    tiles.push([
      N.toRead,
      `#${model.readNext.n}`,
      model.readNext.edition
        ? N.inEdition(model.readNext.edition.label)
        : N.unread(model.unread),
    ])
  } else {
    tiles.push([
      N.reading,
      N.allRead,
      model.readTo ? N.through(model.readTo) : null,
    ])
  }
  if (model.firstGap) {
    tiles.push([N.gap, `#${model.firstGap.n}`, N.missing(model.missing)])
  } else {
    tiles.push([
      N.run,
      SERIES.pill[model.state],
      SERIES.count(model.held, model.released, model.ongoing),
    ])
  }
  if (model.nextIssue) {
    tiles.push([
      N.out,
      `#${model.nextIssue.number}`,
      shortDate(model.nextIssue.store_date),
    ])
  }
  return (
    <section className="comic-hero-next comic-next" aria-label={N.label}>
      {tiles.map(([label, value, note]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
          {note && <small>{note}</small>}
        </div>
      ))}
    </section>
  )
}

/**
 * The run card, the editions and About: the comic's cards, in that order.
 *
 * The run card draws the lanes (the overview) above the box (the detail),
 * except for a run of 12 issues or fewer, where the cells already show
 * everything. The sentence under the box is the text equivalent of both.
 * Signed in, a single issue's cell toggles it owned and saves at once.
 */
function ComicCards({
  comic,
  detail,
  model,
  description,
  wall,
  skipped,
  series,
  onToggleIssue,
  saving,
  saveError,
}) {
  const spans = laneSpans(model)
  const hasWall = (wall?.issues?.length ?? 0) > 0
  return (
    <>
      {model.held > 0 && (
        <section className="item-card" aria-labelledby="item-run">
          <h2 id="item-run">{SERIES.runCard}</h2>
          {!spans.short && (
            <>
              <RunLanes spans={spans} label={lanesLabel(model)} />
              {!hasWall && (
                <p className="comic-box-kicker">{SERIES.inTheBox}</p>
              )}
            </>
          )}
          {!hasWall && (
            <>
              <RunBox
                model={model}
                mode={onToggleIssue ? 'toggle' : 'public'}
                busy={saving}
                onCell={
                  onToggleIssue
                    ? (issue) => onToggleIssue(issue.n, !issue.held)
                    : undefined
                }
              />
              <RunKey variant="box" />
            </>
          )}
          <p className="comic-sentence muted">{runSentence(model)}</p>
          {saveError && (
            <p className="admin-error" role="alert">
              {saveError}
            </p>
          )}
        </section>
      )}

      {model.held > 0 && hasWall && (
        <CoverWall
          wall={wall}
          detail={detail}
          series={series}
          skipped={skipped ?? undefined}
        />
      )}

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
  const [preview, setPreview] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [runs, setRuns] = useState(null)
  // The owner's skipped issues, from the same row as the playthroughs.
  const [skipped, setSkipped] = useState(null)
  const [wall, setWall] = useState(null)

  const read = useLiveRead(
    async (signal) => {
      const response = await apiFetch(
        `/api/public/items/${encodeURIComponent(id)}`,
        { signal },
      )
      if (response.status === 404) return { missing: true }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    },
    [id],
  )
  const { failed, retry } = read
  const { refresh, tryAgain, afterWrite } = useRefreshAfterWrite(retry)
  const missing = read.data?.missing === true
  const loaded = missing ? null : read.data

  // The card-level fields from the build-time snapshot, painted while the
  // API wakes. The API stays authoritative: its 404 wins over a snapshot
  // taken before the item was unpublished.
  useEffect(() => {
    let cancelled = false
    readSnapshot('items').then((items) => {
      const match = items?.find((entry) => entry.id === id)
      if (!cancelled && match) setPreview(match)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // The owner's playthroughs come from the admin read, which a visitor
  // cannot make; the public item carries only the dates. Quiet on failure:
  // the table is an aside, and the edit page is where it matters.
  useEffect(() => {
    if (!signedIn) return undefined
    let cancelled = false
    apiFetch(`/api/items/${encodeURIComponent(id)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled) return
        setRuns(body?.playthroughs ?? null)
        setSkipped(new Set(expandRanges(body?.issues_skipped)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, signedIn])

  // A comic's issue rows and editions, for the cover wall. Quiet on failure
  // (and while the series has no issue rows): the run box draws as before.
  const comicReady = loaded?.type === 'comic'
  useEffect(() => {
    if (!comicReady) return undefined
    let cancelled = false
    apiFetch(`/api/public/items/${encodeURIComponent(id)}/issues`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled) setWall(Array.isArray(body?.issues) ? body : null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, comicReady])

  /**
   * Owns or unowns one issue from the grid (`lib/comicEdits.js` edits the
   * owner's own ranges), then reloads the public detail, which recomputes
   * the run.
   */
  const toggleIssue = useCallback(
    async (issue, owned) => {
      setSaving(true)
      setSaveError(null)
      try {
        await toggleOwned(id, issue, owned)
      } catch {
        setSaveError(SERIES.saveError)
        setSaving(false)
        return
      }
      // The write went through; stay busy until the re-read settles.
      await refresh()
      setSaving(false)
    },
    [id, refresh],
  )

  const staleLine = (
    <LoadState
      failed
      stale
      live={read.live}
      staleMessage={afterWrite ? SAVED_NOT_REFRESHED : undefined}
      onRetry={tryAgain}
    />
  )
  const shown = loaded ?? preview
  // Null on a 404, so NotFound's own title stands (see usePageTitle).
  usePageTitle(
    missing
      ? null
      : shown
        ? `${shown.title} · ${spine.name}`
        : `${spine.name} · Joey Haas`,
  )

  if (missing) return <NotFound />

  if (loaded) {
    return (
      <ItemView
        item={loaded}
        detail
        signedIn={signedIn}
        runs={signedIn ? runs : null}
        skipped={signedIn ? skipped : null}
        wall={wall}
        expanded={expanded}
        onToggleDescription={() => setExpanded((current) => !current)}
        onToggleIssue={signedIn ? toggleIssue : undefined}
        saving={saving}
        saveError={saveError}
        loadState={failed ? staleLine : null}
      />
    )
  }

  if (preview) {
    return (
      <ItemView
        item={preview}
        detail={false}
        signedIn={signedIn}
        loadState={failed ? staleLine : null}
      />
    )
  }

  // Nothing to show yet, or the read failed: the same breadcrumb as the
  // loaded page, so nothing shifts when the item arrives.
  return (
    <article className="item-page">
      <Breadcrumb trail={itemTrail(null, false)} />
      <h1 className="visually-hidden">{spine.name}</h1>
      <LoadState loading={!failed} failed={failed} onRetry={retry} />
    </article>
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
  skipped = null,
  wall = null,
  loadState = null,
  expanded = false,
  onToggleDescription,
  onToggleIssue,
  saving = false,
  saveError = null,
}) {
  const isComic = item.type === 'comic'
  // The detail's comic block; the snapshot preview has none.
  const comic = detail && isComic ? item.comic : null
  const run = comic ? publicRun(item) : null
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
  // What the game is, then where else it exists. The copy on the shelf has
  // its own line.
  const chipGroups = [
    [
      'genres',
      ITEM.genresLabel,
      [
        ...item.genres.map((genre) => [`genre-${genre}`, genre, false]),
        ...themes.map((theme) => [`theme-${theme}`, theme, true]),
      ],
    ],
    [
      'also-on',
      ITEM.alsoOnLabel,
      otherPlatforms.map((platform) => [
        `platform-${platform}`,
        platform,
        true,
      ]),
    ],
  ].filter(([, , chips]) => chips.length > 0)
  const similar = detail ? (item.similar_in_collection ?? []) : []

  return (
    <article className="item-page">
      <Breadcrumb trail={itemTrail(item.title, isComic)} />

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
          {comic && <ComicSummary comic={comic} model={run} />}
          {signedIn && (
            <Link to={`/admin/collection/${item.id}`} className="item-edit">
              Edit
            </Link>
          )}
        </div>
        {comic && <WhatsNext model={run} />}
      </header>

      {chipGroups.length > 0 && (
        <dl className="item-groups">
          {chipGroups.map(([key, label, chips]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                <ul className="item-chips">
                  {chips.map(([chipKey, chipLabel, muted]) => (
                    <li
                      key={chipKey}
                      className={
                        muted ? 'item-chip item-chip-muted' : 'item-chip'
                      }
                    >
                      {chipLabel}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
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
        <section
          className="item-playthroughs"
          aria-label={runWords(item.type).runs}
        >
          <h2>{runWords(item.type).runs}</h2>
          <PlaythroughTable runs={runs} type={item.type} />
          <p className="muted playthroughs-note">
            Dates change on the{' '}
            <Link to={`/admin/collection/${item.id}`}>edit page</Link>.
          </p>
        </section>
      )}

      {comic && (
        <ComicCards
          comic={comic}
          detail={item}
          wall={wall}
          skipped={skipped ?? undefined}
          series={{ id: item.id, title: item.title }}
          model={run}
          description={description}
          onToggleIssue={onToggleIssue}
          saving={saving}
          saveError={saveError}
        />
      )}

      {loadState}

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
