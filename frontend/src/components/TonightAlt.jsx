import { Link } from 'react-router'
import CoverImage from './CoverImage.jsx'
import SizePill from './SizePill.jsx'
import { spine } from '../content/spine.js'
import { itemPath } from '../lib/spinePaths.js'

const copy = spine.next.tonight

/**
 * A compact Tonight card: cover, slot label, title, size and the first
 * reason. On What's next it sits under the lead as "Or instead"; the How it
 * works tour uses it on its own. The owner's buttons are siblings of the
 * title link, never inside it, and only render with `onPlay`. Each names
 * its game to a screen reader, so a list of buttons tells the cards apart.
 *
 * @param {object} props
 * @param {object} props.pick - A `PublicTonightCard`.
 * @param {string|null} [props.label] - Overrides the pick's own slot label
 *   (the tour's "Up next").
 * @param {(pick: object) => void} [props.onPlay]
 * @param {(pick: object) => void} [props.onSkip]
 */
export default function TonightAlt({ pick, label, onPlay, onSkip }) {
  const slot = label === undefined ? pick.slot_label : label
  const reason = pick.reasons?.[0]
  return (
    <li className="tonight-alt">
      <span className="tonight-alt-cover">
        <CoverImage src={pick.cover_url} type={pick.type} alt="" />
      </span>
      {slot && <span className="pick-slot">{slot}</span>}
      <Link
        to={itemPath(pick.item_id)}
        className="tonight-title"
        data-tonight-title={pick.item_id}
      >
        {pick.title}
      </Link>
      {pick.time_to_beat_hours != null && (
        <span className="tonight-meta">
          <SizePill hours={pick.time_to_beat_hours} />
        </span>
      )}
      {reason && (
        <ul className="tonight-reasons">
          <li>{reason}</li>
        </ul>
      )}
      {onPlay && (
        <div className="tonight-acts">
          <button type="button" className="btn" onClick={() => onPlay(pick)}>
            {copy.playInstead}
            <span className="visually-hidden">: {pick.title}</span>
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => onSkip(pick)}
          >
            {copy.skip}
            <span className="visually-hidden">: {pick.title}</span>
          </button>
        </div>
      )}
    </li>
  )
}
