import { Link } from 'react-router'
import CoverImage from './CoverImage.jsx'
import { ownerMonth, ownerYear } from '../lib/formatDate.js'
import { STATUS_LABEL, STATUS_ORDER, topFavourites } from '../lib/shelf.js'

/**
 * The shelf's overview blocks, shared by the public Games and Comics pages
 * and the admin shelf: favourites, the status bar, the ratings and finishes
 * charts and the on-cartridge line.
 */

const FAVOURITES_SHOWN = 4
const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const MONTH_LABEL = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const MONTH_INITIAL = new Intl.DateTimeFormat('en', {
  month: 'narrow',
  timeZone: 'UTC',
})

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * The twelve months ending with the current one, oldest first, as the
 * "YYYY-MM" keys the stats endpoint returns. The current month is the
 * owner's (`ownerMonth`), as the year beside it is.
 */
export function lastTwelveMonths(now = new Date()) {
  const { year, month } = ownerMonth(now)
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (11 - index), 1))
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    return {
      key,
      label: MONTH_LABEL.format(date),
      initial: MONTH_INITIAL.format(date),
    }
  })
}

/** Key-card platforms by IGDB id, as stats.by_format keys them. */
const KEY_CARD_PLATFORM_NAMES = { 508: 'Nintendo Switch 2' }

/**
 * The key-card platforms' copies: how many are full cartridges, of how many,
 * then what the rest are. Unknowns are stated, never folded into the
 * cartridge count. A stats block like its neighbours, with a heading; it
 * renders only once at least one format has been recorded.
 */
export function OnCartridge({ byFormat, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`
  const platforms = Object.entries(byFormat ?? {}).filter(
    ([, counts]) =>
      counts.game_card + counts.game_key_card + counts.code_in_box > 0,
  )
  if (platforms.length === 0) return null
  return (
    <section className="stat-card stat-cartridge" aria-label="On cartridge">
      <Heading>On cartridge</Heading>
      {platforms.map(([platformId, counts]) => {
        const name =
          KEY_CARD_PLATFORM_NAMES[platformId] ?? `Platform ${platformId}`
        const rest = [
          [
            counts.game_key_card,
            counts.game_key_card === 1 ? 'Game-Key Card' : 'Game-Key Cards',
          ],
          [
            counts.code_in_box,
            counts.code_in_box === 1 ? 'code in a box' : 'codes in a box',
          ],
          [counts.unknown, 'not recorded'],
        ]
          .filter(([count]) => count > 0)
          .map(([count, label]) => `${count} ${label}`)
        return (
          <div key={platformId} className="cartridge-platform">
            <p>{`${name} — ${counts.game_card} of ${counts.total}`}</p>
            {rest.length > 0 && <p className="muted">{rest.join(' · ')}</p>}
          </div>
        )
      })}
    </section>
  )
}

/**
 * Up to four favourite covers, highest rated first, then by title. Shared
 * with the admin shelf.
 *
 * Public renders nothing without a favourite. Admin passes `placeholders`,
 * which always renders the row with empty slots and a hint, because picking
 * favourites is part of the job there. Admin also shows every favourite when
 * there are more than four -- rows favourited before the API capped them --
 * with a note, so the extras can be found and trimmed.
 *
 * @param {object} props
 * @param {object[]} props.items - Every shelf row; favourites are chosen here.
 * @param {(item: object) => string} props.linkFor - Where a cover links.
 * @param {boolean} [props.placeholders] - Always render, padding with slots.
 * @param {2|3} [props.headingLevel] - The heading's level: 3 under the
 *   public shelf's Overview, 2 where the row sits straight under the page.
 */
export function FavoritesRow({
  items,
  linkFor,
  placeholders = false,
  headingLevel = 2,
}) {
  const Heading = `h${headingLevel}`
  const all = topFavourites(items)
  const favourites = placeholders ? all : all.slice(0, FAVOURITES_SHOWN)
  if (favourites.length === 0 && !placeholders) return null
  const empty = placeholders
    ? Math.max(FAVOURITES_SHOWN - favourites.length, 0)
    : 0
  const extra = favourites.length - FAVOURITES_SHOWN

  return (
    <section className="favourites" aria-label="Favorites">
      <Heading>Favorites</Heading>
      <ul className="favourites-row">
        {favourites.map((item) => (
          <li key={item.id}>
            <Link to={linkFor(item)} className="favourite-link">
              <CoverImage src={item.cover_url} type={item.type} alt="" />
              <span className="visually-hidden">{item.title}</span>
            </Link>
          </li>
        ))}
        {Array.from({ length: empty }, (_, index) => (
          <li key={`empty-${index}`} className="favourite-empty" />
        ))}
      </ul>
      {extra > 0 && (
        <p className="muted favourites-hint">
          {`${favourites.length} favorites. The public page shows four; remove ${extra}.`}
        </p>
      )}
      {empty > 0 && (
        <p className="muted favourites-hint">
          Pick your favorites with the heart on any card.
        </p>
      )}
    </section>
  )
}

/**
 * One stacked bar of the four statuses, in shelf order, with a legend.
 * Comics passes its own labels and title ("Reading").
 */
export function StatusBar({
  byStatus,
  labels = STATUS_LABEL,
  title = 'Status',
  headingLevel = 2,
}) {
  const Heading = `h${headingLevel}`
  const present = STATUS_ORDER.filter((status) => byStatus[status] > 0)
  return (
    <div className="stat-card stat-status">
      <Heading>{title}</Heading>
      <div className="status-bar">
        {present.map((status) => (
          <span
            key={status}
            className="status-segment"
            data-status={status}
            role="img"
            aria-label={`${labels[status]}: ${byStatus[status]}`}
            style={{ '--count': byStatus[status] }}
          />
        ))}
      </div>
      <ul className="status-legend">
        {present.map((status) => (
          <li key={status}>
            <span
              className="status-swatch"
              data-status={status}
              aria-hidden="true"
            />
            <span>{labels[status]}</span>
            <span className="stat-count">{byStatus[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Ten bars for ratings 1 to 10 beside the average, with the axis's ends
 * labelled. Each bar is focusable and names its count, and its title repeats
 * that name; the numeral above it shows on hover and on focus alike.
 */
export function RatingHistogram({ histogram, average, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`
  const counts = RATINGS.map((rating) => histogram[rating] ?? 0)
  const most = Math.max(...counts, 1)
  return (
    <section className="stat-card stat-ratings" aria-label="Ratings">
      <Heading>Ratings</Heading>
      <div className="stat-figure">
        <div className="bar-column">
          <div className="rating-bars">
            {RATINGS.map((rating, index) => {
              const label = `Rated ${rating}: ${plural(counts[index], 'item')}`
              return (
                <span
                  key={rating}
                  className="rating-bar"
                  role="img"
                  tabIndex={0}
                  aria-label={label}
                  title={label}
                  style={{ '--share': counts[index] / most }}
                >
                  <span className="rating-bar-count">{counts[index]}</span>
                </span>
              )
            })}
          </div>
          <div className="bar-axis" aria-hidden="true">
            <span>1</span>
            <span>10</span>
          </div>
        </div>
        {average != null && (
          <p className="stat-big">
            <span className="stat-big-number">{average.toFixed(1)}</span>
            <span className="stat-big-label">Average</span>
          </p>
        )}
      </div>
    </section>
  )
}

/** Twelve months of finishes, the current month at the right. */
export function FinishesStrip({
  months,
  byMonth,
  finishedThisYear,
  headingLevel = 2,
}) {
  const Heading = `h${headingLevel}`
  const counts = months.map((month) => byMonth[month.key] ?? 0)
  const most = Math.max(...counts, 1)
  return (
    <section className="stat-card stat-finishes" aria-label="Finishes">
      <Heading>Finishes</Heading>
      <div className="stat-figure">
        <div className="bar-column">
          <div className="month-bars">
            {months.map((month, index) => {
              const label = `${month.label}: ${counts[index]} finished`
              return (
                <span
                  key={month.key}
                  className="month-bar"
                  role="img"
                  tabIndex={0}
                  aria-label={label}
                  title={label}
                  style={{ '--share': counts[index] / most }}
                >
                  <span className="rating-bar-count">{counts[index]}</span>
                </span>
              )
            })}
          </div>
          <div className="bar-axis bar-axis-months" aria-hidden="true">
            {months.map((month) => (
              <span key={month.key}>{month.initial}</span>
            ))}
          </div>
        </div>
        <p className="stat-big">
          <span className="stat-big-label">
            {`${finishedThisYear} in ${ownerYear()}`}
          </span>
        </p>
      </div>
    </section>
  )
}
