import { Link } from 'react-router'
import { posts } from '../content/posts.js'

/**
 * Landing page: a greeting, a short introduction, and two ways onward.
 *
 * The introduction is JSX rather than a string in content/profile.js because it
 * carries markup — one word is set in the display serif to pull it out of the
 * sans paragraph. Storing that as segments to reassemble would be more code for
 * the same sentence.
 */
export default function Home() {
  const [latest] = posts

  return (
    <section>
      <h1 className="greeting">Hi, I&rsquo;m Joey.</h1>

      <p className="intro">
        I&rsquo;m a senior software engineer at Guild, building the payments and
        benefits systems behind employer education benefits. Eight years as a
        product manager first &mdash; so I care as much about <em>why</em> we
        build things as how.
      </p>

      <div className="link-cards">
        <Link className="link-card" to="/about">
          <span className="link-card-title">More about me</span>
          <span className="link-card-arrow"> &rarr;</span>
          <span className="link-card-sub">
            The PM-to-engineer story, plus the resume.
          </span>
        </Link>
        <Link className="link-card" to="/projects">
          <span className="link-card-title">See my work</span>
          <span className="link-card-arrow"> &rarr;</span>
          <span className="link-card-sub">
            Projects, including this very site.
          </span>
        </Link>
      </div>

      {latest && (
        <Link className="latest-post" to={`/blog/${latest.slug}`}>
          <span className="latest-kicker">Latest</span>
          <span className="latest-title">{latest.frontmatter.title}</span>
        </Link>
      )}
    </section>
  )
}
