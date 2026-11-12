import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import { StatusText } from '../components/JobStatusRow.jsx'
import LoadState from '../components/LoadState.jsx'
import Panel from '../components/Panel.jsx'
import SuggestionCard from '../components/SuggestionCard.jsx'
import WeatherPanel from '../components/WeatherPanel.jsx'
import { denver } from '../content/denver.js'
import { SESSION_ENDED } from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { formatDate } from '../lib/formatDate.js'
import { whenWords } from '../lib/nightly.js'
import { localToday } from '../lib/statusMoves.js'
import { READ_DEADLINE_MS, withDeadline } from '../lib/waits.js'

const copy = denver.weekend
const ACTION_ERROR = 'That didn’t go through. Check your connection.'
/** The API's ceiling on `seed`; Reroll wraps back to the first plan. */
const MAX_SEED = 10000
/** As many visits as the plan read lists (`RECENT_VISITS` there). */
const RECENT_VISITS = 5
/** The hours Home by offers, as the API bounds them. */
const HOME_BY = Array.from({ length: 14 }, (_, i) => i + 9)

/** An hour of the day as the weather strip writes it: 9a, noon, 1p. */
export function clock(hour) {
  if (hour === 12) return 'noon'
  return hour < 12 ? `${hour}a` : `${hour - 12}p`
}

/** The standing constraints as pill words, in a fixed order. */
export function constraintPills(c) {
  const pills = []
  if (c.kid_along) pills.push(copy.kidAlong)
  if (c.bike_if_dry) pills.push(copy.bikeIfDry)
  if (c.max_miles !== null) pills.push(`${copy.within} ${c.max_miles} mi`)
  if (c.home_by !== null) pills.push(`${copy.homeBy} ${clock(c.home_by)}`)
  return pills
}

/** A refused read or write in words: a 401 or 403 means sign in again. */
async function failureText(response) {
  return response.status === 401 || response.status === 403
    ? denver.admin.sessionEnded
    : errorMessage(response)
}

/** The plan for a seed, returned rather than set: `{plan}` or `{error}`. */
async function fetchPlan(seed) {
  try {
    // The deadline covers the body too: a plan that never finishes arriving
    // is a failed read.
    const answer = await withDeadline(
      async (signal) => {
        const response = await apiFetch(`/api/spots/plan?seed=${seed}`, {
          signal,
        })
        return response.ok
          ? { plan: await response.json() }
          : { status: response.status }
      },
      { ms: READ_DEADLINE_MS },
    )
    if (answer.plan) return answer
    return {
      error:
        answer.status === 401 || answer.status === 403
          ? SESSION_ENDED
          : copy.readError,
    }
  } catch {
    return { error: copy.readError }
  }
}

/** The weekend's dates in a few words: "Sat, Nov 14 – Sun, Nov 15". */
function dateRange(days) {
  const words = days.map((day) =>
    new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
  )
  return words.join(' – ')
}

/** When the forecast was last fetched, or why it wasn't. */
function ForecastLine({ weather }) {
  const at = weather?.at ? Date.parse(weather.at) : NaN
  if (!weather || Number.isNaN(at)) return <>{copy.noForecast}</>
  if (weather.state === 'failed') {
    return (
      <StatusText state="failed">
        {copy.forecastFailed} · {whenWords(at)}
      </StatusText>
    )
  }
  return (
    <StatusText state={weather.state === 'ok' ? 'ok' : 'stale'}>
      {copy.forecastAt} {whenWords(at)}
    </StatusText>
  )
}

/** The constraints form, in the page's footer: two switches, a distance
 * and a time to be home by. */
function ConstraintsForm({ value, busy, onSave, onCancel }) {
  const [kid, setKid] = useState(value.kid_along)
  const [bike, setBike] = useState(value.bike_if_dry)
  const [miles, setMiles] = useState(value.max_miles ?? '')
  const [homeBy, setHomeBy] = useState(value.home_by ?? '')
  const first = useRef(null)

  useEffect(() => {
    first.current?.focus()
  }, [])

  function submit(event) {
    event.preventDefault()
    onSave({
      kid_along: kid,
      bike_if_dry: bike,
      max_miles: miles === '' ? null : Number(miles),
      home_by: homeBy === '' ? null : Number(homeBy),
    })
  }

  return (
    <form className="wk-form" onSubmit={submit}>
      <label className="wk-check">
        <input
          ref={first}
          type="checkbox"
          checked={kid}
          onChange={(event) => setKid(event.target.checked)}
        />
        {copy.kidAlong}
      </label>
      <label className="wk-check">
        <input
          type="checkbox"
          checked={bike}
          onChange={(event) => setBike(event.target.checked)}
        />
        {copy.bikeIfDry}
      </label>
      <label className="wk-field">
        {copy.within}
        <input
          type="number"
          min="0.5"
          max="50"
          step="0.5"
          inputMode="decimal"
          placeholder={copy.anyDistance}
          value={miles}
          onChange={(event) => setMiles(event.target.value)}
        />
        <span aria-hidden="true">mi</span>
      </label>
      <label className="wk-field">
        {copy.homeBy}
        <select
          value={homeBy}
          onChange={(event) => setHomeBy(event.target.value)}
        >
          <option value="">{copy.anyTime}</option>
          {HOME_BY.map((hour) => (
            <option key={hour} value={hour}>
              {clock(hour)}
            </option>
          ))}
        </select>
      </label>
      <div className="wk-form-acts">
        <button type="submit" className="btn primary" disabled={busy}>
          {copy.saveConstraints}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {copy.cancel}
        </button>
      </div>
    </form>
  )
}

/**
 * The weekend planner, at /admin/weekend: the coming Saturday and Sunday's
 * forecast, three suggestions from the spots, the standing constraints and
 * the recent visits. Everything is one read of `GET /api/spots/plan`, which
 * plans over cached weather; Reroll asks for the next seed, which moves
 * the unsaved slots only. Read on a phone on Saturday morning, so the
 * columns stack first and widen after.
 */
export default function AdminWeekend() {
  const [seed, setSeed] = useState(0)
  const [reload, setReload] = useState(0)
  const [plan, setPlan] = useState(null)
  // Kept apart so a re-read cannot clear a refused write's message: a
  // failed forecast refresh reads the plan again and still says why.
  const [readError, setReadError] = useState(null)
  const [writeError, setWriteError] = useState(null)
  const error = writeError ?? readError
  const [busy, setBusy] = useState(false)
  const [skipped, setSkipped] = useState(null)
  const [visited, setVisited] = useState(() => new Set())
  const [editing, setEditing] = useState(false)
  const undoButton = useRef(null)
  const editButton = useRef(null)
  const wasEditing = useRef(false)

  useEffect(() => {
    let live = true
    fetchPlan(seed).then((result) => {
      if (!live) return
      if (result.plan) {
        setPlan(result.plan)
        setReadError(null)
      } else {
        setReadError(result.error)
      }
    })
    return () => {
      live = false
    }
  }, [seed, reload])

  // A skipped card leaves the list; its Undo is where focus goes next.
  useEffect(() => {
    if (skipped) undoButton.current?.focus()
  }, [skipped])

  // Closing the form hands focus back to Edit.
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus()
    wasEditing.current = editing
  }, [editing])

  /** One write; true when it landed, the error shown when it didn't. */
  async function send(path, body, method = 'POST') {
    setBusy(true)
    try {
      const response = await apiFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!response.ok) {
        setWriteError(await failureText(response))
        return null
      }
      setWriteError(null)
      return response
    } catch {
      setWriteError(ACTION_ERROR)
      return null
    } finally {
      setBusy(false)
    }
  }

  const again = () => setReload((n) => n + 1)

  async function save(s) {
    const body = { slot_key: s.slot_key, spot_id: s.spot_id, day: s.day }
    if (await send('/api/spots/plan/save', body)) again()
  }

  async function unsave(s) {
    if (await send('/api/spots/plan/unsave', { slot_key: s.slot_key })) again()
  }

  async function been(s) {
    // The suggestion's day once it has come; before then, today.
    const today = localToday()
    const day = s.day && s.day <= today ? s.day : today
    const response = await send(`/api/spots/${s.spot_id}/visits`, {
      visited_on: day,
    })
    if (!response) return
    const visit = await response.json().catch(() => null)
    setVisited((current) => new Set(current).add(s.spot_id))
    // The plan stays as it is, so the card can say Visited; the visit list
    // takes the new row at once.
    if (visit) {
      setPlan((current) => ({
        ...current,
        recent_visits: [
          { ...visit, name: s.name },
          ...current.recent_visits,
        ].slice(0, RECENT_VISITS),
      }))
    }
  }

  async function skip(s) {
    if (await send('/api/spots/plan/skip', { spot_id: s.spot_id })) {
      setSkipped(s)
      again()
    }
  }

  async function unskip(spot) {
    if (await send('/api/spots/plan/unskip', { spot_id: spot.spot_id })) {
      setSkipped(null)
      again()
    }
  }

  /** Read the plan again either way: a refresh refused part-way may still
   * have stored some of the forecast. */
  async function refresh() {
    await send('/api/spots/weather/refresh')
    again()
  }

  async function saveConstraints(value) {
    if (await send('/api/spots/constraints', value, 'PUT')) {
      setEditing(false)
      again()
    }
  }

  if (!plan) {
    return (
      <div className="weekend">
        <AdminPageHeader title={copy.title} />
        <LoadState
          loading={!error}
          failed={!!error}
          message={error ?? undefined}
          onRetry={
            error === SESSION_ENDED
              ? undefined
              : () => {
                  setReadError(null)
                  setWriteError(null)
                  again()
                }
          }
        />
      </div>
    )
  }

  const highs = plan.days.map((d) => d.high).filter((t) => t !== null)
  const lows = plan.days.map((d) => d.low).filter((t) => t !== null)
  const range = highs.length
    ? [Math.min(...lows), Math.max(...highs)]
    : undefined
  const pills = constraintPills(plan.constraints)
  // The skip just made is offered back by the toast, not listed twice.
  const otherSkips = plan.skips.filter(
    (spot) => spot.spot_id !== skipped?.spot_id,
  )

  return (
    <div className="weekend">
      <AdminPageHeader
        title={copy.title}
        description={
          <>
            {dateRange(plan.days)} · <ForecastLine weather={plan.weather} />
          </>
        }
      >
        <button
          type="button"
          className="btn ghost"
          onClick={refresh}
          disabled={busy}
        >
          {copy.refresh}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setSeed((n) => (n >= MAX_SEED ? 0 : n + 1))}
          disabled={busy}
        >
          {copy.reroll}
        </button>
      </AdminPageHeader>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      <div className="wk-pills">
        <span className="visually-hidden">{copy.constraintsTitle}: </span>
        {pills.length ? (
          <ul>
            {pills.map((pill) => (
              <li key={pill}>{pill}</li>
            ))}
          </ul>
        ) : (
          <span className="wk-none">{copy.noConstraints}</span>
        )}
        <button
          ref={editButton}
          type="button"
          className="btn ghost sm"
          onClick={() => setEditing(true)}
          disabled={editing}
          aria-expanded={editing}
          aria-controls="wk-constraints"
        >
          {copy.edit}{' '}
          <span className="visually-hidden">{copy.constraintsTitle}</span>
        </button>
      </div>

      <div className="wx-days">
        {plan.days.map((day) => (
          <WeatherPanel key={day.date} day={day} range={range} />
        ))}
      </div>

      <h2 className="wk-kicker">{copy.suggestions}</h2>
      <p className="wk-toast" role="status" aria-live="polite">
        {skipped && (
          <>
            {skipped.name} {copy.skipped}{' '}
            <button
              ref={undoButton}
              type="button"
              className="btn ghost sm"
              onClick={() => unskip(skipped)}
              disabled={busy}
            >
              {copy.undo}
            </button>
          </>
        )}
      </p>
      {plan.suggestions.length ? (
        <ul className="sug-list">
          {plan.suggestions.map((s, i) => (
            <SuggestionCard
              key={s.slot_key}
              suggestion={s}
              lead={i === 0}
              visited={visited.has(s.spot_id)}
              busy={busy}
              onSave={save}
              onUnsave={unsave}
              onBeen={been}
              onSkip={skip}
            />
          ))}
        </ul>
      ) : (
        <p className="finder-empty">{copy.noSuggestions}</p>
      )}

      {otherSkips.length > 0 && (
        <div className="wk-skips">
          <span>{copy.skipsTitle}</span>
          <ul>
            {otherSkips.map((spot) => (
              <li key={spot.spot_id}>
                {spot.name}{' '}
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => unskip(spot)}
                  disabled={busy}
                >
                  {copy.unskip}
                  <span className="visually-hidden">: {spot.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="wk-foot">
        <Panel
          title={copy.visitsTitle}
          action={<Link to="/admin/spots">{copy.logVisit}</Link>}
        >
          {plan.recent_visits.length ? (
            <ul className="wk-visits">
              {plan.recent_visits.map((visit) => (
                <li key={visit.id}>
                  <span>{visit.name}</span>
                  <span className="wk-visit-date">
                    {formatDate(visit.visited_on)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wk-none">{copy.noVisits}</p>
          )}
        </Panel>
        <div id="wk-constraints">
          {editing && (
            <Panel title={copy.constraintsTitle}>
              <ConstraintsForm
                value={plan.constraints}
                busy={busy}
                onSave={saveConstraints}
                onCancel={() => setEditing(false)}
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
