import { Link } from 'react-router'
import CoverImage from '../CoverImage.jsx'
import { sourceWords } from '../../lib/intake.js'

/**
 * The add bar's answer (`GET /api/intake/search`): one row per result
 * labelled with its kind, Add (opens the drawer) or, for a title already
 * owned, On shelf linking to it. Under the rows, each source that did not
 * answer says why in words; a source with no credentials is a disabled
 * Search button with its reason (AC 11). Last, "No match, keep as typed"
 * offers every kind that can be typed, so a kind with no source still
 * commits (as a manual row).
 *
 * @param {object} props
 * @param {string} props.query The query these results answer.
 * @param {Array<object>} props.results
 * @param {Array<{kind: string, state: string, reason: string|null}>} props.sources
 * @param {Record<string, object>} props.kinds The area's kinds by key.
 * @param {(result: object, opener: HTMLElement) => void} props.onAdd
 * @param {(kind: object, opener: HTMLElement) => void} props.onKeepTyped
 */
export default function AddResults({
  query,
  results,
  sources,
  kinds,
  onAdd,
  onKeepTyped,
}) {
  const typed = Object.values(kinds).filter((kind) =>
    kind.ways_in.includes('type'),
  )
  const unanswered = sources
    .map((source) => ({ source, kind: kinds[source.kind] }))
    .filter(({ source, kind }) => kind && source.state !== 'ok')

  return (
    <div className="intake-results">
      {results.length > 0 ? (
        <ul aria-label={`Results for “${query}”`}>
          {results.map((result) => {
            const kind = kinds[result.kind]
            const meta = [result.year, result.external_source]
              .filter(Boolean)
              .join(' · ')
            return (
              <li
                key={`${result.external_source}:${result.external_id}`}
                className="intake-result"
              >
                <CoverImage src={result.thumbnail_url} type={result.kind} />
                <span className="intake-result-text">
                  <span className="intake-result-title">{result.title}</span>
                  <span className="muted">{meta}</span>
                </span>
                <span className="intake-result-kind">
                  {kind?.label ?? result.kind}
                </span>
                {result.owned_item_id ? (
                  <Link
                    className="btn"
                    to={`/admin/collection/${result.owned_item_id}`}
                  >
                    On shelf
                    <span className="visually-hidden">: {result.title}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    aria-label={`Add ${result.title}`}
                    onClick={(event) => onAdd(result, event.currentTarget)}
                  >
                    Add
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted">No match for “{query}”.</p>
      )}

      {unanswered.length > 0 && (
        <ul className="intake-sources" aria-label="Sources">
          {unanswered.map(({ source, kind }) => (
            <li key={source.kind}>
              {source.state === 'not_configured' && (
                <button type="button" className="btn sm" disabled>
                  Search {kind.label}
                </button>
              )}
              <span>{sourceWords(source, kind)}</span>
            </li>
          ))}
        </ul>
      )}

      {typed.length > 0 && (
        <div className="intake-typed" role="group" aria-label="Keep as typed">
          <span className="muted">
            {results.length > 0 ? 'No match? ' : ''}Keep “{query}” as typed:
          </span>
          {typed.map((kind) => (
            <button
              key={kind.key}
              type="button"
              className="btn sm"
              aria-label={`Keep as a typed ${kind.label}`}
              onClick={(event) => onKeepTyped(kind, event.currentTarget)}
            >
              {kind.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
