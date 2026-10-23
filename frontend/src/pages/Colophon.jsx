import { Link } from 'react-router'
import { profile } from '../content/profile.js'
import { spine } from '../content/spine.js'
import { usePageTitle } from '../lib/usePageTitle.js'

/**
 * How the site is made. Every line is a fact about this repository; a change
 * to the stack should change this page in the same pull request.
 */
export default function Colophon() {
  usePageTitle('Colophon · Joey Haas')

  return (
    <section className="colophon">
      <h1>Colophon</h1>
      <p className="prose">
        How this site is built, for anyone curious. The whole thing is open:{' '}
        <a href={profile.repo}>the source is on GitHub</a>.
      </p>

      <h2>Frontend</h2>
      <ul className="prose-list">
        <li>
          React 19 and Vite, routed with React Router. Plain CSS with design
          tokens; no CSS framework.
        </li>
        <li>
          Set in Inter, JetBrains Mono, and Source Serif 4, self-hosted rather
          than loaded from a font service.
        </li>
        <li>
          Dark by default, with a light theme one click away. Shiki renders code
          highlighting at build time in both themes. Code colors and the
          shelf&rsquo;s status colors were chosen by measured contrast.
        </li>
        <li>
          Blog posts are Markdown, compiled at build time. Each page is
          prerendered with its own title and link preview, and there&rsquo;s an{' '}
          <a href="/feed.xml">RSS feed</a>.
        </li>
      </ul>

      <h2>Backend</h2>
      <ul className="prose-list">
        <li>
          FastAPI on Python 3.12, with Postgres 18 on Neon. Migrations are
          additive and applied by hand. The API won&rsquo;t boot if the database
          is behind one.
        </li>
        <li>
          <Link to={spine.path}>{spine.name}</Link> reads game metadata from
          IGDB, and film and comic metadata from TMDB and Comic Vine. Gemini
          reads titles from shelf photos and writes Discover&rsquo;s picks,
          answering only with games from a list it&rsquo;s given.
        </li>
        <li>
          A nightly GitHub Actions job refreshes the picks and the physical
          release catalog, then redeploys the site when the collection has
          changed, so its snapshot stays current.
        </li>
      </ul>

      <h2>Hosting</h2>
      <ul className="prose-list">
        <li>
          Render&rsquo;s free tier: a static site and a web service that sleeps
          when idle. Public pages load from a build-time snapshot, so nothing
          waits for the service to wake up.
        </li>
        <li>Admin sign-in is Google OAuth, allowlisted to one account.</li>
        <li>
          A cookie-free beacon counts page views. Nothing goes to a third party,
          and signed-in visits are excluded.
        </li>
      </ul>
    </section>
  )
}
