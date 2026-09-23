import { Link } from 'react-router'
import { STATUS_LABEL } from '../lib/shelf.js'
import { localToday } from '../lib/statusTransition.js'
import CoverImage from './CoverImage.jsx'
import Stars from './Stars.jsx'

const SWITCH_2_ID = 508
const SWITCH_2_NAME = 'Nintendo Switch 2'

const MONTH_YEAR = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

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
 * Nothing is revealed only on hover: the title, stars, year and creator are
 * always visible, and the marks are named images.
 *
 * @param {object} props
 * @param {object} props.item - A shelf row.
 * @param {string} props.to - Where the card links; the page decides.
 * @param {(item: object) => import('react').ReactNode} [props.actions] -
 *   Optional controls rendered beside the link.
 * @param {boolean} [props.dimmed] - Fade the card (finished and abandoned).
 */
export default function PosterCard({ item, to, actions, dimmed = false }) {
  const meta = [item.year, item.creator].filter(Boolean).join(' · ')
  const mark = formatMark(item)
  const coming = upcoming(item)

  return (
    <div className="poster-card" data-dimmed={dimmed || undefined}>
      <Link to={to} className="poster-link">
        <span className="poster-art">
          <CoverImage src={item.cover_url} type={item.type} alt="" />
          {/* Backlog gets no mark: its absence is the signal. */}
          {item.status !== 'backlog' && STATUS_LABEL[item.status] && (
            <span
              className="status-mark"
              data-status={item.status}
              role="img"
              aria-label={STATUS_LABEL[item.status]}
            />
          )}
          {mark && (
            <span className="format-mark" role="img" aria-label={mark}>
              {mark === 'Format not recorded' ? '?' : <KeyGlyph />}
            </span>
          )}
          {coming && <span className="upcoming-ribbon">{coming}</span>}
          {item.favorite && (
            <span className="poster-heart" role="img" aria-label="Favourite">
              ♥
            </span>
          )}
        </span>
        <span className="poster-title">{item.title}</span>
      </Link>
      <Stars rating={item.rating} />
      {meta && <p className="poster-meta muted">{meta}</p>}
      {actions && <div className="poster-actions">{actions(item)}</div>}
    </div>
  )
}
