import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { releaseWords } from '../pages/AdminRadar.jsx'
import CoverImage from './CoverImage.jsx'

/** As a meta line starts; mirrors FORMAT_WORDS in physical_sources/limits.py. */
export const FORMAT_WORDS = {
  game_card: 'Full game on cartridge',
  game_key_card: 'Game-Key Card',
  code_in_box: 'Code in a box',
  disc: 'Disc',
}

const MAX_REASONS = 2

function metaLine(row, section) {
  const format =
    row.lane === 'digital' ||
    (section === 'not_on_cartridge' && !row.physical_format)
      ? 'Digital only'
      : (FORMAT_WORDS[row.physical_format] ?? 'Format unknown')
  const parts = [row.platform, format]
  if (row.release_date) {
    const when = releaseWords(row)
    parts.push(section === 'preorders' ? `${spine.next.outOn} ${when}` : when)
  }
  return parts.filter(Boolean).join(' · ')
}

/**
 * One game on What's next or the store list: cover, title, platform ·
 * format · date, up to two reasons, and the New and Top pick badges. The
 * title links to the item page for a wanted game, else to IGDB.
 *
 * `actions` and `extra` (the admin's buttons and store lines) render as
 * siblings of the link, never inside it.
 *
 * @param {object} props
 * @param {object} props.row - A PublicNextRow or an admin store-list row.
 * @param {string} props.section - The server section key.
 * @param {import('react').ReactNode} [props.actions]
 * @param {import('react').ReactNode} [props.extra]
 */
export default function NextRow({ row, section, actions, extra }) {
  const body = (
    <>
      <span className="next-row-cover">
        <CoverImage src={row.cover_url} type="game" alt="" />
      </span>
      <span className="next-row-title">{row.title}</span>
    </>
  )
  const link = row.item_id ? (
    <Link to={`/spine/${row.item_id}`} className="next-row-link">
      {body}
    </Link>
  ) : row.igdb_url ? (
    <a href={row.igdb_url} className="next-row-link" rel="noreferrer noopener">
      {body}
    </a>
  ) : (
    <span className="next-row-link">{body}</span>
  )
  const reasons = (row.reasons ?? []).slice(0, MAX_REASONS)
  return (
    <li className="next-row">
      {link}
      <div className="next-row-text">
        <span className="muted">{metaLine(row, section)}</span>
        {(row.new || row.top_pick) && (
          <span className="next-badges">
            {row.new && (
              <span className="next-badge">{spine.next.badges.new}</span>
            )}
            {row.top_pick && (
              <span className="next-badge next-badge-pick">
                {spine.next.badges.topPick}
              </span>
            )}
          </span>
        )}
        {reasons.length > 0 && (
          <ul className="next-row-reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {extra}
      </div>
      {actions && <div className="next-row-actions">{actions}</div>}
    </li>
  )
}
