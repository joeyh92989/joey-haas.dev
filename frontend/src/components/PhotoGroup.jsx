import TripPhoto from './TripPhoto.jsx'

/** Half the 45rem column on a desktop; the whole width once a pair stacks. */
const SIZES = {
  1: '(min-width: 46rem) 45rem, 100vw',
  2: '(min-width: 46rem) 22.5rem, 100vw',
}

/**
 * A day's photos, in groups of one or two: a pair sits side by side (stacked
 * on a phone, by CSS) and a photo left over goes full width.
 *
 * The parser lifts image lines out of the prose and keeps their order, and
 * the photos render after the prose, so "two consecutive image lines" is the
 * same thing as "the next two photos": pairing them in order is the
 * authoring rule, not a guess at it.
 *
 * @param {object} props
 * @param {string} props.slug
 * @param {object[]} props.photos The day's photos, in markdown order.
 * @param {boolean} [props.eager] Load these at once (the page's first group).
 * @param {(name: string, opener: HTMLElement) => void} [props.onOpen]
 */
export default function PhotoGroup({ slug, photos, eager = false, onOpen }) {
  const groups = []
  for (let i = 0; i < photos.length; i += 2) {
    groups.push(photos.slice(i, i + 2))
  }
  return groups.map((group, index) => (
    <div
      key={group[0].name}
      className={
        group.length === 2 ? 'photo-group photo-group--two' : 'photo-group'
      }
    >
      {group.map((photo) => (
        <TripPhoto
          key={photo.name}
          slug={slug}
          photo={photo}
          sizes={SIZES[group.length]}
          eager={eager && index === 0}
          onOpen={onOpen && ((opener) => onOpen(photo.name, opener))}
        />
      ))}
    </div>
  ))
}
