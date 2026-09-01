import { Link } from 'react-router'

/**
 * Client-side 404. The static host serves index.html for unknown paths (see
 * the rewrite rule in render.yaml), so this component is what the visitor
 * actually sees.
 */
export default function NotFound() {
  return (
    <section>
      <h2>Not found</h2>
      <p className="prose muted">That page does not exist.</p>
      <p className="prose">
        <Link to="/">Back home</Link>
      </p>
    </section>
  )
}
