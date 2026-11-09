import { useState } from 'react'
import {
  CATEGORIES,
  HAND_STATUSES,
  imageUrl,
  monthName,
} from '../lib/closet.js'

const TEXT = [
  ['name', 'Name'],
  ['subtype', 'Type', 'oxford shirt, chinos, chelsea boot'],
  ['brand', 'Brand'],
  ['pattern', 'Pattern', 'solid, stripe, check'],
  ['material', 'Material', 'cotton, merino, denim'],
]

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/** The form's state from a `GarmentOut`: text as strings, the rest as is. */
export function formFrom(garment) {
  const text = (value) => value ?? ''
  return {
    name: text(garment.name),
    category: garment.category,
    subtype: text(garment.subtype),
    brand: text(garment.brand),
    primary_color: text(garment.primary_color),
    primary_hex: garment.primary_hex,
    secondary_color: text(garment.secondary_color),
    secondary_hex: garment.secondary_hex,
    pattern: text(garment.pattern),
    material: text(garment.material),
    warmth: garment.warmth,
    formality: garment.formality,
    seasons: [...(garment.seasons ?? [])],
    notes: text(garment.notes),
    acquired_on: text(garment.acquired_on),
    // An untagged garment becomes active on its first save.
    status: garment.status === 'untagged' ? 'active' : garment.status,
    back_on: garment.back_on ? garment.back_on.slice(0, 7) : '',
  }
}

/** The PATCH body: every field, blanks as null, back_on as its month's 1st. */
export function bodyFrom(form) {
  const blank = (value) => (value === '' ? null : value)
  return {
    ...form,
    name: blank(form.name.trim()),
    subtype: blank(form.subtype.trim()),
    brand: blank(form.brand.trim()),
    primary_color: blank(form.primary_color.trim()),
    secondary_color: blank(form.secondary_color.trim()),
    pattern: blank(form.pattern.trim()),
    material: blank(form.material.trim()),
    notes: blank(form.notes.trim()),
    acquired_on: blank(form.acquired_on),
    back_on:
      form.status === 'packed' && form.back_on ? `${form.back_on}-01` : null,
  }
}

/** A 1–5 scale as − and + around its value; "—" until one is chosen. */
function Stepper({ label, value, onChange }) {
  const id = `garment-${label.toLowerCase()}`
  return (
    <div className="garment-stepper" role="group" aria-labelledby={id}>
      <span id={id} className="garment-field-label">
        {label}
      </span>
      <button
        type="button"
        className="btn sm"
        aria-label={`Less ${label.toLowerCase()}`}
        disabled={value !== null && value <= 1}
        onClick={() => onChange(value === null ? 1 : value - 1)}
      >
        −
      </button>
      <output aria-live="polite" className="garment-mono">
        {value ?? '—'}
      </output>
      <button
        type="button"
        className="btn sm"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value !== null && value >= 5}
        onClick={() => onChange(value === null ? 3 : value + 1)}
      >
        +
      </button>
    </div>
  )
}

/** A named colour with its swatch: the hex stays null until it is changed. */
function Colour({ label, name, hex, onName, onHex }) {
  const slug = label.toLowerCase()
  return (
    <div className="garment-colour">
      <label>
        <span className="garment-field-label">{label} colour</span>
        <input
          type="text"
          value={name}
          maxLength={40}
          onChange={(e) => onName(e.target.value)}
        />
      </label>
      <label className="garment-swatch">
        <span className="visually-hidden">{label} swatch</span>
        <input
          type="color"
          value={hex ?? '#808080'}
          data-unset={hex === null}
          onChange={(e) => onHex(e.target.value)}
        />
      </label>
      {hex !== null && (
        <button
          type="button"
          className="btn sm ghost"
          aria-label={`Clear the ${slug} swatch`}
          onClick={() => onHex(null)}
        >
          Clear
        </button>
      )}
    </div>
  )
}

/**
 * The garment's edit form: everything the tagger fills, by hand. Saving an
 * untagged garment makes it active (the route does the same when no status
 * is sent). Delete asks once more before it removes the garment and its
 * photo.
 *
 * @param {object} props
 * @param {object} props.garment A `GarmentOut` row.
 * @param {(body: object) => Promise<void>} props.onSave
 * @param {() => Promise<void>} props.onDelete
 * @param {boolean} props.busy
 */
export default function GarmentForm({ garment, onSave, onDelete, busy }) {
  const [form, setForm] = useState(() => formFrom(garment))
  const [confirming, setConfirming] = useState(false)
  const set = (key) => (value) =>
    setForm((current) => ({ ...current, [key]: value }))
  const src = imageUrl(garment)

  function toggleMonth(month) {
    setForm((current) => ({
      ...current,
      seasons: current.seasons.includes(month)
        ? current.seasons.filter((m) => m !== month)
        : [...current.seasons, month].sort((a, b) => a - b),
    }))
  }

  function submit(event) {
    event.preventDefault()
    onSave(bodyFrom(form))
  }

  return (
    <form className="garment-form" onSubmit={submit}>
      {src && (
        <img
          className="garment-form-photo"
          src={src}
          alt={`Photo of ${garment.name ?? 'the garment'}`}
        />
      )}

      <label>
        <span className="garment-field-label">Name</span>
        <input
          type="text"
          value={form.name}
          maxLength={120}
          onChange={(e) => set('name')(e.target.value)}
        />
      </label>

      <fieldset className="garment-segments">
        <legend className="garment-field-label">Slot</legend>
        {CATEGORIES.map((c) => (
          <label key={c.value} className="chip">
            <input
              type="radio"
              name="category"
              className="visually-hidden"
              checked={form.category === c.value}
              onChange={() => set('category')(c.value)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>

      {TEXT.slice(1).map(([key, label, hint]) => (
        <label key={key}>
          <span className="garment-field-label">{label}</span>
          <input
            type="text"
            value={form[key]}
            placeholder={hint}
            maxLength={key === 'brand' ? 80 : 60}
            onChange={(e) => set(key)(e.target.value)}
          />
        </label>
      ))}

      <Colour
        label="Primary"
        name={form.primary_color}
        hex={form.primary_hex}
        onName={set('primary_color')}
        onHex={set('primary_hex')}
      />
      <Colour
        label="Secondary"
        name={form.secondary_color}
        hex={form.secondary_hex}
        onName={set('secondary_color')}
        onHex={set('secondary_hex')}
      />

      <Stepper label="Warmth" value={form.warmth} onChange={set('warmth')} />
      <Stepper
        label="Formality"
        value={form.formality}
        onChange={set('formality')}
      />

      <fieldset className="garment-months">
        <legend className="garment-field-label">Season</legend>
        {MONTHS.map((month) => (
          <button
            key={month}
            type="button"
            className="chip"
            aria-pressed={form.seasons.includes(month)}
            onClick={() => toggleMonth(month)}
          >
            {monthName(month)}
          </button>
        ))}
      </fieldset>

      <label>
        <span className="garment-field-label">Notes</span>
        <textarea
          rows={3}
          value={form.notes}
          maxLength={2000}
          onChange={(e) => set('notes')(e.target.value)}
        />
      </label>

      <label>
        <span className="garment-field-label">Acquired</span>
        <input
          type="date"
          value={form.acquired_on}
          onChange={(e) => set('acquired_on')(e.target.value)}
        />
      </label>

      <label>
        <span className="garment-field-label">Status</span>
        <select
          value={form.status}
          onChange={(e) => set('status')(e.target.value)}
        >
          {HAND_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {form.status === 'packed' && (
        <label>
          <span className="garment-field-label">Back in</span>
          <input
            type="month"
            value={form.back_on}
            onChange={(e) => set('back_on')(e.target.value)}
          />
        </label>
      )}

      <div className="garment-form-acts">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={onDelete}
            >
              Delete for good
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn ghost"
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
