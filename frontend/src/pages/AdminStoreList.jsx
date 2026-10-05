import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { apiFetch, errorMessage } from '../lib/api.js'
import { usePageTitle } from '../lib/usePageTitle.js'

const UNREACHABLE = 'Could not reach the API. Try again shortly.'

/** How far ahead a dated cartridge is worth asking a store about. */
export const PREORDER_DAYS = 90

/** [key, heading], in the order a store visit reads them. */
export const SECTIONS = [
  ['top', 'Top picks'],
  ['switch2', 'Out now on Switch 2'],
  ['switch', 'Out now on Switch'],
  ['preorder', 'Ask about pre-orders'],
  ['skip', 'Skip in store'],
]

// Mirrors PLATFORM_WORDS in backend/radar.py, which names each row's platform.
const CONSOLES = {
  'Nintendo Switch 2': 'switch2',
  'Nintendo Switch': 'switch',
}
const SKIP_FORMATS = new Set(['game_key_card', 'code_in_box'])
// Mirrors FORMAT_WORDS in backend/physical_sources/limits.py, as a line starts.
const FORMAT_WORDS = {
  game_card: 'Full game on cartridge',
  game_key_card: 'Game-Key Card',
  code_in_box: 'Code in a box',
  disc: 'Disc',
}

/** A local date as YYYY-MM-DD, the shape the API's dates come in. */
export function isoDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** `date` moved by `days` calendar days. */
export function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Where a Radar row goes on the store list, or null when it is not on it:
 * anything that is not a full cartridge is Skip; a cartridge out by today is
 * under its console; one due within PREORDER_DAYS is worth asking about.
 */
export function radarSection(row, today) {
  if (row.lane === 'digital' || SKIP_FORMATS.has(row.physical_format))
    return 'skip'
  if (row.physical_format !== 'game_card' || !row.release_date) return null
  if (row.release_date <= isoDay(today)) return CONSOLES[row.platform] ?? null
  return row.release_date <= isoDay(addDays(today, PREORDER_DAYS))
    ? 'preorder'
    : null
}

/** Discover's picks and Radar's rows as the store list's sections. */
export function buildList(discover, radar, today) {
  const sections = Object.fromEntries(SECTIONS.map(([key]) => [key, []]))
  const seen = new Set()
  function add(key, entry) {
    const game = `${entry.title}|${entry.platform}`
    if (seen.has(game)) return
    seen.add(game)
    sections[key].push(entry)
  }
  const byScore = (a, b) => b.score - a.score
  for (const pick of [...(discover?.picks ?? [])].sort(byScore))
    add('top', pick)
  const rows = Object.values(radar?.sections ?? {}).flat()
  for (const entry of rows.sort(byScore)) {
    const key = radarSection(entry, today)
    if (key) add(key, entry)
  }
  sections.preorder.sort((a, b) => a.release_date.localeCompare(b.release_date))
  return sections
}

async function fetchLists() {
  try {
    const [discover, radar] = await Promise.all([
      apiFetch('/api/recommendations?kind=discover'),
      apiFetch('/api/recommendations?kind=radar'),
    ])
    if (discover.status === 401 || radar.status === 401)
      return { state: 'unauthorized' }
    if (!discover.ok)
      return { state: 'error', error: await errorMessage(discover) }
    if (!radar.ok) return { state: 'error', error: await errorMessage(radar) }
    return {
      state: 'ready',
      discover: await discover.json(),
      radar: await radar.json(),
    }
  } catch {
    return { state: 'error', error: UNREACHABLE }
  }
}

function meta(entry, key) {
  const format =
    entry.lane === 'digital'
      ? 'Digital only'
      : (FORMAT_WORDS[entry.physical_format] ?? 'Format unknown')
  const parts = [entry.platform, format]
  if (key === 'preorder' && entry.release_date)
    parts.push(`Out ${entry.release_date}`)
  return parts.filter(Boolean).join(' · ')
}

/**
 * What to look for in a store, read from the pending Discover picks and Radar
 * rows: one column, large tap targets, nothing on hover, for a phone held in
 * an aisle. Got it is Discover's Already own: the game becomes a private
 * owned item and leaves both lists. The row goes at once and comes back if
 * the server refuses.
 */
export default function AdminStoreList() {
  usePageTitle('Store list · Admin')
  const { signedIn = false } = useOutletContext() ?? {}
  const [state, setState] = useState('loading')
  const [sections, setSections] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const apply = useCallback((result) => {
    setState(result.state)
    if (result.state === 'ready')
      setSections(buildList(result.discover, result.radar, new Date()))
    if (result.error) setError(result.error)
  }, [])

  useEffect(() => {
    let live = true
    fetchLists().then((result) => {
      if (live) apply(result)
    })
    return () => {
      live = false
    }
  }, [apply, signedIn])

  function show(id, shown) {
    setHidden((current) => {
      const next = new Set(current)
      if (shown) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function gotIt(entry) {
    setError(null)
    setMessage(null)
    show(entry.id, false)
    try {
      const response = await apiFetch(`/api/recommendations/${entry.id}/own`, {
        method: 'POST',
      })
      if (response.status === 409) {
        // errorMessage words every 409 as a running refresh; here it is the
        // suggestion's own answer ("Already on your shelf"), so it stays off.
        const body = await response.json().catch(() => ({}))
        setError(`${entry.title}: ${body.detail ?? 'already answered'}`)
        return
      }
      if (!response.ok) {
        show(entry.id, true)
        setError(await errorMessage(response))
        return
      }
      setMessage(`Added ${entry.title} to the collection`)
    } catch {
      show(entry.id, true)
      setError(UNREACHABLE)
    }
  }

  if (state === 'unauthorized') {
    return (
      <section>
        <h1>Store list</h1>
        <p>
          <Link to="/admin">Sign in</Link> to see the store list.
        </p>
      </section>
    )
  }

  const empty =
    sections && SECTIONS.every(([key]) => sections[key].length === 0)

  return (
    <section className="store-list">
      <h1>Store list</h1>
      <p className="store-list-note">
        On Switch 2 boxes, put back Game-Key Cards.
      </p>
      <p className="catalogue-progress" role="status" aria-live="polite">
        {message ?? ''}
      </p>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {state === 'loading' && <p className="muted">Loading the list…</p>}
      {empty && (
        <p className="muted">
          Nothing to look for yet: generate{' '}
          <Link to="/admin/discover">Discover</Link> and{' '}
          <Link to="/admin/radar">Radar</Link> first.
        </p>
      )}
      {sections &&
        SECTIONS.map(([key, heading]) => {
          const rows = sections[key].filter((entry) => !hidden.has(entry.id))
          return (
            <section
              key={key}
              className="store-list-section"
              aria-labelledby={`store-list-${key}`}
            >
              <h2 id={`store-list-${key}`}>{heading}</h2>
              {rows.length === 0 ? (
                <p className="muted">Nothing here.</p>
              ) : (
                <ul className="store-list-rows">
                  {rows.map((entry) => {
                    const reason = entry.reasons?.[0] ?? entry.format_note
                    return (
                      <li key={entry.id} className="store-list-row">
                        <div className="store-list-text">
                          <strong>{entry.title}</strong>
                          <span className="muted">{meta(entry, key)}</span>
                          {reason && <span>{reason}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => gotIt(entry)}
                          aria-label={`Got it: ${entry.title}`}
                        >
                          Got it
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
    </section>
  )
}
