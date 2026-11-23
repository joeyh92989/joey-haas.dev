import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { TOUR_TOC, TOUR_TOC_N, TOUR_TOC_WHERE } from './tourClasses.js'

const copy = spine.how

/**
 * The tour's contents: every stop, its title and where it lives. Router
 * links to the hash, so useHashFocus sees the change and moves focus.
 */
export default function StopIndex() {
  return (
    <nav className={`tour-toc ${TOUR_TOC}`} aria-label={copy.tocLabel}>
      <ol>
        {copy.stops.map((stop) => (
          <li key={stop.n}>
            <Link to={`#stop-${stop.n}`}>
              <span className={`tour-toc-n ${TOUR_TOC_N}`} aria-hidden="true">
                {String(stop.n).padStart(2, '0')}
              </span>
              <span className="tour-toc-title">{stop.title}</span>
              <span className={`tour-toc-where ${TOUR_TOC_WHERE}`}>
                {stop.where}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
