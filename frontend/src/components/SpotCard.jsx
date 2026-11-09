import { denver, tagLabel } from '../content/denver.js'

/** A spot's tags as small pills, in the order the API gave them. */
export function SpotTags({ tags }) {
  if (tags.length === 0) return null
  return (
    <ul className="spot-tags">
      {tags.map((tag) => (
        <li key={tag}>{tagLabel(tag)}</li>
      ))}
    </ul>
  )
}

/**
 * One spot in the /denver list (spec: Denver spots, Surface 1).
 *
 * An `article`, not a link: there is no spot page. The name is a toggle
 * button that selects the spot, which marks its pin on the map; the
 * selected card takes the accent border. A spot whose point is outside the
 * drawn map says so in a kicker rather than silently having no pin.
 *
 * @param {object} props
 * @param {{name: string, neighbourhood: string|null, tags: string[],
 *   blurb: string|null}} props.spot A public spot.
 * @param {boolean} [props.selected] Whether this is the selected spot.
 * @param {boolean} [props.offMap] Whether its point is outside the map.
 * @param {() => void} [props.onSelect] The name was pressed.
 * @param {import('react').Ref<HTMLElement>} [props.ref] The article, so the
 *   page can scroll it into view (React 19 passes `ref` as a prop).
 */
export default function SpotCard({
  spot,
  selected = false,
  offMap = false,
  onSelect,
  ref,
}) {
  return (
    <article
      ref={ref}
      className={selected ? 'spot-card selected' : 'spot-card'}
    >
      {offMap ? <p className="spot-card-kicker">{denver.page.offMap}</p> : null}
      <div className="spot-card-head">
        <h2 className="spot-card-name">
          {onSelect ? (
            <button type="button" aria-pressed={selected} onClick={onSelect}>
              {spot.name}
            </button>
          ) : (
            spot.name
          )}
        </h2>
        {spot.neighbourhood ? (
          <span className="spot-card-area">{spot.neighbourhood}</span>
        ) : null}
      </div>
      <SpotTags tags={spot.tags} />
      {spot.blurb ? <p className="spot-card-blurb">{spot.blurb}</p> : null}
    </article>
  )
}
