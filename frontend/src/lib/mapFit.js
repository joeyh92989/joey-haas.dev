/**
 * The projection behind `DrawnMap`: places a `{lat, lon}` on a hand-drawn
 * SVG.
 *
 * A drawing is calibrated by two reference points, each a real place with
 * the `{x, y}` it sits at on the drawing. From those two the fit is an
 * axis-aligned affine map, `x` linear in longitude and `y` linear in
 * latitude (inverted, since SVG's y grows downward). There is no rotation:
 * the drawings are north-up, and two points cannot pin down one honestly.
 *
 * Over the few hundred kilometres a route map covers this is an
 * equirectangular projection, which is accurate enough at poster scale,
 * provided the drawing itself was drawn that way. `scaleRatio` is the check
 * that it was: a drawing stretched in one direction implies two scales whose
 * ratio is far from `cos(latitude)`, and a stop on it would land wherever
 * the stretch put it.
 *
 * Pure, so the accuracy criteria are unit tests rather than eyeballing.
 */

/** Distance from the viewBox edge inside which a pin is not drawn. */
export const EDGE_MARGIN = 12

/** How far `scaleRatio` may stray from 1 before a drawing is squashed. */
export const SCALE_TOLERANCE = 0.15

/**
 * Builds a fit from two reference points.
 *
 * @param {{lat: number, lon: number, x: number, y: number}[]} refs Exactly
 *   two, differing in both latitude and longitude.
 * @returns {{ax: number, bx: number, ay: number, by: number, midLat: number}}
 */
export function fitFromPoints(refs) {
  if (!Array.isArray(refs) || refs.length !== 2) {
    throw new Error('a map fit needs exactly two reference points')
  }
  const [a, b] = refs
  for (const ref of refs) {
    for (const key of ['lat', 'lon', 'x', 'y']) {
      if (!Number.isFinite(ref?.[key])) {
        throw new Error(`a reference point has no usable ${key}`)
      }
    }
  }
  if (a.lon === b.lon || a.lat === b.lat) {
    // One shared coordinate leaves that axis's scale undefined.
    throw new Error(
      'the two reference points must differ in both latitude and longitude',
    )
  }
  const ax = (b.x - a.x) / (b.lon - a.lon)
  const ay = (b.y - a.y) / (b.lat - a.lat)
  return {
    ax,
    bx: a.x - ax * a.lon,
    ay,
    by: a.y - ay * a.lat,
    midLat: (a.lat + b.lat) / 2,
  }
}

/** Where a place falls on the drawing. */
export function project(fit, { lat, lon }) {
  return { x: fit.ax * lon + fit.bx, y: fit.ay * lat + fit.by }
}

/**
 * Whether a place can be drawn: inside the viewBox and clear of its edge by
 * `margin`, so a pin is never clipped. A stop that fails this is left off
 * the drawing and kept in the caption's stop list.
 *
 * @param {object} fit
 * @param {{lat: number, lon: number}} point
 * @param {{width: number, height: number}} viewBox
 * @param {number} [margin]
 */
export function isOnMap(fit, point, viewBox, margin = EDGE_MARGIN) {
  const { x, y } = project(fit, point)
  return (
    x >= margin &&
    y >= margin &&
    x <= viewBox.width - margin &&
    y <= viewBox.height - margin
  )
}

/**
 * The drawing's east-west scale against its north-south scale, divided by
 * what an equirectangular drawing would have (`cos` of the middle
 * latitude). 1 is a true drawing; below 1 it is squashed east-west, above 1
 * stretched. A y axis that grows northward (a drawing upside down) comes
 * out negative.
 */
export function scaleRatio(fit) {
  const expected = Math.cos((fit.midLat * Math.PI) / 180)
  return fit.ax / -fit.ay / expected
}

/** Whether `scaleRatio` is within `SCALE_TOLERANCE` of a true drawing. */
export function isTrueToScale(fit, tolerance = SCALE_TOLERANCE) {
  return Math.abs(scaleRatio(fit) - 1) <= tolerance
}
