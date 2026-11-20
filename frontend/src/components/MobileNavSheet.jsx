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
 * @param {{to: string, label: string, sheetLabel?: string}[]} [props.more]
 *   The More group, under the nav: the same list as the desktop panel.
 * @param {import('react').RefObject<HTMLElement>} props.returnFocusRef
 *   Where focus goes when the sheet closes: the button that opened it.
 */
export default function MobileNavSheet({
  open,
  onClose,
  items,
  more = [],
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
      {more.length > 0 && (
        <>
          <p className="kicker sheet-group" id="sheet-more">
            More
          </p>
          <div className="sheet-two" role="group" aria-labelledby="sheet-more">
            {more.map((item) => (
              <MastNavLink
                key={item.to}
                item={{ ...item, label: item.sheetLabel ?? item.label }}
                onClick={onClose}
              />
            ))}
          </div>
        </>
      )}
      <div className="sheet-foot">
        <a href="/resume.pdf" onClick={onClose}>
          Resume (PDF)
        </a>
      </div>
    </NavSheet>
  )
}
