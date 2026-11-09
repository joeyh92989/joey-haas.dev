import { useState } from 'react'
import { denver, tagLabel, TAGS } from '../content/denver.js'

const copy = denver.finder

/**
 * One place the spot finder found, as a card in the finder's queue: where
 * it is, why it might fit, the tags it would be saved with, and Accept or
 * Dismiss. The tags start as the finder's suggestion and toggle; Accept
 * saves exactly the pressed ones.
 *
 * @param {object} props
 * @param {object} props.candidate A row of `GET /api/spots/candidates`.
 * @param {boolean} props.busy An answer for this card is in flight.
 * @param {(candidate: object, tags: string[]) => void} props.onAccept
 * @param {(candidate: object) => void} props.onDismiss
 */
export default function CandidateCard({
  candidate,
  busy,
  onAccept,
  onDismiss,
}) {
  const [tags, setTags] = useState(() => candidate.suggested_tags ?? [])
  const headingId = `candidate-${candidate.id}`
  const scored = candidate.fit !== null && candidate.fit !== undefined

  function toggle(tag) {
    setTags((current) =>
      current.includes(tag)
        ? current.filter((entry) => entry !== tag)
        : TAGS.filter((entry) => entry === tag || current.includes(entry)),
    )
  }

  return (
    <li className="cand" aria-labelledby={headingId}>
      <div className="cand-h">
        <div>
          <h3 className="cand-name" id={headingId}>
            {candidate.name}
          </h3>
          <p className="cand-area">
            {candidate.category.replace('_', ' ')}
            {candidate.distance && ` · ${candidate.distance}`}
          </p>
        </div>
        <span className="cand-src" title={copy.sourceName}>
          {copy.source}
        </span>
      </div>

      <p className="cand-why">
        {scored ? (
          <>
            <span className="cand-score">
              Fit <strong>{candidate.fit}</strong>
            </span>{' '}
            {candidate.reason}
          </>
        ) : (
          copy.notScored
        )}
      </p>

      <div className="cand-acts">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          data-candidate-accept={candidate.id}
          onClick={() => onAccept(candidate, tags)}
        >
          {copy.accept}
          <span className="visually-hidden">: {candidate.name}</span>
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => onDismiss(candidate)}
        >
          {copy.dismiss}
          <span className="visually-hidden">: {candidate.name}</span>
        </button>
        <ul
          className="cand-tags"
          aria-label={`${copy.tagsLabel}: ${candidate.name}`}
        >
          {TAGS.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                className="minitag"
                aria-pressed={tags.includes(tag)}
                disabled={busy}
                onClick={() => toggle(tag)}
              >
                {tagLabel(tag)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}
