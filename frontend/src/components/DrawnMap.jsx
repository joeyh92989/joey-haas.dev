import { isOnMap, project } from '../lib/mapFit.js'

/**
 * A hand-drawn map with numbered stops: the travel route map, and the
 * component Denver spots is to reuse rather than add a second one.
 *
 * The drawing is a prop (a component rendering SVG shapes in the
 * `drawn-map__*` classes, which CSS colours from tokens), placed by a
 * two-point `fit` from `lib/mapFit.js`. Stops are `{name, lat, lon, href}`
 * and are numbered in the order given.
 *
 * The pins are HTML links laid over the SVG at percentage positions rather
 * than shapes inside it, for two reasons: an `<svg role="img">` makes its
 * children presentational, so a link inside it would be focusable but
 * unnamed to a screen reader; and an HTML pin keeps one tap-sized footprint
 * at every width, where an SVG circle shrinks with the drawing. The frame
 * takes the viewBox's aspect ratio, so the percentages land where the
 * projection put them.
 *
 * A stop that projects outside the drawing, or within its edge margin, gets
 * no pin (it would be clipped) but keeps its number in the caption list,
 * which is the map's real text alternative.
 *
 * @param {object} props
 * @param {import('react').ComponentType} props.drawing
 * @param {object} props.fit From `fitFromPoints`.
 * @param {{name: string, lat: number, lon: number, href: string}[]} props.stops
 * @param {{width: number, height: number}} props.viewBox
 * @param {string} props.label Leads the accessible name, e.g. "Route".
 * @param {string} [props.note] A line above the stop list.
 */
export default function DrawnMap({
  drawing: Drawing,
  fit,
  stops,
  viewBox,
  label,
  note = 'Drawn route, not a live map.',
}) {
  const { width, height } = viewBox
  const names = stops.map((stop) => stop.name).join(', ')
  return (
    <figure className="drawn-map">
      <div
        className="drawn-map__frame"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <svg
          className="drawn-map__svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${label}: ${names}`}
        >
          <rect className="drawn-map__sea" width={width} height={height} />
          <Drawing />
        </svg>
        {stops.map((stop, index) => {
          if (!isOnMap(fit, stop, viewBox)) return null
          const { x, y } = project(fit, stop)
          const left = (x / width) * 100
          return (
            <a
              key={stop.name}
              className={
                left > 70
                  ? 'drawn-map__pin drawn-map__pin--label-left'
                  : 'drawn-map__pin'
              }
              href={stop.href}
              style={{ left: `${left}%`, top: `${(y / height) * 100}%` }}
              aria-label={`${index + 1}. ${stop.name}`}
            >
              <span className="drawn-map__number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="drawn-map__name" aria-hidden="true">
                {stop.name}
              </span>
            </a>
          )
        })}
      </div>
      <figcaption className="drawn-map__caption">
        <span className="drawn-map__note">{note}</span>
        <ol className="drawn-map__stops">
          {stops.map((stop) => (
            <li key={stop.name}>
              <a href={stop.href}>{stop.name}</a>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}
