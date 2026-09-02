const TYPES = ['game', 'movie', 'comic', 'boardgame']
const STATUSES = ['backlog', 'active', 'finished', 'abandoned']
const OWNED_FORMATS = [
  'physical',
  'digital',
  'subscription',
  'borrowed',
  'none',
]

/**
 * The add-an-item form.
 *
 * Extracted from AdminCollection so that page keeps one job — loading and
 * listing the collection — while this one owns the shape of an item.
 *
 * `owned_format` is required here even though the column is nullable. That is
 * the point of the column being nullable: a want-list row ('none') should mean
 * the owner said so, never that a default happened to be wrong.
 *
 * @param {object} props
 * @param {object} props.value - Current form state.
 * @param {(next: object) => void} props.onChange - Called with the next form state.
 * @param {(event: SubmitEvent) => void} props.onSubmit - Form submit handler.
 * @param {boolean} [props.busy] - Disables submission while a request is in flight.
 * @param {string|null} [props.linkedSource] - Source name when a candidate is linked.
 * @param {() => void} [props.onClearLink] - Drops the external link, keeping the text.
 */
export default function ItemForm({
  value,
  onChange,
  onSubmit,
  busy = false,
  linkedSource = null,
  onClearLink,
}) {
  const set = (field) => (event) =>
    onChange({ ...value, [field]: event.target.value })

  return (
    <form className="item-form" onSubmit={onSubmit}>
      <select aria-label="Type" value={value.type} onChange={set('type')}>
        {TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      <input
        aria-label="Title"
        placeholder="Title"
        required
        value={value.title}
        onChange={set('title')}
      />

      <input
        aria-label="Year"
        type="number"
        min="1880"
        max="2100"
        placeholder="Year"
        value={value.year}
        onChange={set('year')}
      />

      <select aria-label="Status" value={value.status} onChange={set('status')}>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>

      <select
        aria-label="Owned format"
        required
        value={value.owned_format}
        onChange={set('owned_format')}
      >
        <option value="">Format…</option>
        {OWNED_FORMATS.map((format) => (
          <option key={format} value={format}>
            {format === 'none' ? 'want (not owned)' : format}
          </option>
        ))}
      </select>

      <input
        aria-label="Rating"
        type="number"
        min="1"
        max="10"
        placeholder="Rating"
        value={value.rating}
        onChange={set('rating')}
      />

      <button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Add'}
      </button>

      {linkedSource && (
        <p className="muted linked-source">
          Linked to {linkedSource}.{' '}
          <button type="button" className="link-button" onClick={onClearLink}>
            Unlink
          </button>
        </p>
      )}
    </form>
  )
}
