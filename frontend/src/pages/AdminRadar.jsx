import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import { apiFetch, errorMessage } from '../lib/api.js'
import { localToday } from '../lib/statusTransition.js'

const UNREACHABLE = 'Could not reach the API. Try again shortly.'

// Mirrors FORMAT_WORDS in backend/physical_sources/limits.py.
const FORMAT_WORDS = {
  game_card: 'Full game on cartridge',
  game_key_card: 'Game-Key Card',
  code_in_box: 'Code in a box',
  disc: 'Disc',
}

const MONTH = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const DAY = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function utc(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** A release date as precisely as it is known. */
export function releaseWords(row) {
  if (!row.release_date) return 'Date not announced'
  const date = utc(row.release_date)
  if (row.release_precision === 'year') return String(date.getUTCFullYear())
  if (row.release_precision === 'quarter')
    return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`
  if (row.release_precision === 'month') return MONTH.format(date)
  return DAY.format(date)
}

/** "2 hours ago", or "never". */
export function ago(timestamp, now = Date.now()) {
  if (!timestamp) return 'never'
  const minutes = Math.round((now - new Date(timestamp).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/** The soonest open pre-order window among a row's store lines, or null. */
export function soonestWindow(row, today) {
  const open = row.store_lines
    .filter(
      (line) =>
        line.availability === 'preorder' &&
        line.preorder_closes_at &&
        line.preorder_closes_at >= today,
    )
    .map((line) => line.preorder_closes_at)
    .sort()
  return open[0] ?? null
}

/**
 * Suggested rows in groups by release, soonest group first: a month when the
 * date is that precise, else the year or quarter as known ("2027"), "Out
 * now" for a pre-order of a game already out, or "Date not announced".
 * Within a group, open pre-orders come first, soonest-closing first.
 */
export function byMonth(rows, today) {
  const label = (row) => {
    if (!row.release_date) return 'Date not announced'
    if (row.release_date <= today) return 'Out now'
    if (['day', 'month'].includes(row.release_precision ?? 'day'))
      return MONTH.format(utc(row.release_date))
    return releaseWords(row)
  }
  const order = (row) =>
    !row.release_date
      ? '9999-12-31'
      : row.release_date <= today
        ? '0000-01-01'
        : row.release_date
  const groups = new Map()
  for (const row of rows) {
    const key = label(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const closes = (row) => soonestWindow(row, today) ?? '9999-12-31'
  return [...groups.entries()]
    .sort(
      ([, a], [, b]) =>
        order(a[0]).localeCompare(order(b[0])) ||
        String(a[0].release_date).localeCompare(String(b[0].release_date)),
    )
    .map(([group, entries]) => [
      group,
      [...entries].sort((a, b) => closes(a).localeCompare(closes(b))),
    ])
}

async function fetchRadar() {
  try {
    const [radar, watching] = await Promise.all([
      apiFetch('/api/recommendations?kind=radar'),
      apiFetch('/api/recommendations/watching'),
    ])
    if (radar.status === 401 || watching.status === 401)
      return { state: 'unauthorized' }
    if (!radar.ok) return { state: 'error', error: await errorMessage(radar) }
    if (!watching.ok)
      return { state: 'error', error: await errorMessage(watching) }
    return {
      state: 'ready',
      radar: await radar.json(),
      watching: await watching.json(),
    }
  } catch {
    return { state: 'error', error: UNREACHABLE }
  }
}

function StoreLine({ line }) {
  // Only a pre-order line has a window worth naming.
  const closes =
    line.availability === 'preorder' && line.preorder_closes_at
      ? `, pre-orders close ${DAY.format(utc(line.preorder_closes_at))}`
      : ''
  return (
    <li>
      <a href={line.url} target="_blank" rel="noreferrer">
        {line.store}
      </a>
      {line.price ? ` · ${line.price} ${line.currency}` : ''}
      {closes}
    </li>
  )
}

/** A watched game's open pre-order, under its poster. */
function WatchNote({ preorder }) {
  if (!preorder) return null
  const closes = preorder.closes_at
    ? `closes ${DAY.format(utc(preorder.closes_at))}`
    : 'open'
  return (
    <p className="radar-watch-note">
      <a href={preorder.url} target="_blank" rel="noreferrer">
        Pre-order at {preorder.store}
      </a>
      , {closes}
      {preorder.price ? ` · ${preorder.price} ${preorder.currency}` : ''}
    </p>
  )
}

function RadarCard({ row, busy, onAnswer, level = 3 }) {
  const Title = `h${level}`
  const format = row.physical_format
    ? FORMAT_WORDS[row.physical_format]
    : row.format_note
  return (
    <article className="radar-card">
      <span className="radar-cover">
        <CoverImage src={row.cover_url} type="game" alt="" />
      </span>
      <div className="radar-body">
        <Title>{row.title}</Title>
        <p className="muted">
          {[releaseWords(row), row.platform, format]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {row.reasons.length > 0 && (
          <ul className="radar-reasons">
            {row.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {row.store_lines.length > 0 && (
          <ul className="radar-stores">
            {row.store_lines.map((line, index) => (
              <StoreLine key={`${line.url}-${index}`} line={line} />
            ))}
          </ul>
        )}
        <div className="radar-actions">
          <button
            type="button"
            disabled={busy}
            aria-label={`Watch ${row.title}`}
            onClick={() => onAnswer(row, 'watch')}
          >
            Watch
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={`Not interested in ${row.title}`}
            onClick={() => onAnswer(row, 'dismiss')}
          >
            Not interested
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={`Skip ${row.title}`}
            onClick={() => onAnswer(row, 'skip')}
          >
            Skip
          </button>
        </div>
      </div>
    </article>
  )
}

function Cards({ rows, busy, onAnswer, level }) {
  return (
    <div className="radar-cards">
      {rows.map((row) => (
        <RadarCard
          key={row.id}
          row={row}
          busy={busy}
          onAnswer={onAnswer}
          level={level}
        />
      ))}
    </div>
  )
}

export default function AdminRadar() {
  const { signedIn = false } = useOutletContext() ?? {}
  const [state, setState] = useState('loading')
  const [radar, setRadar] = useState(null)
  const [watching, setWatching] = useState([])
  const [busy, setBusy] = useState(false)
  const [keyCards, setKeyCards] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const apply = useCallback((result) => {
    setState(result.state)
    if (result.radar) setRadar(result.radar)
    if (result.watching) setWatching(result.watching)
    if (result.error) setError(result.error)
  }, [])

  useEffect(() => {
    let live = true
    fetchRadar().then((result) => {
      if (live) apply(result)
    })
    return () => {
      live = false
    }
  }, [apply, signedIn])

  async function generate() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch('/api/recommendations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'radar', include_key_cards: keyCards }),
      })
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      const result = await response.json()
      const { suggested, dated_later: later, digital } = result.counts
      setMessage(
        `${suggested} suggested, ${later} dated later, ${digital} digital so far`,
      )
      if (result.digital_error)
        setError(`Digital so far is missing: ${result.digital_error}`)
    } catch {
      setError(UNREACHABLE)
    } finally {
      // Read the radar before the buttons come back, so an answer pressed
      // now is not undone by an older list arriving after it.
      apply(await fetchRadar())
      setBusy(false)
    }
  }

  function drop(row) {
    setRadar((current) => ({
      ...current,
      sections: Object.fromEntries(
        Object.entries(current.sections).map(([name, rows]) => [
          name,
          rows.filter((entry) => entry.id !== row.id),
        ]),
      ),
    }))
  }

  async function answer(row, action) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch(
        `/api/recommendations/${row.id}/${action}`,
        { method: 'POST' },
      )
      if (response.status === 409) {
        // errorMessage words every 409 as a running refresh; here it is the
        // suggestion's own answer ("Already on your shelf").
        const body = await response.json().catch(() => ({}))
        setError(`${row.title}: ${body.detail ?? 'already answered'}`)
        drop(row) // settled elsewhere: it has nothing left to answer here
        return
      }
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      drop(row)
      if (action === 'watch') {
        setMessage(`Watching ${row.title}`)
        apply(await fetchRadar())
      }
    } catch {
      setError(UNREACHABLE)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'unauthorized') {
    return (
      <section>
        <h1>Radar</h1>
        <p>
          <Link to="/admin">Sign in</Link> to see the radar.
        </p>
      </section>
    )
  }

  const sections = radar?.sections ?? {
    suggested: [],
    dated_later: [],
    digital: [],
  }
  const nothing =
    radar &&
    !sections.suggested.length &&
    !sections.dated_later.length &&
    !sections.digital.length

  return (
    <section className="radar">
      <h1>Radar</h1>
      <p className="muted">
        Upcoming physical releases and open pre-orders from the catalogue,
        ranked by your taste.
      </p>

      <div className="radar-header">
        <button type="button" disabled={busy} onClick={generate}>
          {busy ? 'Working…' : 'Generate'}
        </button>
        <label>
          <input
            type="checkbox"
            checked={keyCards}
            onChange={(event) => setKeyCards(event.target.checked)}
          />{' '}
          Include Game-Key Cards
        </label>
        <span className="muted">
          Generated {ago(radar?.generated_at)} ·{' '}
          <Link to="/admin/catalogue">
            Catalogue refreshed {ago(radar?.catalogue?.stores_at)} →
          </Link>
        </span>
      </div>

      {radar && radar.personalised === false && (
        <p className="muted">
          Ranked by anticipation: rate, finish or favourite a few games to
          personalise.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {state === 'loading' && <p className="muted">Loading the radar…</p>}

      <h2>Watching</h2>
      {watching.length ? (
        <PosterGrid
          items={watching.map((row) => ({
            ...row.item,
            type: 'game',
            preorder: row.preorder,
          }))}
          size="compact"
          renderCard={(item) => (
            <PosterCard
              item={item}
              to={`/admin/collection/${item.id}`}
              actions={() => <WatchNote preorder={item.preorder} />}
            />
          )}
        />
      ) : (
        <p className="muted">Nothing watched yet.</p>
      )}

      <h2>Suggested</h2>
      {nothing && (
        <p className="muted">Nothing yet. Generate to read the catalogue.</p>
      )}
      {byMonth(sections.suggested, localToday()).map(([group, rows]) => (
        <section key={group} aria-label={group}>
          <h3 className="radar-month">{group}</h3>
          <Cards rows={rows} busy={busy} onAnswer={answer} level={4} />
        </section>
      ))}

      <h2>Dated later</h2>
      {sections.dated_later.length ? (
        <Cards rows={sections.dated_later} busy={busy} onAnswer={answer} />
      ) : (
        <p className="muted">Nothing dated only by year or quarter.</p>
      )}

      <details className="radar-digital">
        <summary>
          <h2 className="radar-summary-title">
            Digital so far ({sections.digital.length})
          </h2>
        </summary>
        <p className="muted">
          Upcoming on your platforms with no physical edition announced yet.
        </p>
        <Cards rows={sections.digital} busy={busy} onAnswer={answer} />
      </details>
    </section>
  )
}
