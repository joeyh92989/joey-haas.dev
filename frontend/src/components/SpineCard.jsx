import { Link } from 'react-router'
import { cx } from '../lib/cx.js'
import { statusLabel } from '../lib/shelf.js'
import StatusMark from './StatusMark.jsx'
import {
  LONG_TITLE,
  LONGEST_TITLE,
  SPINE_LINK,
  SPINE_RAIL,
  SPINE_TITLE,
  SPINE_TITLE_LONG,
  SPINE_TITLE_LONGEST,
  SPINE_TITLE_USUAL,
} from './shelf-classes.js'

/**
 * One spine on the shelf's spine view (3b2): an upright label standing on a
 * rail. A link to the item; the title is the link's name, the status is a
 * visually hidden word beside the mark (the mark is drawn, never the only
 * carrier), and the catalogue number and year are decoration around them.
 * It draws from the same item shape as `PosterCard`, so the two views read
 * one list.
 *
 * Eager-safe like PosterCard (the Now page reaches this folder): `cx`, no
 * `cn`, no `ui/*`.
 *
 * @param {object} props
 * @param {object} props.item - A shelf row (the shape PosterCard takes).
 * @param {string} props.to - Where the spine links.
 * @param {number} props.number - The catalogue number.
 * @param {Record<string, string>} [props.statusLabels] - Names for the
 *   statuses; comics pass their own (Reading, Read).
 */
export default function SpineCard({ item, to, number, statusLabels }) {
  const word = statusLabels
    ? (item.caught_up && statusLabels.caughtUp) || statusLabels[item.status]
    : statusLabel(item.status, item.type)
  return (
    <div className={SPINE_RAIL}>
      <Link to={to} className={cx('shelf-spine', SPINE_LINK)}>
        <span
          aria-hidden="true"
          className="w-full border-b border-line-card py-2 text-center font-mono text-xs"
        >
          {String(number).padStart(3, '0')}
        </span>
        <span
          className={cx(
            SPINE_TITLE,
            item.title.length > LONGEST_TITLE
              ? SPINE_TITLE_LONGEST
              : item.title.length > LONG_TITLE
                ? SPINE_TITLE_LONG
                : SPINE_TITLE_USUAL,
          )}
        >
          {item.title}
        </span>{' '}
        {item.year ? (
          <span className="h-4 font-mono text-xs text-muted-foreground">
            {item.year}
          </span>
        ) : null}{' '}
        <span className="flex w-full justify-center pt-2 pb-2.5">
          <StatusMark status={item.status === 'active' ? 'live' : item.status}>
            <span className="sr-only">{word}</span>
          </StatusMark>
        </span>
      </Link>
    </div>
  )
}
