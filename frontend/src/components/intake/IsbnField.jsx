import { useId, useState } from 'react'
import { Link } from 'react-router'
import { isbnIntake as words } from '../../content/isbnIntake.js'
import { apiFetch } from '../../lib/api.js'
import { fillRow, foundLine, toIsbn13 } from '../../lib/isbn.js'
import BarcodeScanner from './BarcodeScanner.jsx'

const REASONS = {
  not_found: words.notFound,
  rate_limited: words.rateLimited,
  unavailable: words.unavailable,
  error: words.unavailable,
}

/**
 * One collected book's ISBN: a box, Look up and Scan. A lookup fills the
 * row's label when it is blank and never overwrites typed text; a miss or
 * a failure says so and leaves the box and the row as they are, so the
 * lookup is never a gate. A volume already holding this ISBN is warned
 * about, not blocked.
 *
 * @param {object} props
 * @param {{kind: string, label: string, from: string, to: string, isbn?: string}} props.row
 * @param {string} props.name The row's name, for the controls' labels.
 * @param {(row: object) => void} props.onChange The row with changes.
 */
export default function IsbnField({ row, name, onChange }) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [note, setNote] = useState(null)
  const isbn = row.isbn ?? ''

  async function lookUp(code = isbn) {
    const valid = toIsbn13(code)
    if (!valid) {
      setNote({ bad: words.badIsbn })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const response = await apiFetch(`/api/intake/isbn/${valid}`)
      if (!response.ok) {
        setNote({
          bad: response.status === 422 ? words.badIsbn : words.noAnswer,
        })
        return
      }
      const result = await response.json()
      onChange(fillRow({ ...row, isbn: valid }, result))
      setNote({
        found: result.found ? foundLine(result) : null,
        cover: result.found ? result.cover_url : null,
        bad: result.found
          ? null
          : (REASONS[result.reason] ?? words.unavailable),
        onShelf: result.on_shelf ?? [],
      })
    } catch {
      setNote({ bad: words.noAnswer })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="comic-edition-isbn">
      <label htmlFor={`${id}-isbn`}>{words.label}</label>
      <input
        id={`${id}-isbn`}
        aria-label={`ISBN, ${name}`}
        inputMode="numeric"
        autoComplete="off"
        placeholder={words.placeholder}
        value={isbn}
        aria-invalid={note?.bad === words.badIsbn || undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        onChange={(event) => {
          setNote(null)
          onChange({ ...row, isbn: event.target.value })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            lookUp()
          }
        }}
      />
      <button
        type="button"
        className="btn sm"
        aria-label={`Look up the ISBN, ${name}`}
        disabled={busy || !isbn.trim()}
        onClick={() => lookUp()}
      >
        {busy ? words.looking : words.lookUp}
      </button>
      <button
        type="button"
        className="btn sm"
        aria-label={`${words.scanLabel}, ${name}`}
        disabled={busy}
        onClick={() => setScanning(true)}
      >
        <span aria-hidden="true">▥</span> {words.scan}
      </button>
      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onScan={(code) => {
          onChange({ ...row, isbn: code })
          lookUp(code)
        }}
      />
      {note && (
        <div
          id={`${id}-note`}
          className="comic-edition-isbn-note"
          role="status"
        >
          {note.found && (
            <p>
              {note.cover && (
                <img
                  className="comic-edition-isbn-cover"
                  src={note.cover}
                  alt=""
                  loading="lazy"
                />
              )}
              {words.found(note.found)} {words.fillNote}
            </p>
          )}
          {note.bad && (
            <p className="comic-field-error" data-state="bad">
              {note.bad}
            </p>
          )}
          {note.onShelf?.length > 0 && (
            <p className="comic-field-error" data-state="bad">
              {words.onShelf.before}
              {note.onShelf.map((held, index) => (
                <span key={`${held.item_id}-${held.volume_slug}`}>
                  {index > 0 && ', '}
                  <Link
                    to={`/admin/shelf/comics/${held.item_id}/${held.volume_slug}`}
                  >
                    {held.title}
                  </Link>
                </span>
              ))}
              {words.onShelf.after}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
