import { Link } from 'react-router'
import CoverImage from './CoverImage.jsx'
import SizePill from './SizePill.jsx'
import { spine } from '../content/spine.js'
import { itemPath } from '../lib/spinePaths.js'

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
    <article className={pinned ? 'tonight-lead pinned' : 'tonight-lead'}>
      <span className="tonight-lead-cover">
        <CoverImage src={pick.cover_url} type={pick.type} alt="" />
      </span>
      <div className="tonight-lead-text">
        {slot && <span className="pick-slot">{slot}</span>}
        <Link
          to={itemPath(pick.item_id)}
          className="tonight-title"
          data-tonight-title={pick.item_id}
        >
          {pick.title}
        </Link>
        <span className="tonight-meta">
          {pick.platform && <span>{pick.platform}</span>}
          <SizePill hours={pick.time_to_beat_hours} />
        </span>
        {reasons.length > 0 && (
          <ul className="tonight-reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
      {signedIn && (
        <div className="tonight-acts">
          {pinned ? (
            <>
              <span className="tonight-playing">{spine.next.upNext}</span>
              <button
                type="button"
                className="btn ghost"
                onClick={() => onUnpin(pick)}
              >
                {copy.unpin}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn primary"
                onClick={() => onPlay(pick)}
              >
                {copy.play}
              </button>
              <button
                type="button"
                className="btn"
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
