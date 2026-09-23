import { useEffect, useId, useRef, useState } from 'react'
import { STATUS_LABEL, STATUS_ORDER } from '../lib/shelf.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import QuickRate from './QuickRate.jsx'

/**
 * The admin controls on one shelf card: quick rate, favourite, status and
 * publish.
 *
 * Rendered through PosterCard's `actions`, so it is a sibling of the card's
 * link. On a pointer device the panel is always in the document and CSS
 * reveals it on hover and on focus-within, with opacity rather than display,
 * so a keyboard can still reach it. On touch it collapses to one "…" button
 * that opens the same panel as a sheet, closed by Escape or a tap outside.
 *
 * Every callback receives the item and the new value; the page decides what
 * to PATCH and reloads rather than updating optimistically.
 *
 * @param {object} props
 * @param {object} props.item - The row as the server last returned it.
 * @param {(item: object, rating: number|null) => void} props.onRate
 * @param {(item: object, favorite: boolean) => void} props.onFavorite
 * @param {(item: object, status: string) => void} props.onStatus
 * @param {(item: object, isPublic: boolean) => void} props.onPublish
 */
export default function ShelfCardActions({
  item,
  onRate,
  onFavorite,
  onStatus,
  onPublish,
}) {
  const hover = useMediaQuery('(hover: hover)')
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const toggle = useRef(null)
  const sheet = useRef(null)
  const sheetId = useId()
  const label = `Actions for ${item.title}`

  // An opened sheet takes focus, at the rating's tab stop, so the keyboard
  // lands where the work is and Escape reaches it.
  useEffect(() => {
    if (open) sheet.current?.querySelector('[tabindex="0"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const panel = (
    <>
      <QuickRate value={item.rating} onChange={(next) => onRate(item, next)} />
      <div className="shelf-actions-row">
        <button
          type="button"
          className="shelf-favourite"
          aria-pressed={Boolean(item.favorite)}
          aria-label="Favourite"
          onClick={() => onFavorite(item, !item.favorite)}
        >
          <span aria-hidden="true">{item.favorite ? '♥' : '♡'}</span>
        </button>
        <select
          aria-label={`Status for ${item.title}`}
          value={item.status}
          onChange={(event) => onStatus(item, event.target.value)}
        >
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <label className="shelf-publish">
          <input
            type="checkbox"
            checked={item.is_public}
            aria-label={`Public: ${item.title}`}
            onChange={(event) => onPublish(item, event.target.checked)}
          />
          <span aria-hidden="true">Public</span>
        </label>
      </div>
    </>
  )

  if (hover) {
    return (
      <div
        className="shelf-actions"
        data-mode="hover"
        role="group"
        aria-label={label}
      >
        {panel}
      </div>
    )
  }

  return (
    <div
      className="shelf-actions"
      data-mode="sheet"
      ref={root}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          setOpen(false)
          toggle.current?.focus()
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="shelf-actions-toggle"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? sheetId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">…</span>
      </button>
      {open && (
        <div
          ref={sheet}
          id={sheetId}
          className="shelf-sheet"
          role="dialog"
          aria-label={label}
        >
          {panel}
        </div>
      )}
    </div>
  )
}
