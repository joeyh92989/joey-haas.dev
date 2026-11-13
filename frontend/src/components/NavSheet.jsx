import Sheet from './Sheet.jsx'

/**
 * A phone's nav as a sheet: a Menu or a segment's pages, under a kicker and
 * a Close button. The site's MobileNavSheet and the admin shell's TabSheet
 * are this with different links. The links render only while the sheet is
 * open, so the closed sheet adds no second nav landmark to the page.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.label The sheet's name and its kicker.
 * @param {string} props.navLabel The name of the nav landmark inside.
 * @param {string} [props.className] Extra classes after `nav-sheet`.
 * @param {import('react').RefObject<HTMLElement>} props.returnFocusRef
 *   Where focus goes when the sheet closes: the control that opened it.
 * @param {import('react').ReactNode} props.children The links.
 */
export default function NavSheet({
  open,
  onClose,
  label,
  navLabel,
  className = '',
  returnFocusRef,
  children,
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      ariaLabel={label}
      variant="bare"
      className={`nav-sheet ${className}`.trim()}
      returnFocus={returnFocusRef}
    >
      <div className="nav-sheet-body">
        <div className="nav-sheet-head">
          <span className="kicker">{label}</span>
          <button type="button" className="btn sm" onClick={onClose}>
            Close
          </button>
        </div>
        <nav aria-label={navLabel}>{children}</nav>
      </div>
    </Sheet>
  )
}
