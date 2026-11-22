import { architecture } from '../content/architecture.js'
import {
  ARCH,
  ARCH_BADGE,
  ARCH_CAPTION,
  ARCH_EDGE,
  ARCH_HEAD,
  ARCH_NAME,
  ARCH_NODE,
  ARCH_NODE_FILL,
  ARCH_NODE_STROKE,
  ARCH_SUB,
  ARCH_SVG,
} from './archClasses.js'

/**
 * Edges, drawn in the order of `architecture.steps`: `d` is the path, `at`
 * the badge, `ends` which ends carry an arrowhead.
 */
const EDGES = [
  { d: 'M220 66 V98 H277 V130', at: [277, 98], ends: 'end' },
  { d: 'M140 66 V98 H83 V130', at: [83, 98], ends: 'end' },
  { d: 'M277 186 V230', at: [277, 208], ends: 'both' },
  { d: 'M158 146 H202', at: [180, 146], ends: 'both' },
  { d: 'M202 176 H120 V214', at: [180, 176], ends: 'end' },
]

/** A node: a name, a line under it and its box. */
function Node({ x, y, w, h, name, sub, snapshot = false }) {
  const tone = snapshot
    ? `arch__node--snapshot ${ARCH_NODE_FILL.snapshot} ${ARCH_NODE_STROKE.snapshot}`
    : `${ARCH_NODE_FILL.plain} ${ARCH_NODE_STROKE.plain}`
  return (
    <g className={`arch__node ${ARCH_NODE} ${tone}`}>
      <rect x={x} y={y} width={w} height={h} rx="6" />
      <text className={`arch__name ${ARCH_NAME}`} x={x + 12} y={y + 22}>
        {name}
      </text>
      <text className={`arch__sub ${ARCH_SUB}`} x={x + 12} y={y + 40}>
        {sub}
      </text>
    </g>
  )
}

/**
 * The Colophon's architecture diagram: an inline SVG drawn with tokens (both
 * themes), in a `<figure>` whose caption carries the same facts as a numbered
 * list. The SVG is `role="img"`, so its children are presentational and the
 * list is the real text alternative. Words live in `content/architecture.js`.
 */
export default function ArchitectureFigure() {
  return (
    <figure className={`arch ${ARCH}`}>
      <svg
        className={`arch__svg ${ARCH_SVG}`}
        viewBox="0 0 360 296"
        role="img"
        aria-label={architecture.label}
      >
        <defs>
          <marker
            id="arch-head"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path
              className={`arch__head ${ARCH_HEAD}`}
              d="M0 0 L10 5 L0 10 z"
            />
          </marker>
        </defs>
        {EDGES.map((edge, index) => (
          <path
            key={edge.d}
            className={`arch__edge ${ARCH_EDGE}`}
            d={edge.d}
            markerEnd="url(#arch-head)"
            markerStart={edge.ends === 'both' ? 'url(#arch-head)' : undefined}
            data-step={index + 1}
          />
        ))}
        <Node
          x={105}
          y={10}
          w={150}
          h={56}
          name="Nightly job"
          sub="GitHub Actions"
        />
        <Node x={202} y={130} w={150} h={56} name="API" sub="FastAPI, Render" />
        <Node x={202} y={230} w={150} h={56} name="Neon" sub="Postgres 18" />
        <g
          className={`arch__node arch__node--frame ${ARCH_NODE} ${ARCH_NODE_FILL.frame} ${ARCH_NODE_STROKE.plain}`}
        >
          <rect x="8" y="130" width="150" height="156" rx="6" />
          <text className={`arch__name ${ARCH_NAME}`} x="20" y="152">
            Static site
          </text>
          <text className={`arch__sub ${ARCH_SUB}`} x="20" y="170">
            Render
          </text>
        </g>
        <Node
          x={20}
          y={214}
          w={126}
          h={60}
          name="Snapshot"
          sub="written at build"
          snapshot
        />
        {EDGES.map((edge, index) => (
          <g key={edge.d} className={`arch__badge ${ARCH_BADGE}`}>
            <circle cx={edge.at[0]} cy={edge.at[1]} r="10" />
            <text x={edge.at[0]} y={edge.at[1] + 4.5} textAnchor="middle">
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className={ARCH_CAPTION.figcaption}>
        <p>{architecture.caption}</p>
        <ol className={ARCH_CAPTION.list}>
          {architecture.steps.map((step) => (
            <li key={step} className={ARCH_CAPTION.item}>
              {step}
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}
