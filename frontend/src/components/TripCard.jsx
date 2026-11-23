import { Link } from 'react-router'

import { tripKicker } from '../lib/tripDates.js'
import { photoSrc, photoSrcSet, tripPhotos } from '../lib/trips.js'
import {
  DRAFT_BADGE,
  TRIP_CARD,
  TRIP_CARD_BODY,
  TRIP_CARD_COUNT,
  TRIP_CARD_COVER,
  TRIP_CARD_PLACES,
  TRIP_CARD_TITLE,
} from './travelClasses.js'

/**
 * One trip on the `/travel` index: cover, kicker, title, places and photo
 * count, the whole card a single link to the trip page. The title is an
 * `h2` inside the link, so heading navigation still finds each trip.
 *
 * The cover is 16:9 by CSS (`object-fit: cover`); `width` and `height` are
 * the built image's own, which the browser needs for the aspect ratio
 * before the image loads, so the list does not shift as covers arrive. A
 * trip with no `cover` gets a quiet `--sunken` panel of the same shape
 * rather than no image, so the cards stay aligned.
 *
 * @param {object} props
 * @param {object} props.trip A compiled trip module.
 * @param {boolean} [props.eager] Load the cover at once (the first card).
 */
export default function TripCard({ trip, eager = false }) {
  const { slug, frontmatter, cover } = trip
  const photos = tripPhotos(trip).length
  return (
    <Link className={`trip-card ${TRIP_CARD}`} to={`/travel/${slug}`}>
      {cover ? (
        <img
          className={`trip-card__cover ${TRIP_CARD_COVER}`}
          src={photoSrc(slug, cover.name, 800)}
          srcSet={photoSrcSet(slug, cover.name)}
          sizes="(min-width: 46rem) 45rem, 100vw"
          width={cover.width ?? undefined}
          height={cover.height ?? undefined}
          loading={eager ? 'eager' : 'lazy'}
          alt=""
        />
      ) : (
        <span
          className={`trip-card__cover ${TRIP_CARD_COVER} trip-card__cover--blank`}
        />
      )}
      {/* A div, not a span: the heading inside needs flow content. */}
      <div className={`trip-card__body ${TRIP_CARD_BODY}`}>
        <span className="kicker">{tripKicker(frontmatter)}</span>
        <h2 className={`trip-card__title ${TRIP_CARD_TITLE}`}>
          {frontmatter.title}
          {frontmatter.draft && (
            <span className={`draft-badge ${DRAFT_BADGE}`}>Draft</span>
          )}
        </h2>
        <span className={`trip-card__places ${TRIP_CARD_PLACES}`}>
          {frontmatter.places.map((place) => place.name).join(' · ')}
        </span>
        {photos > 0 && (
          <span className={`trip-card__count ${TRIP_CARD_COUNT}`}>
            {photos} {photos === 1 ? 'photo' : 'photos'}
          </span>
        )}
      </div>
    </Link>
  )
}
