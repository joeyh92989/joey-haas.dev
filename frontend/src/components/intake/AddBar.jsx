/**
 * The add bar's one row: a text field, ▤ Photos and the barcode button,
 * disabled with its reason in its name until barcodes exist (spec: a
 * disabled way in is a disabled button, never a hidden one). The field
 * searches on submit where the area has a catalogue; in the Closet it is
 * type-only (`searchable` false) and submitting opens the drawer.
 *
 * @param {object} props
 * @param {boolean} props.searchable
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {() => void} props.onSubmit
 * @param {() => void} props.onPhotos
 * @param {boolean} [props.busy] A search or a new sitting is under way.
 * @param {import('react').Ref<HTMLInputElement>} props.inputRef
 */
export default function AddBar({
  searchable,
  value,
  onChange,
  onSubmit,
  onPhotos,
  busy = false,
  inputRef,
}) {
  return (
    <form
      className="intake-addbar"
      role={searchable ? 'search' : undefined}
      aria-label={searchable ? 'Add to the shelf' : undefined}
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim()) onSubmit()
      }}
    >
      <input
        ref={inputRef}
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
        className="btn"
        aria-label="Add from photos"
        disabled={busy}
        onClick={onPhotos}
      >
        <span aria-hidden="true">▤</span> Photos
      </button>
      <button
        type="button"
        className="btn"
        disabled
        aria-label="Scan a barcode: not available yet"
      >
        <span aria-hidden="true">▥</span>
      </button>
    </form>
  )
}
