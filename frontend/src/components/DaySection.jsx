import { dayKicker } from '../lib/tripDates.js'
import PhotoGroup from './PhotoGroup.jsx'
import PostcardCard from './PostcardCard.jsx'

/**
 * One day of a trip: kicker, title with its place, prose, then its photos;
 * a day with no photo is a postcard instead.
 *
 * The section is its own anchor (`#day-2`, `#day-8-9`), which the place
 * chips and the map's pins jump to, and is labelled by its heading. A
 * travel day shows its whole route (*Dubrovnik → Athens → Naxos*) and
 * belongs to where it ended.
 *
 * The heading is an `h2`, not the spec's `h3`: nothing sits between the
 * page's `h1` and the days, and a skipped level breaks heading navigation.
 *
 * @param {object} props
 * @param {string} props.slug
 * @param {object} props.day A compiled day.
 * @param {boolean} [props.eager] This day holds the page's first photos.
 * @param {(name: string, opener: HTMLElement) => void} [props.onOpen]
 */
export default function DaySection({ slug, day, eager = false, onOpen }) {
  const titleId = `${day.id}-title`
  return (
    <section id={day.id} className="trip-day" aria-labelledby={titleId}>
      <p className="kicker">{dayKicker(day)}</p>
      <h2 id={titleId} className="trip-day__title">
        {day.title}
        <span className="trip-day__place"> · {day.legs.join(' → ')}</span>
      </h2>
      {day.photos.length > 0 ? (
        <>
          <div
            className="post-body"
            dangerouslySetInnerHTML={{ __html: day.html }}
          />
          <PhotoGroup
            slug={slug}
            photos={day.photos}
            eager={eager}
            onOpen={onOpen}
          />
        </>
      ) : (
        <PostcardCard place={day.place} html={day.html} />
      )}
    </section>
  )
}
