import { useCallback, useEffect, useState } from 'react'
import { apiFetch, errorMessage } from '../lib/api.js'
import { localToday } from '../lib/statusTransition.js'

const DAY = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function shown(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return DAY.format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * The play journal on the admin item page: log a day of play and see the
 * days already logged. The note stays here; the public diary shows only the
 * game, the day and the minutes (journal_routes.py, public.py).
 *
 * @param {object} props
 * @param {string} props.itemId
 */
export default function PlayJournal({ itemId }) {
  const [sessions, setSessions] = useState(null)
  const [playedOn, setPlayedOn] = useState(() => localToday())
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchSessions = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/items/${itemId}/sessions`)
      return response.ok ? await response.json() : []
    } catch {
      return []
    }
  }, [itemId])

  useEffect(() => {
    let cancelled = false
    fetchSessions().then((rows) => {
      if (!cancelled) setSessions(rows)
    })
    return () => {
      cancelled = true
    }
  }, [fetchSessions])

  async function log(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const response = await apiFetch(`/api/items/${itemId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          played_on: playedOn,
          minutes: minutes === '' ? null : Number(minutes),
          note: note.trim() || null,
        }),
      })
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      setMinutes('')
      setNote('')
      setSessions(await fetchSessions())
    } catch {
      setError('The server could not be reached.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(sessionId) {
    setError(null)
    try {
      const response = await apiFetch(
        `/api/items/${itemId}/sessions/${sessionId}`,
        { method: 'DELETE' },
      )
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      setSessions((current) => current.filter((row) => row.id !== sessionId))
    } catch {
      setError('The server could not be reached.')
    }
  }

  return (
    <div className="play-journal">
      <h2>Journal</h2>
      <form className="play-journal-form" onSubmit={log}>
        <label htmlFor="journal-played-on">Played on</label>
        <input
          id="journal-played-on"
          type="date"
          value={playedOn}
          max={localToday()}
          onChange={(event) => setPlayedOn(event.target.value)}
          required
        />
        <label htmlFor="journal-minutes">Minutes</label>
        <input
          id="journal-minutes"
          type="number"
          min="1"
          max="1440"
          inputMode="numeric"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
        />
        <label htmlFor="journal-note">Note (private)</label>
        <input
          id="journal-note"
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
        />
        <button type="submit" disabled={saving}>
          {saving ? 'Logging…' : 'Log a session'}
        </button>
      </form>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {sessions === null && <p className="muted">Loading the journal…</p>}
      {sessions?.length === 0 && (
        <p className="muted">No sessions logged yet.</p>
      )}
      {sessions?.length > 0 && (
        <ul className="play-journal-list">
          {sessions.map((row) => (
            <li key={row.id}>
              <time dateTime={row.played_on}>{shown(row.played_on)}</time>
              <span>
                {row.minutes != null && `${row.minutes} min`}
                {row.note && <span className="muted"> · {row.note}</span>}
              </span>
              <button
                type="button"
                className="link-button"
                onClick={() => remove(row.id)}
                aria-label={`Delete the session on ${shown(row.played_on)}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
