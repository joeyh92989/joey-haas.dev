import { useEffect, useState } from 'react'
import Sheet from './Sheet.jsx'
import CoverImage from './CoverImage.jsx'
import QuickRate from './QuickRate.jsx'
import { ACTION_ERROR } from '../content/status.js'
import { spine } from '../content/spine.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { runWords } from '../lib/shelf.js'
import { dayWords } from '../lib/releaseWords.js'
import { WRAP_UP_STATUSES, localToday, setStatus } from '../lib/statusMoves.js'

const copy = spine.next.tonight.sheet
// The moves the sheet makes are the ones the card menu routes to it.
const OUTCOMES = WRAP_UP_STATUSES
const NOTE_MAX = 500

/** The open run's header line: "Playthrough 2 · since Oct 24, 2026 · 31 h" (a comic's is "Read 2 · ..."). */
function headerLine(detail, type) {
  if (!detail) return ''
  const run = runWords(type).run
  const parts = [
    `${run.charAt(0).toUpperCase()}${run.slice(1)} ${detail.playthrough}`,
  ]
  if (detail.since) parts.push(`${copy.since} ${dayWords(detail.since)}`)
  if (detail.hours) {
    // Whole hours from ten up, one decimal below, as the Continue card says.
    const hours =
      detail.hours >= 10
        ? Math.round(detail.hours)
        : Math.round(detail.hours * 10) / 10
    parts.push(`${hours} ${spine.next.tonight.hours}`)
  }
  return parts.join(' · ')
}

/**
 * The Wrap up sheet (Tonight continue spec): Finished / Paused / Abandoned
 * first, then the extras on the same screen, a rating, one line and the
 * date. Two taps when the extras are skipped. One component for three
 * entry points: the Continue card, the admin Now playing band, and the
 * shelf card's status menu, which opens it with that outcome preselected.
 *
 * A Sheet, a native `<dialog>` opened with showModal(): the browser traps focus, inerts the page, closes on Escape (routed
 * through the owner's state) and returns focus to the opener. The sheet
 * fetches the item on open for its header and the current rating.
 *
 * Saving is the status route with `on` (when not today) and `note`, then a
 * PATCH of the rating only when the stars changed. A status failure keeps
 * the sheet open with the server's words; a rating failure closes it and
 * is reported through `onDone`, since the game is already marked.
 *
 * @param {object} props
 * @param {{item: {id: string, title: string, cover_url: string|null,
 *   type: string}, preselect?: string}|null} props.subject - The game, or
 *   null while closed.
 * @param {() => void} props.onClose
 * @param {(result: {item: object, status: string, rating: number|null,
 *   ratingFailed: boolean}) => void} props.onDone
 */
export default function WrapUpSheet({ subject, onClose, onDone }) {
  const open = subject != null
  // A save is out: closing now would unmount the form, swallowing its error
  // or letting its result land on whatever the owner opens next.
  const [busy, setBusy] = useState(false)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onCancel={() => !busy}
      labelledBy={TITLE_ID}
      className="wrap-sheet"
      initialFocus='[aria-pressed="true"]'
    >
      {open && (
        <WrapUpForm
          key={subject.item.id}
          subject={subject}
          onClose={() => !busy && onClose()}
          onBusy={setBusy}
          onDone={onDone}
        />
      )}
    </Sheet>
  )
}

const TITLE_ID = 'wrap-up-title'
const HINT_ID = 'wrap-up-date-hint'

/**
 * The sheet's contents, mounted fresh for each game it opens on, so every
 * field starts from the subject. Fetches the item for the header and the
 * current rating.
 */
function WrapUpForm({ subject, onClose, onBusy, onDone }) {
  const { item } = subject
  const [outcome, setOutcome] = useState(subject.preselect ?? 'finished')
  // `picked` is the owner's choice, undefined until they touch the stars,
  // so a slow item fetch can seed the rating without overwriting one they
  // have already given.
  const [picked, setPicked] = useState(undefined)
  const [initialRating, setInitialRating] = useState(null)
  const [note, setNote] = useState('')
  const [on, setOn] = useState(localToday)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // The owner's choice once they have made one, else what the item says.
  const rating = picked === undefined ? initialRating : picked

  useEffect(() => {
    let cancelled = false
    apiFetch(`/api/items/${item.id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((loaded) => {
        if (cancelled || !loaded) return
        const runs = loaded.playthroughs ?? []
        const run = runs.find((entry) => entry.outcome == null)
        setDetail({
          playthrough: run?.number ?? runs.length + 1,
          since: run?.started_on ?? null,
          hours: run ? (run.journal_minutes ?? 0) / 60 : null,
        })
        setInitialRating(loaded.rating ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [item.id])

  async function save(withExtras) {
    setBusy(true)
    onBusy(true)
    setError(null)
    try {
      const extras = {}
      if (withExtras) {
        if (on && on !== localToday()) extras.on = on
        if (note.trim()) extras.note = note.trim()
      }
      const response = await setStatus(item.id, outcome, extras)
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      let ratingFailed = false
      if (withExtras && rating !== initialRating) {
        try {
          const patched = await apiFetch(`/api/items/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating }),
          })
          ratingFailed = !patched.ok
        } catch {
          ratingFailed = true
        }
      }
      onDone({
        item,
        status: outcome,
        rating: ratingFailed ? initialRating : rating,
        ratingFailed,
      })
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  return (
    <div className="wrap-sheet-body">
      <header className="wrap-sheet-head">
        <span className="wrap-sheet-cover" aria-hidden="true">
          <CoverImage src={item.cover_url} type={item.type} alt="" />
        </span>
        <div className="wrap-sheet-heading">
          <h2 id={TITLE_ID}>{copy.title(item.title)}</h2>
          <p className="muted">{headerLine(detail, item.type)}</p>
        </div>
        <button
          type="button"
          className="btn ghost sm"
          aria-label={copy.close}
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className="wrap-outcome" role="group" aria-label={copy.outcomeGroup}>
        {OUTCOMES.map((key) => {
          const { label, hint } = copy.outcomes[key]
          return (
            <button
              key={key}
              type="button"
              aria-pressed={outcome === key}
              aria-label={`${label}, ${hint}`}
              onClick={() => setOutcome(key)}
            >
              <b>
                <span
                  className="status-swatch"
                  data-status={key}
                  aria-hidden="true"
                />
                {label}
              </b>
              <small>{hint}</small>
            </button>
          )
        })}
      </div>
      <div className="wrap-fresh">
        <h3>{copy.fresh}</h3>
        <div className="wrap-field">
          <span className="wrap-label" id="wrap-up-rating">
            {copy.rating}
          </span>
          <QuickRate value={rating} onChange={setPicked} />
        </div>
        <div className="wrap-field">
          <label className="wrap-label" htmlFor="wrap-up-note">
            {copy.line}
          </label>
          <textarea
            id="wrap-up-note"
            rows={2}
            maxLength={NOTE_MAX}
            placeholder={copy.placeholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div className="wrap-field">
          <label className="wrap-label" htmlFor="wrap-up-date">
            {copy.dateLabel[outcome]}
          </label>
          <input
            id="wrap-up-date"
            type="date"
            max={localToday()}
            value={on}
            aria-describedby={HINT_ID}
            onChange={(event) => setOn(event.target.value)}
          />
          <span className="wrap-hint" id={HINT_ID}>
            {copy.dateHint}
          </span>
        </div>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      <footer className="wrap-sheet-foot">
        <span className="muted">{copy.twoTaps}</span>
        <span className="wrap-sheet-acts">
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => save(false)}
          >
            {copy.skipExtras}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => save(true)}
          >
            {copy.primary[outcome]}
          </button>
        </span>
      </footer>
    </div>
  )
}
