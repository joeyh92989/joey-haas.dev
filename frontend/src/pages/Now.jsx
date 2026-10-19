import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import { spine } from '../content/spine.js'
import { readSnapshot } from '../lib/snapshot.js'
import { usePageTitle } from '../lib/usePageTitle.js'

const RECENT = 4

const DAY = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * What the shelf says I am doing now: playing, up next, just finished.
 *
 * A /now page (nownownow.com) written by Spine instead of by hand, so it is
 * never stale by more than a night. Like Home and Projects it reads only the
 * build-time snapshot, never the API, so it renders while the backend sleeps.
 *
 * @param {object[]} items The snapshot's public items.
 * @returns {{playing: object[], finished: object[]}}
 */
export function nowLists(items) {
  const owned = items.filter((item) => !item.wanted)
  return {
    playing: owned.filter((item) => item.status === 'active'),
    finished: owned
      .filter((item) => item.finished_at)
      .sort((a, b) => b.finished_at.localeCompare(a.finished_at))
      .slice(0, RECENT),
  }
}

function finishedOn(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return DAY.format(new Date(Date.UTC(year, month - 1, day)))
}

export default function Now() {
  usePageTitle('Now · Joey Haas')
  const [items, setItems] = useState(null)
  const [upNext, setUpNext] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([readSnapshot('items'), readSnapshot('next')]).then(
      ([snapshotItems, next]) => {
        if (cancelled) return
        setItems(snapshotItems ?? [])
        setUpNext(next?.tonight?.up_next ?? null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const { playing, finished } = nowLists(items ?? [])
  const empty = items !== null && playing.length + finished.length === 0

  return (
    <section className="now">
      <h1>Now</h1>
      <p className="prose">
        What I&rsquo;m playing, what&rsquo;s next and what I just finished,
        written by <Link to={spine.path}>{spine.name}</Link> each night rather
        than by hand.
      </p>

      {items === null && (
        <p className="muted" role="status">
          Loading…
        </p>
      )}
      {empty && (
        <p className="muted">
          Nothing to show from this build. The shelf is on{' '}
          <Link to={spine.path}>{spine.name}</Link>.
        </p>
      )}

      {playing.length > 0 && (
        <section aria-labelledby="now-playing">
          <h2 id="now-playing">Playing</h2>
          <PosterGrid
            items={playing}
            size="compact"
            renderCard={(item) => (
              <PosterCard item={item} to={`${spine.path}/${item.id}`} />
            )}
          />
        </section>
      )}

      {upNext && (
        <section aria-labelledby="now-up-next">
          <h2 id="now-up-next">Up next</h2>
          <p>
            <Link to={`${spine.path}/${upNext.item_id}`}>{upNext.title}</Link>
            {upNext.platform && (
              <span className="muted"> · {upNext.platform}</span>
            )}
          </p>
        </section>
      )}

      {finished.length > 0 && (
        <section aria-labelledby="now-finished">
          <h2 id="now-finished">Recently finished</h2>
          <ul className="now-finished">
            {finished.map((item) => (
              <li key={item.id}>
                <Link to={`${spine.path}/${item.id}`}>{item.title}</Link>
                <span className="muted">
                  {' '}
                  · {finishedOn(item.finished_at)}
                  {item.rating != null && ` · rated ${item.rating}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Also as a feed: <a href="/spine/feed.xml">finished games (RSS)</a>.
          </p>
        </section>
      )}
    </section>
  )
}
