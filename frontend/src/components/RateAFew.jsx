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
 * A table, so each game's stars sit beside its title. A game rated here
 * stays in the table with its score for the session, so the owner can see
 * what was saved and fix a mis-tap; Next few moves on once all six are
 * rated.
 *
 * @param {object} props
 * @param {object[]} props.items - The owner's items, as `GET /api/items` returns them.
 * @param {() => void} [props.onRated] - Called after each rating is saved.
 */
export default function RateAFew({ items, onRated }) {
  const [hidden, setHidden] = useState(
    () => readShelfPref(PREF, 'shown') === 'hidden',
  )
  // This session's answers by item id: a number, or null once cleared.
  const [scores, setScores] = useState(() => new Map())
  // Rated games moved past with Next few.
  const [done, setDone] = useState(() => new Set())
  // Saves in flight, per game: rating one never blocks another.
  const [saving, setSaving] = useState(() => new Set())
  const [error, setError] = useState(null)

  const pool = items.filter(
    (item) =>
      item.type === 'game' &&
      item.status === 'finished' &&
      !done.has(item.id) &&
      (item.rating == null || scores.has(item.id)),
  )
  const shown = pool.slice(0, LIMIT)
  if (hidden || !shown.length) return null
  const allRated = shown.every((item) => scores.get(item.id) != null)
  const more = allRated && pool.length > shown.length

  async function rate(item, rating) {
    if (saving.has(item.id)) return
    setSaving((current) => new Set(current).add(item.id))
    setError(null)
    try {
      const response = await apiFetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })
      if (!response.ok) {
        setError(`${item.title}: ${await errorMessage(response)}`)
        return
      }
      setScores((current) => new Map(current).set(item.id, rating))
      onRated?.()
    } catch {
      setError('Could not reach the API. Try again shortly.')
    } finally {
      setSaving((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  function nextFew() {
    setDone((current) => {
      const next = new Set(current)
      for (const item of shown) next.add(item.id)
      return next
    })
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
      <table className="rate-a-few-table">
        <thead>
          <tr>
            <th scope="col">Game</th>
            <th scope="col">Rating</th>
            <th scope="col">Saved</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((item) => {
            const score = scores.get(item.id) ?? null
            return (
              <tr key={item.id} aria-busy={saving.has(item.id) || undefined}>
                <th scope="row">
                  {item.title}
                  {item.platform && (
                    <span className="rate-a-few-platform">
                      {' '}
                      · {item.platform}
                    </span>
                  )}
                </th>
                <td>
                  <div role="group" aria-label={`Rating for ${item.title}`}>
                    <QuickRate
                      value={score}
                      onChange={(next) => rate(item, next)}
                    />
                  </div>
                </td>
                <td className="rate-a-few-score">
                  {score == null ? '—' : `${score}/10 saved`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="rate-a-few-actions">
        {more && (
          <button type="button" onClick={nextFew}>
            Next few
          </button>
        )}
        <button type="button" onClick={notNow}>
          Not now
        </button>
      </div>
    </section>
  )
}
