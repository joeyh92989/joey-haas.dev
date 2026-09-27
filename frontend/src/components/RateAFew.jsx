import { useState } from 'react'
import { apiFetch, errorMessage } from '../lib/api.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'
import QuickRate from './QuickRate.jsx'

const PREF = 'discover.rate-a-few'
const LIMIT = 6

/**
 * Finished games with no rating, a few at a time: each rating sharpens the
 * profile Discover and Play Next rank by. Dismissible, and the dismissal
 * is remembered in this browser.
 *
 * @param {object} props
 * @param {object[]} props.items - The owner's items, as `GET /api/items` returns them.
 * @param {() => void} [props.onRated] - Called after each rating is saved.
 */
export default function RateAFew({ items, onRated }) {
  const [hidden, setHidden] = useState(
    () => readShelfPref(PREF, 'shown') === 'hidden',
  )
  const [rated, setRated] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const unrated = items
    .filter(
      (item) =>
        item.type === 'game' &&
        item.status === 'finished' &&
        item.rating == null &&
        !rated.has(item.id),
    )
    .slice(0, LIMIT)
  if (hidden || !unrated.length) return null

  async function rate(item, rating) {
    if (rating == null || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      setRated((current) => new Set(current).add(item.id))
      onRated?.()
    } catch {
      setError('Could not reach the API. Try again shortly.')
    } finally {
      setBusy(false)
    }
  }

  function notNow() {
    setHidden(true)
    writeShelfPref(PREF, 'hidden')
  }

  return (
    <section className="rate-a-few" aria-labelledby="rate-a-few-title">
      <h2 id="rate-a-few-title">Rate a few</h2>
      <p className="muted">
        You finished these but never rated them. Each rating sharpens what
        Discover and Play Next suggest.
      </p>
      {error && <p role="alert">{error}</p>}
      <ul className="rate-a-few-list">
        {unrated.map((item) => (
          // Each game's stars are a group named for it, since every
          // QuickRate is labelled "Rating".
          <li
            key={item.id}
            role="group"
            aria-label={item.title}
            aria-busy={busy || undefined}
          >
            <span>{item.title}</span>
            <QuickRate value={null} onChange={(next) => rate(item, next)} />
          </li>
        ))}
      </ul>
      <button type="button" onClick={notNow}>
        Not now
      </button>
    </section>
  )
}
