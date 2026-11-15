import { architecture } from '../content/architecture.js'

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
function Node({ x, y, w, h, name, sub, className = '' }) {
  return (
    <g className={`arch__node ${className}`}>
      <rect x={x} y={y} width={w} height={h} rx="6" />
      <text className="arch__name" x={x + 12} y={y + 22}>
        {name}
      </text>
      <text className="arch__sub" x={x + 12} y={y + 40}>
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
    <figure className="arch">
      <svg
        className="arch__svg"
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
            <path className="arch__head" d="M0 0 L10 5 L0 10 z" />
          </marker>
        </defs>
        {EDGES.map((edge, index) => (
          <path
            key={edge.d}
            className="arch__edge"
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
        <g className="arch__node arch__node--frame">
          <rect x="8" y="130" width="150" height="156" rx="6" />
          <text className="arch__name" x="20" y="152">
            Static site
          </text>
          <text className="arch__sub" x="20" y="170">
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
          className="arch__node--snapshot"
        />
        {EDGES.map((edge, index) => (
          <g key={edge.d} className="arch__badge">
            <circle cx={edge.at[0]} cy={edge.at[1]} r="10" />
            <text x={edge.at[0]} y={edge.at[1] + 4.5} textAnchor="middle">
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        <p>{architecture.caption}</p>
        <ol>
          {architecture.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}
