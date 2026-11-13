import { spine } from '../content/spine.js'
import { STATUS_LABEL } from '../lib/shelf.js'

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
 * @param {import('react').ReactNode} [props.children] - Extra entries, as `<li>`s.
 */
export default function CoverKey({ children }) {
  return (
    <ul className="cover-key" aria-label={copy.aria}>
      <li className="key-h">{copy.label}</li>
      {MARKED.map((status) => (
        <li key={status}>
          <i className="status-mark" data-status={status} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </li>
      ))}
      <li>
        <span className="replay-mark" aria-hidden="true">
          ×2
        </span>
        {copy.finishedTwice}
      </li>
      <li>
        <span className="poster-heart" aria-hidden="true">
          ♥
        </span>
        {copy.favorite}
      </li>
      <li className="key-none">{copy.backlog}</li>
      {children}
    </ul>
  )
}
