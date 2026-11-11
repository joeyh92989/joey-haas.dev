import { useState } from 'react'
import { Link } from 'react-router'
import { meterCounts } from '../../lib/intake.js'

/** A sitting's name on the page; one left unnamed still has one. */
export function sittingName(sitting) {
  return sitting.label || 'Untitled sitting'
}

/**
 * The three-part meter: ready, to check, still reading. Non-text marks, so
 * each segment is an image with its count as its name, inside a group
 * named for the sitting; the counts are in the row's text as well.
 */
function Meter({ name, counts }) {
  const total = counts.ready + counts.check + counts.reading
  const parts = [
    ['ready', counts.ready, 'ready'],
    ['check', counts.check, 'to check'],
    ['reading', counts.reading, 'still reading'],
  ]
  return (
    <span
      className="intake-meter"
      role="group"
      aria-label={`Progress of ${name}`}
    >
      {parts.map(([key, value, words]) => (
        <i
          key={key}
          role="img"
          aria-label={`${value} ${words}`}
          className={`intake-meter-${key}`}
          style={{ flexGrow: total ? value : 0 }}
          hidden={!value}
        />
      ))}
    </span>
  )
}

/**
 * The Add page's unfinished sittings, one row each: name, kind, counts, the
 * meter, Resume and Discard. Discard asks once, in the row. Sittings live
 * on the server, so the list is the same on every device (AC 3).
 *
 * @param {object} props
 * @param {Array<object>} props.sittings From `GET /api/intake/sittings`.
 * @param {Record<string, {label: string}>} props.kinds Kinds by key.
 * @param {string} props.base The area's Add path; a sitting is under it.
 * @param {(sitting: object) => void} props.onDiscard
 */
export default function UnfinishedList({ sittings, kinds, base, onDiscard }) {
  const [asking, setAsking] = useState(null)
  if (!sittings.length) return <p className="muted">Nothing unfinished</p>
  return (
    <ul className="intake-unfinished">
      {sittings.map((sitting) => {
        const name = sittingName(sitting)
        const counts = meterCounts(sitting)
        const kind = sitting.kind
          ? (kinds[sitting.kind]?.label ?? sitting.kind)
          : 'Mixed shelf'
        const photos = `${sitting.photos} photo${sitting.photos === 1 ? '' : 's'}`
        return (
          <li key={sitting.id} className="intake-sitting">
            <div className="intake-sitting-text">
              <p className="intake-sitting-name">
                {name} <span className="muted">· {kind}</span>
              </p>
              <p className="muted">
                {photos} · {counts.check} to check, {counts.ready} ready,{' '}
                {counts.reading} still reading
                {counts.owned > 0 && `, ${counts.owned} already on the shelf`}
              </p>
            </div>
            <Meter name={name} counts={counts} />
            {asking === sitting.id ? (
              <div className="intake-sitting-actions" role="group">
                <span>Discard {name}? All its photos go with it.</span>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setAsking(null)
                    onDiscard(sitting)
                  }}
                >
                  Yes, discard
                </button>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => setAsking(null)}
                >
                  Keep it
                </button>
              </div>
            ) : (
              <div className="intake-sitting-actions">
                <Link
                  className="btn sm primary"
                  to={`${base}/${sitting.id}`}
                  aria-label={`Resume ${name}`}
                >
                  Resume
                </Link>
                <button
                  type="button"
                  className="btn sm ghost"
                  aria-label={`Discard ${name}`}
                  onClick={() => setAsking(sitting.id)}
                >
                  Discard
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
