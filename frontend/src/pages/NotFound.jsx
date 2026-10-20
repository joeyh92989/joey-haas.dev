import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { usePageTitle } from '../lib/usePageTitle.js'

/**
 * Client-side 404. The static host serves index.html for unknown paths (see
 * the rewrite rule in render.yaml), so this component is what the visitor
 * actually sees. It offers two ways out rather than a dead end.
 */
export default function NotFound() {
  usePageTitle('Not found · Joey Haas')
  return (
    <section>
      <h1>Not found</h1>
      <p className="prose">
        That page doesn&rsquo;t exist. Try{' '}
        <Link to={spine.path}>the shelf</Link>, or <Link to="/">go home</Link>.
      </p>
    </section>
  )
}
