import { optionLabel } from '../../lib/intake.js'

/** The input type for each `FieldSpec.control` that is not a select. */
const INPUT_TYPES = { text: 'text', number: 'number', date: 'date' }

/**
 * A kind's fields, drawn from its `FieldSpec` list as `GET
 * /api/intake/kinds` serves it (spec D11). Nothing here knows a kind: a
 * field added to a kind's list on the server shows in the drawer, the
 * Details rows and "set for all" with no change here (AC 9, 10).
 *
 * @param {object} props
 * @param {Array<{key: string, label: string, control: string,
 *   options: string[], per_item: boolean, required: boolean}>} props.fields
 * @param {Record<string, unknown>} props.values Current values by key.
 * @param {(key: string, value: string) => void} props.onChange
 * @param {(key: string) => void} [props.onBlur] A field lost focus, for
 *   callers that save then rather than on every keystroke.
 * @param {'all'|'item'} [props.mode] `all` draws only the fields a whole
 *   sitting can share ("set for all"); `item` only those that differ per
 *   entry (a comic's issues). Left out, every field.
 * @param {Record<string, string>} [props.refusals] The write path's own
 *   message per field key, shown beside that field.
 * @param {string} [props.kindKey] The sitting's kind (`comic`, `game`), for
 *   option words that follow the item type.
 * @param {string} props.idPrefix Unique per instance, for label ids.
 */
export default function KindFields({
  fields,
  values,
  onChange,
  onBlur,
  mode,
  refusals = {},
  kindKey,
  idPrefix,
}) {
  const shown = fields.filter((field) =>
    mode === 'all' ? !field.per_item : mode === 'item' ? field.per_item : true,
  )
  return shown.map((field) => {
    const id = `${idPrefix}-${field.key}`
    const refusal = refusals[field.key]
    const shared = {
      id,
      value: values[field.key] ?? '',
      required: field.required || undefined,
      'aria-invalid': refusal ? 'true' : undefined,
      'aria-describedby': refusal ? `${id}-refusal` : undefined,
      onChange: (event) => onChange(field.key, event.target.value),
      onBlur: onBlur ? () => onBlur(field.key) : undefined,
    }
    return (
      <div key={field.key} className="intake-field">
        <label htmlFor={id}>{field.label}</label>
        {field.control === 'select' ? (
          <select {...shared}>
            <option value="">—</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {optionLabel(field.key, option, kindKey)}
              </option>
            ))}
          </select>
        ) : (
          <input type={INPUT_TYPES[field.control] ?? 'text'} {...shared} />
        )}
        {refusal && (
          <p id={`${id}-refusal`} className="intake-refusal">
            {refusal}
          </p>
        )}
      </div>
    )
  })
}
