import { Link } from 'react-router'
import { spine } from '../content/spine.js'

const copy = spine.how

/**
 * The tour's contents: every stop, its title and where it lives. Router
 * links to the hash, so useHashFocus sees the change and moves focus.
 */
export default function StopIndex() {
  return (
    <nav className="tour-toc" aria-label={copy.tocLabel}>
      <ol>
        {copy.stops.map((stop) => (
          <li key={stop.n}>
            <Link to={`#stop-${stop.n}`}>
              <span className="tour-toc-n" aria-hidden="true">
                {String(stop.n).padStart(2, '0')}
              </span>
              <span className="tour-toc-title">{stop.title}</span>
              <span className="tour-toc-where">{stop.where}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
