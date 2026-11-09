import { Link } from 'react-router'
import { profile } from '../content/profile.js'
import { loginUrl } from '../lib/api.js'

/**
 * The site footer: a credit line and the contact links, at the two ends of
 * one row on a desktop and stacked on a phone. The LinkedIn link renders
 * only when a URL has been supplied.
 *
 * @param {object} props
 * @param {boolean} props.signedIn Whether the admin session check passed.
 * @param {boolean} [props.hasNotes] Whether a TIL note is published; the
 *   link waits for one, as the masthead's Blog item waits for a post.
 * @param {boolean} [props.hasTrips] Whether a trip is published, likewise.
 */
export default function SiteFooter({
  signedIn,
  hasNotes = false,
  hasTrips = false,
}) {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer-row">
        <p className="footer-credit">
          &copy; {new Date().getFullYear()} {profile.name} &middot;{' '}
          <a href={profile.repo}>Source</a> &middot; <Link to="/now">Now</Link>{' '}
          &middot; <Link to="/daily">Daily</Link>{' '}
          {hasNotes && (
            <>
              &middot; <Link to="/til">TIL</Link>{' '}
            </>
          )}
          {hasTrips && (
            <>
              &middot; <Link to="/travel">Travel</Link>{' '}
            </>
          )}
          &middot; <Link to="/colophon">Colophon</Link> &middot;{' '}
          <Link to="/stats">Stats</Link>
        </p>
        <p className="footer-links">
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          {' · '}
          <a href={profile.github}>GitHub</a>
          {profile.linkedin && (
            <>
              {' · '}
              <a href={profile.linkedin}>LinkedIn</a>
            </>
          )}
          {' · '}
          {/* Replaces having to know the /admin URL. Deliberately understated:
              it is a door for one person, not a call to action. */}
          {signedIn ? (
            <Link to="/admin" className="footer-admin">
              Admin
            </Link>
          ) : (
            <a href={loginUrl} className="footer-admin">
              Sign in
            </a>
          )}
        </p>
      </div>
    </footer>
  )
}
