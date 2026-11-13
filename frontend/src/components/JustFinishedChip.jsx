import CoverImage from './CoverImage.jsx'
import Stars from './Stars.jsx'
import { spine } from '../content/spine.js'
import { weekdayWords } from '../lib/next.js'

const copy = spine.next.tonight

/**
 * Tonight's "Just finished" line: the most recent public finish, which the
 * Change of pace pick is measured against. Two text runs (the title; the day,
 * hours and rating), side by side when there is room and stacked on a phone,
 * with no pill. The thumb is decoration; the title is in the words.
 *
 * @param {object} props
 * @param {{title: string, cover_url: string|null, finished_at: string,
 *   time_to_beat_hours: number|null, rating?: number|null}} props.finish -
 *   With a rating, the stars follow the hours (Tonight continue spec).
 */
export default function JustFinishedChip({ finish }) {
  const parts = [weekdayWords(finish.finished_at)]
  if (finish.time_to_beat_hours != null) {
    parts.push(`${Math.round(finish.time_to_beat_hours)} ${copy.hours}`)
  }
  const when = parts.filter(Boolean).join(' · ')
  return (
    <p className="tonight-just">
      <span className="tonight-just-thumb" aria-hidden="true">
        <CoverImage src={finish.cover_url} type="game" alt="" />
      </span>
      <span className="tj-a">
        {copy.justFinished} <b>{finish.title}</b>
      </span>
      <span className="tj-b">
        {when}
        {finish.rating ? (
          <>
            {when ? ' · ' : ''}
            <Stars rating={finish.rating} />
          </>
        ) : null}
      </span>
    </p>
  )
}
