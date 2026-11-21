import { spine } from '../content/spine.js'
import { STATUS_LABEL } from '../lib/shelf.js'
import { cx } from '../lib/cx.js'
import { POSTER_HEART, REPLAY_MARK, STATUS_MARK } from './shelf-classes.js'

const copy = spine.shelf.key

/** The statuses that mark a cover; the backlog has no mark. */
const MARKED = ['active', 'paused', 'finished', 'abandoned']

/**
 * A one-line key to the marks on shelf covers, drawn with the covers' own
 * CSS (`status-mark`, `replay-mark`, `poster-heart`) made static, so a
 * change to a mark changes its key. The marks are decoration beside their
 * names, so they are hidden from assistive tech; the names carry the key.
 *
 * @param {object} props
 * @param {boolean} [props.statuses] - Draw the status marks and the backlog
 *   line (the default). Off where the cards say their status in words.
 * @param {import('react').ReactNode} [props.children] - Extra entries, as `<li>`s.
 */
export default function CoverKey({ statuses = true, children }) {
  return (
    <ul
      className="cover-key m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 text-(--text-3) [font-size:var(--fs-12)] [section>&]:mt-1 [section>&]:mb-3 [&>li]:flex [&>li]:items-center [&>li]:gap-1 [&>li]:whitespace-nowrap"
      aria-label={copy.aria}
    >
      <li className="key-h font-medium text-(--text-2)">{copy.label}</li>
      {(statuses ? MARKED : []).map((status) => (
        <li key={status}>
          <i
            className={cx('status-mark', STATUS_MARK, 'static')}
            data-status={status}
            aria-hidden="true"
          />
          {STATUS_LABEL[status]}
        </li>
      ))}
      <li>
        <span
          className={cx('replay-mark', REPLAY_MARK, 'static bg-(--sunken)')}
          aria-hidden="true"
        >
          ×2
        </span>
        {copy.finishedTwice}
      </li>
      <li>
        <span
          className={cx('poster-heart', POSTER_HEART, 'static')}
          aria-hidden="true"
        >
          ♥
        </span>
        {copy.favorite}
      </li>
      {statuses && <li className="key-none">{copy.backlog}</li>}
      {children}
    </ul>
  )
}
