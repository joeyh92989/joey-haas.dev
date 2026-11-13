import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import DaySection from '../components/DaySection.jsx'
import DrawnMap from '../components/DrawnMap.jsx'
import FactsTable from '../components/FactsTable.jsx'
import Lightbox from '../components/Lightbox.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { findMap } from '../content/maps/index.js'
import { TRAVEL_PAGE } from '../content/pages.js'
import { findTrip, trips } from '../content/trips.js'
import { tripDateRange, tripDays, tripMonth } from '../lib/tripDates.js'
import { placeSlug, tripPhotos } from '../lib/trips.js'
import { useHashFocus } from '../lib/useHashFocus.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import NotFound from './NotFound.jsx'

/**
 * Each place with the anchor of its first day: the day that ends there, or
 * failing that the travel day that passes through. A place no day mentions
 * has no anchor and is left out of the chips and the map's stops.
 */
function placeAnchors(trip) {
  return trip.frontmatter.places.flatMap((place) => {
    const day =
      trip.days.find((d) => d.place === place.name) ??
      trip.days.find((d) => d.legs.includes(place.name))
    return day ? [{ ...place, href: `#${day.id}` }] : []
  })
}

/**
 * The place whose day is in the reading band (the top half of the
 * viewport), for the chips' `aria-current`. Optional, as the spec allows:
 * without IntersectionObserver (jsdom, old browsers) no chip is current and
 * the chips are still plain jump links.
 */
function useCurrentPlace(days) {
  const [current, setCurrent] = useState(null)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const placeOf = new Map(days.map((day) => [day.id, day.place]))
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.find((entry) => entry.isIntersecting)
        if (seen) setCurrent(placeOf.get(seen.target.id) ?? null)
      },
      { rootMargin: '0px 0px -50% 0px' },
    )
    for (const day of days) {
      const section = document.getElementById(day.id)
      if (section) observer.observe(section)
    }
    return () => observer.disconnect()
  }, [days])
  return current
}

function facts(trip, photos) {
  const { frontmatter, days } = trip
  const dayCount =
    frontmatter.precision === 'day'
      ? tripDays(frontmatter.date, frontmatter.end)
      : days.at(-1).last
  const rows = [
    { label: 'Dates', value: tripDateRange(frontmatter) },
    { label: 'Places', value: frontmatter.places.length },
    { label: 'Days', value: dayCount },
  ]
  if (photos > 0) rows.push({ label: 'Photos', value: photos })
  return rows
}

/**
 * The route's element. Keyed on the slug, so moving to the older or newer
 * trip starts a fresh page: the lightbox's index and opener and the current
 * chip belong to one trip and must not carry into the next.
 *
 * Chips and pins are plain `#day-N` links; useHashFocus moves focus to the
 * day's heading when one is followed, so a keyboard user lands there too.
 */
export default function Trip() {
  const { slug } = useParams()
  useHashFocus()
  return <TripPage key={slug} slug={slug} />
}

/**
 * One trip: kicker, title, lede, facts, the drawn route, place chips, the
 * days, then the older and newer trips — the spec's order (T8).
 *
 * The page stays in the 45rem prose column: a trip is a post with photos,
 * not a gallery. Only the first photo group loads eagerly; the rest wait
 * until they are near.
 */
function TripPage({ slug }) {
  const trip = findTrip(slug)

  // Null when missing, so NotFound's own title stands (see usePageTitle).
  usePageTitle(trip ? `${trip.frontmatter.title} · Travel · Joey Haas` : null)
  const current = useCurrentPlace(trip ? trip.days : [])
  const gallery = useMemo(() => (trip ? tripPhotos(trip) : []), [trip])
  const [viewing, setViewing] = useState(null)
  const [opener, setOpener] = useState(null)

  if (!trip) return <NotFound />

  function openPhoto(name, button) {
    setOpener(button)
    setViewing(gallery.findIndex((photo) => photo.name === name))
  }

  const { frontmatter, days } = trip
  const map = findMap(slug)
  const anchors = placeAnchors(trip)
  const photos = gallery.length
  const firstWithPhotos = days.find((day) => day.photos.length > 0)?.id
  const index = trips.findIndex((t) => t.slug === slug)
  const newer = index > 0 ? trips[index - 1] : null
  const older = index >= 0 ? trips[index + 1] : null

  return (
    <article className="trip">
      <PageHeader
        trail={[
          { label: TRAVEL_PAGE.title, to: TRAVEL_PAGE.path },
          { label: frontmatter.title },
        ]}
        kicker={tripMonth(frontmatter)}
        title={
          <>
            {frontmatter.title}
            {frontmatter.draft && <span className="draft-badge">Draft</span>}
          </>
        }
        lede={frontmatter.summary}
      />
      <FactsTable rows={facts(trip, photos)} />
      {map && (
        <DrawnMap
          drawing={map.drawing}
          fit={map.fit}
          viewBox={map.viewBox}
          stops={anchors}
          label="Route"
        />
      )}
      {anchors.length > 1 && (
        <nav className="trip-places" aria-label="Places">
          <ul role="list">
            {anchors.map((place) => (
              <li key={place.name}>
                <a
                  className="chip"
                  href={place.href}
                  data-place={placeSlug(place.name)}
                  aria-current={current === place.name ? 'location' : undefined}
                >
                  {place.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {days.map((day) => (
        <DaySection
          key={day.id}
          slug={slug}
          day={day}
          eager={day.id === firstWithPhotos}
          onOpen={openPhoto}
        />
      ))}
      {(older || newer) && (
        <nav className="trip-nav" aria-label="More trips">
          {older && (
            <Link to={`/travel/${older.slug}`} rel="prev">
              ← {older.frontmatter.title}
            </Link>
          )}
          {newer && (
            <Link to={`/travel/${newer.slug}`} rel="next">
              {newer.frontmatter.title} →
            </Link>
          )}
        </nav>
      )}
      <Lightbox
        slug={slug}
        photos={gallery}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        opener={opener}
      />
    </article>
  )
}
