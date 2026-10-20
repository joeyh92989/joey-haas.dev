import { Link, Navigate, useParams } from 'react-router'
import PosterCard from '../components/PosterCard.jsx'
import PosterGrid from '../components/PosterGrid.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import { spine } from '../content/spine.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { usePublicDiary } from '../lib/usePublicDiary.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import { isoMonth } from '../lib/monthInReview.js'
import { finishYears, yearInReview } from '../lib/yearInReview.js'
import NotFound from './NotFound.jsx'
import { itemPath, yearPath, monthPath } from '../lib/spinePaths.js'
import { LOAD_ERROR } from '../content/status.js'

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
  return <Navigate to={yearPath(new Date().getFullYear())} replace />
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
  // Hooks run before the not-found return below; an invalid year asks for
  // nothing.
  const played = usePublicDiary(valid ? year : null)
  const daysPlayed = new Set(played.map((row) => row.played_on)).size
  const playedMonths = new Set(played.map((row) => isoMonth(row.played_on)))
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
              <Link key={other} to={yearPath(other)}>
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
          {LOAD_ERROR}
        </p>
      )}

      {data && review.count === 0 && (
        <p className="muted">
          No finishes recorded in {year} yet.{' '}
          {years.length > 0 ? (
            <Link to={yearPath(years[0])}>See {years[0]}</Link>
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
            {daysPlayed > 0 && (
              <div>
                <dt>Days played</dt>
                <dd>{daysPlayed}</dd>
              </div>
            )}
            {review.favourites.length > 0 && (
              <div>
                <dt>Favorites</dt>
                <dd>{review.favourites.length}</dd>
              </div>
            )}
          </dl>

          <section aria-labelledby="year-months">
            <h2 id="year-months">By month</h2>
            <div className="bar-column year-months">
              <div className="month-bars">
                {review.byMonth.map((count, index) => {
                  const month = `${year}-${String(index + 1).padStart(2, '0')}`
                  const label = `${MONTHS[index]} ${year}: ${count} finished${
                    playedMonths.has(month) ? ', played' : ''
                  }`
                  const bar = {
                    className: 'month-bar',
                    'aria-label': label,
                    title: label,
                    style: { '--share': count / most },
                  }
                  const figure = (
                    <span className="rating-bar-count">{count}</span>
                  )
                  // A month with a finish or a session opens its journal
                  // page; an empty one stays a plain mark.
                  return count > 0 || playedMonths.has(month) ? (
                    <Link key={month} to={monthPath(month)} {...bar}>
                      {figure}
                    </Link>
                  ) : (
                    <span key={month} role="img" tabIndex={0} {...bar}>
                      {figure}
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
                    <Link to={itemPath(versus.furthest.item.id)}>
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
              <h2 id="year-favourites">Favorites</h2>
              <PosterGrid
                items={review.favourites}
                size="compact"
                renderCard={(item) => (
                  <PosterCard item={item} to={itemPath(item.id)} />
                )}
              />
            </section>
          )}

          <section aria-labelledby="year-diary">
            <h2 id="year-diary">Finishes</h2>
            <ol className="year-diary">
              {[...review.finished].reverse().map((item) => (
                <li key={item.id}>
                  <time dateTime={item.finished_at}>
                    {shortDate(item.finished_at)}
                  </time>
                  <Link to={itemPath(item.id)}>{item.title}</Link>
                  {item.rating != null && (
                    <span className="muted">{item.rating}/10</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {played.length > 0 && (
        <section aria-labelledby="year-played">
          <h2 id="year-played">Played</h2>
          <p className="muted">
            {daysPlayed} {daysPlayed === 1 ? 'day' : 'days'} with a session
            logged.
          </p>
          <ol className="year-diary">
            {played.map((row, index) => (
              <li key={`${row.item_id}-${row.played_on}-${index}`}>
                <time dateTime={row.played_on}>{shortDate(row.played_on)}</time>
                <Link to={itemPath(row.item_id)}>{row.title}</Link>
                {row.minutes != null && (
                  <span className="muted">{row.minutes} min</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  )
}
