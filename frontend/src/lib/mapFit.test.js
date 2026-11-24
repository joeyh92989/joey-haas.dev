import { describe, expect, it } from 'vitest'

import {
  EDGE_MARGIN,
  fitFromPoints,
  isOnMap,
  isTrueToScale,
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
