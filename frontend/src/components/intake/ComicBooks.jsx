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
function NumberField({ entry, onSave, markId, error }) {
  const id = useId()
  const saved = entry.payload?.issue_number ?? null
  const [draft, setDraft] = useState(saved == null ? '' : String(saved))
  const [bad, setBad] = useState(false)
  const message = bad ? words.badNumber : error
  const shown = Boolean(message)

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
          aria-invalid={shown || undefined}
          aria-describedby={`${markId}${shown ? ` ${id}-bad` : ''}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
        />
      </span>
      {shown && (
        <p id={`${id}-bad`} className="intake-book-mark" data-state="bad">
          {message}
        </p>
      )}
    </div>
  )
}

/** A collected book's first and last issue, saved together. */
function CollectsField({ entry, onSave, error }) {
  const id = useId()
  const from = entry.payload?.collects_from ?? null
  const to = entry.payload?.collects_to ?? null
  const [draft, setDraft] = useState({
    from: from == null ? '' : String(from),
    to: to == null ? '' : String(to),
  })
  const [bad, setBad] = useState(false)
  const message = bad ? words.badRange : error
  const shown = Boolean(message)

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
          aria-invalid={shown || undefined}
          aria-describedby={shown ? `${id}-bad` : undefined}
          value={draft.from}
          onChange={(event) =>
            setDraft((old) => ({ ...old, from: event.target.value }))
          }
        />
        <span aria-hidden="true">to #</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label={words.collectsTo}
          aria-invalid={shown || undefined}
          aria-describedby={shown ? `${id}-bad` : undefined}
          value={draft.to}
          onChange={(event) =>
            setDraft((old) => ({ ...old, to: event.target.value }))
          }
        />
      </span>
      {shown && (
        <p id={`${id}-bad`} className="intake-book-mark" data-state="bad">
          {message}
        </p>
      )}
    </div>
  )
}

// Refusals drawn inside their own field; any other shows under the selects.
const NUMBER_FIELDS = ['issue_number', 'collects_from', 'collects_to']

/** One book: its photo, its match, and its number to read or correct. */
function BookRow({
  entry,
  photoNumber,
  repeated,
  onToggle,
  onRemove,
  onSave,
  busy,
  error,
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
            aria-invalid={error?.field === 'format' || undefined}
            aria-describedby={
              error?.field === 'format' ? `${markId}-err` : undefined
            }
            onChange={(event) => onSave({ format: event.target.value })}
          >
            {Object.entries(words.formats).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {error && !NUMBER_FIELDS.includes(error.field) && (
          <p id={`${markId}-err`} className="intake-book-mark" data-state="bad">
            {error.message}
          </p>
        )}
        {collected ? (
          <>
            <CollectsField
              key={`${entry.payload?.collects_from}-${entry.payload?.collects_to}`}
              entry={entry}
              onSave={onSave}
              error={
                error?.field === 'collects_from' ||
                error?.field === 'collects_to'
                  ? error.message
                  : null
              }
            />
            <div className="intake-book-field">
              <label htmlFor={`${markId}-kind`}>{words.editionKindLabel}</label>
              <select
                id={`${markId}-kind`}
                value={entry.payload?.edition_kind ?? 'trade'}
                aria-invalid={error?.field === 'edition_kind' || undefined}
                aria-describedby={
                  error?.field === 'edition_kind' ? `${markId}-err` : undefined
                }
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
              markId={markId}
              error={error?.field === 'issue_number' ? error.message : null}
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
 * @param {boolean} props.busy A tick or removal is being saved. A number
 *   save never disables anything: the next field keeps focus.
 * @param {Record<string, {field: string|null, message: string}>} [props.errors]
 *   The server's refusal of a book's field, by entry id.
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
  errors = {},
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
            error={errors[entry.id]}
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
