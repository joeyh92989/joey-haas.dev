import { useEffect, useId, useRef, useState } from 'react'
import CoverImage from '../CoverImage.jsx'
import KindFields from './KindFields.jsx'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Single add (screen "Single add"): the chosen result, or a title kept as
 * typed, then the kind's own fields from its `FieldSpec` list (the same
 * list the sitting's Details step draws), then Add, Add and search again,
 * Cancel. Beside the grid at 1280; a modal bottom sheet below 900px
 * (`sheet`). Either way focus is trapped inside while it is open and
 * Escape closes it; the caller returns focus to the button that opened it.
 *
 * @param {object} props
 * @param {object} props.kind The kind, as `GET /api/intake/kinds` serves it.
 * @param {object|null} props.chosen The search result, or null when typed.
 * @param {string} props.typed The query, prefilled when kept as typed.
 * @param {boolean} props.sheet
 * @param {(fields: {title?: string, values: Record<string, string>},
 *   again: boolean) => void} props.onAdd
 * @param {() => void} props.onClose
 * @param {boolean} [props.busy]
 * @param {string|null} [props.error] A refusal no single field owns.
 * @param {Record<string, string>} [props.refusals] Messages per field key.
 */
export default function AddDrawer({
  kind,
  chosen,
  typed,
  sheet,
  onAdd,
  onClose,
  busy = false,
  error = null,
  refusals = {},
}) {
  const id = useId()
  const ref = useRef(null)
  const closet = kind.area === 'closet'
  // A typed shelf row needs a title; a typed piece's name is its own field.
  const needsTitle = !chosen && !closet
  const [title, setTitle] = useState(typed)
  const [values, setValues] = useState(() =>
    !chosen && closet && kind.fields.some((f) => f.key === 'name')
      ? { name: typed }
      : {},
  )
  const heading = chosen?.title ?? title ?? typed

  useEffect(() => {
    ref.current?.querySelector(FOCUSABLE)?.focus()
  }, [])

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = [...ref.current.querySelectorAll(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function submit(again) {
    if (needsTitle && !title.trim()) return
    onAdd({ title: needsTitle ? title : undefined, values }, again)
  }

  return (
    <>
      {sheet && (
        <div
          className="intake-drawer-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={ref}
        role="dialog"
        aria-modal={sheet ? 'true' : undefined}
        aria-labelledby={`${id}-title`}
        className={
          sheet ? 'intake-drawer intake-drawer-sheet' : 'intake-drawer'
        }
        onKeyDown={onKeyDown}
      >
        <div className="intake-drawer-head">
          {chosen && (
            <CoverImage src={chosen.thumbnail_url ?? null} type={kind.key} />
          )}
          <div>
            <p className="kicker">
              {kind.label} · {chosen ? chosen.external_source : 'kept as typed'}
            </p>
            <h2 id={`${id}-title`} className="intake-drawer-title">
              {heading}
            </h2>
            {chosen?.year && <p className="muted">{chosen.year}</p>}
          </div>
        </div>
        <form
          className="intake-drawer-fields"
          onSubmit={(event) => {
            event.preventDefault()
            submit(false)
          }}
        >
          {needsTitle && (
            <div className="intake-field">
              <label htmlFor={`${id}-typed-title`}>Title</label>
              <input
                id={`${id}-typed-title`}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          )}
          <KindFields
            kindKey={kind.key}
            fields={kind.fields}
            values={values}
            onChange={(key, value) =>
              setValues((old) => ({ ...old, [key]: value }))
            }
            refusals={refusals}
            idPrefix={`${id}-field`}
          />
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
          <div className="intake-drawer-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {closet ? 'Add to closet' : 'Add to shelf'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => submit(true)}
            >
              {closet ? 'Add and type another' : 'Add and search again'}
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
        {!closet && <p className="muted">Private until published.</p>}
      </aside>
    </>
  )
}
