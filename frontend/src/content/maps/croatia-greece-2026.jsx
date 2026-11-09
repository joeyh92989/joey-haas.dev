/**
 * The drawn map for Croatia & Greece (September 2026).
 *
 * Hand-authored, not derived from a coastline dataset (design D2): every
 * outline below is a short list of real coastal points in `[lon, lat]`,
 * read off an atlas to about a tenth of a degree and simplified by eye.
 * They are projected through the same `fit` that places the pins, so the
 * coast and the stops cannot drift apart, and the drawing is true to scale
 * by construction (equirectangular at 40°N, which `mapFit.test.js`'s
 * `scaleRatio` check would flag if it were not).
 *
 * At this size a tenth of a degree is about five pixels. That is the
 * accuracy the caption promises when it says *Drawn route, not a live map*.
 */
import { fitFromPoints, project } from '../../lib/mapFit.js'

export const viewBox = { width: 560, height: 532 }

// 66.5px per degree of latitude; 50.94px per degree of longitude, which is
// 66.5 × cos(40°). The frame runs 16°E to 27°E and 43.6°N to 35.6°N.
export const fit = fitFromPoints([
  { lat: 42.6507, lon: 18.0944, x: 106.7, y: 63.1 }, // Dubrovnik
  { lat: 37.9838, lon: 23.7275, x: 393.6, y: 373.5 }, // Athens
])

/** The Balkans, from Split round to Çeşme, closed off-frame to the east. */
const MAINLAND = [
  [15.9, 43.65],
  [16.44, 43.5],
  [17.02, 43.3],
  [17.45, 43.02],
  [17.65, 42.86],
  [17.0, 42.98],
  [17.2, 42.93],
  [17.5, 42.82],
  [17.7, 42.78],
  [17.9, 42.72],
  [18.09, 42.65],
  [18.45, 42.45],
  [18.75, 42.28],
  [19.1, 42.08],
  [19.38, 41.85],
  [19.5, 41.63],
  [19.45, 41.32],
  [19.47, 40.95],
  [19.45, 40.47],
  [19.6, 40.1],
  [20.0, 39.75],
  [20.27, 39.5],
  [20.75, 38.96],
  [21.1, 38.65],
  [21.43, 38.37],
  [21.83, 38.39],
  [22.42, 38.43],
  [22.9, 38.2],
  [23.0, 37.95],
  // The Gulf of Corinth's south shore, then round the Peloponnese.
  [22.75, 38.01],
  [22.08, 38.25],
  [21.73, 38.25],
  [21.15, 37.94],
  [21.4, 37.67],
  [21.67, 37.25],
  [21.69, 36.91],
  [21.95, 36.8],
  [22.11, 37.03],
  [22.48, 36.38],
  [22.56, 36.76],
  [23.19, 36.44],
  [23.06, 36.69],
  [22.78, 37.4],
  [22.8, 37.57],
  [23.25, 37.38],
  [23.45, 37.5],
  [23.15, 37.64],
  [23.05, 37.9],
  // Attica, Euboea's channel, Thessaly.
  [23.35, 37.98],
  [23.62, 37.94],
  [23.78, 37.8],
  [24.02, 37.65],
  [24.06, 37.71],
  [24.01, 38.02],
  [24.0, 38.15],
  [23.75, 38.32],
  [23.6, 38.46],
  [23.2, 38.65],
  [22.6, 38.88],
  [22.94, 39.36],
  [23.3, 39.12],
  [23.1, 39.5],
  [22.75, 39.85],
  [22.6, 40.4],
  [22.94, 40.63],
  // Chalkidiki's three fingers.
  [23.0, 40.4],
  [23.35, 39.98],
  [23.45, 40.25],
  [23.9, 39.95],
  [23.85, 40.3],
  [24.4, 40.15],
  [24.0, 40.4],
  // Thrace, the Dardanelles, the Turkish coast.
  [24.4, 40.94],
  [25.88, 40.85],
  [26.05, 40.72],
  [26.6, 40.62],
  [26.18, 40.05],
  [26.2, 40.0],
  [26.07, 39.48],
  [26.9, 39.55],
  [26.69, 39.31],
  [26.75, 38.95],
  [26.95, 38.75],
  [26.65, 38.68],
  [26.5, 38.45],
  [26.3, 38.32],
  [26.55, 38.12],
  [27.2, 38.0],
  [27.2, 43.8],
  [15.8, 43.8],
]

/** Apulia and Calabria, closed off-frame to the west. */
const ITALY = [
  [15.8, 41.5],
  [16.28, 41.32],
  [16.87, 41.12],
  [17.3, 40.95],
  [17.94, 40.64],
  [18.49, 40.15],
  [18.36, 39.8],
  [17.99, 40.06],
  [17.9, 40.25],
  [17.24, 40.47],
  [16.8, 40.37],
  [16.6, 40.1],
  [16.5, 39.73],
  [17.12, 39.37],
  [17.2, 39.03],
  [16.6, 38.8],
  [16.5, 38.5],
  [16.06, 37.92],
  [15.8, 37.92],
]

const ISLANDS = [
  // Gargano, the spur of Italy's boot.
  [
    [15.8, 41.62],
    [16.05, 41.85],
    [16.19, 41.9],
    [16.0, 41.95],
    [15.8, 41.95],
  ],
  // Dalmatia: Brač, Hvar, Korčula, Mljet.
  [
    [16.4, 43.38],
    [16.85, 43.32],
    [16.75, 43.25],
    [16.45, 43.28],
  ],
  [
    [16.4, 43.2],
    [17.2, 43.13],
    [17.15, 43.1],
    [16.45, 43.15],
  ],
  [
    [16.65, 42.97],
    [17.2, 42.95],
    [17.15, 42.91],
    [16.7, 42.92],
  ],
  [
    [17.32, 42.78],
    [17.6, 42.74],
    [17.75, 42.7],
    [17.55, 42.69],
    [17.33, 42.74],
  ],
  // The Ionian islands.
  [
    [19.65, 39.8],
    [19.85, 39.82],
    [19.95, 39.75],
    [19.92, 39.55],
    [20.12, 39.38],
    [19.98, 39.42],
    [19.85, 39.6],
    [19.68, 39.7],
  ],
  [
    [20.6, 38.83],
    [20.72, 38.8],
    [20.7, 38.62],
    [20.58, 38.68],
  ],
  [
    [20.35, 38.35],
    [20.6, 38.45],
    [20.75, 38.25],
    [20.6, 38.08],
    [20.4, 38.12],
  ],
  [
    [20.65, 37.9],
    [20.95, 37.8],
    [20.85, 37.65],
    [20.62, 37.75],
  ],
  // Euboea.
  [
    [22.85, 39.02],
    [23.3, 39.0],
    [23.6, 38.75],
    [24.15, 38.65],
    [24.6, 38.1],
    [24.55, 37.97],
    [24.3, 38.15],
    [23.75, 38.45],
    [23.4, 38.65],
    [23.0, 38.85],
  ],
  // The Cyclades: Andros, Tinos, Mykonos, Syros, Kea, Paros, Naxos, Ios,
  // Amorgos, Milos, Santorini.
  [
    [24.7, 37.95],
    [24.95, 37.85],
    [24.95, 37.75],
    [24.75, 37.85],
  ],
  [
    [25.05, 37.65],
    [25.25, 37.55],
    [25.2, 37.52],
    [25.0, 37.6],
  ],
  [
    [25.28, 37.48],
    [25.45, 37.46],
    [25.42, 37.41],
    [25.28, 37.42],
  ],
  [
    [24.88, 37.5],
    [24.96, 37.45],
    [24.92, 37.37],
    [24.87, 37.43],
  ],
  [
    [24.28, 37.68],
    [24.38, 37.64],
    [24.35, 37.56],
    [24.27, 37.6],
  ],
  [
    [25.1, 37.15],
    [25.25, 37.1],
    [25.25, 36.98],
    [25.1, 37.0],
  ],
  [
    [25.35, 37.18],
    [25.55, 37.15],
    [25.58, 36.98],
    [25.45, 36.95],
    [25.35, 37.05],
  ],
  [
    [25.25, 36.77],
    [25.38, 36.72],
    [25.32, 36.66],
    [25.24, 36.7],
  ],
  [
    [25.75, 36.88],
    [25.85, 36.86],
    [26.0, 36.8],
    [25.95, 36.78],
    [25.78, 36.83],
  ],
  [
    [24.35, 36.77],
    [24.55, 36.75],
    [24.52, 36.66],
    [24.35, 36.68],
  ],
  [
    [25.4, 36.47],
    [25.48, 36.42],
    [25.44, 36.35],
    [25.38, 36.38],
  ],
  // The north and east Aegean: Thasos, Lemnos, Lesbos, Chios, Ikaria,
  // Samos.
  [
    [24.55, 40.8],
    [24.75, 40.75],
    [24.7, 40.6],
    [24.55, 40.65],
  ],
  [
    [25.05, 40.0],
    [25.4, 39.98],
    [25.35, 39.8],
    [25.1, 39.85],
  ],
  [
    [25.85, 39.25],
    [26.2, 39.38],
    [26.6, 39.3],
    [26.55, 39.0],
    [26.2, 39.05],
    [25.95, 39.1],
  ],
  [
    [25.85, 38.6],
    [26.15, 38.55],
    [26.15, 38.25],
    [25.95, 38.25],
    [25.85, 38.4],
  ],
  [
    [26.0, 37.68],
    [26.35, 37.6],
    [26.3, 37.55],
    [26.02, 37.62],
  ],
  [
    [26.6, 37.8],
    [27.05, 37.75],
    [26.95, 37.65],
    [26.6, 37.7],
  ],
]

const at = ([lon, lat]) => project(fit, { lat, lon })
const xy = ({ x, y }) => `${x.toFixed(1)} ${y.toFixed(1)}`
const outline = (points) => `M${points.map((p) => xy(at(p))).join('L')}Z`

/** A gentle arc from one place to another, bowed `bend` px to the left. */
function leg(from, to, bend) {
  const a = at(from)
  const b = at(to)
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const control = {
    x: (a.x + b.x) / 2 + ((a.y - b.y) / length) * bend,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * bend,
  }
  return `M${xy(a)}Q${xy(control)} ${xy(b)}`
}

const LAND = [MAINLAND, ITALY, ...ISLANDS].map(outline).join('')

// Flown Dubrovnik to Athens; the ferry from Piraeus to Naxos and back.
const ROUTE =
  leg([18.0944, 42.6507], [23.7275, 37.9838], -40) +
  leg([23.64, 37.94], [25.3767, 37.1036], 18)

const SEAS = [
  { name: 'Adriatic', at: [17.6, 42.05] },
  { name: 'Ionian', at: [18.6, 38.6] },
  { name: 'Aegean', at: [24.6, 39.25] },
]

export default function CroatiaGreeceMap() {
  return (
    <g aria-hidden="true">
      <path className="drawn-map__land" d={LAND} />
      <path className="drawn-map__route" d={ROUTE} />
      {SEAS.map((sea) => {
        const { x, y } = at(sea.at)
        return (
          <text
            key={sea.name}
            className="drawn-map__sea-label"
            x={x.toFixed(1)}
            y={y.toFixed(1)}
            textAnchor="middle"
          >
            {sea.name.toUpperCase()}
          </text>
        )
      })}
    </g>
  )
}
