import { Link } from 'react-router'
import CoverImage from './CoverImage.jsx'
import SizePill from './SizePill.jsx'
import { spine } from '../content/spine.js'
import { itemRowPath } from '../lib/spinePaths.js'
import {
  LEAD,
  LEAD_COVER,
  LEAD_PINNED,
  LEAD_TEXT,
  LEAD_TITLE,
  PICK_SLOT,
  TONIGHT_ACTS_LEAD,
  TONIGHT_BTN,
  TONIGHT_META,
  TONIGHT_PLAYING,
  TONIGHT_REASONS,
} from './tonightClasses.js'

const copy = spine.next.tonight

/**
 * Tonight's lead card: the first open pick, or the pinned Up next game.
 * Up to two reasons. The owner's buttons (with `signedIn`) are a sibling of
 * the title link; pinned, they become the "Up next" mark and Unpin.
 *
 * @param {object} props
 * @param {object} props.pick - A `PublicTonightCard`.
 * @param {boolean} props.pinned - The pick is Up next.
 * @param {boolean} [props.signedIn]
 * @param {(pick: object) => void} [props.onPlay]
 * @param {(pick: object) => void} [props.onSkip]
 * @param {(pick: object) => void} [props.onUnpin]
 */
export default function TonightLead({
  pick,
  pinned,
  signedIn = false,
  onPlay,
  onSkip,
  onUnpin,
}) {
  const slot = pinned ? spine.next.upNext : pick.slot_label
  const reasons = (pick.reasons ?? []).slice(0, 2)
  return (
    <article
      className={
        pinned ? `tonight-lead pinned ${LEAD_PINNED}` : `tonight-lead ${LEAD}`
      }
    >
      <span className={`tonight-lead-cover ${LEAD_COVER}`}>
        <CoverImage src={pick.cover_url} type={pick.type} alt="" />
      </span>
      <div className={`tonight-lead-text ${LEAD_TEXT}`}>
        {slot && <span className={`pick-slot ${PICK_SLOT}`}>{slot}</span>}
        <Link
          to={itemRowPath(pick)}
          className={`tonight-title ${LEAD_TITLE}`}
          data-tonight-title={pick.item_id}
        >
          {pick.title}
        </Link>
        <span className={`tonight-meta ${TONIGHT_META}`}>
          {pick.platform && <span>{pick.platform}</span>}
          <SizePill size={pick.size} hours={pick.time_to_beat_hours} />
        </span>
        {reasons.length > 0 && (
          <ul className={`tonight-reasons ${TONIGHT_REASONS}`}>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
      {signedIn && (
        <div className={`tonight-acts ${TONIGHT_ACTS_LEAD}`}>
          {pinned ? (
            <>
              <span className={`tonight-playing ${TONIGHT_PLAYING}`}>
                {spine.next.upNext}
              </span>
              <button
                type="button"
                className={`btn ghost ${TONIGHT_BTN}`}
                onClick={() => onUnpin(pick)}
              >
                {copy.unpin}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`btn primary ${TONIGHT_BTN}`}
                onClick={() => onPlay(pick)}
              >
                {copy.play}
              </button>
              <button
                type="button"
                className={`btn ${TONIGHT_BTN}`}
                onClick={() => onSkip(pick)}
              >
                {copy.skip}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  )
}
