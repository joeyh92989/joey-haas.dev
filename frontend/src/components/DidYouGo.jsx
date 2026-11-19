import { useEffect, useRef, useState } from 'react'
import { call } from './places/placeApi.js'
import { denver } from '../content/denver.js'
import { outings } from '../content/outings.js'
import { WEEKDAY_LONG_DAY } from '../lib/formatDate.js'
import { READ_DEADLINE_MS, WaitTimeout, withDeadline } from '../lib/waits.js'

const copy = denver.didYouGo
const NOTE_MAX = 140

const keyOf = (ask) => `${ask.week}:${ask.slot}`
const dayWords = (day) => WEEKDAY_LONG_DAY.format(new Date(`${day}T12:00:00Z`))
const verdictWord = (value) => outings.verdicts.find(([v]) => v === value)[1]

/** One write under the read deadline: `{ok, status}`, or `{timedOut}`. */
async function timed(path, body) {
  try {
    return await withDeadline((signal) => call(path, 'POST', body, signal), {
      ms: READ_DEADLINE_MS,
    })
  } catch (error) {
    if (!(error instanceof WaitTimeout)) throw error
    return { ok: false, timedOut: true }
  }
}

/** A refused or unanswered write in words. `status` 0 is no response at all. */
function failureWords({ status, message }) {
  if (status === 401 || status === 403) return copy.signedOut
  if (status === 404 || status === 422) {
    return message ? copy.refusedWith(message) : copy.refused
  }
  if (!status) return copy.offline
  return copy.refused
}

/**
 * The "Did you go?" block (story #349) on /admin/weekend: a row for each
 * saved plan slot whose day has passed and that was neither logged nor
 * answered. Been opens a verdict row in place and picking a verdict logs the
 * outing (`POST /api/spots/outings`, the slot's day, precision day); Didn't
 * stops the asking (`POST /api/spots/plan/didnt`). Either way the page reads
 * the plan again. "Not now" hides the block for this visit only. One status
 * line under the block carries every confirmation, so it outlives the last
 * row; nothing renders when there are no asks and nothing to say.
 *
 * @param {object} props
 * @param {Array<object>} props.asks `asks` from `GET /api/spots/plan`.
 * @param {() => Promise<boolean>} props.onChanged Read the plan again; true
 *   when the read landed.
 */
export default function DidYouGo({ asks, onChanged }) {
  const [answered, setAnswered] = useState(() => new Set())
  const [open, setOpen] = useState(null)
  const [extras, setExtras] = useState(false)
  const [note, setNote] = useState('')
  const [kid, setKid] = useState(null)
  const [busy, setBusy] = useState(null)
  const [failure, setFailure] = useState(null)
  const [hidden, setHidden] = useState(false)
  const [status, setStatus] = useState(null)
  const inflight = useRef(false)
  const live = useRef(true)
  const root = useRef(null)
  const statusLine = useRef(null)
  const focusNext = useRef(null)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  // Focus follows the move that was just made, once it is on the page.
  useEffect(() => {
    const want = focusNext.current
    if (!want) return
    focusNext.current = null
    const target =
      (want !== 'status' && root.current?.querySelector(want)) ||
      statusLine.current
    target?.focus()
  })

  const rows = asks.filter((ask) => !answered.has(keyOf(ask)))
  const showBlock = !hidden && rows.length > 0

  function toggleBeen(ask) {
    const key = keyOf(ask)
    const next = open === key ? null : key
    setOpen(next)
    setExtras(false)
    setNote('')
    setKid(null)
    setFailure(null)
    focusNext.current = next ? '.dyg-vbtn' : `[data-been="${key}"]`
  }

  async function answer(ask, verdict) {
    if (inflight.current) return
    inflight.current = true
    const key = keyOf(ask)
    setBusy(key)
    setFailure(null)
    const body = verdict
      ? {
          spot_id: ask.spot_id,
          visited_on: ask.day,
          precision: 'day',
          verdict,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(kid === null ? {} : { kid_along: kid }),
        }
      : { week: ask.week, slot: ask.slot }
    let result
    try {
      result = await timed(
        verdict ? '/api/spots/outings' : '/api/spots/plan/didnt',
        body,
      )
    } catch {
      result = { ok: false, status: 0 }
    } finally {
      inflight.current = false
    }
    if (!live.current) return
    setBusy(null)
    if (result.ok) {
      setAnswered((current) => new Set(current).add(key))
      setStatus({
        text: verdict
          ? copy.logged(verdictWord(verdict), ask.spot_name)
          : copy.notGone(ask.spot_name),
        done: true,
      })
      setOpen(null)
      setExtras(false)
      setNote('')
      setKid(null)
      focusNext.current = '[data-been]'
      reread(key)
      return
    }
    focusNext.current = verdict
      ? `[data-v="${verdict}"]`
      : `[data-didnt="${key}"]`
    if (result.timedOut) {
      // The write may have landed: say so, and read the plan again.
      setFailure({
        key,
        text: verdict
          ? copy.maybeLogged(ask.spot_name)
          : copy.maybeDidnt(ask.spot_name),
      })
      reread(key)
      return
    }
    setFailure({ key, text: failureWords(result) })
  }

  /** Read the plan again; once it lands the server decides about the row that
   * asked, so its local hide is dropped (and only its: another row answered
   * meanwhile stays hidden until its own read lands). A failed read keeps it. */
  async function reread(key) {
    const landed = await onChanged()
    if (!landed || !live.current) return
    setAnswered((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  function notNow() {
    setHidden(true)
    setStatus({ text: copy.hidden, done: false })
    focusNext.current = 'status'
  }

  if (!showBlock && !status) return null

  return (
    <div ref={root} className="dyg-wrap">
      {showBlock && (
        <section className="dyg panel" aria-labelledby="dyg-h">
          <div className="panel-head">
            <h2 id="dyg-h">
              {copy.title}{' '}
              <span className="dyg-count">{copy.count(rows.length)}</span>
            </h2>
            <button type="button" className="btn ghost" onClick={notNow}>
              {copy.notNow}
            </button>
          </div>
          <ul className="dyg-list">
            {rows.map((ask) => {
              const key = keyOf(ask)
              const isOpen = open === key
              const isBusy = busy === key
              const nameId = `dyg-n-${key}`
              return (
                <li key={key} className="dyg-row" aria-labelledby={nameId}>
                  <div>
                    <p className="dyg-ask-kicker">
                      <b>{ask.slot_label}</b>
                      <span>{dayWords(ask.day)}</span>
                    </p>
                    <h3 className="dyg-ask-name" id={nameId}>
                      {ask.spot_name}
                    </h3>
                    {ask.neighbourhood && (
                      <p className="dyg-ask-hood">{ask.neighbourhood}</p>
                    )}
                  </div>
                  <div className="dyg-acts">
                    <button
                      type="button"
                      className={isOpen ? 'btn' : 'btn primary'}
                      data-been={key}
                      aria-expanded={isOpen}
                      disabled={busy !== null}
                      onClick={() => toggleBeen(ask)}
                    >
                      {copy.been}
                      <span className="visually-hidden">: {ask.spot_name}</span>
                    </button>
                    <button
                      type="button"
                      className="btn"
                      data-didnt={key}
                      disabled={busy !== null}
                      onClick={() => answer(ask, null)}
                    >
                      {copy.didnt}{' '}
                      <span className="visually-hidden">
                        {copy.didntFor}: {ask.spot_name}
                      </span>
                    </button>
                  </div>
                  {isOpen && (
                    <div className="dyg-open">
                      <p className="dyg-open-head">
                        <span className="dyg-ask-label">{copy.howWas}</span>
                        <span className="dyg-ask-hint">
                          {isBusy ? copy.saving : copy.hint}
                        </span>
                      </p>
                      <div
                        className="dyg-verdicts"
                        role="group"
                        aria-label={copy.verdictFor(ask.spot_name)}
                      >
                        {outings.verdicts.map(([value, word]) => (
                          <button
                            key={value}
                            type="button"
                            className="dyg-vbtn"
                            data-v={value}
                            disabled={busy !== null}
                            onClick={() => answer(ask, value)}
                          >
                            <span
                              className={`vmark vmark-${value}`}
                              aria-hidden="true"
                            />
                            {word}
                          </button>
                        ))}
                      </div>
                      {extras ? (
                        <div className="dyg-fields">
                          <label>
                            {copy.noteLabel}
                            <input
                              className="lo-input"
                              id="dyg-note"
                              maxLength={NOTE_MAX}
                              autoComplete="off"
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                            />
                          </label>
                          <div
                            className="dyg-kid"
                            role="group"
                            aria-label={copy.kidLabel}
                          >
                            <span>{copy.kidLabel}</span>
                            {[
                              [true, copy.came],
                              [false, copy.stayed],
                            ].map(([value, word]) => (
                              <button
                                key={word}
                                type="button"
                                className="chip"
                                aria-pressed={kid === value}
                                onClick={() =>
                                  setKid(kid === value ? null : value)
                                }
                              >
                                {word}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="linkbtn dyg-extras"
                          aria-expanded="false"
                          onClick={() => {
                            setExtras(true)
                            focusNext.current = '#dyg-note'
                          }}
                        >
                          {copy.extras}
                        </button>
                      )}
                    </div>
                  )}
                  {failure?.key === key && (
                    <div className="lo-alert" role="alert">
                      <strong>{copy.failedTitle}</strong>
                      <p>{failure.text}</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <p
        className="wk-toast"
        role="status"
        aria-live="polite"
        tabIndex={-1}
        ref={statusLine}
      >
        {status && (
          <span className={status.done ? 'dyg-said' : undefined}>
            {status.text}
          </span>
        )}
      </p>
    </div>
  )
}
