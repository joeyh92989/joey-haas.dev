import { Link, useParams } from 'react-router'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import { spine } from '../content/spine.js'
import { monthInReview, monthName, parseMonth } from '../lib/monthInReview.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { usePublicDiary } from '../lib/usePublicDiary.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import NotFound from './NotFound.jsx'

const DAY = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function dayWords(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return DAY.format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * One month of the play journal: the games finished that month and the
 * sessions logged, by day. Built from the public items (snapshot first,
 * then live) and the public diary, so it shows nothing the shelf does not.
 * A diary that fails to load reads as no sessions.
 */
export default function MonthInReview() {
  const { month } = useParams()
  const parsed = parseMonth(month)
  const { data, failed } = useSnapshotThenLive('items')
  // Hooks run before the not-found return below; an invalid month asks for
  // nothing.
  const played = usePublicDiary(parsed ? parsed.year : null)
  const name = parsed ? monthName(month) : null
  usePageTitle(name ? `${name} · ${spine.name}` : null)

  if (!parsed) return <NotFound />

  const items = Array.isArray(data) ? data : []
  const review = monthInReview(items, played, month)
  const empty = review.finished.length === 0 && review.days.length === 0

  return (
    <section className="year-review">
      <SpineHeader asLink />
      <h1>{name}</h1>

      <nav className="month-nav" aria-label="Months">
        {review.previous && (
          <Link to={`${spine.path}/journal/${review.previous}`}>
            <span aria-hidden="true">&larr;</span> {monthName(review.previous)}
          </Link>
        )}
        <Link to={`${spine.path}/year/${review.year}`}>
          {review.year} in review
        </Link>
        {review.next && (
          <Link to={`${spine.path}/journal/${review.next}`}>
            {monthName(review.next)} <span aria-hidden="true">&rarr;</span>
          </Link>
        )}
      </nav>

      {!data && !failed && (
        <p className="muted" role="status">
          Loading…
        </p>
      )}
      {!data && failed && (
        <p className="admin-error" role="alert">
          The shelf could not be loaded. Try again shortly.
        </p>
      )}

      {data && empty && (
        <p className="muted">Nothing finished or played in {name}.</p>
      )}

      {review.finished.length > 0 && (
        <section aria-labelledby="month-finished">
          <h2 id="month-finished">Finished</h2>
          <PosterGrid
            items={review.finished}
            size="compact"
            renderCard={(item) => (
              <PosterCard item={item} to={`${spine.path}/${item.id}`} />
            )}
          />
        </section>
      )}

      {review.days.length > 0 && (
        <section aria-labelledby="month-played">
          <h2 id="month-played">Played</h2>
          <p className="muted">
            {review.days.length} {review.days.length === 1 ? 'day' : 'days'}{' '}
            with a session logged
            {review.minutes > 0 && `, ${review.minutes} minutes in all`}.
          </p>
          <ol className="month-days">
            {review.days.map((day) => (
              <li key={day.date}>
                <time dateTime={day.date}>{dayWords(day.date)}</time>
                <ul className="year-diary">
                  {day.sessions.map((row, index) => (
                    <li key={`${row.item_id}-${index}`}>
                      <Link to={`${spine.path}/${row.item_id}`}>
                        {row.title}
                      </Link>
                      {row.minutes != null && (
                        <span className="muted">{row.minutes} min</span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  )
}
