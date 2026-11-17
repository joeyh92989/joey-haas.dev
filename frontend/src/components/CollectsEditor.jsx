import { useId, useState } from 'react'
import { Link } from 'react-router'
import { volume as COPY } from '../content/adminVolume.js'
import { collectBody, draftBody } from '../lib/volumeEdits.js'
import ConfirmDelete from './ConfirmDelete.jsx'

const C = COPY.collects

/** An entry as it is named on every button: "Saga #7-12". */
const entryName = (entry) => `${entry.series_name} ${entry.issue_text}`.trim()

/** The edit form's starting values: an entry, or empty for a new one. */
function draftOf(entry) {
  const link = entry?.link
  return {
    series_name: entry?.series_name ?? '',
    issue_text: entry?.issue_text ?? '',
    item_id: link ? link.item_id : '',
    from: link?.from_number != null ? String(link.from_number) : '',
    to: link?.to_number != null ? String(link.to_number) : '',
  }
}

/** One labelled input with its refusal under it, tied by aria-describedby. */
function Field({ id, label, error, children }) {
  return (
    <div className="admin-collect-field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-error` : undefined,
      })}
      {error && (
        <p
          id={`${id}-error`}
          className="admin-error comic-field-error"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The form for one entry, new or existing. `onSave(draft)` resolves with a
 * `VolumeError` when the API refused (its `fields` are keyed from the entry's
 * own `collects.<index>.` path), or null when it saved.
 */
function EntryForm({ index, entry, titles, busy, onSave, onCancel }) {
  const ids = useId()
  const [draft, setDraft] = useState(() => draftOf(entry))
  const [refusal, setRefusal] = useState(null)
  const set = (key) => (event) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }))

  const prefix = `collects.${index}.`
  const fields = Object.fromEntries(
    Object.entries(refusal?.fields ?? {})
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, message]) => [key.slice(prefix.length), message]),
  )
  const unplaced =
    refusal && Object.keys(fields).length === 0 ? refusal.message : null

  async function submit(event) {
    event.preventDefault()
    setRefusal(null)
    const failure = await onSave(draft)
    if (failure) setRefusal(failure)
  }

  const linked = draft.item_id !== ''
  return (
    <form
      className="admin-collect-form"
      onSubmit={submit}
      noValidate
      aria-label={entry ? C.editName(entryName(entry)) : C.add}
    >
      <Field id={`${ids}-series`} label={C.series} error={fields.series_name}>
        {(props) => (
          <input
            {...props}
            value={draft.series_name}
            onChange={set('series_name')}
          />
        )}
      </Field>
      <Field id={`${ids}-issues`} label={C.issues} error={fields.issue_text}>
        {(props) => (
          <input
            {...props}
            placeholder={C.issuesHint}
            value={draft.issue_text}
            onChange={set('issue_text')}
          />
        )}
      </Field>
      {titles.status === 'loading' && (
        <p className="muted">{C.loadingTitles}</p>
      )}
      {titles.status === 'error' && (
        <p className="admin-error" role="alert">
          {C.titlesFailed}
        </p>
      )}
      {titles.status === 'ready' && (
        <Field
          id={`${ids}-link`}
          label={C.linkTitle}
          error={fields['link.item_id']}
        >
          {(props) => (
            <select {...props} value={draft.item_id} onChange={set('item_id')}>
              <option value="">{C.noLink}</option>
              {titles.list.map((title) => (
                <option key={title.id} value={title.id}>
                  {title.is_public
                    ? title.title
                    : `${title.title} (${COPY.privateTag.toLowerCase()})`}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {linked && (
        <div className="admin-collect-range">
          <Field
            id={`${ids}-from`}
            label={C.from}
            error={fields['link.from_number']}
          >
            {(props) => (
              <input
                {...props}
                type="number"
                min="1"
                inputMode="numeric"
                value={draft.from}
                onChange={set('from')}
              />
            )}
          </Field>
          <Field
            id={`${ids}-to`}
            label={C.to}
            error={fields['link.to_number'] ?? fields.link}
          >
            {(props) => (
              <input
                {...props}
                type="number"
                min="1"
                inputMode="numeric"
                value={draft.to}
                onChange={set('to')}
              />
            )}
          </Field>
        </div>
      )}
      {unplaced && (
        <p className="admin-error" role="alert">
          {unplaced}
        </p>
      )}
      <div className="admin-collect-actions">
        <button type="submit" disabled={busy}>
          {busy ? C.saving : C.save}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {C.cancel}
        </button>
      </div>
    </form>
  )
}

/** One saved entry: its words, its source, its link, and its actions. */
function EntryRow({ entry, index, last, busy, onEdit, onMove, onRemove }) {
  const name = entryName(entry)
  const link = entry.link
  return (
    <li className="admin-collect">
      <div className="admin-collect-text">
        <span className="admin-collect-name">
          <strong>{entry.series_name}</strong> <span>{entry.issue_text}</span>
        </span>
        {link && (
          <span className="admin-collect-link">
            {C.linkedTo}{' '}
            <Link
              to={`/admin/shelf/comics/${encodeURIComponent(link.item_id)}`}
            >
              {link.title}
            </Link>
            {link.from_number != null && link.to_number != null && (
              <> {C.range(link.from_number, link.to_number)}</>
            )}{' '}
            {!link.is_public && (
              <span className="comic-private">{COPY.privateTag}</span>
            )}
          </span>
        )}
        <span className="muted admin-collect-source">
          {C.sourceLabel}: {C.source[entry.source] ?? entry.source}
        </span>
      </div>
      <div className="admin-collect-actions">
        <button
          type="button"
          className="btn sm"
          aria-label={C.editName(name)}
          disabled={busy}
          onClick={onEdit}
        >
          {C.edit}
        </button>
        <button
          type="button"
          className="btn sm"
          aria-label={C.moveUpName(name)}
          disabled={busy || index === 0}
          onClick={() => onMove(-1)}
        >
          {C.moveUp}
        </button>
        <button
          type="button"
          className="btn sm"
          aria-label={C.moveDownName(name)}
          disabled={busy || last}
          onClick={() => onMove(1)}
        >
          {C.moveDown}
        </button>
        <ConfirmDelete
          subject={name}
          className="btn sm"
          label={C.remove}
          intro={C.removeIntro(name)}
          confirmLabel={C.removeFor}
          disabled={busy}
          onConfirm={onRemove}
        />
      </div>
    </li>
  )
}

/**
 * The contents of a book: a list of entries (series and issues as printed,
 * where they came from, an optional link to a run on the shelf), each with
 * Edit, Remove and Move up / down, and Add entry. Every action is one write
 * of the whole list through `onSave(list, line, undoList)`, which resolves
 * with a `VolumeError` or null; entries go back with their ids, so an
 * untouched entry keeps its source.
 *
 * @param {object} props
 * @param {object[]} props.entries - The book's saved `collects`.
 * @param {{status: string, list: object[]}} props.titles - The comics on the shelf.
 * @param {boolean} props.busy - A write is in flight.
 * @param {(list: object[], line: string, undo?: object[]) => Promise<object|null>} props.onSave
 * @param {(note: string) => Promise<unknown>} [props.onParse] - Reads the
 *   contents from the description and the pasted note; the page shows the result.
 */
export default function CollectsEditor({
  entries,
  titles,
  busy,
  onSave,
  onParse,
}) {
  const noteId = useId()
  const [editing, setEditing] = useState(null) // an entry id, or 'new'
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const saved = entries.map(collectBody)

  async function saveDraft(draft, entry) {
    const body = draftBody(draft, entry?.id)
    const list = entry
      ? saved.map((item) => (item.id === entry.id ? body : item))
      : [...saved, body]
    const failure = await onSave(
      list,
      entry ? C.saved(draft.series_name) : C.added(draft.series_name),
    )
    if (!failure) setEditing(null)
    return failure
  }

  function move(index, by) {
    const list = [...saved]
    const [item] = list.splice(index, 1)
    list.splice(index + by, 0, item)
    return onSave(list, C.moved(entries[index].series_name), saved)
  }

  return (
    <>
      {onParse && (
        <div className="admin-collect-read">
          <div className="admin-collect-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => onParse(noting ? note : '')}
            >
              {busy ? C.read.reading : C.read.button}
            </button>
            <button
              type="button"
              className="link-button"
              aria-expanded={noting}
              onClick={() => setNoting((on) => !on)}
            >
              {noting ? C.read.noteHide : C.read.noteToggle}
            </button>
          </div>
          <p className="muted comic-hint">{C.read.hint}</p>
          {noting && (
            <div className="admin-collect-field">
              <label htmlFor={noteId}>{C.read.noteLabel}</label>
              <textarea
                id={noteId}
                rows={3}
                maxLength={2000}
                aria-describedby={`${noteId}-hint`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <p id={`${noteId}-hint`} className="muted comic-hint">
                {C.read.noteHint}
              </p>
            </div>
          )}
        </div>
      )}
      {entries.length === 0 ? (
        <p className="muted">{C.empty}</p>
      ) : (
        <ol className="admin-collects" aria-label={C.list}>
          {entries.map((entry, index) =>
            editing === entry.id ? (
              <li key={entry.id} className="admin-collect">
                <EntryForm
                  index={index}
                  entry={entry}
                  titles={titles}
                  busy={busy}
                  onSave={(draft) => saveDraft(draft, entry)}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <EntryRow
                key={entry.id}
                entry={entry}
                index={index}
                last={index === entries.length - 1}
                busy={busy}
                onEdit={() => setEditing(entry.id)}
                onMove={(by) => move(index, by)}
                onRemove={() =>
                  onSave(
                    saved.filter((item) => item.id !== entry.id),
                    C.removed(entry.series_name),
                  )
                }
              />
            ),
          )}
        </ol>
      )}
      {editing === 'new' ? (
        <EntryForm
          index={entries.length}
          entry={null}
          titles={titles}
          busy={busy}
          onSave={(draft) => saveDraft(draft, null)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          type="button"
          disabled={busy || editing !== null}
          onClick={() => setEditing('new')}
        >
          {C.add}
        </button>
      )}
    </>
  )
}
