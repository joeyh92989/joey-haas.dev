import { describe, expect, it } from 'vitest'

import {
  EDGE_MARGIN,
  fitFromPoints,
  isOnMap,
  isTrueToScale,
  makeFit,
  placeSpots,
  project,
  scaleRatio,
} from './mapFit.js'

// A drawing made the way the real ones are: equirectangular at 60px per
// degree of latitude around 40°N, measured to the nearest half pixel.
const K = 60
const COS = Math.cos((40 * Math.PI) / 180)
const drawn = ({ lat, lon }) => ({
  x: Math.round(2 * K * COS * (lon - 16)) / 2,
  y: Math.round(2 * K * (44 - lat)) / 2,
})

const DUBROVNIK = { lat: 42.6507, lon: 18.0944 }
const ATHENS = { lat: 37.9838, lon: 23.7275 }
const NAXOS = { lat: 37.1036, lon: 25.3767 }
const VIEWBOX = { width: 560, height: 480 }

const fit = fitFromPoints([
  { ...DUBROVNIK, ...drawn(DUBROVNIK) },
  { ...ATHENS, ...drawn(ATHENS) },
])

const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)

describe('fitFromPoints and project', () => {
  it('projects both reference points within 1px of where they were measured', () => {
    expect(distance(project(fit, DUBROVNIK), drawn(DUBROVNIK))).toBeLessThan(1)
    expect(distance(project(fit, ATHENS), drawn(ATHENS))).toBeLessThan(1)
  })

  it('projects a third known place within 6px', () => {
    expect(distance(project(fit, NAXOS), drawn(NAXOS))).toBeLessThan(6)
  })

  it('puts north up and east right', () => {
    const north = project(fit, { lat: 43, lon: 20 })
    const south = project(fit, { lat: 38, lon: 20 })
    const east = project(fit, { lat: 40, lon: 24 })
    const west = project(fit, { lat: 40, lon: 19 })
    expect(north.y).toBeLessThan(south.y)
    expect(east.x).toBeGreaterThan(west.x)
  })

  it('refuses anything but two usable reference points', () => {
    expect(() => fitFromPoints([{ lat: 1, lon: 1, x: 0, y: 0 }])).toThrow(
      /exactly two/,
    )
    expect(() =>
      fitFromPoints([
        { lat: 1, lon: 1, x: 0, y: 0 },
        { lat: 2, lon: 'east', x: 9, y: 9 },
      ]),
    ).toThrow(/lon/)
    expect(() =>
      fitFromPoints([
        { lat: 40, lon: 18, x: 0, y: 0 },
        { lat: 40, lon: 22, x: 100, y: 50 },
      ]),
    ).toThrow(/both latitude and longitude/)
  })
})

describe('isOnMap', () => {
  it('keeps a place well inside the viewBox', () => {
    expect(isOnMap(fit, NAXOS, VIEWBOX)).toBe(true)
  })

  it('drops a place outside the viewBox', () => {
    const rome = { lat: 41.9028, lon: 12.4964 }
    expect(project(fit, rome).x).toBeLessThan(0)
    expect(isOnMap(fit, rome, VIEWBOX)).toBe(false)
  })

  it('drops a place inside the edge margin', () => {
    // 5px in from the left edge: inside the viewBox, inside the margin.
    const lon = (5 - fit.bx) / fit.ax
    const nearEdge = { lat: 40, lon }
    const { x } = project(fit, nearEdge)
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThan(EDGE_MARGIN)
    expect(isOnMap(fit, nearEdge, VIEWBOX)).toBe(false)
  })
})

describe('scaleRatio', () => {
  it('is close to 1 for a drawing made to scale', () => {
    expect(scaleRatio(fit)).toBeCloseTo(1, 1)
    expect(isTrueToScale(fit)).toBe(true)
  })

  it('flags a drawing squashed east-west', () => {
    const squashed = fitFromPoints([
      { ...DUBROVNIK, x: 120, y: 90 },
      { ...ATHENS, x: 200, y: 370 },
    ])
    expect(scaleRatio(squashed)).toBeLessThan(0.85)
    expect(isTrueToScale(squashed)).toBe(false)
  })

  it('flags the mockup schematic, which was never drawn to scale', () => {
    const mockup = fitFromPoints([
      { ...DUBROVNIK, x: 120, y: 90 },
      { ...ATHENS, x: 400, y: 170 },
    ])
    expect(isTrueToScale(mockup)).toBe(false)
  })
})

// A north-up fit at Denver's latitude: 1000 px per degree of latitude and
// cos(39.75°) of that per degree of longitude.
const LAT_SCALE = 1000
const LNG_SCALE = LAT_SCALE * Math.cos((39.75 * Math.PI) / 180)
const A = { lat: 39.78, lng: -105.03, x: 0, y: 0 }
const B = {
  lat: 39.72,
  lng: -104.95,
  x: 0.08 * LNG_SCALE,
  y: 0.06 * LAT_SCALE,
}

describe('makeFit', () => {
  it('maps both reference points onto themselves', () => {
    const project = makeFit({ points: [A, B] })
    for (const point of [A, B]) {
      const { x, y } = project(point)
      expect(x).toBeCloseTo(point.x, 6)
      expect(y).toBeCloseTo(point.y, 6)
    }
  })

  it('is linear between them, east to the right and north up', () => {
    const project = makeFit({ points: [A, B] })
    const middle = project({ lat: 39.75, lng: -104.99 })
    expect(middle.x).toBeCloseTo(B.x / 2, 6)
    expect(middle.y).toBeCloseTo(B.y / 2, 6)
    const north = project({ lat: 39.76, lng: -104.99 })
    expect(north.y).toBeLessThan(middle.y)
  })

  it('refuses scales out of the cos(latitude) ratio', () => {
    const squashed = { ...B, x: 0.08 * LAT_SCALE }
    expect(() => makeFit({ points: [A, squashed] })).toThrow(/proportions/)
  })

  it('accepts a small authoring error', () => {
    const nearly = { ...B, x: B.x * 1.03 }
    expect(() => makeFit({ points: [A, nearly] })).not.toThrow()
  })

  it('refuses a south-up or mirrored fit', () => {
    expect(() => makeFit({ points: [A, { ...B, y: -B.y }] })).toThrow(
      /north-up/,
    )
    expect(() => makeFit({ points: [A, { ...B, x: -B.x }] })).toThrow(
      /north-up/,
    )
  })

  it('refuses points sharing a latitude or longitude', () => {
    expect(() => makeFit({ points: [A, { ...B, lat: A.lat }] })).toThrow()
    expect(() => makeFit({ points: [A, { ...B, lng: A.lng }] })).toThrow()
    expect(() => makeFit({ points: [A] })).toThrow()
    expect(() => makeFit(undefined)).toThrow()
  })
})

describe('placeSpots', () => {
  const drawing = { fit: { points: [A, B] }, viewBox: [0, 0, B.x, B.y] }

  it('places each spot by key and flags the ones off the drawing', () => {
    const placed = placeSpots(drawing, [
      { key: 'inside', lat: 39.75, lng: -104.99 },
      { key: 'outside', lat: 39.9, lng: -104.99 },
    ])
    expect(placed.get('inside')).toEqual({
      x: expect.closeTo(B.x / 2, 6),
      y: expect.closeTo(B.y / 2, 6),
      offMap: false,
    })
    expect(placed.get('outside').offMap).toBe(true)
  })

  it('flags a spot inside the edge margin or with no coordinates', () => {
    const lngAt = (x) => A.lng + x / LNG_SCALE
    const placed = placeSpots(drawing, [
      { key: 'edge', lat: 39.75, lng: lngAt(EDGE_MARGIN - 1) },
      { key: 'clear', lat: 39.75, lng: lngAt(EDGE_MARGIN + 1) },
      { key: 'blank', lat: NaN, lng: -104.99 },
    ])
    expect(placed.get('edge').offMap).toBe(true)
    expect(placed.get('clear').offMap).toBe(false)
    expect(placed.get('blank').offMap).toBe(true)
  })
})
