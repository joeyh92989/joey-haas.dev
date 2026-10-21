import { Link } from 'react-router'
import { spine } from '../content/spine.js'

const copy = spine.how

/** "What Spine does": five cards, each opening its stop on the tour. */
export default function FeatureStrip() {
  return (
    <section className="tour-does" aria-labelledby="tour-does-title">
      <div className="tour-does-head">
        <h2 id="tour-does-title">{copy.featuresLabel}</h2>
        <Link to={copy.path}>
          {copy.tour} <span aria-hidden="true">→</span>
        </Link>
      </div>
      <ul className="tour-does-cards">
        {copy.features.map((feature) => (
          <li key={feature.stop}>
            <Link to={`${copy.path}#stop-${feature.stop}`}>
              <span className="tour-does-n" aria-hidden="true">
                {String(feature.stop).padStart(2, '0')}
              </span>
              <b>{feature.title}</b>
              <span className="tour-does-line">{feature.line}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
