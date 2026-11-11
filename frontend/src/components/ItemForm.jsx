import { useRef } from 'react'
import { spine } from '../content/spine.js'
import { EMPTY_EDITION, SHELF_FORMATS } from '../lib/comics.js'
import { STATUS_LABEL, STATUS_ORDER } from '../lib/shelf.js'

const TYPES = ['game', 'movie', 'comic', 'boardgame']
const OWNED_FORMATS = [
  'physical',
  'digital',
  'subscription',
  'borrowed',
  'none',
]

/**
 * Platforms offered for a copy, cartridge-era and Nintendo first. These mirror
 * PLATFORM_NAMES in backend/sources/igdb.py, which is the authority: the API
 * refuses an id missing there, so add a platform on both sides.
 */
export const PLATFORM_OPTIONS = [
  [4, 'Nintendo 64'],
  [130, 'Nintendo Switch'],
  [508, 'Nintendo Switch 2'],
  [37, 'Nintendo 3DS'],
  [41, 'Wii U'],
  [167, 'PlayStation 5'],
  [48, 'PlayStation 4'],
  [169, 'Xbox Series X|S'],
  [49, 'Xbox One'],
  [6, 'PC'],
]

/** What a physical copy is. Blank means unknown or not physical. */
export const FORMAT_OPTIONS = [
  ['game_card', 'Full game on cartridge'],
  ['game_key_card', 'Game-Key Card'],
  ['code_in_box', 'Code in a box'],
  ['disc', 'Disc'],
]

export const COMPLETENESS_OPTIONS = [
  ['loose', 'Loose'],
  ['boxed', 'Boxed'],
  ['cib', 'Complete in box'],
  ['sealed', 'Sealed'],
]

/** Platforms whose copies are collected by completeness (formats.py). */
export const CARTRIDGE_ERA_PLATFORMS = [4]

/** A comic's fields as empty form state, for a new row. */
export const EMPTY_COMIC_FIELDS = {
  issues_owned: '',
  issues_skipped: '',
  editions: [],
  read_to: '',
  shelf_format: '',
  following: false,
}

/** Kinds offered for an edition; free text, so any other is fine too. */
const EDITION_KINDS = ['Trade', 'Omnibus', 'Hardcover', 'Compendium', 'Deluxe']

/** An error from the API, shown beside the field it is about. */
function FieldError({ id, message }) {
  if (!message) return null
  return (
    <p id={id} className="admin-error comic-field-error" role="alert">
      {message}
    </p>
  )
}

/**
 * Collected editions as rows: kind, label, the first and last issue it
 * collects, and Remove; Add appends a blank row. The API is the one
 * validator; a blank row is dropped on save.
 */
function EditionRows({ rows, onChange, error }) {
  const addRef = useRef(null)
  const update = (index, field) => (event) =>
    onChange(
      rows.map((row, at) =>
        at === index ? { ...row, [field]: event.target.value } : row,
      ),
    )
  return (
    <fieldset
      className="comic-editions"
      aria-describedby={error ? 'comic-editions-error' : undefined}
    >
      <legend>Collected editions</legend>
      <datalist id="comic-edition-kinds">
        {EDITION_KINDS.map((kind) => (
          <option key={kind} value={kind} />
        ))}
      </datalist>
      {rows.map((row, index) => {
        const name = row.label || `edition ${index + 1}`
        return (
          <div className="comic-edition-row" key={index}>
            <input
              aria-label={`Kind, ${name}`}
              list="comic-edition-kinds"
              placeholder="Trade"
              value={row.kind}
              onChange={update(index, 'kind')}
            />
            <input
              aria-label={`Label, ${name}`}
              placeholder="Vol. 1"
              value={row.label}
              onChange={update(index, 'label')}
            />
            <input
              aria-label={`From issue, ${name}`}
              inputMode="numeric"
              placeholder="1"
              value={row.from}
              onChange={update(index, 'from')}
            />
            <input
              aria-label={`To issue, ${name}`}
              inputMode="numeric"
              placeholder="6"
              value={row.to}
              onChange={update(index, 'to')}
            />
            <button
              type="button"
              className="link-button"
              aria-label={`Remove ${name}`}
              onClick={() => {
                onChange(rows.filter((_, at) => at !== index))
                // The row and its button are gone: land on Add, never on
                // the next row's Remove, where a second Enter would remove
                // another edition.
                addRef.current?.focus()
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="link-button"
        ref={addRef}
        onClick={() => onChange([...rows, { ...EMPTY_EDITION }])}
      >
        Add an edition
      </button>
      <FieldError id="comic-editions-error" message={error} />
    </fieldset>
  )
}

/**
 * A comic series' own fields (spec, section 5): the single issues owned as
 * ranges, how far I have read, the skipped issues (admin edit only, and
 * private), collected editions as rows, the format on the shelf, and
 * Follow. Shared by the add form and the edit page, so both read and write
 * one shape. On the edit page the run editor above stays in step with these
 * fields: a tap rewrites the text, and typing redraws the box.
 *
 * Ranges are checked by the API, which answers a malformed one with a
 * message shown beside the field it names; the form keeps what was typed.
 *
 * @param {object} props
 * @param {object} props.value - Form state carrying the EMPTY_COMIC_FIELDS keys.
 * @param {(next: object) => void} props.onChange
 * @param {number|null} [props.released] - Comic Vine's released count, for the hint.
 * @param {boolean} [props.showSkipped] - The edit page's private Skipped field.
 * @param {Record<string, string>} [props.errors] - API errors by field.
 */
export function ComicFields({
  value,
  onChange,
  released = null,
  showSkipped = false,
  errors = {},
}) {
  const set = (field) => (event) =>
    onChange({
      ...value,
      [field]:
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value,
    })
  const describedBy = (field, hint) =>
    [hint, errors[field] && `comic-${field}-error`].filter(Boolean).join(' ') ||
    undefined
  return (
    <>
      <label htmlFor="comic-issues">Single issues I own</label>
      <input
        id="comic-issues"
        placeholder="1–54, 60, 62–64"
        aria-describedby={describedBy('issues_owned', 'comic-issues-hint')}
        aria-invalid={errors.issues_owned ? true : undefined}
        value={value.issues_owned}
        onChange={set('issues_owned')}
      />
      <p id="comic-issues-hint" className="muted comic-hint">
        Numbers and ranges, separated by commas. Issues in a collected edition
        are counted from its row.
        {released ? ` Comic Vine lists ${released} out.` : ''}
      </p>
      <FieldError id="comic-issues_owned-error" message={errors.issues_owned} />

      <label htmlFor="comic-read-to">Read to</label>
      <input
        id="comic-read-to"
        type="number"
        min="1"
        aria-describedby={describedBy('read_to')}
        aria-invalid={errors.read_to ? true : undefined}
        value={value.read_to}
        onChange={set('read_to')}
      />
      <FieldError id="comic-read_to-error" message={errors.read_to} />

      {showSkipped && (
        <>
          <label htmlFor="comic-skipped">
            Skipped <span className="comic-private">private</span>
          </label>
          <input
            id="comic-skipped"
            placeholder="58"
            aria-describedby={describedBy(
              'issues_skipped',
              'comic-skipped-hint',
            )}
            aria-invalid={errors.issues_skipped ? true : undefined}
            value={value.issues_skipped}
            onChange={set('issues_skipped')}
          />
          <p id="comic-skipped-hint" className="muted comic-hint">
            Issues I chose not to buy. Never public; an owned issue can’t be
            skipped.
          </p>
          <FieldError
            id="comic-issues_skipped-error"
            message={errors.issues_skipped}
          />
        </>
      )}

      <EditionRows
        rows={value.editions}
        onChange={(editions) => onChange({ ...value, editions })}
        error={errors.editions}
      />

      <label htmlFor="comic-shelf-format">Format on the shelf</label>
      <select
        id="comic-shelf-format"
        value={value.shelf_format}
        onChange={set('shelf_format')}
      >
        <option value="">not recorded</option>
        {SHELF_FORMATS.map((format) => (
          <option key={format} value={format}>
            {spine.comics.formats[format]}
          </option>
        ))}
      </select>

      <label htmlFor="comic-following">Follow</label>
      <input
        id="comic-following"
        type="checkbox"
        checked={value.following}
        onChange={set('following')}
      />
    </>
  )
}

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
  // The API takes a number or null, never an empty string, so the create call
  // can send these as they stand.
  const setPlatform = (event) =>
    onChange({
      ...value,
      platform_id:
        event.target.value === '' ? null : Number(event.target.value),
    })
  const setCopyFormat = (event) =>
    onChange({ ...value, physical_format: event.target.value || null })

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
        {STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABEL[status]}
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

      {value.type === 'comic' ? (
        <div className="comic-fields">
          <ComicFields value={value} onChange={onChange} />
        </div>
      ) : (
        <>
          <select
            aria-label="Platform"
            value={value.platform_id ?? ''}
            onChange={setPlatform}
          >
            <option value="">Platform…</option>
            {PLATFORM_OPTIONS.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          <select
            aria-label="Copy format"
            value={value.physical_format ?? ''}
            onChange={setCopyFormat}
          >
            <option value="">Copy format…</option>
            {FORMAT_OPTIONS.map(([format, label]) => (
              <option key={format} value={format}>
                {label}
              </option>
            ))}
          </select>
        </>
      )}

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
