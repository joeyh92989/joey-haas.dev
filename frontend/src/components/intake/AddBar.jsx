import { useRef, useState } from 'react'
import { isbnIntake } from '../../content/isbnIntake.js'
import { linkIntake } from '../../content/linkIntake.js'
import { seedIntake as words } from '../../content/seedIntake.js'
import BarcodeScanner from './BarcodeScanner.jsx'
import { ibtn, INTAKE_FIELD } from '../addClasses.js'
import { INTAKE_ADDBAR } from '../intakeClasses.js'

/**
 * The add bar's one row: a text field, ▤ Photos and the barcode button.
 * The barcode button scans a book's ISBN where the area reads one
 * (`onScan`); elsewhere it stays disabled with its reason in its name
 * (spec: a disabled way in is a disabled button, never a hidden one). The field
 * searches on submit where the area has a catalogue; in the Closet it is
 * type-only (`searchable` false) and submitting opens the drawer.
 *
 * @param {object} props
 * @param {boolean} props.searchable
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {() => void} props.onSubmit
 * @param {() => void} props.onPhotos
 * @param {(file: File) => void} [props.onFile] Offered only where a kind has
 *   the `file` way in: "From a file" picks a seed CSV.
 * @param {() => void} [props.onLinks] Offered only where a kind has the
 *   `link` way in: "From links" opens the paste panel.
 * @param {boolean} [props.linksOpen] The paste panel is showing.
 * @param {(isbn: string) => void} [props.onScan] Offered only where books
 *   are added (the shelf): called with the ISBN-13 the camera read.
 * @param {boolean} [props.busy] A search or a new sitting is under way.
 * @param {import('react').Ref<HTMLInputElement>} props.inputRef
 */
export default function AddBar({
  searchable,
  value,
  onChange,
  onSubmit,
  onPhotos,
  onFile,
  onLinks,
  onScan,
  linksOpen = false,
  busy = false,
  inputRef,
}) {
  const filePicker = useRef(null)
  const [scanning, setScanning] = useState(false)
  return (
    // The file input sits outside the form: a second field there would stop
    // Enter in the text field from submitting it.
    <>
      <form
        className={`intake-addbar ${INTAKE_ADDBAR}`}
        role={searchable ? 'search' : undefined}
        aria-label={searchable ? 'Add to the shelf' : undefined}
        onSubmit={(event) => {
          event.preventDefault()
          if (value.trim()) onSubmit()
        }}
      >
        <input
          ref={inputRef}
          className={INTAKE_FIELD}
          type={searchable ? 'search' : 'text'}
          aria-label="Add"
          enterKeyHint={searchable ? 'search' : 'done'}
          placeholder={
            searchable
              ? 'Search to add one, or ▤ Photos for a sitting'
              : 'Type a piece to add it by hand, or ▤ Photos, one per piece'
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className={ibtn('plain')}
          aria-label="Add from photos"
          disabled={busy}
          onClick={onPhotos}
        >
          <span aria-hidden="true">▤</span> Photos
        </button>
        {onFile && (
          <button
            type="button"
            className={ibtn('plain')}
            aria-label={words.buttonLabel}
            disabled={busy}
            onClick={() => filePicker.current?.click()}
          >
            <span aria-hidden="true">▦</span> {words.button}
          </button>
        )}
        {onLinks && (
          <button
            type="button"
            className={ibtn('plain')}
            aria-label={linkIntake.buttonLabel}
            aria-expanded={linksOpen}
            disabled={busy}
            onClick={onLinks}
          >
            <span aria-hidden="true">↗</span> {linkIntake.button}
          </button>
        )}
        <button
          type="button"
          className={ibtn('plain')}
          disabled={busy || !onScan}
          aria-label={
            onScan ? isbnIntake.barScan : 'Scan a barcode: not available here'
          }
          onClick={() => setScanning(true)}
        >
          <span aria-hidden="true">▥</span>
        </button>
      </form>
      {onScan && (
        <BarcodeScanner
          open={scanning}
          onClose={() => setScanning(false)}
          onScan={onScan}
        />
      )}
      {onFile && (
        <input
          ref={filePicker}
          type="file"
          accept=".csv,text/csv"
          className="visually-hidden"
          aria-label={words.fileLabel}
          tabIndex={-1}
          onChange={(event) => {
            const [file] = event.target.files
            event.target.value = ''
            if (file) onFile(file)
          }}
        />
      )}
    </>
  )
}
