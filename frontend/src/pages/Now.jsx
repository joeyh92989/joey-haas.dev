import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import RecordCard from '../components/RecordCard.jsx'
import { PROSE_H1, SECTION_HEAD } from '../components/prose-classes.js'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import AgainTag from '../components/AgainTag.jsx'
import Rating from '../components/Rating.jsx'
import { spine } from '../content/spine.js'
import { timeWord } from '../lib/finishes.js'
import { nowLists } from '../lib/nowLists.js'
import { readSnapshot } from '../lib/snapshot.js'
import { itemPath } from '../lib/spinePaths.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { MONTH_YEAR as MONTH, DAY_YEAR as DAY } from '../lib/formatDate.js'
import { NOW_RSS } from '../components/adminFormClasses.js'

/** A dated row: a hairline under each, so a list reads as a ledger. */
const ROW = 'border-b border-line-card py-3'

function utc(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function finishedOn(isoDate) {
  return DAY.format(utc(isoDate))
}

/**
 * What the shelf says I am doing now: playing, set aside, up next, just
 * finished.
 *
 * A /now page (nownownow.com) written by Spine instead of by hand, so it is
 * never stale by more than a night. Like Home and Projects it reads only the
 * build-time snapshot, never the API, so it renders while the backend sleeps.
 */
export default function Now() {
  usePageTitle('Now · Joey Haas')
  const [items, setItems] = useState(null)
  // The game to show and whether it is Tonight's pick, not a pinned up_next.
  const [upNext, setUpNext] = useState(null)
  const [isPick, setIsPick] = useState(false)
  // The day the snapshot was fetched, 'YYYY-MM-DD', or null without one.
  const [asOf, setAsOf] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      readSnapshot('items'),
      readSnapshot('next'),
      readSnapshot('meta'),
    ]).then(([snapshotItems, next, meta]) => {
      if (cancelled) return
      setAsOf(meta?.fetched_at?.slice(0, 10) ?? null)
      setItems(snapshotItems ?? [])
      const pinned = next?.tonight?.up_next
      setUpNext(pinned ?? next?.tonight?.picks?.[0] ?? null)
      setIsPick(!pinned)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { playing, paused, finished } = nowLists(items ?? [])
  const empty =
    items !== null &&
    !upNext &&
    playing.length + paused.length + finished.length === 0

  return (
    <section className="now">
      <h1 className={PROSE_H1}>Now</h1>
      <p className="prose mt-4">
        <Link to={spine.path}>{spine.name}</Link> writes this page every night,
        and it covers games only. My work is on the{' '}
        <Link to="/about">About</Link> page.
      </p>
      {asOf && <p className="muted mt-2">As of {DAY.format(utc(asOf))}.</p>}

      {items === null && (
        <p className="muted" role="status">
          Loading…
        </p>
      )}
      {empty && (
        <p className="muted">
          Nothing here yet. The collection is on{' '}
          <Link to={spine.path}>{spine.name}</Link>.
        </p>
      )}

      {playing.length > 0 && (
        <section className="mt-10" aria-labelledby="now-playing">
          <h2 id="now-playing" className={SECTION_HEAD}>
            Playing
          </h2>
          <PosterGrid
            items={playing}
            size="compact"
            renderCard={(item) => (
              <PosterCard item={item} to={itemPath(item.id)} />
            )}
          />
        </section>
      )}

      {/* The snapshot carries no journal, so a paused row has its date and
          no hours. */}
      {paused.length > 0 && (
        <section className="mt-10" aria-labelledby="now-paused">
          <h2 id="now-paused" className={SECTION_HEAD}>
            Paused
          </h2>
          <ul className="now-finished m-0 grid list-none gap-0 p-0">
            {paused.map((item) => (
              <li key={item.id} className={ROW}>
                <Link to={itemPath(item.id)}>{item.title}</Link>
                {item.paused_on && (
                  <span className="muted">
                    {' '}
                    · since {MONTH.format(utc(item.paused_on))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {upNext && (
        <section className="mt-10" aria-labelledby="now-up-next">
          <h2 id="now-up-next" className={SECTION_HEAD}>
            {isPick ? spine.next.sections.tonight : 'Up next'}
          </h2>
          <RecordCard className="max-w-[45rem]">
            <p className="p-4">
              <Link
                to={itemPath(upNext.item_id)}
                className="font-heading text-xl font-medium text-foreground underline decoration-primary decoration-[1.5px] underline-offset-4"
              >
                {upNext.title}
              </Link>
              {upNext.platform && (
                <span className="muted"> · {upNext.platform}</span>
              )}
            </p>
          </RecordCard>
        </section>
      )}

      {finished.length > 0 && (
        <section className="mt-10" aria-labelledby="now-finished">
          <h2 id="now-finished" className={SECTION_HEAD}>
            Recently finished
          </h2>
          <ul className="now-finished m-0 grid list-none gap-0 p-0">
            {finished.map((item) => (
              <li key={item.id} className={ROW}>
                <Link to={itemPath(item.id)}>{item.title}</Link>
                {item.again && <AgainTag />}
                <span className="muted">
                  {' '}
                  · {finishedOn(item.finished_at)}
                  {item.again && ` · ${timeWord(item.finish_number)}`}
                  {item.rating ? ' · ' : null}
                </span>
                <Rating rating={item.rating} />
              </li>
            ))}
          </ul>
          <p className={`muted now-rss ${NOW_RSS}`}>
            Also as an{' '}
            <a href={`${spine.path}/feed.xml`}>RSS feed of finished games</a>.
          </p>
        </section>
      )}
    </section>
  )
}
