import { useEffect, useId, useRef, useState } from 'react'
import { garmentTitle, ownerDay, shortDate } from '../lib/closet.js'
import { Swatch } from './OutfitSwatches.jsx'

/** The four outcomes, in order, with the sub-label under each. */
export const OUTCOMES = [
  { value: 'keep', label: 'Keep', hint: 'clear until next season' },
  { value: 'pack', label: 'Pack away', hint: 'pick a month' },
  { value: 'sell', label: 'Sell', hint: 'listing checklist' },
  { value: 'donate', label: 'Donate', hint: 'mark gone' },
]

/** The card's one mono line: wears, when it was added, the size. */
export function deckStat(card) {
  const garment = card.garment
  const parts = [`Worn ${garment.wears_12mo}× in 12 months`]
  const added = garment.acquired_on ?? (garment.created_at ? ownerDay(garment.created_at) : null)
  if (added) parts.push(`added ${shortDate(added)}`)
  if (card.size) parts.push(`size ${card.size}`)
  return parts.join(' · ')
}

/**
 * The evidence: one bullet per data flag, in full sentences, then the
 * model's opinion last. The bullets' shapes are decorative; the word
 * "Opinion:" is what marks the last one as the model's.
 */
export function EvidenceList({ flags, opinion }) {
  return (
    <ul className="evidence">
      {flags.map((flag) => (
        <li key={flag.kind} className="evidence-flag">
          {flag.sentence}
        </li>
      ))}
      {opinion && (
        <li className="evidence-opinion">
          <strong>Opinion:</strong> {opinion}
        </li>
      )}
    </ul>
  )
}

/**
 * The four outcomes as equal buttons. The suggested one is marked by its
 * border and fill, and by ", suggested" in its name, since a reader gets
 * neither.
 */
export function OutcomeRow({ suggested, busy, onChoose, packRef }) {
  return (
    <div className="outcomes" role="group" aria-label="Decide">
      {OUTCOMES.map((outcome) => {
        const pick = outcome.value === suggested
        return (
          <button
            key={outcome.value}
            ref={outcome.value === 'pack' ? packRef : undefined}
            type="button"
            className="outcome"
            data-suggested={pick ? 'true' : undefined}
            aria-label={`${outcome.label}, ${outcome.hint}${pick ? ', suggested' : ''}`}
            disabled={busy}
            onClick={() => onChoose(outcome.value)}
          >
            <span className="outcome-label">{outcome.label}</span>
            <span className="outcome-hint">{outcome.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Pack away's month: prefilled from the season window, next month at least.
 * It takes focus as it opens, since the button that opened it is gone.
 */
function PackMonth({ card, day, busy, onPack, onCancel }) {
  const id = useId()
  const hintId = useId()
  const inputRef = useRef(null)
  const [month, setMonth] = useState(card.back_on.slice(0, 7))
  // Where `type="month"` is not supported the field is plain text, so the
  // shape is checked here as well as by `pattern`.
  const [invalid, setInvalid] = useState(false)
  const year = Number(day.slice(0, 4))
  const next = Number(day.slice(5, 7)) + 1
  const min =
    next > 12 ? `${year + 1}-01` : `${year}-${String(next).padStart(2, '0')}`

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit(event) {
    event.preventDefault()
    const ok = /^\d{4}-\d{2}$/.test(month)
    setInvalid(!ok)
    if (ok) onPack(`${month}-01`)
  }

  return (
    <form className="pack-month" onSubmit={submit}>
      <label htmlFor={id}>Back in</label>
      <input
        id={id}
        ref={inputRef}
        type="month"
        min={min}
        value={month}
        required
        pattern="\d{4}-\d{2}"
        title="A month, as YYYY-MM"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? hintId : undefined}
        onChange={(event) => setMonth(event.target.value)}
      />
      <button type="submit" className="btn primary sm" disabled={busy}>
        Pack away
      </button>
      <button type="button" className="btn ghost sm" onClick={onCancel}>
        Cancel
      </button>
      {invalid && (
        <p id={hintId} className="admin-error" role="alert">
          Pick a month, as YYYY-MM.
        </p>
      )}
    </form>
  )
}

/**
 * One flagged piece at a time: the progress line and bar, the thumbnail,
 * name and stat line, the evidence and the outcomes, and Skip under it.
 *
 * @param {object} props
 * @param {object} props.card The current deck card from `GET /api/closet/review`.
 * @param {number} props.position 1-based place of the card in the session.
 * @param {number} props.total Cards decided, skipped and still to come.
 * @param {string} props.day Today, 'YYYY-MM-DD', for Pack away's earliest month.
 * @param {boolean} props.busy
 * @param {(outcome: string, backOn?: string) => void} props.onDecide Keep,
 *   Pack away (with its month) or Donate; Sell is `onSell`.
 * @param {() => void} props.onSell
 * @param {() => void} props.onSkip
 * @param {import('react').Ref<HTMLHeadingElement>} [props.headingRef]
 */
export default function ReviewDeck({
  card,
  position,
  total,
  day,
  busy,
  onDecide,
  onSell,
  onSkip,
  headingRef,
}) {
  const [packing, setPacking] = useState(false)
  const packRef = useRef(null)
  // Cancel puts focus back on Pack away, which is drawn again only then.
  const backToPack = useRef(false)
  const done = position - 1

  useEffect(() => {
    if (packing || !backToPack.current) return
    backToPack.current = false
    packRef.current?.focus()
  }, [packing])

  function cancelPack() {
    backToPack.current = true
    setPacking(false)
  }
  const percent = total ? Math.round((done / total) * 100) : 0

  function choose(outcome) {
    if (outcome === 'pack') setPacking(true)
    else if (outcome === 'sell') onSell()
    else onDecide(outcome)
  }

  return (
    <section className="review-deck" aria-label="Flagged pieces">
      <p className="review-progress">
        {position} of {total} flagged
      </p>
      <div className="review-bar" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <article className="panel review-card">
        <Swatch garment={card.garment} className="review-thumb" />
        <div className="review-text">
          <h2 className="review-name" tabIndex={-1} ref={headingRef}>
            {garmentTitle(card.garment)}
          </h2>
          <p className="review-stat">{deckStat(card)}</p>
          <EvidenceList flags={card.flags} opinion={card.opinion} />
        </div>
      </article>
      {packing ? (
        <PackMonth
          card={card}
          day={day}
          busy={busy}
          onPack={(backOn) => onDecide('pack', backOn)}
          onCancel={cancelPack}
        />
      ) : (
        <OutcomeRow
          suggested={card.suggested}
          busy={busy}
          onChoose={choose}
          packRef={packRef}
        />
      )}
      <button
        type="button"
        className="btn ghost review-skip"
        disabled={busy}
        onClick={onSkip}
      >
        Skip
      </button>
    </section>
  )
}
