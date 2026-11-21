import { Link } from 'react-router'
import { statusLabel } from '../lib/shelf.js'
import { localToday } from '../lib/statusMoves.js'
import CoverImage from './CoverImage.jsx'
import Rating from './Rating.jsx'
import { MONTH_YEAR } from '../lib/formatDate.js'
import { cx } from '../lib/cx.js'
import RecordCard from './RecordCard.jsx'
import StatusMark from './StatusMark.jsx'
import { CARD_HOST, CARD_LINK, CARD_TITLE } from './shelf-classes.js'

const SWITCH_2_ID = 508
const SWITCH_2_NAME = 'Nintendo Switch 2'

/**
 * The format mark's accessible name, or null for no mark.
 *
 * Only copies that do not hold the whole game are marked, plus a Switch 2
 * copy whose format was never recorded: that one may be a Game-Key Card, and
 * an unmarked poster would claim a cartridge. Admin rows carry platform_id,
 * public rows only the platform name, so both are checked.
 */
function formatMark(item) {
  if (item.physical_format === 'game_key_card') return 'Game-Key Card'
  if (item.physical_format === 'code_in_box') return 'Code in a box'
  const switch2 =
    item.platform_id === SWITCH_2_ID || item.platform === SWITCH_2_NAME
  if (switch2 && item.physical_format == null) return 'Format not recorded'
  return null
}

/** "Coming Mar 2027" for a release after today, otherwise null. */
function upcoming(item) {
  if (!item.release_date || item.release_date <= localToday()) return null
  const [year, month, day] = item.release_date.split('-').map(Number)
  return `Coming ${MONTH_YEAR.format(new Date(Date.UTC(year, month - 1, day)))}`
}

/** A small key, drawn in currentColor so it takes the mark's token. */
function KeyGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <circle
        cx="5"
        cy="8"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M8 8h7M12 8v3M14.5 8v2" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/**
 * One cover on a shelf, shared by the public showcase and the admin shelf.
 *
 * The poster and the title are a single link; admin controls arrive through
 * `actions` and render as a sibling of that link, never inside it, because a
 * button nested in an anchor is invalid and a click on it would navigate.
 * Nothing is revealed only on hover: the title, rating, year and creator are
 * always visible, and the marks are named images.
 *
 * @param {object} props
 * @param {object} props.item - A shelf row. An admin row with
 *   `is_public === false` carries a Private tag.
 * @param {string} props.to - Where the card links; the page decides.
 * @param {(item: object) => import('react').ReactNode} [props.actions] -
 *   Optional controls rendered beside the link.
 * @param {boolean} [props.dimmed] - Fade the card (finished and abandoned).
 * @param {boolean} [props.stacked] - Draw two offset edges behind the cover,
 *   so a comic series reads as more than one book before any text.
 *   Decorative.
 * @param {import('react').ReactNode} [props.run] - A comic's run, under the
 *   title and outside the link (ComicCardRun).
 * @param {Record<string, string>} [props.statusLabels] - The status mark's
 *   names; comics pass their own (Reading, Read).
 * @param {number} [props.number] - The card's catalogue number. With it the
 *   card is a record card in a numbered collection (the public lists): a
 *   strip with the catalogue number and the status mark with its word, and the whole
 *   card is the link. Without it the card is the loose poster the other
 *   grids draw. The admin lists pass both: `actions` then sits below the
 *   card's link (above its cover-wide `::after`, so it takes clicks), and a
 *   private row carries its Private tag.
 */
export default function PosterCard({
  item,
  to,
  actions,
  dimmed = false,
  stacked = false,
  run = null,
  statusLabels,
  number,
}) {
  const markLabel = statusLabels
    ? (item.caught_up && statusLabels.caughtUp) || statusLabels[item.status]
    : statusLabel(item.status, item.type)
  const meta = [item.year, item.creator].filter(Boolean).join(' · ')
  const mark = formatMark(item)
  const coming = upcoming(item)

  if (number != null) {
    const art = (
      <span className="poster-art" data-stacked={stacked || undefined}>
        <CoverImage src={item.cover_url} type={item.type} alt="" />
        {!coming && <ReplayMark count={item.times_completed} />}
        {mark && (
          <span className="format-mark" role="img" aria-label={mark}>
            {mark === 'Format not recorded' ? '?' : <KeyGlyph />}
          </span>
        )}
        {coming && <span className="upcoming-ribbon">{coming}</span>}
        {item.favorite && (
          <span className="poster-heart" role="img" aria-label="Favorite">
            ♥
          </span>
        )}
      </span>
    )
    return (
      <RecordCard
        className={cx('poster-card', CARD_HOST)}
        data-dimmed={dimmed || undefined}
        number={number}
        label={
          markLabel && (
            <span aria-hidden="true">
              <StatusMark
                status={item.status === 'active' ? 'live' : item.status}
              >
                {markLabel}
              </StatusMark>
            </span>
          )
        }
      >
        <div className="flex flex-1 flex-col p-3">
          <Link to={to} className={cx('poster-link', CARD_LINK)}>
            {art}
            <span className={cx('poster-title', CARD_TITLE)}>{item.title}</span>
            {markLabel && ' '}
            {markLabel && <span className="sr-only">{markLabel}</span>}
          </Link>
          {run}
          {item.rating ? (
            <div className="mt-1">
              <Rating rating={item.rating} />
            </div>
          ) : null}
          {meta && <p className="poster-meta muted">{meta}</p>}
          {/* Admin rows only: a public row has no is_public at all. */}
          {item.is_public === false && (
            <p className="poster-private">Private</p>
          )}
          {actions && (
            <div className="relative z-10 mt-auto pt-1">{actions(item)}</div>
          )}
        </div>
      </RecordCard>
    )
  }

  return (
    <div className="poster-card" data-dimmed={dimmed || undefined}>
      <Link to={to} className="poster-link">
        <span className="poster-art" data-stacked={stacked || undefined}>
          <CoverImage src={item.cover_url} type={item.type} alt="" />
          {/* Backlog gets no mark: its absence is the signal. */}
          {item.status !== 'backlog' && markLabel && (
            <span
              className="status-mark"
              data-status={item.status}
              role="img"
              aria-label={markLabel}
            />
          )}
          {/* Bottom-left, unless the ribbon holds it. */}
          {!coming && <ReplayMark count={item.times_completed} />}
          {mark && (
            <span className="format-mark" role="img" aria-label={mark}>
              {mark === 'Format not recorded' ? '?' : <KeyGlyph />}
            </span>
          )}
          {coming && <span className="upcoming-ribbon">{coming}</span>}
          {item.favorite && (
            <span className="poster-heart" role="img" aria-label="Favorite">
              ♥
            </span>
          )}
        </span>
        <span className="poster-title">{item.title}</span>
      </Link>
      {run}
      <Rating rating={item.rating} />
      {meta && <p className="poster-meta muted">{meta}</p>}
      {/* Only an admin row says it is private; a public row has no
          is_public at all. Never hover-only: it is the state, not a control. */}
      {item.is_public === false && <p className="poster-private">Private</p>}
      {actions && <div className="poster-actions">{actions(item)}</div>}
    </div>
  )
}

/**
 * "×2" in the poster's bottom-left corner for a game finished more than
 * once; nothing for one finish or none.
 *
 * @param {{count?: number}} props
 */
export function ReplayMark({ count }) {
  if (!(count > 1)) return null
  return (
    <span
      className="replay-mark"
      role="img"
      aria-label={`Finished ${count} times`}
    >
      ×{count}
    </span>
  )
}
