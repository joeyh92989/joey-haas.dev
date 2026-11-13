import { useEffect, useId, useRef, useState } from 'react'
import { useMediaQuery } from '../lib/useMediaQuery.js'

/**
 * The frame around an admin card's controls, shared by the Games and Comics
 * cards. On a pointer device the panel is always in the document and CSS
 * reveals it on hover and on focus-within (opacity, so a keyboard can still
 * reach it). On touch it collapses to one "…" button that opens the same
 * panel as a sheet, closed by Escape or a tap outside.
 *
 * @param {object} props
 * @param {string} props.label  Names the group, the "…" button and the sheet.
 * @param {string} [props.focusSelector]  What an opened sheet focuses first.
 * @param {string} [props.className]  Extra class on the wrapper.
 * @param {React.ReactNode} props.children  The panel.
 */
export default function CardActionsShell({
  label,
  focusSelector = '[tabindex="0"]',
  className,
  children,
}) {
  const hover = useMediaQuery('(hover: hover)')
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const toggle = useRef(null)
  const sheet = useRef(null)
  const sheetId = useId()
  const classes = className ? `shelf-actions ${className}` : 'shelf-actions'

  // An opened sheet takes focus, so the keyboard lands where the work is
  // and Escape reaches it.
  useEffect(() => {
    if (open) sheet.current?.querySelector(focusSelector)?.focus()
  }, [open, focusSelector])

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  if (hover) {
    return (
      <div
        className={classes}
        data-mode="hover"
        role="group"
        aria-label={label}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className={classes}
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
          {children}
        </div>
      )}
    </div>
  )
}
