import { useId, useState } from 'react'
import { placesAdd } from '../../content/placesAdd.js'

const words = placesAdd.paste

/**
 * The fix form of a to-check row: a name and one button, the page's search
 * row. An empty name is refused here, beside the field.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.initial The name to start from.
 * @param {string} props.button
 * @param {string} [props.hint]
 * @param {string} props.inputId Id of the field (a focus target).
 * @param {boolean} [props.disabled] A request for the row is under way.
 * @param {(name: string) => void} props.onSubmit Gets the trimmed name.
 */
export default function PasteFixForm({
  label,
  initial,
  button,
  hint,
  inputId,
  disabled = false,
  onSubmit,
}) {
  const hintId = useId()
  const errorId = useId()
  const [name, setName] = useState(initial)
  const [error, setError] = useState(false)

  function submit(event) {
    event.preventDefault()
    const text = name.trim()
    if (!text) {
      setError(true)
      return
    }
    setError(false)
    onSubmit(text)
  }

  const described = [hint && hintId, error && errorId].filter(Boolean).join(' ')
  return (
    <form className="place-paste-fix" onSubmit={submit}>
      <label htmlFor={inputId}>{label}</label>
      <div className="place-search-row">
        <input
          type="text"
          id={inputId}
          autoComplete="off"
          enterKeyHint="search"
          aria-invalid={error || undefined}
          aria-describedby={described || undefined}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="btn" disabled={disabled}>
          {button}
        </button>
      </div>
      {hint && (
        <p className="place-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="place-field-error" id={errorId} role="alert">
          {words.nameRequired}
        </p>
      )}
    </form>
  )
}
