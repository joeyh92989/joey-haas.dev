/**
 * Draws the /denver poster map from OpenStreetMap: one Overpass query for
 * the streets, the South Platte, Cherry Creek and the parks inside the
 * drawn area, projected north-up with `src/lib/mapFit.js` and written as
 * `src/content/maps/denver.js`, a committed module the page imports.
 *
 * A one-off authoring step, not part of the build: run it again only to
 * redraw or extend the map, and commit the result. The module carries the
 * ODbL attribution the data needs wherever it is shown.
 *
 *   node scripts/draw-denver-map.mjs                  # fetch, write the module
 *   node scripts/draw-denver-map.mjs --record-fixture # re-record the test fixture
 *
 * The pure parts (`buildDrawing`, `renderModule`) are exported for
 * `draw-denver-map.test.mjs`, which runs on a recorded fixture with no
 * network.
 *
 * Spec and plan: docs/planning/2026-11-08-denver-spots-design.md, task 6.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeFit } from '../src/lib/mapFit.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '../src/content/maps/denver.js')
const FIXTURE = path.join(HERE, 'fixtures/overpass-union-station.json')
// The main instance; OVERPASS_URL points the script at a mirror when it is busy.
const OVERPASS =
  process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter'
const USER_AGENT = 'joey-haas.dev map generator (+https://joey-haas.dev)'

/**
 * The drawn area: Civic Center in the south to the Sunnyside edge in the
 * north, the Highland side of I-25 in the west to Five Points and RiNo in
 * the east. Only the west edge and the latitudes are chosen; the east edge
 * follows from the 4:3 viewBox, so a degree of longitude is drawn
 * cos(latitude) as wide as a degree of latitude.
 */
export const DENVER_AREA = {
  south: 39.734,
  north: 39.776,
  west: -105.026,
  width: 800,
  height: 600,
}

/** A small area around Union Station: the test fixture's extent. */
export const FIXTURE_AREA = {
  south: 39.7505,
  north: 39.7565,
  west: -105.004,
  width: 400,
  height: 300,
}

/** The two reference intersections the fit is stated by (opposite corners). */
const REFERENCE_POINTS = [
  { name: 'W 32nd Ave & Zuni St', lat: 39.7621, lng: -105.0153 },
  { name: 'Colfax Ave & Broadway', lat: 39.7401, lng: -104.9875 },
]

/** Neighbourhood labels, placed by hand at a point inside each. */
const AREA_LABELS = [
  { text: 'Sunnyside', lat: 39.7712, lng: -105.0135 },
  { text: 'Highland', lat: 39.7612, lng: -105.0205 },
  { text: 'LoHi', lat: 39.7578, lng: -105.0085 },
  { text: 'RiNo', lat: 39.7672, lng: -104.9805 },
  { text: 'Five Points', lat: 39.7555, lng: -104.9745 },
  { text: 'Ballpark', lat: 39.7553, lng: -104.9885 },
  { text: 'LoDo', lat: 39.7518, lng: -105.0005 },
  { text: 'Auraria', lat: 39.7435, lng: -105.0075 },
  { text: 'Civic Center', lat: 39.7372, lng: -104.9878 },
]

/** Water labels, set along the channel at the given angle. */
const WATER_LABELS = [
  { text: 'S. Platte', lat: 39.7605, lng: -105.0012, rotate: -52 },
  { text: 'Cherry Creek', lat: 39.7448, lng: -104.9988, rotate: 45 },
]

const ARTERIAL = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'motorway_link',
  'trunk_link',
])
const STREET = new Set([
  'tertiary',
  'residential',
  'unclassified',
  'living_street',
])
const WATER_NAMES = new Set(['South Platte River', 'Cherry Creek'])

/** The east edge that makes the area's proportions match its viewBox. */
export function eastEdge(area) {
  const meanLat = ((area.south + area.north) / 2) * (Math.PI / 180)
  const latSpan = area.north - area.south
  return area.west + (latSpan * (area.width / area.height)) / Math.cos(meanLat)
}

/** The fit's two corners: the area's north-west and south-east. */
function cornerFit(area) {
  return {
    points: [
      { lat: area.north, lng: area.west, x: 0, y: 0 },
      { lat: area.south, lng: eastEdge(area), x: area.width, y: area.height },
    ],
  }
}

/** The Overpass QL for an area. */
export function overpassQuery(area) {
  const bbox = [area.south, area.west, area.north, eastEdge(area)]
    .map((n) => n.toFixed(5))
    .join(',')
  return `[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary|motorway_link|trunk_link|tertiary|residential|unclassified|living_street)$"](${bbox});
  way["waterway"~"^(river|stream)$"]["name"~"^(South Platte River|Cherry Creek)$"](${bbox});
  way["leisure"="park"](${bbox});
  relation["leisure"="park"](${bbox});
);
out geom;`
}

const round = (n) => Math.round(n * 10) / 10

/** Perpendicular distance from p to the segment a-b. */
function segmentDistance(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Douglas-Peucker simplification, keeping both ends. */
export function simplify(points, tolerance) {
  if (points.length < 3) return points
  let worst = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = segmentDistance(points[i], points[0], points.at(-1))
    if (d > worst) {
      worst = d
      index = i
    }
  }
  if (worst <= tolerance) return [points[0], points.at(-1)]
  const left = simplify(points.slice(0, index + 1), tolerance)
  return [...left.slice(0, -1), ...simplify(points.slice(index), tolerance)]
}

/**
 * Splits a polyline into the runs that come near the drawing: a point is
 * kept while it, or a neighbour, is inside the padded viewBox, so a street
 * crossing the edge keeps its first point outside and the frame clips it.
 */
function clipRuns(points, area, pad) {
  const near = (p) =>
    p.x >= -pad &&
    p.y >= -pad &&
    p.x <= area.width + pad &&
    p.y <= area.height + pad
  const runs = []
  let run = []
  points.forEach((p, i) => {
    const keep =
      near(p) ||
      (i > 0 && near(points[i - 1])) ||
      (i < points.length - 1 && near(points[i + 1]))
    if (keep) {
      run.push(p)
    } else if (run.length) {
      runs.push(run)
      run = []
    }
  })
  if (run.length) runs.push(run)
  return runs.filter((r) => r.length > 1)
}

/** An `M x y L x y …` path for polylines, closed with Z when asked. */
function pathData(lines, close = false) {
  return lines
    .map(
      (line) =>
        line
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`)
          .join('') + (close ? 'Z' : ''),
    )
    .join('')
}

/** Joins a relation's outer members into closed rings by matching ends. */
export function joinRings(segments) {
  const key = (p) => `${p.lat},${p.lon}`
  const open = segments.filter((s) => s.length > 1).map((s) => [...s])
  const rings = []
  while (open.length) {
    let ring = open.shift()
    let grew = true
    while (key(ring[0]) !== key(ring.at(-1)) && grew) {
      grew = false
      for (let i = 0; i < open.length; i += 1) {
        const s = open[i]
        if (key(s[0]) === key(ring.at(-1))) {
          ring = [...ring, ...s.slice(1)]
        } else if (key(s.at(-1)) === key(ring.at(-1))) {
          ring = [...ring, ...[...s].reverse().slice(1)]
        } else {
          continue
        }
        open.splice(i, 1)
        grew = true
        break
      }
    }
    if (key(ring[0]) === key(ring.at(-1))) rings.push(ring)
  }
  return rings
}

/**
 * The drawing from an Overpass answer: pure and deterministic, so the same
 * answer always writes the same module.
 *
 * @param {{elements: object[]}} overpass The `out geom` answer.
 * @param {object} area The drawn area (`DENVER_AREA`).
 * @param {{references?: object[], labels?: object[], water?: object[]}} [hand]
 *   The hand-placed reference points and labels.
 */
export function buildDrawing(overpass, area, hand = {}) {
  const project = makeFit(cornerFit(area))
  const toXY = (node) => project({ lat: node.lat, lng: node.lon })
  const elements = [...(overpass?.elements ?? [])].sort(
    (a, b) => a.type.localeCompare(b.type) || a.id - b.id,
  )
  const arterials = []
  const streets = []
  const water = []
  const parks = []
  for (const el of elements) {
    const tags = el.tags ?? {}
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const points = el.geometry.map(toXY)
      if (ARTERIAL.has(tags.highway) || STREET.has(tags.highway)) {
        const target = ARTERIAL.has(tags.highway) ? arterials : streets
        for (const run of clipRuns(points, area, 20)) {
          target.push(simplify(run, 0.4))
        }
      } else if (WATER_NAMES.has(tags.name) && tags.waterway) {
        for (const run of clipRuns(points, area, 40)) {
          water.push(simplify(run, 0.6))
        }
      } else if (tags.leisure === 'park') {
        const first = el.geometry[0]
        const last = el.geometry.at(-1)
        if (first.lat === last.lat && first.lon === last.lon) {
          parks.push(simplify(points, 0.5))
        }
      }
    } else if (el.type === 'relation' && tags.leisure === 'park') {
      const outers = (el.members ?? [])
        .filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry)
        .map((m) => m.geometry)
      for (const ring of joinRings(outers)) {
        parks.push(simplify(ring.map(toXY), 0.5))
      }
    }
  }
  const inside = (p) =>
    p.x >= 0 && p.y >= 0 && p.x <= area.width && p.y <= area.height
  const visibleParks = parks.filter((ring) => ring.some(inside))
  const label = (kind) => (l) => {
    const p = project({ lat: l.lat, lng: l.lng })
    return {
      text: l.text,
      kind,
      x: round(p.x),
      y: round(p.y),
      ...(l.rotate ? { rotate: l.rotate } : {}),
    }
  }
  const references = (hand.references ?? []).map((r) => {
    const p = project(r)
    return {
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      x: round(p.x),
      y: round(p.y),
    }
  })
  return {
    viewBox: [0, 0, area.width, area.height],
    fit: { points: references },
    arterials: pathData(arterials),
    streets: pathData(streets),
    water: pathData(water),
    parks: pathData(visibleParks, true),
    labels: [
      ...(hand.labels ?? []).map(label('area')),
      ...(hand.water ?? []).map(label('water')),
    ],
    attribution: ATTRIBUTION,
  }
}

/** The line shown beside the map, as the ODbL requires. */
export const ATTRIBUTION = {
  text: '© OpenStreetMap contributors',
  href: 'https://www.openstreetmap.org/copyright',
}

const HEADER = `/**
 * The /denver poster map, drawn by scripts/draw-denver-map.mjs. Generated:
 * do not edit by hand; change the script and run it again.
 *
 * Map data © OpenStreetMap contributors, available under the Open Database
 * License (ODbL 1.0, https://opendatacommons.org/licenses/odbl/). The page
 * that shows this drawing carries the attribution line next to it.
 */
`

/** The module's source text: the header and one exported object. */
export function renderModule(drawing) {
  return `${HEADER}export const denverMap = ${JSON.stringify(drawing, null, 2)}\n`
}

async function overpass(area) {
  const response = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ data: overpassQuery(area) }),
  })
  if (!response.ok) {
    throw new Error(`Overpass answered ${response.status}`)
  }
  return response.json()
}

async function main() {
  if (process.argv.includes('--record-fixture')) {
    const answer = await overpass(FIXTURE_AREA)
    await fs.mkdir(path.dirname(FIXTURE), { recursive: true })
    await fs.writeFile(FIXTURE, `${JSON.stringify(answer)}\n`)
    console.log(`Recorded ${answer.elements.length} elements to ${FIXTURE}`)
    return
  }
  const answer = await overpass(DENVER_AREA)
  const drawing = buildDrawing(answer, DENVER_AREA, {
    references: REFERENCE_POINTS,
    labels: AREA_LABELS,
    water: WATER_LABELS,
  })
  await fs.mkdir(path.dirname(OUT), { recursive: true })
  await fs.writeFile(OUT, renderModule(drawing))
  const size = (await fs.stat(OUT)).size
  console.log(
    `Wrote ${OUT}: ${answer.elements.length} elements, ${Math.round(size / 1024)} KB`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
