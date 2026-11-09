import { Link } from 'react-router'
import CoverImage from './CoverImage.jsx'
import SizePill from './SizePill.jsx'
import SkippedToast from './SkippedToast.jsx'
import { spine } from '../content/spine.js'
import { itemPath } from '../lib/spinePaths.js'

const copy = spine.next.tonight

/**
 * "Or instead" while a Continue card leads: the picks as one compact list
 * rather than cards, since mid-game they are the fallback (Tonight continue
 * spec). A pinned backlog game comes first with its Up next kicker. The
 * owner's buttons are siblings of the title link; a skipped row shows its
 * toast with Undo in place.
 *
 * @param {object} props
 * @param {object[]} props.picks - `PublicTonightCard`s, in order.
 * @param {object|null} [props.upNext] - The pinned game, first when given.
 * @param {string[]} [props.skipped] - Item ids answered "not tonight" here.
 * @param {(pick: object) => void} [props.onPlay]
 * @param {(pick: object) => void} [props.onSkip]
 * @param {(pick: object) => void} [props.onUndo]
 * @param {string|null} [props.heading] - The line above the list; null
 *   when a lane titles it instead.
 * @param {string} [props.caption] - Muted beside the heading.
 * @param {string} [props.verb] - The owner's first button ("Play this
 *   instead", "Read this tonight").
 */
export default function PickList({
  picks,
  upNext = null,
  skipped = [],
  onPlay,
  onSkip,
  onUndo,
  heading = copy.orInstead,
  caption = copy.pickedLive,
  verb = copy.playInstead,
}) {
  const rows = [
    ...(upNext ? [{ pick: upNext, label: spine.next.upNext }] : []),
    ...picks.map((pick) => ({ pick, label: pick.slot_label })),
  ]
  if (rows.length === 0) return null
  return (
    <>
      {heading && (
        <p className="picks-h">
          <span>{heading}</span>
          <span className="muted">{caption}</span>
        </p>
      )}
      <ul className="picklist">
        {rows.map(({ pick, label }) =>
          skipped.includes(pick.item_id) ? (
            <SkippedToast key={pick.item_id} pick={pick} onUndo={onUndo} />
          ) : (
            <li key={pick.item_id}>
              <span className="picklist-cover">
                <CoverImage src={pick.cover_url} type={pick.type} alt="" />
              </span>
              <div className="picklist-text">
                {label && <span className="pick-slot">{label}</span>}
                <Link
                  to={itemPath(pick.item_id)}
                  className="tonight-title"
                  data-tonight-title={pick.item_id}
                >
                  {pick.title}
                </Link>
                <span className="tonight-meta">
                  {pick.platform && <span>{pick.platform}</span>}
                  <SizePill size={pick.size} hours={pick.time_to_beat_hours} />
                  {pick.progress && <Progress {...pick.progress} />}
                </span>
                {pick.reasons?.[0] && (
                  <ul className="tonight-reasons">
                    <li>{pick.reasons[0]}</li>
                  </ul>
                )}
              </div>
              {onPlay && (
                <div className="tonight-acts">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => onPlay(pick)}
                  >
                    {verb}
                    <span className="visually-hidden">: {pick.title}</span>
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => onSkip(pick)}
                  >
                    {copy.skip}
                    <span className="visually-hidden">: {pick.title}</span>
                  </button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </>
  )
}

/** A comic's read-through as a short bar and words; the bar is a non-text
 * mark, so it carries the count as its accessible name. */
function Progress({ read, of }) {
  const share = of > 0 ? Math.min(100, Math.round((read / of) * 100)) : 0
  return (
    <span className="progress">
      <i
        role="img"
        aria-label={copy.progressLabel(read, of)}
        style={{ '--p': `${share}%` }}
      />
      <span aria-hidden="true">{copy.progress(read, of)}</span>
    </span>
  )
}
