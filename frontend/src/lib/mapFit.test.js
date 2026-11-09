import { describe, expect, it } from 'vitest'
import { OFF_MAP_MARGIN, isOffMap, makeFit } from './mapFit.js'

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

describe('isOffMap', () => {
  const viewBox = [0, 0, 800, 600]

  it('keeps a point well inside', () => {
    expect(isOffMap({ x: 400, y: 300 }, viewBox)).toBe(false)
  })

  it('drops a point outside or inside the margin', () => {
    expect(isOffMap({ x: -5, y: 300 }, viewBox)).toBe(true)
    expect(isOffMap({ x: 400, y: 601 }, viewBox)).toBe(true)
    expect(isOffMap({ x: OFF_MAP_MARGIN - 1, y: 300 }, viewBox)).toBe(true)
    expect(isOffMap({ x: 400, y: 600 - OFF_MAP_MARGIN + 1 }, viewBox)).toBe(
      true,
    )
    expect(isOffMap({ x: OFF_MAP_MARGIN, y: OFF_MAP_MARGIN }, viewBox)).toBe(
      false,
    )
  })

  it('honours a viewBox that does not start at the origin and a custom margin', () => {
    expect(isOffMap({ x: 105, y: 105 }, [100, 100, 50, 50], 0)).toBe(false)
    expect(isOffMap({ x: 95, y: 105 }, [100, 100, 50, 50], 0)).toBe(true)
  })

  it('treats a non-finite point as off the map', () => {
    expect(isOffMap({ x: NaN, y: 10 }, viewBox)).toBe(true)
  })
})
