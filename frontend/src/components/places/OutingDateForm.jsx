import { useId, useState } from 'react'
import { placesAdd } from '../../content/placesAdd.js'
import { lineOf } from './pasteModel.js'

const words = placesAdd.paste.outings

/**
 * The Fix date form of a past-outing row (story #350): a text field, the
 * server's last reading of the stored date as "Read as: June 2024, month",
 * and Use this date, Leave out and Cancel. The line shows what the SERVER
 * read, never a client guess: Use this date sends the words through the entry
 * PATCH and the row updates from the reply (a reading that fails leaves the
 * form open on "Not read").
 *
 * @param {object} props
 * @param {object} props.entry The server's entry (with `outing`).
 * @param {string} props.inputId Id of the field (a focus target).
 * @param {boolean} [props.disabled] A request for the row is under way.
 * @param {(text: string) => void} props.onSubmit Gets the trimmed words.
 * @param {() => void} props.onLeaveOut
 * @param {() => void} props.onCancel
 */
export default function OutingDateForm({
  entry,
  inputId,
  disabled = false,
  onSubmit,
  onLeaveOut,
  onCancel,
}) {
  const readId = useId()
  const hintId = useId()
  const errorId = useId()
  const [text, setText] = useState(entry.outing.date_text ?? '')
  const [error, setError] = useState(false)
  // What the server read of the words it holds; edited words are read when
  // they are sent, so until then the line says so rather than guess.
  const unsent = text.trim() !== (entry.outing.date_text ?? '')
  let read = words.notRead
  if (unsent) read = words.readOnUse
  else if (entry.outing.label) {
    read = words.readAsLine(
      entry.outing.label,
      words.precisionWord[entry.outing.precision] ?? entry.outing.precision,
    )
  }

  function submit(event) {
    event.preventDefault()
    const typed = text.trim()
    if (!typed) {
      setError(true)
      return
    }
    setError(false)
    onSubmit(typed)
  }

  return (
    <form className="place-paste-fix" onSubmit={submit}>
      <p className="place-hint">{words.pastedAs(lineOf(entry))}</p>
      <label htmlFor={inputId}>{words.dateLabel}</label>
      <input
        type="text"
        id={inputId}
        autoComplete="off"
        aria-invalid={error || undefined}
        aria-describedby={[readId, hintId, error && errorId]
          .filter(Boolean)
          .join(' ')}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <p className="outing-readas" id={readId} role="status">
        {read}
      </p>
      <p className="place-hint" id={hintId}>
        {words.dateHint}
      </p>
      {error && (
        <p className="place-field-error" id={errorId} role="alert">
          {words.dateRequired}
        </p>
      )}
      <div className="intake-actions">
        <button type="submit" className="btn primary" disabled={disabled}>
          {words.useDate}
        </button>
        <button type="button" className="btn" onClick={onLeaveOut}>
          {placesAdd.paste.leaveOut}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {placesAdd.paste.cancel}
        </button>
      </div>
    </form>
  )
}
