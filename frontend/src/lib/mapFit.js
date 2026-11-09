/**
 * Projection for the drawn maps (`SpotMap`): latitude and longitude to a
 * point in the drawing's viewBox, from two reference points measured on the
 * drawing. Pure, so the page, the generator and the tests share it.
 *
 * The map is a north-up equirectangular poster: x is linear in longitude,
 * y linear in latitude (inverted), no rotation. That only reads right when
 * a degree of longitude is drawn cos(latitude) as wide as a degree of
 * latitude, so `makeFit` refuses reference points whose two scales are
 * more than `SCALE_TOLERANCE` off that ratio: the drawing's proportions
 * would be wrong, and the pins with them.
 *
 * Spec: docs/planning/2026-11-08-denver-spots-design.md, SpotMap.
 */

/** How far the implied x/y scale ratio may stray from cos(latitude). */
export const SCALE_TOLERANCE = 0.05

/** The margin, in viewBox units, inside which a point counts as off the map. */
export const OFF_MAP_MARGIN = 12

/**
 * The affine map from two reference points.
 *
 * @param {{points: {lat: number, lng: number, x: number, y: number}[]}} fit
 *   Two reference points at opposite corners of the drawn area.
 * @returns {(point: {lat: number, lng: number}) => {x: number, y: number}}
 * @throws {Error} When the points share a latitude or longitude, or their
 *   implied scales are not in the cos(latitude) ratio.
 */
export function makeFit(fit) {
  const [a, b] = fit?.points ?? []
  if (!a || !b || a.lng === b.lng || a.lat === b.lat) {
    throw new Error(
      'A map fit needs two points apart in latitude and longitude',
    )
  }
  const sx = (b.x - a.x) / (b.lng - a.lng)
  const sy = (b.y - a.y) / (b.lat - a.lat)
  if (!(sx > 0) || !(sy < 0)) {
    throw new Error('A map fit must be north-up: x grows east, y grows south')
  }
  const meanLat = ((a.lat + b.lat) / 2) * (Math.PI / 180)
  const ratio = sx / -sy / Math.cos(meanLat)
  if (Math.abs(ratio - 1) > SCALE_TOLERANCE) {
    throw new Error(
      `A map fit's scales are off by ${Math.round(Math.abs(ratio - 1) * 100)}%: the drawing's proportions are wrong`,
    )
  }
  return ({ lat, lng }) => ({
    x: a.x + (lng - a.lng) * sx,
    y: a.y + (lat - a.lat) * sy,
  })
}

/**
 * Whether a projected point falls outside the drawing or within its margin.
 *
 * @param {{x: number, y: number}} point A projected point.
 * @param {number[]} viewBox `[minX, minY, width, height]`.
 * @param {number} [margin] The edge band that also counts as off the map.
 * @returns {boolean}
 */
export function isOffMap(point, viewBox, margin = OFF_MAP_MARGIN) {
  const [minX, minY, width, height] = viewBox
  return (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < minX + margin ||
    point.y < minY + margin ||
    point.x > minX + width - margin ||
    point.y > minY + height - margin
  )
}

/**
 * Where each spot lands on a drawing, and whether it is off the map.
 *
 * @param {{fit: object, viewBox: number[]}} drawing A drawn map module.
 * @param {{key: string, lat: number, lng: number}[]} spots
 * @returns {Map<string, {x: number, y: number, offMap: boolean}>} By key.
 */
export function placeSpots(drawing, spots) {
  const project = makeFit(drawing.fit)
  const placed = new Map()
  for (const spot of spots) {
    const point = project({ lat: spot.lat, lng: spot.lng })
    placed.set(spot.key, {
      ...point,
      offMap: isOffMap(point, drawing.viewBox),
    })
  }
  return placed
}
