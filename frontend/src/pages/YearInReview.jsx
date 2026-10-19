import { Link, Navigate, useParams } from 'react-router'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import { spine } from '../content/spine.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import { finishYears, yearInReview } from '../lib/yearInReview.js'
import NotFound from './NotFound.jsx'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const DAY = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function shortDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return DAY.format(new Date(Date.UTC(year, month - 1, day)))
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** /spine/year: this calendar year's page. */
export function CurrentYear() {
  return (
    <Navigate to={`${spine.path}/year/${new Date().getFullYear()}`} replace />
  )
}

/**
 * A year of finishes on the shelf: the numbers, the months, the genres, how
 * my ratings compare with IGDB's community, and a diary of every finish.
 * Built from the public items (snapshot first, then live), so it shows
 * nothing the shelf does not.
 */
export default function YearInReview() {
  const { year: param } = useParams()
  const valid = /^\d{4}$/.test(param ?? '')
  const year = Number(param)
  const { data, failed } = useSnapshotThenLive('items')
  usePageTitle(valid ? `${year} in review · ${spine.name}` : null)

  if (!valid) return <NotFound />

  const items = Array.isArray(data) ? data : []
  const review = yearInReview(items, year)
  const years = finishYears(items)
  const most = Math.max(...review.byMonth, 1)
  const { versusCommunity: versus } = review

  return (
    <section className="year-review">
      <SpineHeader asLink />
      <h1>{year} in review</h1>

      {/* Shown whenever another year has finishes: in January the redirect
          lands on a year with none yet, and the way back is this nav. */}
      {years.some((other) => other !== year) && (
        <nav className="year-nav" aria-label="Years">
          {years.map((other) =>
            other === year ? (
              <span key={other} aria-current="page">
                {other}
              </span>
            ) : (
              <Link key={other} to={`${spine.path}/year/${other}`}>
                {other}
              </Link>
            ),
          )}
        </nav>
      )}

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

      {data && review.count === 0 && (
        <p className="muted">
          No finishes recorded in {year} yet.{' '}
          {years.length > 0 ? (
            <Link to={`${spine.path}/year/${years[0]}`}>See {years[0]}</Link>
          ) : (
            <Link to={spine.path}>Back to the shelf</Link>
          )}
          .
        </p>
      )}

      {review.count > 0 && (
        <>
          <dl className="year-numbers">
            <div>
              <dt>Finished</dt>
              <dd>{review.count}</dd>
            </div>
            {review.averageRating != null && (
              <div>
                <dt>Average rating</dt>
                <dd>{review.averageRating}</dd>
              </div>
            )}
            {review.timedCount > 0 && (
              <div>
                <dt>
                  Hours to beat
                  {review.timedCount < review.count &&
                    ` (${review.timedCount} of ${review.count})`}
                </dt>
                <dd>{review.hours}</dd>
              </div>
            )}
            {review.favourites.length > 0 && (
              <div>
                <dt>Favourites</dt>
                <dd>{review.favourites.length}</dd>
              </div>
            )}
          </dl>

          <section aria-labelledby="year-months">
            <h2 id="year-months">By month</h2>
            <div className="bar-column year-months">
              <div className="month-bars">
                {review.byMonth.map((count, index) => {
                  const label = `${MONTHS[index]} ${year}: ${count} finished`
                  return (
                    <span
                      key={MONTHS[index]}
                      className="month-bar"
                      role="img"
                      tabIndex={0}
                      aria-label={label}
                      title={label}
                      style={{ '--share': count / most }}
                    >
                      <span className="rating-bar-count">{count}</span>
                    </span>
                  )
                })}
              </div>
              <div className="bar-axis bar-axis-months" aria-hidden="true">
                {MONTHS.map((month) => (
                  <span key={month}>{month[0]}</span>
                ))}
              </div>
            </div>
          </section>

          {review.topGenres.length > 0 && (
            <section aria-labelledby="year-genres">
              <h2 id="year-genres">Most played genres</h2>
              <ol className="year-genres">
                {review.topGenres.map(({ genre, count }) => (
                  <li key={genre}>
                    {genre} <span className="muted">· {count}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {versus.compared > 0 && (
            <section aria-labelledby="year-versus">
              <h2 id="year-versus">Against the crowd</h2>
              <p className="prose">
                Of {plural(versus.compared, 'rated finish')} with an IGDB
                community score, I rated {versus.higher} higher and{' '}
                {versus.lower} lower than the crowd.
                {versus.furthest && versus.furthest.gap !== 0 && (
                  <>
                    {' '}
                    Furthest apart:{' '}
                    <Link to={`${spine.path}/${versus.furthest.item.id}`}>
                      {versus.furthest.item.title}
                    </Link>
                    , which I rated {versus.furthest.item.rating}/10 against the
                    community&rsquo;s{' '}
                    {Math.round(versus.furthest.item.community_score)}/100.
                  </>
                )}
              </p>
            </section>
          )}

          {review.favourites.length > 0 && (
            <section aria-labelledby="year-favourites">
              <h2 id="year-favourites">Favourites</h2>
              <PosterGrid
                items={review.favourites}
                size="compact"
                renderCard={(item) => (
                  <PosterCard item={item} to={`${spine.path}/${item.id}`} />
                )}
              />
            </section>
          )}

          <section aria-labelledby="year-diary">
            <h2 id="year-diary">Diary</h2>
            <ol className="year-diary">
              {[...review.finished].reverse().map((item) => (
                <li key={item.id}>
                  <time dateTime={item.finished_at}>
                    {shortDate(item.finished_at)}
                  </time>
                  <Link to={`${spine.path}/${item.id}`}>{item.title}</Link>
                  {item.rating != null && (
                    <span className="muted">{item.rating}/10</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </section>
  )
}
