import { useSearchParams } from 'react-router'

import FilterChips from '../components/FilterChips.jsx'
import TripCard from '../components/TripCard.jsx'
import { trips } from '../content/trips.js'
import { placeSlug } from '../lib/trips.js'
import { usePageTitle } from '../lib/usePageTitle.js'

/** The sentence under the lede while no trip is published. */
export const EMPTY = 'No trips written up yet.'

/**
 * Every place across the trips, as one FilterChips group: the order each
 * is first seen (newest trip first, then visit order), each counted once
 * per trip that went there.
 */
function placeGroup(list) {
  const counts = new Map()
  for (const trip of list) {
    const names = new Set(trip.frontmatter.places.map((place) => place.name))
    for (const name of names) {
      const value = placeSlug(name)
      const entry = counts.get(value) ?? { value, label: name, count: 0 }
      entry.count += 1
      counts.set(value, entry)
    }
  }
  return { key: 'place', label: 'Place', options: [...counts.values()] }
}

function visits(trip, place) {
  return trip.frontmatter.places.some((p) => placeSlug(p.name) === place)
}

/**
 * The travel index: every published trip, newest first, as cover cards.
 *
 * Place chips above the list filter the cards. The pressed place lives in
 * the query (`/travel?place=naxos`), not in state, so a shared link lands
 * filtered and Back undoes nothing it should not: the entry is replaced,
 * not pushed. Not the hash, as the spec first had it: the skip link's
 * `#main` would have cleared the filter, and a hand-typed `#%` threw in
 * `decodeURIComponent`. A place that names no chip is ignored rather than
 * showing an empty list. With one trip there are no chips: its two or three places
 * would pass `FilterChips`' one-chip rule, yet every chip would show the
 * same single card.
 *
 * The page is unlinked until a trip publishes (T11); reached directly, it
 * says so under its lede (#125).
 */
export default function Travel() {
  usePageTitle('Travel · Joey Haas')
  const [params, setParams] = useSearchParams()
  const group = placeGroup(trips)
  const wanted = params.get('place')
  const place = group.options.some((option) => option.value === wanted)
    ? wanted
    : null
  const shown = place ? trips.filter((trip) => visits(trip, place)) : trips

  function select(next) {
    setParams(next.place ? { place: next.place } : {}, { replace: true })
  }

  return (
    <section>
      <h1>Travel</h1>
      <p className="prose">
        Trips, a day at a time: where we went, what happened and a few photos.
      </p>
      {trips.length === 0 ? (
        <p className="muted">{EMPTY}</p>
      ) : (
        <>
          {trips.length > 1 && (
            <FilterChips groups={[group]} value={{ place }} onChange={select} />
          )}
          <ul className="trip-list" role="list">
            {shown.map((trip, index) => (
              <li key={trip.slug}>
                <TripCard trip={trip} eager={index === 0} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
