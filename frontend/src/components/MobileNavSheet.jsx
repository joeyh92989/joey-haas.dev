import MastNavLink from './MastNavLink.jsx'
import NavSheet from './NavSheet.jsx'

/**
 * The site nav as a sheet, for a phone, where the masthead has room for a
 * Menu button but not the links. A NavSheet, so a native modal <dialog>
 * through Sheet: focus is trapped and the page behind it is inert.
 *
 * The owner holds `open`; Escape (the dialog's cancel event), the Close
 * button, a click on the backdrop, following a link and any other native
 * close all go through `onClose`. Focus goes back to `returnFocusRef` once
 * the dialog has closed, since the page behind a modal is inert and would
 * refuse it. A followed link still wins: the route change moves focus after
 * Sheet has returned it. The links render only while the sheet is open, so
 * the closed sheet adds no second "Site" nav to the page.
 *
 * @param {object} props
 * @param {boolean} props.open Whether the sheet is showing.
 * @param {() => void} props.onClose Called for every way of closing it.
 * @param {{to: string, label: string, end?: boolean}[]} props.items The nav.
 * @param {import('react').RefObject<HTMLElement>} props.returnFocusRef
 *   Where focus goes when the sheet closes: the button that opened it.
 */
export default function MobileNavSheet({
  open,
  onClose,
  items,
  returnFocusRef,
}) {
  return (
    <NavSheet
      open={open}
      onClose={onClose}
      label="Menu"
      navLabel="Site"
      returnFocusRef={returnFocusRef}
    >
      {items.map((item) => (
        <MastNavLink key={item.to} item={item} onClick={onClose} />
      ))}
      <a href="/resume.pdf" onClick={onClose}>
        Resume ↓
      </a>
    </NavSheet>
  )
}
