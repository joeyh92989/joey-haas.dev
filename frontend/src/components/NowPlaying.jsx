import { useId } from 'react'
import { Link } from 'react-router'
import CoverImage from './CoverImage.jsx'
import { spine } from '../content/spine.js'
import { nowPlaying } from '../lib/nowPlaying.js'
import { dayWords } from '../lib/releaseWords.js'
import { btn } from './closetClasses.js'
import { cx } from '../lib/cx.js'
import {
  NOW_PLAYING,
  NOW_PLAYING_BODY,
  NOW_PLAYING_CARD,
  NOW_PLAYING_COVER,
  NOW_PLAYING_LIST,
  NOW_PLAYING_META,
  NOW_PLAYING_TITLE,
  NOW_PLAYING_WRAP,
  STAT_HEAD,
} from './overview-classes.js'

const copy = spine.nowPlaying

/**
 * The shelf's Now playing band: the games I am playing, up front, with a
 * large cover, the platform and when the current run began. The same
 * games stay in the grid; this is the one row about today.
 *
 * Renders nothing when nothing is being played, so there is no empty band.
 *
 * @param {object} props
 * @param {object[]} props.items - Shelf rows, public or admin.
 * @param {(item: object) => string} props.linkFor - Where a game links.
 * @param {(item: object) => void} [props.onWrapUp] - Admin only: renders a
 *   Wrap up button beside each card, a sibling of the link (shelf rule).
 */
export default function NowPlaying({ items, linkFor, onWrapUp }) {
  const headingId = useId()
  const rows = nowPlaying(items)
  if (rows.length === 0) return null
  return (
    <section
      className={cx('now-playing', NOW_PLAYING)}
      data-count={rows.length}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={STAT_HEAD}>
        {copy.heading}
      </h2>
      <ul className={cx('now-playing-list', NOW_PLAYING_LIST)}>
        {rows.map(({ item, since }) => (
          <li key={item.id}>
            <Link
              to={linkFor(item)}
              className={cx('now-playing-card', NOW_PLAYING_CARD)}
            >
              <span className={cx('now-playing-cover', NOW_PLAYING_COVER)}>
                <CoverImage src={item.cover_url} type={item.type} alt="" />
              </span>
              <span className={cx('now-playing-body', NOW_PLAYING_BODY)}>
                <span className={cx('now-playing-title', NOW_PLAYING_TITLE)}>
                  {item.title}
                </span>
                {item.platform && (
                  <span className={cx('now-playing-meta', NOW_PLAYING_META)}>
                    {item.platform}
                  </span>
                )}
                {since && (
                  <span className={cx('now-playing-meta', NOW_PLAYING_META)}>
                    {copy.since} {dayWords(since)}
                  </span>
                )}
              </span>
            </Link>
            {onWrapUp && (
              <button
                type="button"
                className={cx(
                  btn('plain', 'sm'),
                  'now-playing-wrap',
                  NOW_PLAYING_WRAP,
                )}
                onClick={() => onWrapUp(item)}
              >
                {copy.wrapUp}
                <span className="visually-hidden">: {item.title}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
