import { useEffect, useRef } from 'react'

/**
 * Resolves a "where does focus go" value: an element, a ref to one, or
 * nothing.
 */
function resolveTarget(target) {
  if (!target) return null
  return 'current' in target ? target.current : target
}

/**
 * The one modal dialog: a native `<dialog>` opened with showModal(). By
 * default it is a sheet, centred on desktop and anchored to the bottom on a
 * phone, with the site's `--overlay` backdrop. The browser traps focus and
 * inerts the page; Escape, a press on the backdrop and any other native
 * close route through `onClose`, so the owner's state stays the one source
 * of truth. Focus goes in on open and back out on close.
 *
 * Search, the photo lightbox, the phone menus, Wrap up and the add drawer's
 * phone sheet all render through this, each with its own `className` and
 * `variant="bare"`, so the dialog handling lives in one place (#204).
 *
 * One of `labelledBy` (the id of a heading inside) or `ariaLabel` names it.
 * Headings inside a sheet start at h2: the page above has its h1.
 *
 * @param {object} props
 * @param {boolean} props.open Whether the sheet is showing.
 * @param {() => void} props.onClose Called for every way of closing it.
 * @param {string} [props.labelledBy] The id of the sheet's heading.
 * @param {string} [props.ariaLabel] A name, where there is no heading.
 * @param {string} [props.className] Extra classes on the dialog.
 * @param {'sheet'|'bare'} [props.variant] `sheet` (default) adds the shared
 *   `.sheet` look; `bare` leaves all styling to `className`.
 * @param {string|import('react').RefObject<HTMLElement>} [props.initialFocus]
 *   A selector within the dialog, or a ref, for what takes focus on open.
 *   Default `[data-autofocus]`.
 * @param {HTMLElement|import('react').RefObject<HTMLElement>|null} [props.returnFocus]
 *   Where focus goes on close: an element or a ref to one (read at close).
 *   Default: whatever had focus when the sheet opened.
 * @param {() => (boolean|void)} [props.canClose] Asked before each close
 *   (Escape, backdrop, a native close). Returning `false` refuses it. It
 *   answers at once: a promise is not awaited, and counts as yes.
 * @param {(event: import('react').KeyboardEvent) => void} [props.onKeyDown]
 * @param {import('react').ReactNode} props.children The contents, mounted
 *   only while open.
 */
export default function Sheet({
  open,
  onClose,
  labelledBy,
  ariaLabel,
  className = '',
  variant = 'sheet',
  initialFocus = '[data-autofocus]',
  returnFocus = null,
  canClose,
  onKeyDown,
  children,
}) {
  const ref = useRef(null)
  const opener = useRef(null)
  // Focus targets are read when the sheet opens or closes, not before, so
  // the open effect needs only `open` as a dependency. This effect runs
  // first (effects run in order), so the refs hold this render's props.
  const initialFocusRef = useRef(initialFocus)
  const returnFocusRef = useRef(returnFocus)
  useEffect(() => {
    initialFocusRef.current = initialFocus
    returnFocusRef.current = returnFocus
  })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement
      dialog.showModal()
      const wanted = initialFocusRef.current
      const target =
        typeof wanted === 'string'
          ? dialog.querySelector(wanted)
          : resolveTarget(wanted)
      target?.focus()
    }
    if (!open && dialog.open) {
      dialog.close()
      // A route change can close the sheet after its opener left the page,
      // so a missing or detached target falls back to what had focus at open.
      const wanted = resolveTarget(returnFocusRef.current)
      const back = wanted?.isConnected ? wanted : opener.current
      if (back?.isConnected) back.focus?.()
      opener.current = null
    }
  }, [open])

  function requestClose() {
    if (canClose?.() === false) return
    onClose()
  }

  function handleCancel(event) {
    event.preventDefault()
    requestClose()
  }

  function handleClose() {
    if (open) requestClose()
  }

  // The backdrop closes the sheet only when the press began there too: a
  // drag that selects text and ends past the edge is not a dismissal.
  const pressedBackdrop = useRef(false)

  function handlePointerDown(event) {
    pressedBackdrop.current = event.target === event.currentTarget
  }

  function handleClick(event) {
    if (event.target === event.currentTarget && pressedBackdrop.current) {
      requestClose()
    }
    pressedBackdrop.current = false
  }

  const classes = [variant === 'sheet' ? 'sheet' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <dialog
      ref={ref}
      className={classes || undefined}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : ariaLabel}
      onCancel={handleCancel}
      onClose={handleClose}
      onKeyDown={onKeyDown}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      {open && children}
    </dialog>
  )
}
