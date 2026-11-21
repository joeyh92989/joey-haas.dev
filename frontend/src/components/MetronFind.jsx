import { useState } from 'react'
import { volume as COPY } from '../content/adminVolume.js'
import { collectBody, findMetronContents } from '../lib/volumeEdits.js'
import { LINK_BTN, MUTED, SMALL } from './adminDataClasses.js'
import { TEXT_LINK } from './detail-classes.js'

const M = COPY.collects.metron

/**
 * "Find contents": asks Metron, shows what it lists, and writes only when the
 * owner accepts. Accepting sends the whole list through `onSave`: every entry
 * that did not come from Metron goes back untouched (by id), the ones that did
 * are replaced by the proposal's, each marked `metron`. Nothing is written
 * before then.
 *
 * @param {object} props
 * @param {string} props.volumeId
 * @param {object[]} props.entries - The book's saved `collects`.
 * @param {boolean} props.busy - A write is in flight.
 * @param {(list: object[], line: string, undo?: object[]) => Promise<object|null>} props.onSave
 */
export default function MetronFind({ volumeId, entries, busy, onSave }) {
  const [finding, setFinding] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function find() {
    setFinding(true)
    setError(null)
    setResult(null)
    try {
      setResult(await findMetronContents(volumeId))
    } catch (failure) {
      setError(failure.message || M.failed)
    } finally {
      setFinding(false)
    }
  }

  async function accept(candidate) {
    const saved = entries.map(collectBody)
    const keep = entries
      .map((entry, index) => [entry, saved[index]])
      .filter(([entry]) => entry.source !== 'metron')
      .map(([, body]) => body)
    const added = candidate.entries.map((entry) => ({
      series_name: entry.series_name,
      issue_text: entry.issue_text,
      source: 'metron',
      link: null,
    }))
    const failure = await onSave(
      [...keep, ...added],
      M.accepted(added.length),
      saved,
    )
    if (!failure) setResult(null)
  }

  return (
    <div className="admin-collect-read">
      <div className="admin-collect-actions">
        <button
          type="button"
          className={SMALL}
          disabled={busy || finding}
          onClick={find}
        >
          {finding ? M.finding : M.button}
        </button>
      </div>
      <p className={`${MUTED} comic-hint`}>{M.hint}</p>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {result && result.candidates.length === 0 && (
        <p className={MUTED} role="status">
          {result.message}
        </p>
      )}
      {result?.candidates.map((candidate) => (
        <section
          key={candidate.metron_id}
          className="admin-collect"
          aria-label={`${candidate.series_name} ${candidate.title ?? ''}`.trim()}
        >
          <strong>
            {candidate.series_name}
            {candidate.title ? `: ${candidate.title}` : ''}
          </strong>
          <p className={MUTED}>
            {candidate.strong ? M.strong : M.possible} {M.isbn(candidate.isbn)}
            {candidate.pages ? `, ${M.pages(candidate.pages)}` : ''}
            {candidate.resource_url && (
              <>
                {' · '}
                <a
                  className={TEXT_LINK}
                  href={candidate.resource_url}
                  rel="noreferrer noopener"
                >
                  {M.open}
                </a>
              </>
            )}
          </p>
          {candidate.entries.length > 0 ? (
            <>
              <p>{M.collects}</p>
              <ul>
                {candidate.entries.map((entry) => (
                  <li key={`${entry.series_name}|${entry.issue_text}`}>
                    {entry.series_name} {entry.issue_text}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={MUTED}>{M.nothingNew}</p>
          )}
          {candidate.skipped > 0 && (
            <p className={MUTED}>{M.alreadyHeld(candidate.skipped)}</p>
          )}
          {result.replaces > 0 && (
            <p className={MUTED}>{M.replaces(result.replaces)}</p>
          )}
          <div className="admin-collect-actions">
            <button
              type="button"
              className={SMALL}
              disabled={busy || candidate.entries.length === 0}
              onClick={() => accept(candidate)}
            >
              {M.accept}
            </button>
            <button
              type="button"
              className={LINK_BTN}
              onClick={() => setResult(null)}
            >
              {M.dismiss}
            </button>
          </div>
        </section>
      ))}
    </div>
  )
}
