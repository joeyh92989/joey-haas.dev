import { useEffect, useMemo, useRef, useState } from 'react'
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

  // The rendered width, for the popover's side test. jsdom has no
  // ResizeObserver, so tests keep the viewBox fallback.
  const frame = useRef(null)
  const [rendered, setRendered] = useState(null)
  useEffect(() => {
    const node = frame.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) =>
      setRendered(entry.contentRect.width),
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && selected != null) {
      event.stopPropagation()
      onSelect(null)
    }
  }

  return (
    <div
      ref={frame}
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
          className={popoverClass(
            placed.get(chosen.key),
            width,
            height,
            rendered,
          )}
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

/** Half the popover's widest (15rem), plus a little room, in CSS pixels. */
export const POPOVER_EDGE = 128

/** The popover's tallest (name, area, a wrapped tag row) and the pin gap. */
export const POPOVER_RISE = 150

/**
 * Opens below a pin near the top edge, and leans in from the side edges.
 * A centred popover overflows the side when the pin is nearer to it than
 * half the popover's width, and the top when it is nearer than the
 * popover's height; on a phone-width map both are a large share of the
 * drawing, so the tests run on the rendered size when it is known. Before
 * the first measurement they fall back to fractions of the drawing.
 *
 * @param {{x: number, y: number}} point The pin, in viewBox units.
 * @param {number} width The viewBox width.
 * @param {number} height The viewBox height.
 * @param {number|null} [rendered] The map's rendered width in pixels; the
 *   height follows from the drawing's proportions.
 */
export function popoverClass({ x, y }, width, height, rendered = null) {
  const classes = ['spot-map-popover']
  const fromTop = rendered ? (y / width) * rendered : null
  if (rendered ? fromTop < POPOVER_RISE : y < height * 0.3) {
    classes.push('below')
  }
  const fromLeft = rendered ? (x / width) * rendered : null
  if (rendered ? fromLeft < POPOVER_EDGE : x < width * 0.2) {
    classes.push('start')
  } else if (rendered ? rendered - fromLeft < POPOVER_EDGE : x > width * 0.8) {
    classes.push('end')
  }
  return classes.join(' ')
}
