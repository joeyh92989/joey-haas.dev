import { useId } from 'react'
import { denver, tagLabel } from '../content/denver.js'

/**
 * One of the weekend's three suggestions, in the Play Next card shape: the
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
  const classes = ['sug', lead && 'lead', s.saved && 'saved']
    .filter(Boolean)
    .join(' ')

  return (
    <li className={classes} aria-labelledby={id}>
      <p className="sug-kicker">
        <span className="sug-slot">{s.slot}</span>
        <span className="sug-when">{s.when}</span>
      </p>
      <h3 id={id} className="sug-name">
        {s.name}
      </h3>
      <p className="sug-meta">
        {s.tags.length > 0 && (
          <span className="sug-tags">
            {s.tags.map((tag) => (
              <span key={tag} className="sug-tag">
                {tagLabel(tag)}
              </span>
            ))}
          </span>
        )}
        {s.distance && <span className="sug-dist">{s.distance}</span>}
      </p>
      {s.reasons.length > 0 && (
        <ul className="sug-why">
          {s.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <div className="cand-acts">
        {s.saved ? (
          <>
            <span className="savedtag">
              {copy.savedFor} {s.when}
            </span>
            <button
              type="button"
              className="btn ghost"
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
            className="btn primary"
            onClick={() => onSave(s)}
            disabled={busy}
          >
            {copy.save}
            {name}
          </button>
        )}
        {visited ? (
          <span className="sug-visited">{copy.visited}</span>
        ) : (
          <button
            type="button"
            className="btn ghost"
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
            className="btn ghost"
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
