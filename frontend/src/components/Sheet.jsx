import { useEffect, useRef } from 'react'

/**
 * A modal sheet: a native `<dialog>` opened with showModal(), centred on
 * desktop and anchored to the bottom on a phone, with the site's
 * `--overlay` backdrop. The browser traps focus and inerts the page;
 * Escape and a press on the backdrop route through `onClose`, so the owner's
 * state stays the one source of truth. Focus returns to whatever had it
 * when the sheet opened.
 *
 * The dialog handling is the one WrapUpSheet and SearchDialog each carry;
 * this is the shared shell for new sheets (daily puzzle spec).
 *
 * @param {object} props
 * @param {boolean} props.open Whether the sheet is showing.
 * @param {() => void} props.onClose Called for every way of closing it.
 * @param {string} props.labelledBy The id of the sheet's heading.
 * @param {string} [props.className] Extra classes on the dialog.
 * @param {import('react').ReactNode} props.children The contents, mounted
 *   only while open.
 */
export default function Sheet({
  open,
  onClose,
  labelledBy,
  className = '',
  children,
}) {
  const ref = useRef(null)
  const returnFocus = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement
      dialog.showModal()
      dialog.querySelector('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) {
      dialog.close()
      if (returnFocus.current?.isConnected) returnFocus.current.focus?.()
      returnFocus.current = null
    }
  }, [open])

  function handleCancel(event) {
    event.preventDefault()
    onClose()
  }

  function handleClose() {
    if (open) onClose()
  }

  // The backdrop closes the sheet only when the press began there too: a
  // drag that selects text and ends past the edge is not a dismissal.
  const pressedBackdrop = useRef(false)

  function handlePointerDown(event) {
    pressedBackdrop.current = event.target === event.currentTarget
  }

  function handleClick(event) {
    if (event.target === event.currentTarget && pressedBackdrop.current) {
      onClose()
    }
    pressedBackdrop.current = false
  }

  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`.trim()}
      aria-labelledby={labelledBy}
      onCancel={handleCancel}
      onClose={handleClose}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      {open && children}
    </dialog>
  )
}
