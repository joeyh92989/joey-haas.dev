import { useCallback, useEffect, useRef, useState } from 'react'
import CandidateCard from './CandidateCard.jsx'
import { StatusText } from './JobStatusRow.jsx'
import { denver } from '../content/denver.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { whenWords } from '../lib/nightly.js'

const copy = denver.finder
const ACTION_ERROR = 'That didn’t go through. Check your connection.'
/** A weekly job more than eight days old has missed a Sunday. */
const STALE_MS = 8 * 24 * 60 * 60 * 1000

/** The queue and the last run, read together; returned, never set. */
export async function fetchFinder() {
  try {
    const [queue, status] = await Promise.all([
      apiFetch('/api/spots/candidates'),
      apiFetch('/api/spots/status'),
    ])
    if (queue.status === 401 || queue.status === 403)
      return { state: 'error', error: denver.admin.sessionEnded }
    if (!queue.ok) return { state: 'error', error: copy.readError }
    // The run line is an extra: the queue still shows without it.
    const body = status.ok ? await status.json() : {}
    return {
      state: 'ready',
      candidates: await queue.json(),
      lastRun: body['candidates.last_run'] ?? null,
    }
  } catch {
    return { state: 'error', error: copy.readError }
  }
}

/** The last run as a state and words, for the run line. */
export function runLine(run, now = Date.now()) {
  if (!run) return { state: 'unknown', words: copy.never }
  const at = Date.parse(run.at)
  const when = Number.isNaN(at) ? 'at an unknown time' : whenWords(at)
  if (run.state === 'failed')
    return {
      state: 'failed',
      words: `Last run ${when} failed${run.note ? `: ${run.note}` : ''}.`,
    }
  if (run.state === 'no_anchors')
    return {
      state: 'failed',
      words: `Last run ${when} had no anchors to search around. Mark a spot as an anchor.`,
    }
  const ranked =
    run.ranked_by === 'fallback' ? ' Not scored: the model didn’t answer.' : ''
  return {
    state: !Number.isNaN(at) && now - at > STALE_MS ? 'stale' : 'ok',
    words: `Last run ${when}: ${run.found} found, ${run.new} new.${ranked}`,
  }
}

/** An answer's refusal in words; a 409 here is the place's own answer. */
async function refusal(response) {
  if (response.status === 401 || response.status === 403)
    return denver.admin.sessionEnded
  if (response.status !== 409) return errorMessage(response)
  const body = await response.json().catch(() => ({}))
  return body.detail ?? 'That place has already been answered'
}

/**
 * The spot finder's column on /admin/spots: when it last ran, Run now, and
 * the queue of places it found. Accept and Dismiss replace a card with a
 * line saying so and an Undo, in place and with no timer, as Tonight's
 * "Not tonight" does; Undo puts the card back (and removes the spot Accept
 * made, which the table is told about).
 *
 * @param {object} props
 * @param {(spotId: string) => void} props.onAccepted A spot was made.
 * @param {(spotId: string) => void} props.onRestored That spot is gone.
 */
export default function SpotFinder({ onAccepted, onRestored }) {
  const [state, setState] = useState('loading')
  // Cards and toasts in queue order: {candidate} or {answered, verb}.
  const [entries, setEntries] = useState([])
  const [lastRun, setLastRun] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // The control to focus after the render that moves a card.
  const focusNext = useRef(null)

  const apply = useCallback((result) => {
    if (result.state === 'error') {
      setError(result.error)
      setState((current) => (current === 'loading' ? 'error' : current))
      return
    }
    setState('ready')
    setEntries(result.candidates.map((candidate) => ({ candidate })))
    setLastRun(result.lastRun)
  }, [])

  useEffect(() => {
    let live = true
    fetchFinder().then((result) => {
      if (live) apply(result)
    })
    return () => {
      live = false
    }
  }, [apply])

  useEffect(() => {
    if (!focusNext.current) return
    document.querySelector(focusNext.current)?.focus()
    focusNext.current = null
  }, [entries])

  async function runNow() {
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch('/api/spots/candidates/refresh', {
        method: 'POST',
      })
      if (!response.ok) setError(await errorMessage(response))
    } catch {
      setError(ACTION_ERROR)
    } finally {
      // Read the queue before the buttons come back, so an answer pressed
      // now is not undone by an older list arriving after it.
      apply(await fetchFinder())
      setBusy(false)
    }
  }

  function swap(id, next) {
    setEntries((current) =>
      current.map((entry) =>
        (entry.candidate ?? entry.answered.candidate).id === id ? next : entry,
      ),
    )
  }

  async function answer(candidate, verb, tags) {
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/spots/candidates/${candidate.id}/${verb === 'accepted' ? 'accept' : 'dismiss'}`,
        verb === 'accepted'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tags }),
            }
          : { method: 'POST' },
      )
      if (response.status === 409) {
        // Answered elsewhere: the card goes, with nothing to undo.
        setError(`${candidate.name}: ${await refusal(response)}`)
        setEntries((current) =>
          current.filter((entry) => entry.candidate?.id !== candidate.id),
        )
        return
      }
      if (!response.ok) {
        setError(await refusal(response))
        return
      }
      const answered = await response.json()
      focusNext.current = `[data-candidate-undo="${candidate.id}"]`
      swap(candidate.id, { answered, verb })
      if (answered.spot_id) onAccepted(answered.spot_id)
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function undo(entry) {
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch('/api/spots/candidates/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.answered),
      })
      if (!response.ok) {
        setError(await refusal(response))
        return
      }
      const candidate = await response.json()
      focusNext.current = `[data-candidate-accept="${candidate.id}"]`
      swap(entry.answered.candidate.id, { candidate })
      if (entry.answered.spot_id) onRestored(entry.answered.spot_id)
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setBusy(false)
    }
  }

  const run = runLine(lastRun)

  return (
    <section className="finder" aria-labelledby="finder-title">
      <h2 className="finder-title" id="finder-title">
        {copy.title}
      </h2>
      <div className="runline">
        {state === 'ready' && (
          <StatusText state={run.state}>{run.words}</StatusText>
        )}
        <button
          type="button"
          className="btn ghost"
          disabled={busy || state === 'loading'}
          onClick={runNow}
        >
          {busy ? copy.running : copy.runNow}
        </button>
      </div>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {state === 'loading' && <p>Loading the queue…</p>}
      {state === 'ready' && entries.length === 0 && (
        <p className="finder-empty">{copy.empty}</p>
      )}
      {entries.length > 0 && (
        <ul className="cand-list">
          {entries.map((entry) =>
            entry.candidate ? (
              <CandidateCard
                key={entry.candidate.id}
                candidate={entry.candidate}
                busy={busy}
                onAccept={(candidate, tags) =>
                  answer(candidate, 'accepted', tags)
                }
                onDismiss={(candidate) => answer(candidate, 'dismissed')}
              />
            ) : (
              <li
                key={entry.answered.candidate.id}
                className="tonight-toast cand-toast"
              >
                <span>
                  <strong>{entry.answered.candidate.name}</strong>{' '}
                  {copy[entry.verb]}
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  data-candidate-undo={entry.answered.candidate.id}
                  onClick={() => undo(entry)}
                >
                  {copy.undo}
                  <span className="visually-hidden">
                    : {entry.answered.candidate.name}
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}
