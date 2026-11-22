import { useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import TonightAlt from './TonightAlt.jsx'
import { spine } from '../content/spine.js'
import {
  PICK_MOODS,
  PICK_SIZES,
  pickForMeKey,
  picksFor,
  toggleMood,
} from '../lib/pickForMe.js'
import EmptyState from './EmptyState.jsx'
import { Button } from './ui/button.jsx'
import { buttonVariants } from './ui/button-variants.js'
import { CHIP_TAP } from './chipClasses.js'

const copy = spine.next.pickForMe
const SHOWN = 3

// A result is a record card's look: the card outline and a 3px accent edge.
const RESULT = 'rounded-md border-line-card border-l-[3px] border-l-primary p-4'

// A length radio is a label drawn as a chip: the chip button's look, with the
// pressed look (darker outline, heavier word, the 3px bar) keyed on
// `data-checked` instead of `aria-pressed`, and the focus ring on the label
// while the hidden input has keyboard focus.
const RADIO_CHIP = `chip pick-radio ${CHIP_TAP} ${buttonVariants({ variant: 'chip', size: 'chip' })} data-[checked=true]:border-foreground data-[checked=true]:bg-card data-[checked=true]:font-medium data-[checked=true]:text-foreground data-[checked=true]:after:block has-focus-visible:outline-2 has-focus-visible:outline-solid has-focus-visible:outline-offset-2 has-focus-visible:outline-ring`
const TERMS = ['affinity', 'similarity', 'quality', 'length_fit']

/**
 * The words a choice is announced with: "short, cozy or story". Two moods
 * widen the pool (a game in either bucket), so they join with "or".
 */
function choiceWords(size, moods) {
  const words = copy.sizes[size].toLowerCase()
  if (!moods.length) return words
  return `${words}, ${moods.map((mood) => copy.moods[mood].toLowerCase()).join(' or ')}`
}

/**
 * The combination's three picks without Tonight's lead. `leftOut` is true
 * only when the lead would have been one of the three shown, so the note
 * under the results is never untrue.
 */
function resultsFor(table, size, moods, lead) {
  const all = picksFor(table, pickForMeKey(size, moods))
  const leftOut = all
    .slice(0, SHOWN)
    .some(({ pick }) => pick.item_id === lead?.id)
  const shown = all
    .filter(({ pick }) => pick.item_id !== lead?.id)
    .slice(0, SHOWN)
  return { shown, leftOut }
}

/** One pick's working: its total, then each term with its weight. */
function ScoreBreakdown({ pick, weights }) {
  return (
    <div className="pick-score">
      <p className="pick-score-total">
        {copy.score} <strong>{Math.round(pick.score)}</strong>{' '}
        <span className="muted">{copy.outOf}</span>
      </p>
      <dl className="pick-terms">
        {TERMS.map((name) => {
          const value = pick.terms[name] ?? 0
          return (
            <div key={name} className="pick-term">
              <dt>
                {copy.terms[name]}{' '}
                <span className="muted">
                  ({copy.weight} {weights[name]})
                </span>
              </dt>
              <dd>
                <span className="pick-term-bar" aria-hidden="true">
                  <span
                    style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                  />
                </span>
                {Math.round(value)}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

/**
 * Pick for me (Pick for me spec): a length and up to two moods choose three
 * games from the public backlog. Nothing shows until a length or a mood is
 * chosen, and Tonight's lead is never among the three. Every answer is precomputed by the API, so
 * a press is a lookup in `table`, never a request. Size is a radio group;
 * moods are toggle chips, and a third mood is refused with a polite note.
 * The live line speaks only after a change, never on load. The band mounts
 * once its table has loaded, after useHashFocus would have looked, so a link
 * to `#pick-for-me` (the Tour's) is honoured here.
 *
 * @param {object} props
 * @param {object} props.table - A `PublicPickForMeOut` body.
 * @param {{id: string, title: string}|null} [props.lead] - Tonight's lead,
 *   left out of the results (the table holds four per combination, so three
 *   still show) and named under them.
 */
export default function PickForMe({ table, lead = null }) {
  const name = useId()
  // null until chosen: with no size and no mood there is no result to show.
  const [size, setSize] = useState(null)
  const [moods, setMoods] = useState([])
  const [refused, setRefused] = useState(false)
  const [announce, setAnnounce] = useState('')
  const chosen = size !== null || moods.length > 0
  const { shown: picks, leftOut } = chosen
    ? resultsFor(table, size ?? 'any', moods, lead)
    : { shown: [], leftOut: false }
  const { hash } = useLocation()
  const heading = useRef(null)

  useEffect(() => {
    if (hash !== '#pick-for-me' || !heading.current) return
    heading.current.scrollIntoView?.({ block: 'start' })
    heading.current.focus({ preventScroll: true })
    // Only on arrival: a later change of hash is useHashFocus's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function chose(nextSize, nextMoods) {
    if (nextSize === null && !nextMoods.length) {
      setAnnounce(copy.choose)
      return
    }
    const length = nextSize ?? 'any'
    const count = resultsFor(table, length, nextMoods, lead).shown.length
    setAnnounce(copy.announce(count, choiceWords(length, nextMoods)))
  }

  function pickSize(value) {
    setSize(value)
    setRefused(false)
    chose(value, moods)
  }

  function pressMood(mood) {
    const result = toggleMood(moods, mood)
    setRefused(result.refused)
    if (result.refused) return
    setMoods(result.moods)
    chose(size, result.moods)
  }

  return (
    <section
      id="pick-for-me"
      className="pick-for-me"
      aria-labelledby={`${name}-h`}
    >
      <h2 id={`${name}-h`} ref={heading} tabIndex={-1}>
        {copy.heading}
      </h2>
      <p className="muted">{copy.lede}</p>
      <fieldset className="pick-choices">
        <legend>{copy.sizeLegend}</legend>
        <div className="chip-row">
          {PICK_SIZES.map((value) => (
            <label
              key={value}
              className={RADIO_CHIP}
              data-checked={size === value}
            >
              <input
                type="radio"
                name={`${name}-size`}
                value={value}
                checked={size === value}
                onChange={() => pickSize(value)}
              />
              <span>
                {copy.sizes[value]}
                {copy.sizeHints[value] && (
                  <span className="pick-hint"> · {copy.sizeHints[value]}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="pick-choices">
        <legend>{copy.moodLegend}</legend>
        <div className="chip-row">
          {PICK_MOODS.map((mood) => (
            <Button
              key={mood}
              variant="chip"
              size="chip"
              className={`chip ${CHIP_TAP}`}
              aria-pressed={moods.includes(mood)}
              onClick={() => pressMood(mood)}
            >
              {copy.moods[mood]}
            </Button>
          ))}
        </div>
      </fieldset>
      <p className="pick-note" role="status">
        {refused ? copy.moodLimit : ''}
      </p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
      {!chosen ? (
        <EmptyState title={copy.choose} />
      ) : picks.length ? (
        <ul className="tonight-alts pick-cards">
          {picks.map(({ pick, card }) => (
            <TonightAlt
              key={pick.item_id}
              pick={{ ...card, type: 'game' }}
              label={null}
              className={RESULT}
            >
              <ScoreBreakdown pick={pick} weights={table.weights} />
            </TonightAlt>
          ))}
        </ul>
      ) : (
        <p className="muted">{copy.empty}</p>
      )}
      {chosen && (
        <p className="pick-how muted">
          {leftOut && <>{copy.leftOut(lead.title)} </>}
          {copy.howScored}
        </p>
      )}
    </section>
  )
}
