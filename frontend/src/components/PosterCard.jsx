import { Link } from 'react-router'
import { statusLabel } from '../lib/shelf.js'
import { localToday } from '../lib/statusMoves.js'
import CoverImage from './CoverImage.jsx'
import Rating from './Rating.jsx'
import { MONTH_YEAR } from '../lib/formatDate.js'
import { cx } from '../lib/cx.js'
import RecordCard from './RecordCard.jsx'
import StatusMark from './StatusMark.jsx'
import {
  CARD_HOST,
  CARD_LINK,
  CARD_TITLE,
  FORMAT_MARK,
  POSTER_ART,
  POSTER_CARD,
  POSTER_DIMMED,
  POSTER_DIMMED_COVER,
  POSTER_HEART,
  POSTER_LIFT,
  POSTER_LINK,
  POSTER_META,
  POSTER_PRIVATE,
  POSTER_TITLE,
  REPLAY_MARK,
  STATUS_MARK,
  UPCOMING_RIBBON,
} from './shelf-classes.js'

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
      <span
        className={cx('poster-art', POSTER_ART)}
        data-stacked={stacked || undefined}
      >
        <CoverImage src={item.cover_url} type={item.type} alt="" />
        {!coming && <ReplayMark count={item.times_completed} />}
        {mark && (
          <span
            className={cx('format-mark', FORMAT_MARK)}
            role="img"
            aria-label={mark}
          >
            {mark === 'Format not recorded' ? '?' : <KeyGlyph />}
          </span>
        )}
        {coming && (
          <span className={cx('upcoming-ribbon', UPCOMING_RIBBON)}>
            {coming}
          </span>
        )}
        {item.favorite && (
          <span
            className={cx(
              'poster-heart',
              POSTER_HEART,
              'absolute [text-shadow:0_0_3px_var(--bg)]',
            )}
            role="img"
            aria-label="Favorite"
          >
            ♥
          </span>
        )}
      </span>
    )
    // The admin lists (an actions panel under the card) fade only the cover.
    const dimClass = actions ? POSTER_DIMMED_COVER : POSTER_DIMMED
    return (
      <RecordCard
        className={cx('poster-card', POSTER_CARD, CARD_HOST, dimClass)}
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
          {meta && (
            <p className={cx('poster-meta muted', POSTER_META)}>{meta}</p>
          )}
          {/* Admin rows only: a public row has no is_public at all. */}
          {item.is_public === false && (
            <p className={cx('poster-private', POSTER_PRIVATE)}>Private</p>
          )}
          {actions && <div className="mt-auto">{actions(item)}</div>}
        </div>
      </RecordCard>
    )
  }

  return (
    <div
      className={cx('poster-card', POSTER_CARD, POSTER_LIFT, POSTER_DIMMED)}
      data-dimmed={dimmed || undefined}
    >
      <Link to={to} className={cx('poster-link', POSTER_LINK)}>
        <span
          className={cx('poster-art', POSTER_ART)}
          data-stacked={stacked || undefined}
        >
          <CoverImage src={item.cover_url} type={item.type} alt="" />
          {/* Backlog gets no mark: its absence is the signal. */}
          {item.status !== 'backlog' && markLabel && (
            <span
              className={cx('status-mark', STATUS_MARK, 'absolute')}
              data-status={item.status}
              role="img"
              aria-label={markLabel}
            />
          )}
          {/* Bottom-left, unless the ribbon holds it. */}
          {!coming && <ReplayMark count={item.times_completed} />}
          {mark && (
            <span
              className={cx('format-mark', FORMAT_MARK)}
              role="img"
              aria-label={mark}
            >
              {mark === 'Format not recorded' ? '?' : <KeyGlyph />}
            </span>
          )}
          {coming && (
            <span className={cx('upcoming-ribbon', UPCOMING_RIBBON)}>
              {coming}
            </span>
          )}
          {item.favorite && (
            <span
              className={cx(
                'poster-heart',
                POSTER_HEART,
                'absolute [text-shadow:0_0_3px_var(--bg)]',
              )}
              role="img"
              aria-label="Favorite"
            >
              ♥
            </span>
          )}
        </span>
        <span className={cx('poster-title', POSTER_TITLE)}>{item.title}</span>
      </Link>
      {run}
      <Rating rating={item.rating} className="block mt-[0.15rem] w-max" />
      {meta && <p className={cx('poster-meta muted', POSTER_META)}>{meta}</p>}
      {/* Only an admin row says it is private; a public row has no
          is_public at all. Never hover-only: it is the state, not a control. */}
      {item.is_public === false && (
        <p className={cx('poster-private', POSTER_PRIVATE)}>Private</p>
      )}
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
      className={cx('replay-mark', REPLAY_MARK, 'absolute bg-(--overlay)')}
      role="img"
      aria-label={`Finished ${count} times`}
    >
      ×{count}
    </span>
  )
}
