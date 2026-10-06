import { Link } from 'react-router'
import { usePageTitle } from '../lib/usePageTitle.js'

/**
 * Client-side 404. The static host serves index.html for unknown paths (see
 * the rewrite rule in render.yaml), so this component is what the visitor
 * actually sees.
 */
export default function NotFound() {
  usePageTitle('Not found · Joey Haas')
  return (
    <section>
      <h1>Not found</h1>
      <p className="prose muted">That page does not exist.</p>
      <p className="prose">
        <Link to="/">Back home</Link>
      </p>
    </section>
  )
}
