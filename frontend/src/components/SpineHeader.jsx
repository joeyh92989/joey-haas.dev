import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import SpineTabs from './SpineTabs.jsx'

/**
 * Spine's one header block, shared by /spine and /spine/next so the
 * sub-page is recognisably the same thing (Spine Next spec, C17): the name
 * at display size, the tagline, the tab row and a hairline rule. The name is
 * the page's h1 on the shelf; elsewhere it links back, and the page supplies
 * its own h1 below, so each page has exactly one.
 *
 * @param {object} props
 * @param {boolean} [props.asLink] - Render the name as a link to /spine.
 */
export default function SpineHeader({ asLink = false }) {
  return (
    <div className="spine-header">
      {asLink ? (
        <p className="spine-name">
          <Link to={spine.path}>{spine.name}</Link>
        </p>
      ) : (
        <h1 className="spine-name">{spine.name}</h1>
      )}
      <p className="spine-lede">{spine.tagline}</p>
      <SpineTabs />
    </div>
  )
}
