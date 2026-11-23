import { useId } from 'react'
import {
  NEXT_LANE,
  NEXT_LANE_CAP,
  NEXT_LANE_HEAD,
  NEXT_LANE_TITLE,
} from './comicClasses.js'
import PickList from './PickList.jsx'

/**
 * Read next / Watch next under Tonight's game picks (recommendation engine
 * spec): one medium's live picks as a compact list, in a region named by
 * its heading. Absent when the lane has nothing to pick.
 *
 * @param {object} props
 * @param {string} props.title - "Read next" or "Watch next".
 * @param {string} props.caption - "from my comics", muted beside it.
 * @param {string} props.verb - The owner's start button.
 * @param {object[]} props.picks - `PublicTonightCard`s, in order.
 * @param {string[]} [props.skipped]
 * @param {(pick: object) => void} [props.onPlay]
 * @param {(pick: object) => void} [props.onSkip]
 * @param {(pick: object) => void} [props.onUndo]
 */
export default function Lane({ title, caption, verb, picks, ...owner }) {
  const id = useId()
  if (!picks?.length) return null
  return (
    <section className={`lane ${NEXT_LANE}`} aria-labelledby={id}>
      <div className={`lane-h ${NEXT_LANE_HEAD}`}>
        <h3 id={id} className={NEXT_LANE_TITLE}>
          {title}
        </h3>
        <span className={`live-cap ${NEXT_LANE_CAP}`}>{caption}</span>
      </div>
      <PickList picks={picks} heading={null} verb={verb} {...owner} />
    </section>
  )
}
