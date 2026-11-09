import { useId } from 'react'
import { Link } from 'react-router'
import CoverImage from './CoverImage.jsx'
import { spine } from '../content/spine.js'
import { nowPlaying } from '../lib/nowPlaying.js'
import { dayWords } from '../lib/releaseWords.js'

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
      className="now-playing"
      data-count={rows.length}
      aria-labelledby={headingId}
    >
      <h2 id={headingId}>{copy.heading}</h2>
      <ul className="now-playing-list">
        {rows.map(({ item, since }) => (
          <li key={item.id}>
            <Link to={linkFor(item)} className="now-playing-card">
              <span className="now-playing-cover">
                <CoverImage src={item.cover_url} type={item.type} alt="" />
              </span>
              <span className="now-playing-body">
                <span className="now-playing-title">{item.title}</span>
                {item.platform && (
                  <span className="now-playing-meta">{item.platform}</span>
                )}
                {since && (
                  <span className="now-playing-meta">
                    {copy.since} {dayWords(since)}
                  </span>
                )}
              </span>
            </Link>
            {onWrapUp && (
              <button
                type="button"
                className="btn sm now-playing-wrap"
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
