import { useMemo } from 'react'
import { placeSpots } from '../lib/mapFit.js'

/**
 * A drawn poster map with a pin per spot (spec: Denver spots, SpotMap).
 *
 * The ground is an inline SVG built from a drawing module
 * (`content/maps/*.js`): streets in two weights, water, parks and labels,
 * every colour a token, so one drawing is right in both themes. Pins are
 * HTML buttons laid over it at the projected point, which keeps them
 * focusable and named like any other control. A spot whose point falls
 * outside the drawing, or inside its margin, is not drawn; the page's list
 * still shows it, marked off the map (`placeSpots`).
 *
 * The map never re-fits: the drawn area is fixed, and filtering only makes
 * pins appear and disappear.
 *
 * @param {object} props
 * @param {object} props.drawing The drawing module (`denverMap`).
 * @param {{key: string, name: string, lat: number, lng: number,
 *   pinLabel?: string}[]} props.spots The spots to pin.
 * @param {string|null} [props.selected] The selected spot's key.
 * @param {(key: string|null) => void} [props.onSelect] Selection changes;
 *   null clears it (Escape, the ground, the selected pin again).
 * @param {string} props.label The map's accessible name.
 * @param {string} [props.title] The serif title at the lower left.
 * @param {(spot: object) => import('react').ReactNode} [props.renderPopover]
 *   The card shown at the selected pin.
 */
export default function SpotMap({
  drawing,
  spots,
  selected = null,
  onSelect = () => {},
  label,
  title,
  renderPopover,
}) {
  const placed = useMemo(() => placeSpots(drawing, spots), [drawing, spots])
  const [, , width, height] = drawing.viewBox
  const onMap = spots.filter((spot) => !placed.get(spot.key).offMap)
  const chosen = onMap.find((spot) => spot.key === selected)
  const at = (key) => {
    const { x, y } = placed.get(key)
    return { left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%` }
  }

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && selected != null) {
      event.stopPropagation()
      onSelect(null)
    }
  }

  return (
    <div
      className="spot-map"
      style={{ aspectRatio: `${width} / ${height}` }}
      onKeyDown={onKeyDown}
    >
      <svg
        className="spot-map-ground"
        viewBox={drawing.viewBox.join(' ')}
        role="img"
        aria-label={label}
        onClick={() => onSelect(null)}
      >
        <path className="spot-map-park" d={drawing.parks} />
        <path className="spot-map-water-edge" d={drawing.water} />
        <path className="spot-map-water" d={drawing.water} />
        <path className="spot-map-street" d={drawing.streets} />
        <path className="spot-map-arterial" d={drawing.arterials} />
        {drawing.labels.map((l) => (
          <text
            key={l.text}
            className={`spot-map-label ${l.kind}`}
            x={l.x}
            y={l.y}
            transform={l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y})` : null}
          >
            {l.text}
          </text>
        ))}
        {title ? (
          <text className="spot-map-title" x={16} y={height - 16}>
            {title}
          </text>
        ) : null}
        <g className="spot-map-north" transform={`translate(${width - 24} 32)`}>
          <path d="M0 -14 L5 0 L0 -3 L-5 0 Z" />
          <text y={14}>N</text>
        </g>
      </svg>
      <div className="spot-map-pins">
        {onMap.map((spot) => (
          <button
            key={spot.key}
            type="button"
            className="spot-map-pin"
            style={at(spot.key)}
            aria-label={spot.pinLabel ?? spot.name}
            aria-pressed={spot.key === selected}
            onClick={() => onSelect(spot.key === selected ? null : spot.key)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      {chosen && renderPopover ? (
        <div
          className={popoverClass(placed.get(chosen.key), width, height)}
          style={at(chosen.key)}
        >
          {renderPopover(chosen)}
        </div>
      ) : null}
      {drawing.attribution ? (
        <p className="spot-map-attribution">
          <a href={drawing.attribution.href}>{drawing.attribution.text}</a>
        </p>
      ) : null}
    </div>
  )
}

/** Opens below a pin near the top edge, and leans in from the side edges. */
function popoverClass({ x, y }, width, height) {
  const classes = ['spot-map-popover']
  if (y < height * 0.3) classes.push('below')
  if (x < width * 0.2) classes.push('start')
  else if (x > width * 0.8) classes.push('end')
  return classes.join(' ')
}
