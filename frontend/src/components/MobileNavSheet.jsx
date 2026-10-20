import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router'

/**
 * The site nav as a sheet, for a phone, where the masthead has room for a
 * Menu button but not the links. A native modal <dialog>: showModal() traps
 * focus and makes the page behind it inert, so there is no focus code here
 * beyond handing the close back to the owner.
 *
 * The owner holds `open` and returns focus to its Menu button in `onClose`;
 * Escape (the dialog's cancel event), the Close button, a click on the
 * backdrop and following a link all go through it. The links render only
 * while the sheet is open, so the closed sheet adds no second "Site" nav to
 * the page.
 *
 * @param {object} props
 * @param {boolean} props.open Whether the sheet is showing.
 * @param {() => void} props.onClose Called for every way of closing it.
 * @param {{to: string, label: string, end?: boolean}[]} props.items The nav.
 */
export default function MobileNavSheet({ open, onClose, items }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function handleCancel(event) {
    // Closing goes through the owner, so its state and the dialog agree.
    event.preventDefault()
    onClose()
  }

  function handleClick(event) {
    // The dialog element itself is only the target outside its content box,
    // which is the backdrop.
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={ref}
      className="nav-sheet"
      aria-label="Menu"
      onCancel={handleCancel}
      onClick={handleClick}
    >
      {open && (
        <div className="nav-sheet-body">
          <div className="nav-sheet-head">
            <span className="kicker">Menu</span>
            <button type="button" className="btn sm" onClick={onClose}>
              Close
            </button>
          </div>
          <nav aria-label="Site">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
              >
                {item.label}
              </NavLink>
            ))}
            <a href="/resume.pdf" onClick={onClose}>
              Resume ↓
            </a>
          </nav>
        </div>
      )}
    </dialog>
  )
}
