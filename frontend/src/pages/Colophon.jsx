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
          <a href="/feed.xml">RSS feed</a>. Short notes go to{' '}
          <Link to="/til">TIL</Link>, which has{' '}
          <a href="/til/feed.xml">its own feed</a>.
        </li>
      </ul>

      <h2>Backend</h2>
      <ul className="prose-list">
        <li>
          FastAPI on Python 3.12, with Postgres 18 on Neon. Migrations are
          additive and applied when a pull request merges. The API won&rsquo;t
          boot if the database is behind one.
        </li>
        <li>
          <Link to={spine.path}>{spine.name}</Link> reads game metadata from
          IGDB and comic metadata from Comic Vine. Gemini reads titles from
          shelf photos and writes Discover&rsquo;s picks, answering only with
          games from a list it&rsquo;s given.
        </li>
        <li>
          A nightly GitHub Actions job refreshes comics and the physical release
          catalog, then redeploys the site when the collection has changed, so
          its snapshot stays current. Tonight&rsquo;s picks are worked out live
          from the shelf, not by the job.
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

      <h2 id="accessibility">Accessibility</h2>
      <p className="prose">
        I haven&rsquo;t had the site audited, and I don&rsquo;t claim a
        conformance level. What I test:
      </p>
      <ul className="prose-list">
        <li>
          Every pull request runs axe (WCAG 2 A and AA rules) in a real browser
          against the built site, in both themes. A new serious violation fails
          the build, and known ones are listed with an issue number.
        </li>
        <li>
          Every page starts with a skip link, and search opens from the
          keyboard. Dialogs are native, move focus in and back out, and close
          with Escape.
        </li>
        <li>
          Text and status colors are chosen on measured contrast, and the ratios
          are recorded beside the tokens in the stylesheet.
        </li>
      </ul>
      <p className="prose">
        If something doesn&rsquo;t work for you, email{' '}
        <a href={`mailto:${profile.email}`}>{profile.email}</a> with the page
        and what happened, and I&rsquo;ll fix it.
      </p>

      <h2 id="docs">Docs and decisions</h2>
      <ul className="prose-list">
        <li>
          <a href={`${profile.repo}/blob/main/docs/design-system.md`}>
            Design system
          </a>
          : the rules every page follows.
        </li>
        <li>
          <a href={`${profile.repo}/blob/main/docs/learnings.md`}>Learnings</a>:
          dated lessons and decisions, with the pull requests behind them.
        </li>
        <li>
          <a href={`${profile.repo}/tree/main/docs/planning`}>
            Specs and plans
          </a>
          : one design doc and plan for each feature.
        </li>
      </ul>
    </section>
  )
}
