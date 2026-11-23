import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { releaseWords } from '../lib/releaseWords.js'
import CoverImage from './CoverImage.jsx'
import { itemRowPath } from '../lib/spinePaths.js'
import {
  NEXT_BADGES,
  NEXT_ROW,
  NEXT_ROW_ACTIONS,
  NEXT_ROW_COVER,
  NEXT_ROW_LINK,
  NEXT_ROW_REASONS,
  NEXT_ROW_TEXT,
  NEXT_ROW_TITLE,
  nextBadge,
} from './tonightClasses.js'

const MAX_REASONS = 2

function metaLine(row, section) {
  if (row.type === 'comic') {
    return [spine.next.comics.kind, spine.comics.formats[row.shelf_format]]
      .filter(Boolean)
      .join(' · ')
  }
  const format =
    row.lane === 'digital' ||
    (section === 'not_on_cartridge' && !row.physical_format)
      ? spine.next.digitalOnly
      : (spine.next.formats[row.physical_format] ?? spine.next.formatUnknown)
  const parts = [row.platform, format]
  if (row.release_date) {
    const when = releaseWords(row)
    parts.push(section === 'preorders' ? `${spine.next.outOn} ${when}` : when)
  }
  return parts.filter(Boolean).join(' · ')
}

/**
 * One game on What's next or the store list: cover, title, platform ·
 * format · date, up to two reasons, and the badges: Top pick sits on the
 * title's line, New under the meta line. A
 * comic want reads "Comic · Trades" instead: it has no platform or
 * cartridge format. The
 * title links to the item page for a wanted game, else to IGDB.
 *
 * `actions` and `extra` (the admin's buttons and store lines) render as
 * siblings of the link, never inside it.
 *
 * @param {object} props
 * @param {object} props.row - A PublicNextRow or an admin store-list row.
 * @param {string} props.section - The server section key.
 * @param {boolean} [props.showTopPick] - Draw the Top pick badge when the row
 *   has one; the page turns it off past its first few (the data is unchanged).
 * @param {import('react').ReactNode} [props.actions]
 * @param {import('react').ReactNode} [props.extra]
 */
export default function NextRow({
  row,
  section,
  showTopPick = true,
  actions,
  extra,
}) {
  const topPick = showTopPick && row.top_pick
  const body = (
    <>
      <span className={`next-row-cover ${NEXT_ROW_COVER}`}>
        <CoverImage
          src={row.cover_url}
          type={row.type === 'comic' ? 'comic' : 'game'}
          alt=""
        />
      </span>
      <span className={`next-row-title ${NEXT_ROW_TITLE}`}>
        {row.title}{' '}
        {topPick && (
          <span
            className={`next-badge next-badge-pick next-badge-inline ${nextBadge({ pick: true, inline: true })}`}
          >
            {spine.next.badges.topPick}
          </span>
        )}
      </span>
    </>
  )
  const link = row.item_id ? (
    <Link to={itemRowPath(row)} className={`next-row-link ${NEXT_ROW_LINK}`}>
      {body}
    </Link>
  ) : row.igdb_url ? (
    <a
      href={row.igdb_url}
      className={`next-row-link ${NEXT_ROW_LINK}`}
      rel="noreferrer noopener"
    >
      {body}
    </a>
  ) : (
    <span className={`next-row-link ${NEXT_ROW_LINK}`}>{body}</span>
  )
  const reasons = (row.reasons ?? []).slice(0, MAX_REASONS)
  return (
    <li className={`next-row ${NEXT_ROW}`}>
      {link}
      <div className={`next-row-text ${NEXT_ROW_TEXT}`}>
        <span className="muted">{metaLine(row, section)}</span>
        {row.new && (
          <span className={`next-badges ${NEXT_BADGES}`}>
            <span className={`next-badge ${nextBadge()}`}>
              {spine.next.badges.new}
            </span>
          </span>
        )}
        {reasons.length > 0 && (
          <ul className={`next-row-reasons ${NEXT_ROW_REASONS}`}>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {extra}
      </div>
      {actions && (
        <div className={`next-row-actions ${NEXT_ROW_ACTIONS}`}>{actions}</div>
      )}
    </li>
  )
}
