import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import { spine } from '../content/spine.js'
import { nowLists } from '../lib/nowLists.js'
import { readSnapshot } from '../lib/snapshot.js'
import { itemPath } from '../lib/spinePaths.js'
import { usePageTitle } from '../lib/usePageTitle.js'

const DAY = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function finishedOn(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return DAY.format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * What the shelf says I am doing now: playing, up next, just finished.
 *
 * A /now page (nownownow.com) written by Spine instead of by hand, so it is
 * never stale by more than a night. Like Home and Projects it reads only the
 * build-time snapshot, never the API, so it renders while the backend sleeps.
 */
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
  const empty =
    items !== null && !upNext && playing.length + finished.length === 0

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
              <PosterCard item={item} to={itemPath(item.id)} />
            )}
          />
        </section>
      )}

      {upNext && (
        <section aria-labelledby="now-up-next">
          <h2 id="now-up-next">Up next</h2>
          <p>
            <Link to={itemPath(upNext.item_id)}>{upNext.title}</Link>
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
                <Link to={itemPath(item.id)}>{item.title}</Link>
                <span className="muted">
                  {' '}
                  · {finishedOn(item.finished_at)}
                  {item.rating != null && ` · rated ${item.rating}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Also as an <a href="/spine/feed.xml">RSS feed of finished games</a>.
          </p>
        </section>
      )}
    </section>
  )
}
