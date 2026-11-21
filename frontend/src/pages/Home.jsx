import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import ContactLine from '../components/ContactLine.jsx'
import CoverStrip from '../components/CoverStrip.jsx'
import Kicker from '../components/Kicker.jsx'
import RecordCard from '../components/RecordCard.jsx'
import StatusMark from '../components/StatusMark.jsx'
import { buttonVariants } from '../components/ui/button-variants.js'
import { homeExperience } from '../content/experience.js'
import { CHANGELOG } from '../content/changelog.js'
import { posts } from '../content/posts.js'
import { profile } from '../content/profile.js'
import { projects } from '../content/projects.js'
import { spine } from '../content/spine.js'
import { trips } from '../content/trips.js'
import { nowLists } from '../lib/nowLists.js'
import { readSnapshot } from '../lib/snapshot.js'
import { tripMonth } from '../lib/tripDates.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { DAY as SHORT_DAY } from '../lib/formatDate.js'

/** A hero action: the shadcn button's look from `button-variants.js` (cva
 *  only), put on a plain link, so the eager Home takes no Base UI. Full width
 *  of its grid cell, so the six sit in even rows. */
const action = (variant) =>
  `${buttonVariants({ variant })} w-full max-[700px]:min-h-11`

const SECTION = 'pt-14 max-[700px]:pt-10'
const SECTION_HEAD =
  'section-head mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-foreground pb-2'
const SECTION_TITLE = 'm-0 font-heading text-2xl font-medium'

const thisSite = projects.find((project) => project.url === profile.repo)

/** "Nov 12" for the newest changelog entry, linking to the changes. */
function lastShipped(entry) {
  if (!entry) return null
  return (
    <Link to="/stats#changes">
      {SHORT_DAY.format(new Date(`${entry.date}T00:00:00Z`))}
    </Link>
  )
}

/**
 * Landing page: the hero with its facts table, three work cards and a short
 * work history.
 *
 * Makes no API call. Playing comes from the build-time snapshot and is
 * left out until it arrives, or when nothing is being played. Last shipped
 * is the date of the newest changelog entry, linking to the changes, and is
 * left out while there is none, as Latest trip and the Travel card are while
 * no trip is published.
 */
export default function Home() {
  usePageTitle('Joey Haas · Senior software engineer, Denver')
  const [latest] = posts
  const [latestTrip] = trips
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

  const records = [
    {
      to: spine.path,
      label: (
        <>
          Project · <StatusMark status="live">live</StatusMark>
        </>
      ),
      title: spine.name,
      summary: spine.homeLine,
      covers: true,
    },
    {
      to: '/colophon',
      label: 'Project',
      title: 'This site',
      summary: thisSite.summary,
    },
    ...(latest
      ? [
          {
            to: `/blog/${latest.slug}`,
            label: 'Blog',
            title: latest.frontmatter.title,
            summary: latest.frontmatter.summary,
          },
        ]
      : []),
    ...(latestTrip
      ? [
          {
            to: `/travel/${latestTrip.slug}`,
            label: 'Travel',
            title: latestTrip.frontmatter.title,
            summary: latestTrip.frontmatter.summary,
          },
        ]
      : []),
  ]
  const shipped = lastShipped(CHANGELOG[0])
  const facts = [
    ...profile.facts,
    ...(shipped ? [{ label: 'Last shipped', value: shipped }] : []),
    ...(latestTrip
      ? [
          {
            label: 'Latest trip',
            value: `${latestTrip.frontmatter.title} · ${tripMonth(latestTrip.frontmatter)}`,
          },
        ]
      : []),
    ...(playing.length > 0
      ? [
          {
            label: 'Playing',
            value: playing.map((item) => item.title).join(' · '),
          },
        ]
      : []),
  ]

  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <div>
          <Kicker className="text-sm tracking-normal text-muted-foreground normal-case">
            {profile.tagline}
          </Kicker>
          <h1 id="home-title" className="hero-title max-w-none">
            {profile.name}
          </h1>
          <p className="mt-2 font-heading text-[length:var(--fs-28)] leading-[1.2] font-medium tracking-[-0.01em] text-balance text-foreground max-[700px]:text-[length:var(--fs-24)]">
            {profile.headline}
          </p>
          <p className="hero-lede">{profile.lede}</p>
          <div className="hero-actions">
            <Link to="/about" className={action('default')}>
              About me
            </Link>
            <a
              href="/resume.pdf"
              download="Joey Haas Resume.pdf"
              className={action('outline')}
            >
              Resume (PDF)
            </a>
            <a href={`mailto:${profile.email}`} className={action('outline')}>
              Email me
            </a>
            <Link to={spine.path} className={action('outline')}>
              See {spine.name}
            </Link>
            <a href={profile.github} className={action('outline')}>
              GitHub <span aria-hidden="true">↗</span>
            </a>
            <a href={profile.linkedin} className={action('outline')}>
              LinkedIn <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <aside aria-labelledby="home-glance">
          <RecordCard
            label={
              <h2
                id="home-glance"
                className="m-0 font-mono text-xs font-normal text-muted-foreground"
              >
                At a glance
              </h2>
            }
          >
            <dl className="glance-facts px-4 py-1">
              {facts.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-3 border-t border-line-card py-3 first:border-t-0"
                >
                  <dt className="font-mono text-xs leading-6 text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-base font-semibold">{row.value}</dd>
                </div>
              ))}
            </dl>
          </RecordCard>
        </aside>
      </section>

      <section className={SECTION} aria-labelledby="home-work">
        <div className={SECTION_HEAD}>
          <h2 id="home-work" className={SECTION_TITLE}>
            Work
          </h2>
          <Link to="/projects">
            Project details <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul
          className="m-0 grid list-none grid-cols-1 gap-5 p-0 min-[981px]:grid-cols-3"
          role="list"
        >
          {records.map((record, i) => (
            <li key={record.to}>
              <RecordCard
                number={i + 1}
                label={record.label}
                className="relative h-full has-[a:hover]:border-y-foreground has-[a:hover]:border-r-foreground"
              >
                <div className="p-4 pb-5">
                  <h3 className="mb-2 font-heading text-xl leading-tight font-medium">
                    <Link
                      to={record.to}
                      className="text-foreground underline decoration-primary decoration-[1.5px] underline-offset-4 outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-solid focus-visible:after:outline-ring"
                    >
                      {record.title}
                    </Link>
                  </h3>
                  {record.summary && (
                    <p className="text-sm text-muted-foreground">
                      {record.summary}
                    </p>
                  )}
                  {record.covers && <CoverStrip />}
                </div>
              </RecordCard>
            </li>
          ))}
        </ul>
      </section>

      <section className={SECTION} aria-labelledby="home-experience">
        <div className={SECTION_HEAD}>
          <h2 id="home-experience" className={SECTION_TITLE}>
            Experience
          </h2>
          <span className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link to="/about">
              Full history <span aria-hidden="true">→</span>
            </Link>
            <a href="/resume.pdf">
              Full resume (PDF) <span aria-hidden="true">→</span>
            </a>
          </span>
        </div>
        <ol className="m-0 list-none p-0" role="list">
          {homeExperience().map((row) => (
            <li
              key={row.key}
              className="grid gap-1 border-b border-border py-5 min-[701px]:grid-cols-[11rem_minmax(0,1fr)] min-[701px]:gap-6"
            >
              <span className="font-mono text-sm leading-7 text-muted-foreground">
                {row.dates}
              </span>
              <div>
                <h3 className="mb-1 font-sans text-lg leading-snug font-semibold">
                  {row.title}
                </h3>
                <p className="max-w-[44rem] text-muted-foreground">
                  {row.summary}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="pt-10 pb-14" aria-label="Contact">
        <ContactLine />
      </section>
    </>
  )
}
