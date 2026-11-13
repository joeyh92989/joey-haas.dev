import { useId, useState } from 'react'
import { comicIntake as words } from '../../content/comicIntake.js'
import { API_URL } from '../../lib/api.js'
import {
  hashRanges,
  isCollected,
  markWords,
  parseNumber,
  seriesAdds,
} from '../../lib/comicBooks.js'
import { entryTitle } from '../../lib/intake.js'
import ConfidenceBadge from './ConfidenceBadge.jsx'

/**
 * The mark under a number: where it came from and whether it fits the
 * series. Words only; the colour repeats them. It is not match confidence:
 * the server decides it from the series' run, never the model.
 */
function NumberMark({ id, entry }) {
  const text = markWords(entry)
  if (!text) return null
  const state = entry.number_check?.state ?? 'none'
  return (
    <p id={id} className="intake-book-mark" data-state={state} role="status">
      {text}
    </p>
  )
}

/**
 * A number field that saves when it loses focus, and says why when it
 * won't. The row keys it by the saved number, so an answer from the server
 * (or another device) starts it again from what was saved.
 */
function NumberField({ entry, onSave, busy, markId }) {
  const id = useId()
  const saved = entry.payload?.issue_number ?? null
  const [draft, setDraft] = useState(saved == null ? '' : String(saved))
  const [bad, setBad] = useState(false)

  function commit() {
    const number = parseNumber(draft)
    setBad(number === undefined)
    if (number === undefined || number === saved) return
    onSave({ issue_number: number })
  }

  return (
    <div className="intake-book-field">
      <label htmlFor={id}>{words.numberLabel}</label>
      <span className="intake-book-num">
        <span aria-hidden="true">#</span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={draft}
          disabled={busy}
          aria-invalid={bad || undefined}
          aria-describedby={`${markId}${bad ? ` ${id}-bad` : ''}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
        />
      </span>
      {bad && (
        <p id={`${id}-bad`} className="intake-book-mark" data-state="bad">
          {words.badNumber}
        </p>
      )}
    </div>
  )
}

/** A collected book's first and last issue, saved together. */
function CollectsField({ entry, onSave, busy }) {
  const id = useId()
  const from = entry.payload?.collects_from ?? null
  const to = entry.payload?.collects_to ?? null
  const [draft, setDraft] = useState({
    from: from == null ? '' : String(from),
    to: to == null ? '' : String(to),
  })
  const [bad, setBad] = useState(false)

  function commit(event) {
    // Moving between the two boxes is not leaving the pair.
    if (
      event?.relatedTarget &&
      event.currentTarget.contains(event.relatedTarget)
    )
      return
    const low = parseNumber(draft.from)
    const high = parseNumber(draft.to)
    const wrong =
      low === undefined ||
      high === undefined ||
      (low === null) !== (high === null) ||
      (low !== null && low > high)
    setBad(wrong)
    if (wrong || (low === from && high === to)) return
    onSave({ collects_from: low, collects_to: high })
  }

  return (
    <div className="intake-book-field">
      <span id={`${id}-label`}>{words.collectsLabel}</span>
      <span
        className="intake-book-num"
        role="group"
        aria-labelledby={`${id}-label`}
        onBlur={commit}
      >
        <span aria-hidden="true">#</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label={words.collectsFrom}
          aria-invalid={bad || undefined}
          value={draft.from}
          disabled={busy}
          onChange={(event) =>
            setDraft((old) => ({ ...old, from: event.target.value }))
          }
        />
        <span aria-hidden="true">to #</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label={words.collectsTo}
          aria-invalid={bad || undefined}
          value={draft.to}
          disabled={busy}
          onChange={(event) =>
            setDraft((old) => ({ ...old, to: event.target.value }))
          }
        />
      </span>
      {bad && (
        <p className="intake-book-mark" data-state="bad">
          {words.badRange}
        </p>
      )}
    </div>
  )
}

/** One book: its photo, its match, and its number to read or correct. */
function BookRow({
  entry,
  photoNumber,
  repeated,
  onToggle,
  onRemove,
  onSave,
  busy,
}) {
  const markId = useId()
  const ticked = entry.state !== 'ignored'
  const shown = entry.state === 'ignored' ? entry.payload?.was : entry.state
  const collected = isCollected(entry)
  const shelf = entry.on_shelf
  const title = entryTitle(entry)
  return (
    <li className="intake-book" data-off={ticked ? undefined : ''}>
      <input
        type="checkbox"
        className="intake-book-tick"
        checked={ticked}
        disabled={busy}
        onChange={(event) => onToggle(entry, event.target.checked)}
        aria-label={`Add this book: ${title}${
          entry.payload?.issue_number ? ` #${entry.payload.issue_number}` : ''
        }`}
      />
      <div className="intake-book-photo">
        {entry.photo_id && (
          <img
            src={`${API_URL}/api/intake/photos/${entry.photo_id}/image`}
            alt={photoNumber ? `Photo ${photoNumber}` : 'The photo'}
          />
        )}
        {photoNumber && <span className="muted">Photo {photoNumber}</span>}
      </div>
      <div className="intake-book-match">
        <p className="intake-book-title">
          {title} <ConfidenceBadge state={shown} />
        </p>
        <p className="intake-book-meta muted">
          {[
            entry.chosen?.year,
            entry.chosen?.publisher,
            shelf ? 'on the shelf' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {entry.payload?.detected_title && (
          <p className="intake-book-read">{entry.payload.detected_title}</p>
        )}
        <p className="intake-book-links">
          <button
            type="button"
            className="link-button"
            disabled={busy}
            aria-label={`Remove ${title}`}
            onClick={() => onRemove(entry)}
          >
            Remove
          </button>
        </p>
      </div>
      <div className="intake-book-number">
        <div className="intake-book-field">
          <label htmlFor={`${markId}-format`}>{words.formatLabel}</label>
          <select
            id={`${markId}-format`}
            value={collected ? 'collected' : 'single'}
            disabled={busy}
            onChange={(event) => onSave({ format: event.target.value })}
          >
            {Object.entries(words.formats).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {collected ? (
          <>
            <CollectsField
              key={`${entry.payload?.collects_from}-${entry.payload?.collects_to}`}
              entry={entry}
              onSave={onSave}
              busy={busy}
            />
            <div className="intake-book-field">
              <label htmlFor={`${markId}-kind`}>{words.editionKindLabel}</label>
              <select
                id={`${markId}-kind`}
                value={entry.payload?.edition_kind ?? 'trade'}
                disabled={busy}
                onChange={(event) =>
                  onSave({ edition_kind: event.target.value })
                }
              >
                {Object.entries(words.editionKinds).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <p className="intake-book-mark" data-state="typed">
              {words.collectedNote}
            </p>
          </>
        ) : (
          <>
            <NumberField
              key={entry.payload?.issue_number ?? 'none'}
              entry={entry}
              onSave={onSave}
              busy={busy}
              markId={markId}
            />
            <NumberMark id={markId} entry={entry} />
            {repeated && (
              <p className="intake-book-mark" data-state="bad">
                {words.duplicate}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  )
}

/**
 * Check for a comic sitting: one row per book, each with its issue number
 * to read, correct or type, and under the list what the sitting adds to
 * each series. A row's save goes through `onSave(entry, changes)`, which
 * PATCHes the entry's payload; the server validates and decides the mark.
 *
 * @param {object} props
 * @param {object[]} props.entries The books listed (settled comic entries).
 * @param {object[]} props.all Every entry, for the sums under the list.
 * @param {(entry: object) => number|null} props.photoNumber
 * @param {Set<string>} props.repeated Ids of books repeating an earlier one.
 * @param {(entry: object, ticked: boolean) => void} props.onToggle
 * @param {(entry: object) => void} props.onRemove
 * @param {(entry: object, changes: object) => Promise<boolean>} props.onSave
 * @param {boolean} props.busy
 */
export default function ComicBooks({
  entries,
  all,
  photoNumber,
  repeated,
  onToggle,
  onRemove,
  onSave,
  busy,
}) {
  const adds = seriesAdds(all)
  return (
    <>
      <p className="intake-lede">{words.lede}</p>
      <p className="muted intake-book-limit">{words.limit}</p>
      <ul className="intake-books">
        {entries.map((entry) => (
          <BookRow
            key={entry.id}
            entry={entry}
            photoNumber={photoNumber(entry)}
            repeated={repeated.has(entry.id)}
            onToggle={onToggle}
            onRemove={onRemove}
            onSave={(changes) => onSave(entry, changes)}
            busy={busy}
          />
        ))}
      </ul>
      <h3 className="kicker intake-skim-head">{words.addsHead}</h3>
      {adds.length ? (
        <ul className="intake-adds">
          {adds.map((series) => {
            const parts = [
              series.added.length ? words.adds(hashRanges(series.added)) : null,
              ...series.editions.map(words.addsEdition),
            ].filter(Boolean)
            return (
              <li key={series.key}>
                <p className="intake-adds-title">{series.title}</p>
                <p className="intake-adds-what">
                  {parts.length ? parts.join(', ') : words.addsNothing}
                  {series.already.length > 0 && (
                    <span className="muted">
                      {' · '}
                      {words.alreadyHeld(hashRanges(series.already))}
                    </span>
                  )}
                  {series.missing > 0 && (
                    <span className="intake-adds-need">
                      {' · '}
                      {words.needNumber(series.missing)}
                    </span>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted">{words.nothingTicked}</p>
      )}
    </>
  )
}
