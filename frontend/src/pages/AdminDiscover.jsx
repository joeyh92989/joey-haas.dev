import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import RateAFew from '../components/RateAFew.jsx'
import RecommendationCard, {
  DISCOVER_ACTIONS,
} from '../components/RecommendationCard.jsx'
import { apiFetch, errorMessage } from '../lib/api.js'

const UNREACHABLE = 'Could not reach the API. Try again shortly.'

const POPULARITY = [
  ['safe', 'Safe'],
  ['balanced', 'Balanced'],
  ['deep', 'Deep'],
]
const WINDOW = [
  ['recent', 'Recent'],
  ['any', 'Any'],
]
// The catalogue's platforms. None chosen means the collection's own.
const PLATFORMS = [
  [508, 'Switch 2'],
  [130, 'Switch'],
  [4, 'N64'],
]

async function fetchDiscover() {
  try {
    const [discover, items] = await Promise.all([
      apiFetch('/api/recommendations?kind=discover'),
      apiFetch('/api/items?type=game&status=finished'),
    ])
    if (discover.status === 401 || items.status === 401)
      return { state: 'unauthorized' }
    if (!discover.ok)
      return { state: 'error', error: await errorMessage(discover) }
    // Rate a few is an extra: the picks still show without it.
    return {
      state: 'ready',
      discover: await discover.json(),
      items: items.ok ? await items.json() : [],
    }
  } catch {
    return { state: 'error', error: UNREACHABLE }
  }
}

/** How the current picks were ranked, in words. */
export function rankingWords(discover) {
  if (!discover?.picks?.length) return null
  if (discover.ranked_by === 'model') return 'Ranked by Gemini.'
  return discover.model_note
    ? `Ranked by taste alone: ${discover.model_note}.`
    : 'Ranked by taste alone.'
}

/** What an empty Picks section says. */
export function emptyWords(discover, emptyNote) {
  if (emptyNote) return `Nothing to pick: ${emptyNote}.`
  if (discover?.generated_at)
    return 'Nothing left to answer. Generate for more.'
  return 'Nothing yet. Generate to read the catalogue.'
}

function Choice({ legend, name, options, value, onChange }) {
  return (
    <fieldset className="discover-choice">
      <legend>{legend}</legend>
      {options.map(([option, label]) => (
        <label key={option}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />{' '}
          {label}
        </label>
      ))}
    </fieldset>
  )
}

/**
 * Discover: released physical games on the owner's platforms that they
 * would love and do not have, eight at a time, picked by one Gemini call
 * from the catalogue's best-scoring twenty.
 */
export default function AdminDiscover() {
  const { signedIn = false } = useOutletContext() ?? {}
  const [state, setState] = useState('loading')
  const [discover, setDiscover] = useState(null)
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [popularity, setPopularity] = useState('balanced')
  const [released, setReleased] = useState('any')
  const [platforms, setPlatforms] = useState([])
  const [keyCards, setKeyCards] = useState(false)
  const [message, setMessage] = useState(null)
  // Why this session's last generate found nothing: with no rows stored,
  // the list cannot say.
  const [emptyNote, setEmptyNote] = useState(null)
  const [error, setError] = useState(null)

  const apply = useCallback((result) => {
    setState(result.state)
    if (result.discover) setDiscover(result.discover)
    if (result.items) setItems(result.items)
    if (result.error) setError(result.error)
  }, [])

  useEffect(() => {
    let live = true
    fetchDiscover().then((result) => {
      if (live) apply(result)
    })
    return () => {
      live = false
    }
  }, [apply, signedIn])

  function togglePlatform(id) {
    setPlatforms((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    )
  }

  async function generate() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch('/api/recommendations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'discover',
          popularity,
          window: released,
          platforms: platforms.length ? platforms : null,
          include_key_cards: keyCards,
        }),
      })
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      const result = await response.json()
      setMessage(result.count === 1 ? '1 pick' : `${result.count} picks`)
      setEmptyNote(result.count ? null : result.model_note)
    } catch {
      setError(UNREACHABLE)
    } finally {
      // Read the picks before the buttons come back, so an answer pressed
      // now is not undone by an older list arriving after it.
      apply(await fetchDiscover())
      setBusy(false)
    }
  }

  // After a rating, only the personalisation note is re-read: a list that
  // arrives after an answer pressed meanwhile must not bring its card back.
  async function refreshPersonalised() {
    const result = await fetchDiscover()
    if (result.discover)
      setDiscover(
        (current) =>
          current && {
            ...current,
            personalised: result.discover.personalised,
          },
      )
  }

  function drop(row) {
    setDiscover((current) => ({
      ...current,
      picks: current.picks.filter((entry) => entry.id !== row.id),
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
        drop(row)
        return
      }
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      drop(row)
      if (action === 'want') setMessage(`Wanted ${row.title}`)
      if (action === 'own') setMessage(`Added ${row.title} to the collection`)
    } catch {
      setError(UNREACHABLE)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'unauthorized') {
    return (
      <section>
        <h1>Discover</h1>
        <p>
          <Link to="/admin">Sign in</Link> to see Discover.
        </p>
      </section>
    )
  }

  const picks = discover?.picks ?? []
  const ranking = rankingWords(discover)

  return (
    <section className="radar discover">
      <h1>Discover</h1>
      <p className="muted">
        Physical games already out on your platforms that you would love and do
        not own, picked from the catalogue.
      </p>

      <div className="discover-controls">
        <Choice
          legend="Popularity"
          name="popularity"
          options={POPULARITY}
          value={popularity}
          onChange={setPopularity}
        />
        <Choice
          legend="Released"
          name="window"
          options={WINDOW}
          value={released}
          onChange={setReleased}
        />
        <fieldset className="discover-choice">
          <legend>Platforms</legend>
          <div className="chip-row">
            {PLATFORMS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="chip"
                aria-pressed={platforms.includes(id)}
                onClick={() => togglePlatform(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {!platforms.length && (
            <p className="muted">None chosen: your collection&apos;s.</p>
          )}
        </fieldset>
      </div>

      <div className="radar-header">
        <button type="button" disabled={busy} onClick={generate}>
          {busy ? 'Working…' : "Generate — uses one of today's Gemini requests"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={keyCards}
            onChange={(event) => setKeyCards(event.target.checked)}
          />{' '}
          Include Game-Key Cards
        </label>
        <Link to="/admin/catalogue">Needs match →</Link>
      </div>

      {ranking && <p className="muted">{ranking}</p>}
      {discover && discover.personalised === false && (
        <p className="muted">
          Ranked by the community alone: rate, finish or favourite a few games
          to personalise.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {state === 'loading' && <p className="muted">Loading Discover…</p>}

      <RateAFew
        items={items}
        onRated={() => {
          void refreshPersonalised()
        }}
      />

      <h2>Picks</h2>
      {discover && !picks.length ? (
        <p className="muted">{emptyWords(discover, emptyNote)}</p>
      ) : (
        <div className="radar-cards">
          {picks.map((row) => (
            <RecommendationCard
              key={row.id}
              row={row}
              when={row.release_date?.slice(0, 4) ?? null}
              busy={busy}
              onAnswer={answer}
              actions={DISCOVER_ACTIONS}
            />
          ))}
        </div>
      )}
    </section>
  )
}
