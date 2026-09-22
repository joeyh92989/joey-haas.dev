import { Link } from 'react-router'
import { STATUS_LABEL } from '../lib/shelf.js'
import CoverImage from './CoverImage.jsx'
import Stars from './Stars.jsx'

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
