import { useId } from 'react'
import { denver, tagLabel } from '../content/denver.js'
import { cx } from '../lib/cx.js'
import { ACTS, box, btn, pill } from './denverSiteClasses.js'

const KICKER =
  'm-0 flex flex-wrap gap-x-3 gap-y-1 [font:var(--fs-12)_var(--font-mono)] text-(color:--text-3)'
const SLOT = 'font-semibold tracking-[0.04em] text-foreground uppercase'
const NAME = 'm-0 text-[1.125rem] font-medium'
const NAME_LEAD = 'm-0 text-[1.25rem] font-medium'
const META =
  'm-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-(color:--text-3)'
const TAGS = 'inline-flex flex-wrap gap-1'
const WHY = 'm-0 grid gap-1 pl-4 text-[0.875rem] text-muted-foreground'
const NOTE = '[font:500_var(--fs-13)_var(--font-mono)] text-foreground'

/**
 * One of the weekend's three suggestions, in the Play next card shape: the
 * slot and when-line, the spot, its tags and distance, the reasons, and
 * Save / Been / Skip. A saved card says what it is saved for and offers
 * Unsave instead; a card logged as Been says Visited. The buttons carry the
 * spot's name for a screen reader, since three cards share their words.
 *
 * @param {object} props
 * @param {object} props.suggestion A `planner.Suggestion` as the API sends it.
 * @param {boolean} [props.lead] The first card, drawn larger.
 * @param {boolean} [props.visited] Logged as Been this visit to the page.
 * @param {boolean} [props.busy] A write is in flight: the buttons wait.
 * @param {(s: object) => void} props.onSave
 * @param {(s: object) => void} props.onUnsave
 * @param {(s: object) => void} props.onBeen
 * @param {(s: object) => void} props.onSkip
 */
export default function SuggestionCard({
  suggestion,
  lead = false,
  visited = false,
  busy = false,
  onSave,
  onUnsave,
  onBeen,
  onSkip,
}) {
  const id = useId()
  const s = suggestion
  const copy = denver.weekend
  const name = <span className="visually-hidden">: {s.name}</span>
  const classes = cx(
    box,
    'sug grid gap-2 p-4',
    lead && 'lead',
    s.saved && 'saved [box-shadow:inset_3px_0_0_var(--ok)]',
    // The Card look's border colour would beat a plain one: say these here.
    s.saved ? 'border-(color:--ok)!' : lead && 'border-(color:--line-strong)!',
  )

  return (
    <li className={classes} aria-labelledby={id}>
      <p className={KICKER}>
        <span className={SLOT}>{s.slot}</span>
        <span className="sug-when">{s.when}</span>
      </p>
      <h3 id={id} className={lead ? NAME_LEAD : NAME}>
        {s.name}
      </h3>
      <p className={META}>
        {s.tags.length > 0 && (
          <span className={TAGS}>
            {s.tags.map((tag) => (
              <span key={tag} className={pill}>
                {tagLabel(tag)}
              </span>
            ))}
          </span>
        )}
        {s.distance && <span className="sug-dist">{s.distance}</span>}
      </p>
      {s.reasons.length > 0 && (
        <ul className={WHY}>
          {s.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <div className={ACTS}>
        {s.saved ? (
          <>
            <span className={NOTE}>
              {copy.savedFor} {s.when}
            </span>
            <button
              type="button"
              className={btn('ghost')}
              onClick={() => onUnsave(s)}
              disabled={busy}
            >
              {copy.unsave}
              {name}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={btn('primary')}
            onClick={() => onSave(s)}
            disabled={busy}
          >
            {copy.save}
            {name}
          </button>
        )}
        {visited ? (
          <span className={NOTE}>{copy.visited}</span>
        ) : (
          <button
            type="button"
            className={btn('ghost')}
            onClick={() => onBeen(s)}
            disabled={busy}
          >
            {copy.been}
            {name}
          </button>
        )}
        {!s.saved && (
          <button
            type="button"
            className={btn('ghost')}
            onClick={() => onSkip(s)}
            disabled={busy}
          >
            {copy.skip}
            {name}
          </button>
        )}
      </div>
    </li>
  )
}
