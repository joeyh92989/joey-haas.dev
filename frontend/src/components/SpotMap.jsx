import { useEffect, useMemo, useRef, useState } from 'react'
import { placeSpots } from '../lib/mapFit.js'
import { cx } from '../lib/cx.js'

// The map's look, from utilities (#536). Every colour is a token, so one
// drawing is right in both themes. The pins are HTML buttons over the SVG;
// their --surface halo is the contrast guarantee, so a pin never depends on
// the ground under it.
const MAP =
  'spot-map relative overflow-hidden rounded-[10px] border border-border bg-card'
const GROUND = 'spot-map-ground block h-full w-full'
const STROKE =
  'fill-none [stroke-linecap:round] [stroke-linejoin:round] [vector-effect:non-scaling-stroke]'
const PARK = `${STROKE} fill-[color-mix(in_srgb,var(--ok)_18%,var(--surface))] stroke-none`
const WATER_EDGE = `${STROKE} [stroke:var(--chart-2)] [stroke-width:7]`
const WATER = `${STROKE} [stroke:var(--accent-soft)] [stroke-width:4]`
const STREET = `${STROKE} [stroke:var(--line-strong)] [stroke-width:0.75]`
const ARTERIAL = `${STROKE} [stroke:var(--text-3)] [stroke-width:1.75]`
// Text on the drawing gets a --surface halo so it reads over any line.
const HALO =
  '[paint-order:stroke] [stroke:var(--surface)] [stroke-width:3px] [stroke-linejoin:round]'
const LABEL = `${HALO} [font:500_11px_var(--font-mono)] [fill:var(--text-2)] tracking-[0.06em] uppercase [text-anchor:middle]`
const WATER_LABEL = `${HALO} [font:400_11px_var(--font-mono)] [fill:var(--text-3)] tracking-[0.06em] normal-case [text-anchor:middle]`
const TITLE = `${HALO} [font:500_var(--fs-20)_var(--font-display)] [fill:var(--text)]`
const NORTH_ARROW = '[fill:var(--text-3)]'
const NORTH_TEXT = `${HALO} [font:500_10px_var(--font-mono)] [fill:var(--text-3)] [text-anchor:middle]`
const PINS = 'absolute inset-0 pointer-events-none'
// The mark is 14px; with 4px of padding the button is a 22px square.
const PIN =
  'spot-map-pin group pointer-events-auto absolute cursor-pointer bg-transparent p-1 [border:0] [transform:translate(-50%,-100%)] focus-visible:[outline:none] aria-pressed:z-1'
const PIN_MARK =
  'block size-[14px] [transform:rotate(-45deg)] rounded-[50%_50%_50%_0] bg-primary [box-shadow:0_0_0_2px_var(--surface)] group-focus-visible:outline-2 group-focus-visible:outline-solid group-focus-visible:outline-offset-3 group-focus-visible:outline-ring group-aria-pressed:size-5 group-aria-pressed:bg-foreground group-aria-pressed:[box-shadow:0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)] motion-safe:[transition:width_120ms_ease,height_120ms_ease]'
const POPOVER =
  'absolute z-2 min-w-44 max-w-60 rounded-[8px] border border-border bg-card px-3 py-2 text-[0.8125rem] [box-shadow:0_6px_18px_var(--overlay)] [transform:translate(-50%,calc(-100%_-_30px))] [&.below]:[transform:translate(-50%,12px)] [&.start]:[transform:translate(-1.25rem,calc(-100%_-_30px))] [&.end]:[transform:translate(calc(-100%_+_1.25rem),calc(-100%_-_30px))] [&.below.start]:[transform:translate(-1.25rem,12px)] [&.below.end]:[transform:translate(calc(-100%_+_1.25rem),12px)]'
const CLEAR = 'absolute top-2 left-2'
const ATTRIBUTION =
  'absolute right-0 bottom-0 m-0 rounded-tl-[4px] bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] px-2 py-px text-[0.75rem] text-(color:--text-3) [&_a]:text-muted-foreground'

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
      className={MAP}
      style={{ aspectRatio: `${width} / ${height}` }}
      onKeyDown={onKeyDown}
    >
      <svg
        className={GROUND}
        viewBox={drawing.viewBox.join(' ')}
        role="img"
        aria-label={label}
      >
        <path className={PARK} d={drawing.parks} />
        <path className={WATER_EDGE} d={drawing.water} />
        <path className={WATER} d={drawing.water} />
        <path className={STREET} d={drawing.streets} />
        <path className={ARTERIAL} d={drawing.arterials} />
        {drawing.labels.map((l) => (
          <text
            key={l.text}
            className={l.kind === 'water' ? WATER_LABEL : LABEL}
            x={l.x}
            y={l.y}
            transform={l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y})` : null}
          >
            {l.text}
          </text>
        ))}
        {title ? (
          <text className={TITLE} x={16} y={height - 16}>
            {title}
          </text>
        ) : null}
        <g transform={`translate(${width - 24} 32)`}>
          <path className={NORTH_ARROW} d="M0 -14 L5 0 L0 -3 L-5 0 Z" />
          <text className={NORTH_TEXT} y={14}>
            N
          </text>
        </g>
      </svg>
      <div className={PINS}>
        {onMap.map((spot) => (
          <button
            key={spot.key}
            type="button"
            className={PIN}
            style={at(spot.key)}
            aria-label={spot.pinLabel ?? spot.name}
            aria-pressed={spot.key === selected}
            onClick={() => onSelect(spot.key === selected ? null : spot.key)}
          >
            <span className={PIN_MARK} aria-hidden="true" />
          </button>
        ))}
      </div>
      {chosen && renderPopover ? (
        <div
          className={cx(
            POPOVER,
            popoverClass(placed.get(chosen.key), width, height, rendered),
          )}
          style={at(chosen.key)}
        >
          {renderPopover(chosen)}
        </div>
      ) : null}
      {selected != null ? (
        <button
          type="button"
          className={cx('btn sm', CLEAR)}
          onClick={() => onSelect(null)}
        >
          Clear selection
        </button>
      ) : null}
      {drawing.attribution ? (
        <p className={ATTRIBUTION}>
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
