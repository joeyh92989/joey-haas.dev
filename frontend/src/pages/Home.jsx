import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import CoverStrip from '../components/CoverStrip.jsx'
import FactsTable from '../components/FactsTable.jsx'
import Kicker from '../components/Kicker.jsx'
import { homeExperience } from '../content/experience.js'
import { posts } from '../content/posts.js'
import { profile } from '../content/profile.js'
import { projects } from '../content/projects.js'
import { spine } from '../content/spine.js'
import { nowLists } from '../lib/nowLists.js'
import { readSnapshot } from '../lib/snapshot.js'
import { usePageTitle } from '../lib/usePageTitle.js'

const SHORT_DAY = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const thisSite = projects.find((project) => project.url === profile.repo)

/** "How Spine works · Oct 2" for the newest post, or null without one. */
function lastShipped(post) {
  if (!post) return null
  const [year, month, day] = post.frontmatter.date.split('-').map(Number)
  const date = SHORT_DAY.format(new Date(Date.UTC(year, month - 1, day)))
  return `${post.frontmatter.title} · ${date}`
}

/**
 * Landing page: the hero with its facts table, three work cards and a short
 * work history.
 *
 * Makes no API call. Playing comes from the build-time snapshot and is
 * left out until it arrives, or when nothing is being played; Last shipped
 * is the newest post and is left out while there is none.
 */
export default function Home() {
  usePageTitle('Joey Haas — Senior software engineer, Denver')
  const [latest] = posts
  const [playing, setPlaying] = useState([])

  useEffect(() => {
    let cancelled = false
    readSnapshot('items').then((items) => {
      if (!cancelled && items) setPlaying(nowLists(items).playing)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const shipped = lastShipped(latest)
  const facts = [
    ...profile.facts,
    ...(shipped ? [{ label: 'Last shipped', value: shipped }] : []),
    ...(playing.length > 0
      ? [
          {
            label: 'Playing',
            value: playing.map((item) => item.title).join(' · '),
          },
        ]
      : []),
  ]
  const { lead, accent } = profile.headline

  return (
    <>
      <section className="hero">
        <div>
          <Kicker>{profile.tagline}</Kicker>
          {/* Read once, as a sentence: the italic phrase is a visual split
              that would otherwise be announced as emphasis. */}
          <h1 className="hero-title">
            <span className="visually-hidden">{`${lead} ${accent}`}</span>
            <span aria-hidden="true">
              {lead} <em>{accent}</em>
            </span>
          </h1>
          <p className="hero-lede">{profile.lede}</p>
          <div className="hero-actions">
            <Link to="/about" className="btn primary">
              About me
            </Link>
            <Link to={spine.path} className="btn">
              See {spine.name}
            </Link>
            <a href={profile.github} className="btn ghost">
              GitHub <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <FactsTable rows={facts} />
      </section>

      <section className="home-section" aria-labelledby="home-work">
        <div className="section-head">
          <h2 id="home-work">Work</h2>
          <Link to="/projects">
            All projects <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="card-grid">
          <Link to={spine.path} className="card">
            <Kicker as="span">Project · live</Kicker>
            <h3>{spine.name}</h3>
            <p>{spine.homeLine}</p>
            <CoverStrip />
          </Link>
          <Link to="/colophon" className="card">
            <Kicker as="span">Project · this site</Kicker>
            <h3>joey-haas.dev</h3>
            <p>{thisSite.summary}</p>
          </Link>
          {latest && (
            <Link to={`/blog/${latest.slug}`} className="card">
              <Kicker as="span">Writing</Kicker>
              <h3>{latest.frontmatter.title}</h3>
              {latest.frontmatter.summary && (
                <p>{latest.frontmatter.summary}</p>
              )}
            </Link>
          )}
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-experience">
        <div className="section-head">
          <h2 id="home-experience">Experience</h2>
          <a href="/resume.pdf">
            Full resume (PDF) <span aria-hidden="true">→</span>
          </a>
        </div>
        <ul className="row-list" role="list">
          {homeExperience().map((row) => (
            <li key={row.key}>
              <Kicker as="span">{row.dates}</Kicker>
              <div>
                <h3>{row.title}</h3>
                <p>{row.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
