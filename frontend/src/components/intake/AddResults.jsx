import { Link } from 'react-router'
import CoverImage from '../CoverImage.jsx'
import { comicDetails, sourceWords } from '../../lib/intake.js'
import { ibtn } from '../addClasses.js'
import {
  INTAKE_RESULT,
  INTAKE_RESULTS,
  INTAKE_RESULT_KIND,
  INTAKE_RESULT_TEXT,
  INTAKE_RESULT_TITLE,
  INTAKE_SOURCES,
  INTAKE_TYPED,
} from '../intakeClasses.js'

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
 * @param {(result: object) => boolean} [props.isAdded] A result already added
 *   to the sitting in progress: shown as a disabled Added, not Add.
 * @param {(kind: object, opener: HTMLElement) => void} props.onKeepTyped
 */
export default function AddResults({
  query,
  results,
  sources,
  kinds,
  onAdd,
  onKeepTyped,
  isAdded = () => false,
}) {
  const typed = Object.values(kinds).filter((kind) =>
    kind.ways_in.includes('type'),
  )
  const unanswered = sources
    .map((source) => ({ source, kind: kinds[source.kind] }))
    .filter(({ source, kind }) => kind && source.state !== 'ok')

  return (
    <div className={`intake-results ${INTAKE_RESULTS}`}>
      {results.length > 0 ? (
        <ul aria-label={`Results for “${query}”`}>
          {results.map((result) => {
            const kind = kinds[result.kind]
            const meta = [
              result.year,
              ...comicDetails(result),
              result.external_source,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li
                key={`${result.external_source}:${result.external_id}`}
                className={`intake-result ${INTAKE_RESULT}`}
              >
                <CoverImage src={result.thumbnail_url} type={result.kind} />
                <span className={`intake-result-text ${INTAKE_RESULT_TEXT}`}>
                  <span
                    className={`intake-result-title ${INTAKE_RESULT_TITLE}`}
                  >
                    {result.title}
                  </span>
                  <span className="muted">{meta}</span>
                </span>
                <span className={`intake-result-kind ${INTAKE_RESULT_KIND}`}>
                  {kind?.label ?? result.kind}
                </span>
                {result.owned_item_id ? (
                  <Link
                    className={ibtn('plain')}
                    to={`/admin/collection/${result.owned_item_id}`}
                  >
                    On shelf
                    <span className="visually-hidden">: {result.title}</span>
                  </Link>
                ) : isAdded(result) ? (
                  <button
                    type="button"
                    className={ibtn('plain')}
                    disabled
                    aria-label={`Added: ${result.title}`}
                  >
                    Added
                  </button>
                ) : (
                  <button
                    type="button"
                    className={ibtn('primary')}
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
        <ul className={`intake-sources ${INTAKE_SOURCES}`} aria-label="Sources">
          {unanswered.map(({ source, kind }) => (
            <li key={source.kind}>
              {source.state === 'not_configured' && (
                <button type="button" className={ibtn('plain', 'sm')} disabled>
                  Search {kind.label}
                </button>
              )}
              <span>{sourceWords(source, kind)}</span>
            </li>
          ))}
        </ul>
      )}

      {typed.length > 0 && (
        <div
          className={`intake-typed ${INTAKE_TYPED}`}
          role="group"
          aria-label="Keep as typed"
        >
          <span className="muted">
            {results.length > 0 ? 'No match? ' : ''}Keep “{query}” as typed:
          </span>
          {typed.map((kind) => (
            <button
              key={kind.key}
              type="button"
              className={ibtn('plain', 'sm')}
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
