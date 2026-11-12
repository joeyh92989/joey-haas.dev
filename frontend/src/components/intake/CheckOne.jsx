import { useId, useState } from 'react'
import { API_URL, apiFetch, errorMessage } from '../../lib/api.js'
import CoverImage from '../CoverImage.jsx'
import ConfidenceBadge from './ConfidenceBadge.jsx'

const sameCandidate = (a, b) =>
  Boolean(a && b) &&
  a.external_source === b.external_source &&
  a.external_id === b.external_id

/**
 * One uncertain entry, asked on its own: the photo it came from, the text
 * that was read, and its candidates as a radio group with the best one
 * preselected. Yes, this one confirms; Search… looks the title up across
 * the add bar's sources (`GET /api/intake/search`) and puts the entry's
 * kind's matches first; Skip leaves it to check later; Not mine drops it;
 * Keep as typed adds it with no match.
 *
 * @param {object} props
 * @param {object} props.entry An entry in `check` or `probable`.
 * @param {number|null} props.photoNumber Its photo's place in the sitting.
 * @param {(entry: object, change: object) => void} props.onAnswer PATCHes
 *   the entry; `change` is `{state, chosen?}`.
 * @param {(entry: object) => void} props.onSkip
 * @param {boolean} props.busy An answer is being saved.
 * @param {import('react').Ref<HTMLHeadingElement>} props.headingRef
 * @param {string} props.position "1 of 7", for the heading.
 */
export default function CheckOne({
  entry,
  photoNumber,
  onAnswer,
  onSkip,
  busy,
  headingRef,
  position,
}) {
  const name = useId()
  const [found, setFound] = useState([])
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState(entry.payload?.detected_title ?? '')
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchNote, setSearchNote] = useState(null)
  const listed = entry.candidates ?? []
  // A search's matches lead; the reader's candidates follow, once each.
  const candidates = [
    ...found,
    ...listed.filter(
      (c) => !found.some((f) => f.external_id === c.external_id),
    ),
  ]
  const best =
    candidates.find((c) => sameCandidate(c, entry.chosen)) ?? candidates[0]
  const [picked, setPicked] = useState(best?.external_id ?? null)
  const choice = candidates.find((c) => c.external_id === picked) ?? null
  const read = entry.payload?.detected_title ?? '—'
  const year = entry.payload?.detected_year

  async function search() {
    setSearchBusy(true)
    setSearchNote(null)
    try {
      const response = await apiFetch(
        `/api/intake/search?area=shelf&query=${encodeURIComponent(query.trim())}`,
      )
      if (!response.ok) {
        setSearchNote(await errorMessage(response, { ownConflicts: true }))
        return
      }
      const body = await response.json()
      const mine = body.results.filter((result) => result.kind === entry.kind)
      setFound(mine)
      if (mine.length) setPicked(mine[0].external_id)
      setSearchNote(
        mine.length
          ? `${mine.length} found`
          : `No match for “${query.trim()}”; keep it as typed, or try other words.`,
      )
    } catch {
      setSearchNote('The server did not answer; try again.')
    } finally {
      setSearchBusy(false)
    }
  }

  return (
    <div className="intake-checkone">
      <div className="intake-checkone-source">
        {entry.photo_id && (
          <img
            className="intake-checkone-photo"
            src={`${API_URL}/api/intake/photos/${entry.photo_id}/image`}
            alt={photoNumber ? `Photo ${photoNumber}` : 'The photo'}
          />
        )}
        <p className="muted">
          {photoNumber ? `Photo ${photoNumber} · ` : ''}what was read:
        </p>
        <p className="intake-readline">
          {read}
          {year ? ` (${year})` : ''}
        </p>
      </div>
      <div>
        <h3 ref={headingRef} tabIndex={-1} className="kicker">
          To check · {position}
        </h3>
        {entry.state === 'probable' && <ConfidenceBadge state="probable" />}
        {candidates.length ? (
          <>
            <p id={`${name}-question`} className="intake-question">
              Which one is it?
            </p>
            <div
              role="radiogroup"
              aria-labelledby={`${name}-question`}
              className="intake-candidates"
            >
              {candidates.map((candidate) => (
                <label
                  key={candidate.external_id}
                  className={
                    candidate.external_id === picked
                      ? 'intake-option selected'
                      : 'intake-option'
                  }
                >
                  <input
                    type="radio"
                    name={name}
                    value={candidate.external_id}
                    aria-label={
                      candidate.year
                        ? `${candidate.title} (${candidate.year})`
                        : candidate.title
                    }
                    checked={candidate.external_id === picked}
                    onChange={() => setPicked(candidate.external_id)}
                  />
                  <CoverImage
                    src={candidate.cover_url ?? candidate.thumbnail_url}
                    type={entry.kind}
                  />
                  <span>
                    {candidate.title}{' '}
                    <span className="muted">{candidate.year ?? ''}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">
            {entry.payload?.reason ?? 'No candidates came back for this one.'}
          </p>
        )}
        {searching && (
          <form
            role="search"
            aria-label="Search this title"
            className="intake-checksearch"
            onSubmit={(event) => {
              event.preventDefault()
              search()
            }}
          >
            <input
              type="search"
              aria-label="Search for this title"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="submit"
              className="btn"
              disabled={searchBusy || !query.trim()}
            >
              Search
            </button>
          </form>
        )}
        {searchNote && (
          <p className="muted" role="status">
            {searchNote}
          </p>
        )}
        <div className="intake-actions">
          <button
            type="button"
            className="btn primary"
            disabled={busy || !choice}
            onClick={() => onAnswer(entry, { state: 'ready', chosen: choice })}
          >
            Yes, this one
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            aria-expanded={searching}
            onClick={() => setSearching(true)}
          >
            Search…
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onSkip(entry)}
          >
            Skip
          </button>
        </div>
        <div className="intake-actions quiet">
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => onAnswer(entry, { state: 'ignored' })}
          >
            Not mine, ignore
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => onAnswer(entry, { state: 'typed', chosen: null })}
          >
            Keep as typed, no match
          </button>
        </div>
      </div>
    </div>
  )
}
