// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { makeFit } from '../src/lib/mapFit.js'
import { denverMap } from '../src/content/maps/denver.js'
import {
  DENVER_AREA,
  FIXTURE_AREA,
  buildDrawing,
  eastEdge,
  joinRings,
  overpassQuery,
  renderModule,
  simplify,
} from './draw-denver-map.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(HERE, 'fixtures/overpass-union-station.json'),
    'utf8',
  ),
)

/** The polylines of an `M…L…` path, as point lists. */
function polylines(d) {
  return d
    .split('M')
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/Z$/, '')
        .split('L')
        .map((pair) => {
          const [x, y] = pair.trim().split(' ').map(Number)
          return { x, y }
        }),
    )
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function distanceToPath(p, d) {
  let best = Infinity
  for (const line of polylines(d)) {
    for (let i = 1; i < line.length; i += 1) {
      best = Math.min(best, distanceToSegment(p, line[i - 1], line[i]))
    }
  }
  return best
}

/** Nodes shared by two highway ways in the fixture: real intersections. */
function intersections(answer) {
  const seen = new Map()
  for (const el of answer.elements) {
    if (el.type !== 'way' || !el.tags?.highway) continue
    for (const [i, node] of (el.nodes ?? []).entries()) {
      const entry = seen.get(node) ?? { ways: new Set(), at: el.geometry[i] }
      entry.ways.add(el.id)
      seen.set(node, entry)
    }
  }
  return [...seen.values()].filter((e) => e.ways.size > 1).map((e) => e.at)
}

describe('buildDrawing', () => {
  it('is deterministic, whatever order Overpass answers in', () => {
    const once = buildDrawing(fixture, FIXTURE_AREA)
    const shuffled = {
      elements: [...fixture.elements].reverse(),
    }
    expect(buildDrawing(shuffled, FIXTURE_AREA)).toEqual(once)
    expect(renderModule(buildDrawing(fixture, FIXTURE_AREA))).toBe(
      renderModule(once),
    )
  })

  it('draws the streets and the river from the fixture', () => {
    const drawing = buildDrawing(fixture, FIXTURE_AREA)
    expect(drawing.viewBox).toEqual([0, 0, 400, 300])
    expect(drawing.streets.length).toBeGreaterThan(0)
    expect(drawing.arterials.length).toBeGreaterThan(0)
    expect(drawing.water).toMatch(/^M/)
  })

  it('puts real intersections on the drawn lines', () => {
    const drawing = buildDrawing(fixture, FIXTURE_AREA)
    const project = makeFit({
      points: [
        { lat: FIXTURE_AREA.north, lng: FIXTURE_AREA.west, x: 0, y: 0 },
        {
          lat: FIXTURE_AREA.south,
          lng: eastEdge(FIXTURE_AREA),
          x: FIXTURE_AREA.width,
          y: FIXTURE_AREA.height,
        },
      ],
    })
    const roads = `${drawing.arterials}${drawing.streets}`
    const inside = intersections(fixture)
      .map((n) => project({ lat: n.lat, lng: n.lon }))
      .filter((p) => p.x > 10 && p.y > 10 && p.x < 390 && p.y < 290)
    expect(inside.length).toBeGreaterThan(5)
    for (const point of inside) {
      expect(distanceToPath(point, roads)).toBeLessThan(6)
    }
  })

  it('projects reference points and labels with the drawing', () => {
    const drawing = buildDrawing(fixture, FIXTURE_AREA, {
      references: [
        { name: 'a', lat: 39.755, lng: -105.0 },
        { name: 'b', lat: 39.752, lng: -104.996 },
      ],
      labels: [{ text: 'LoDo', lat: 39.753, lng: -104.999 }],
      water: [{ text: 'River', lat: 39.754, lng: -105.002, rotate: -40 }],
    })
    expect(drawing.fit.points).toHaveLength(2)
    expect(() => makeFit(drawing.fit)).not.toThrow()
    expect(drawing.labels).toEqual([
      expect.objectContaining({ text: 'LoDo', kind: 'area' }),
      expect.objectContaining({ text: 'River', kind: 'water', rotate: -40 }),
    ])
  })
})

describe('the area', () => {
  it("is drawn in the viewBox's proportions", () => {
    expect(() =>
      makeFit({
        points: [
          { lat: DENVER_AREA.north, lng: DENVER_AREA.west, x: 0, y: 0 },
          {
            lat: DENVER_AREA.south,
            lng: eastEdge(DENVER_AREA),
            x: 800,
            y: 600,
          },
        ],
      }),
    ).not.toThrow()
  })

  it('asks Overpass for the area and nothing outside it', () => {
    const query = overpassQuery(DENVER_AREA)
    expect(query).toContain('39.73400,-105.02600,39.77600,')
    expect(query).toContain('out geom;')
  })
})

describe('simplify and joinRings', () => {
  it('drops collinear points and keeps corners', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]
    expect(simplify(line, 0.5)).toEqual([line[0], line[2], line[3]])
  })

  it('joins outer members end to end, reversing where needed', () => {
    const p = (lat, lon) => ({ lat, lon })
    const rings = joinRings([
      [p(0, 0), p(0, 1)],
      [p(1, 1), p(0, 1)],
      [p(1, 1), p(0, 0)],
    ])
    expect(rings).toHaveLength(1)
    expect(rings[0]).toHaveLength(4)
    expect(rings[0][0]).toEqual(rings[0][3])
  })

  it('drops a ring that never closes', () => {
    const p = (lat, lon) => ({ lat, lon })
    expect(joinRings([[p(0, 0), p(0, 1)]])).toEqual([])
  })
})

describe('the committed Denver map', () => {
  const source = fs.readFileSync(
    path.join(HERE, '../src/content/maps/denver.js'),
    'utf8',
  )

  it('carries the ODbL attribution', () => {
    expect(source).toContain('© OpenStreetMap contributors')
    expect(source).toContain('ODbL 1.0')
    expect(denverMap.attribution).toEqual({
      text: '© OpenStreetMap contributors',
      href: 'https://www.openstreetmap.org/copyright',
    })
  })

  it('has a fit that agrees with the projection the streets were drawn in', () => {
    // The pins go through `fit`, the streets through the area's corners; if
    // the two disagree, every pin sits off its street.
    const project = makeFit(denverMap.fit)
    const nw = project({ lat: DENVER_AREA.north, lng: DENVER_AREA.west })
    const se = project({ lat: DENVER_AREA.south, lng: eastEdge(DENVER_AREA) })
    expect(Math.abs(nw.x)).toBeLessThan(1)
    expect(Math.abs(nw.y)).toBeLessThan(1)
    expect(Math.abs(se.x - 800)).toBeLessThan(1)
    expect(Math.abs(se.y - 600)).toBeLessThan(1)
    for (const ref of denverMap.fit.points) {
      expect(ref.x).toBeGreaterThan(0)
      expect(ref.x).toBeLessThan(800)
      expect(ref.y).toBeGreaterThan(0)
      expect(ref.y).toBeLessThan(600)
    }
  })

  it('keeps every label inside the viewBox', () => {
    const [, , width, height] = denverMap.viewBox
    expect(denverMap.labels.length).toBeGreaterThan(5)
    for (const label of denverMap.labels) {
      expect(label.x).toBeGreaterThan(0)
      expect(label.x).toBeLessThan(width)
      expect(label.y).toBeGreaterThan(0)
      expect(label.y).toBeLessThan(height)
    }
  })

  it('has every layer drawn', () => {
    for (const layer of ['arterials', 'streets', 'water', 'parks']) {
      expect(denverMap[layer]).toMatch(/^M/)
    }
  })
})
