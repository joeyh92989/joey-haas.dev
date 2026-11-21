import { Link } from 'react-router'
import { profile } from '../content/profile.js'
import { loginUrl } from '../lib/api.js'
import { cx } from '../lib/cx.js'

/**
 * The footer's two lines: no margin of their own, and links that sit in a row,
 * not a sentence, so WCAG 2.5.8 applies: 24px high (#477). The line box
 * carries it, so the separators stay where they are.
 */
const FOOTER_P =
  'm-0 [&_a]:inline-block [&_a]:leading-6 [&_a]:text-foreground [&_a]:decoration-primary'

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
 * @param {boolean} [props.hasSpots] Whether /denver has a spot to show. True
 *   unless the build's snapshot says otherwise (`lib/snapshotPresence.js`).
 */
export default function SiteFooter({
  signedIn,
  hasNotes = false,
  hasTrips = false,
  hasSpots = true,
}) {
  return (
    <footer className="site-footer mt-12 border-t border-border pt-6 pb-8 text-[0.8125rem]">
      <div className="wrap flex flex-wrap justify-between gap-x-4 gap-y-2 max-[700px]:flex-col max-[700px]:gap-2">
        <p className={cx('footer-credit', FOOTER_P)}>
          &copy; {new Date().getFullYear()} {profile.name} &middot;{' '}
          <a href={profile.repo}>Source</a> &middot; <Link to="/now">Now</Link>{' '}
          &middot; <Link to="/daily">Daily game</Link>{' '}
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
          {hasSpots && (
            <>
              &middot; <Link to="/denver">Denver</Link>{' '}
            </>
          )}
          &middot; <Link to="/colophon">Colophon</Link> &middot;{' '}
          <Link to="/stats">Stats</Link> &middot; <a href="/feed.xml">RSS</a>
        </p>
        <p className={FOOTER_P}>
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
