import CoverImage from './CoverImage.jsx'
import { spine } from '../content/spine.js'
import { weekdayWords } from '../lib/next.js'

const copy = spine.next.tonight

/**
 * Tonight's "Just finished" pill: the most recent public finish, which the
 * Change of pace pick is measured against. The thumb is decoration; the
 * title is in the words.
 *
 * @param {object} props
 * @param {{title: string, cover_url: string|null, finished_at: string,
 *   time_to_beat_hours: number|null}} props.finish
 */
export default function JustFinishedChip({ finish }) {
  const parts = [weekdayWords(finish.finished_at)]
  if (finish.time_to_beat_hours != null) {
    parts.push(`${finish.time_to_beat_hours} ${copy.hours}`)
  }
  return (
    <p className="tonight-just">
      <span className="tonight-just-thumb" aria-hidden="true">
        <CoverImage src={finish.cover_url} type="game" alt="" />
      </span>
      <span>
        {copy.justFinished} <b>{finish.title}</b>
        {parts
          .filter(Boolean)
          .map((part) => ` · ${part}`)
          .join('')}
      </span>
    </p>
  )
}
