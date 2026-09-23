import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import { apiFetch } from '../lib/api.js'

const TIMES = [
  ['any', 'Any'],
  ['quick', 'Quick'],
  ['evening', 'Evening'],
  ['long', 'Long'],
]

const TIME_HINTS = { quick: 'under 6 h', evening: '6–15 h', long: '15 h+' }

const MOODS = [
  ['cozy', 'Cozy'],
  ['story', 'Story'],
  ['action', 'Action'],
  ['creepy', 'Creepy'],
  ['brainy', 'Brainy'],
  ['chaotic', 'Chaotic'],
]

/** Below this many rated or favourited games, the picks have little to go on. */
const PROFILE_NUDGE_BELOW = 5

const GENRES_SHOWN = 3

/**
 * A chip that toggles; the pressed state is its whole meaning. A hint is shown
 * beside the label and read as the chip's description; the name is set to the
 * label alone, since a button's name would otherwise include every word in it.
 */
function Chip({ pressed, onClick, children, hint }) {
  const hintId = useId()
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={pressed}
      aria-label={hint ? children : undefined}
      aria-describedby={hint ? hintId : undefined}
      onClick={onClick}
    >
      <span>{children}</span>
      {hint && (
        <span className="chip-count" id={hintId}>
          {' '}
          {hint}
        </span>
      )}
    </button>
  )
}

/** One pick: its slot, the game, why, and what to do about it. */
function PickCard({ pick, onPlay, onSkip, onNever, busy }) {
  const { item } = pick
  return (
    <article className="pick-card">
      <p className="pick-slot">{pick.slot_label}</p>
      <div className="pick-body">
        <div className="pick-cover">
          <CoverImage src={item.cover_url} type={item.type} alt="" />
        </div>
        <div>
          <h2>{item.title}</h2>
          <p className="muted pick-meta">
            {[
              item.year,
              item.time_to_beat_hours != null &&
                `≈ ${Math.round(item.time_to_beat_hours)} h`,
            ]
              .filter(Boolean)
              .map((part) => (
                <span key={part}>{part}</span>
              ))}
          </p>
          {item.genres.length > 0 && (
            <ul className="item-chips">
              {item.genres.slice(0, GENRES_SHOWN).map((genre) => (
                <li key={genre} className="item-chip">
                  {genre}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <ul className="pick-reasons">
        {pick.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <div className="pick-actions">
        <button type="button" disabled={busy} onClick={onPlay}>
          Play this
        </button>
        <button type="button" disabled={busy} onClick={onSkip}>
          Not tonight
        </button>
        <button type="button" disabled={busy} onClick={onNever}>
          Never suggest
        </button>
      </div>
    </article>
  )
}

/**
 * Play Next: three named picks from the owned backlog.
 *
 * Every change to the controls asks again from scratch; Reroll and Not tonight
 * ask again without the games already shown. Admin-only, like the collection:
 * both the API and the database sleep when idle, so a first load can wake two
 * services, and the slow message says so rather than looking broken.
 */
export default function PlayNext() {
  const [status, setStatus] = useState('loading')
  const [slow, setSlow] = useState(false)
  const [items, setItems] = useState([])
  const [time, setTime] = useState('any')
  const [moods, setMoods] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [exclude, setExclude] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // Bumped to ask again with the same controls, after a pin or a Never.
  const [round, setRound] = useState(0)

  const fetchItems = useCallback(async () => {
    try {
      const response = await apiFetch('/api/items')
      if (response.status === 401) return { status: 'unauthorized', items: [] }
      if (!response.ok) return { status: 'error', items: [] }
      return { status: 'ready', items: await response.json() }
    } catch {
      return { status: 'error', items: [] }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    fetchItems()
      .then((loaded) => {
        setItems(loaded.items)
        setStatus(loaded.status)
      })
      .finally(() => clearTimeout(timer))
    return () => clearTimeout(timer)
  }, [fetchItems, round])

  useEffect(() => {
    if (status !== 'ready') return undefined
    let cancelled = false
    apiFetch('/api/picker/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time, moods, platforms, exclude }),
    })
      .then(async (response) => {
        if (cancelled) return
        if (!response.ok) {
          setError('Could not get picks. Try again shortly.')
          return
        }
        setError(null)
        setResult(await response.json())
      })
      .catch(() => {
        if (!cancelled) setError('Could not reach the API.')
      })
    return () => {
      cancelled = true
    }
  }, [status, time, moods, platforms, exclude, round])

  /** A control changed: the reroll's exclusions no longer apply. */
  function change(setter) {
    return (next) => {
      setter(next)
      setExclude([])
    }
  }

  /** Adds ids to the exclusions once each; the server caps the list at 200. */
  function excludeMore(ids) {
    setExclude((current) => [...new Set([...current, ...ids])])
  }

  function toggle(list, value) {
    return list.includes(value)
      ? list.filter((entry) => entry !== value)
      : [...list, value]
  }

  async function send(path, options, failure) {
    setError(null)
    setBusy(true)
    try {
      const response = await apiFetch(path, options)
      if (!response.ok) {
        setError(failure)
        return false
      }
      return true
    } catch {
      setError('Could not reach the API.')
      return false
    } finally {
      setBusy(false)
    }
  }

  function recordEvent(itemId, action) {
    return send(
      '/api/picker/events',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, action }),
      },
      'Could not save that.',
    )
  }

  async function playThis(itemId) {
    const ok = await send(
      `/api/items/${itemId}/pin`,
      { method: 'POST' },
      'Could not pin that game.',
    )
    if (ok) setRound((current) => current + 1)
  }

  async function unpin(itemId) {
    const ok = await send(
      `/api/items/${itemId}/pin`,
      { method: 'DELETE' },
      'Could not unpin that game.',
    )
    if (ok) setRound((current) => current + 1)
  }

  async function notTonight(itemId) {
    if (await recordEvent(itemId, 'skipped')) excludeMore([itemId])
  }

  async function never(itemId) {
    if (await recordEvent(itemId, 'never')) setRound((current) => current + 1)
  }

  function reroll() {
    excludeMore((result?.picks ?? []).map((pick) => pick.item.id))
  }

  if (status === 'loading') {
    return (
      <section>
        <h1>Play Next</h1>
        <p className="muted">{slow ? 'Waking the server…' : 'Loading…'}</p>
      </section>
    )
  }

  if (status === 'unauthorized') {
    return (
      <section>
        <h1>Play Next</h1>
        <p className="admin-error">
          Not signed in. <Link to="/admin">Go to admin</Link>.
        </p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section>
        <h1>Play Next</h1>
        <p className="admin-error">
          Could not reach the API. Try again shortly.
        </p>
      </section>
    )
  }

  const pinned = items.find((item) => item.pinned_at)
  const platformChoices = [
    ...new Map(
      items
        .filter((item) => item.platform_id != null && item.platform)
        .map((item) => [item.platform_id, item.platform]),
    ),
  ]
  const picks = result?.picks ?? []

  return (
    <section>
      <h1>Play Next</h1>
      <p className="muted">
        Three picks from the backlog, scored against what you rated, loved and
        finished.
      </p>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {pinned && (
        <section className="up-next" aria-label="Up next">
          <div className="up-next-cover">
            <CoverImage src={pinned.cover_url} type={pinned.type} alt="" />
          </div>
          <div>
            <p className="pick-slot">Up next</p>
            <h2>{pinned.title}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => unpin(pinned.id)}
            >
              Unpin
            </button>
          </div>
        </section>
      )}

      <div className="play-next-controls">
        <div className="chip-row" role="group" aria-label="Time">
          {TIMES.map(([value, label]) => (
            <Chip
              key={value}
              pressed={time === value}
              hint={TIME_HINTS[value]}
              onClick={() => change(setTime)(value)}
            >
              {label}
            </Chip>
          ))}
        </div>
        <div className="chip-row" role="group" aria-label="Mood">
          {MOODS.map(([value, label]) => (
            <Chip
              key={value}
              pressed={moods.includes(value)}
              onClick={() => change(setMoods)(toggle(moods, value))}
            >
              {label}
            </Chip>
          ))}
        </div>
        {platformChoices.length > 1 && (
          <div className="chip-row" role="group" aria-label="Platform">
            {platformChoices.map(([id, name]) => (
              <Chip
                key={id}
                pressed={platforms.includes(id)}
                onClick={() => change(setPlatforms)(toggle(platforms, id))}
              >
                {name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {result && result.profile_size < PROFILE_NUDGE_BELOW && (
        <p className="shelf-nudge">
          These picks have little to go on yet.{' '}
          <Link to="/admin/collection">Rate a few finished games</Link> and they
          get sharper.
        </p>
      )}

      {result && picks.length === 0 ? (
        moods.length > 0 ? (
          <div className="play-next-empty">
            <p>Nothing on the shelf matches those moods.</p>
            <button type="button" onClick={() => change(setMoods)([])}>
              Try without moods
            </button>
          </div>
        ) : (
          <p className="muted">Nothing in the backlog right now.</p>
        )
      ) : (
        <>
          <div className="pick-grid">
            {picks.map((pick) => (
              <PickCard
                key={pick.item.id}
                pick={pick}
                busy={busy}
                onPlay={() => playThis(pick.item.id)}
                onSkip={() => notTonight(pick.item.id)}
                onNever={() => never(pick.item.id)}
              />
            ))}
          </div>
          {picks.length > 0 && (
            <p className="play-next-reroll">
              <button type="button" onClick={reroll}>
                Reroll
              </button>
            </p>
          )}
        </>
      )}
    </section>
  )
}
