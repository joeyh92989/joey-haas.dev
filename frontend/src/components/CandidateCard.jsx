import { useState } from 'react'
import { denver, tagLabel, TAGS } from '../content/denver.js'
import { ACTS, box, btn, pill, tagBtn } from './denverSiteClasses.js'

const HEAD = 'flex items-start justify-between gap-3'
const NAME = 'm-0 text-[1.125rem] font-medium'
// The hairline top margin is an optical offset, not a scale step.
const AREA =
  'mx-0 mt-[0.1rem] mb-0 text-[0.8125rem] text-(color:--text-3) first-letter:uppercase'
const WHY = 'm-0 text-[0.875rem] text-muted-foreground'
const SCORE =
  'font-mono text-[0.75rem] text-(color:--text-3) [&_strong]:text-foreground'
const TAG_LIST =
  'mt-0 mr-0 mb-0 ml-auto flex list-none flex-wrap gap-1 p-0 [@media(max-width:700px)]:ml-0 [@media(max-width:700px)]:w-full'

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
    <li
      className={`${box} cand grid gap-2 px-4 py-3`}
      aria-labelledby={headingId}
    >
      <div className={HEAD}>
        <div>
          <h3 className={NAME} id={headingId}>
            {candidate.name}
          </h3>
          <p className={AREA}>
            {[candidate.category?.replaceAll('_', ' '), candidate.distance]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span className={`${pill} cand-src`} title={copy.sourceName}>
          {copy.source}
        </span>
      </div>

      <p className={WHY}>
        {scored ? (
          <>
            <span className={SCORE}>
              Fit <strong>{candidate.fit}</strong>
            </span>{' '}
            {candidate.reason}
          </>
        ) : (
          copy.notScored
        )}
      </p>

      <div className={ACTS}>
        <button
          type="button"
          className={btn('primary')}
          disabled={busy}
          data-candidate-accept={candidate.id}
          onClick={() => onAccept(candidate, tags)}
        >
          {copy.accept}
          <span className="visually-hidden">: {candidate.name}</span>
        </button>
        <button
          type="button"
          className={btn('ghost')}
          disabled={busy}
          onClick={() => onDismiss(candidate)}
        >
          {copy.dismiss}
          <span className="visually-hidden">: {candidate.name}</span>
        </button>
        <ul
          className={TAG_LIST}
          aria-label={`${copy.tagsLabel}: ${candidate.name}`}
        >
          {TAGS.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                className={tagBtn}
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
