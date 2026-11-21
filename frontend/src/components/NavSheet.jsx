import Sheet from './Sheet.jsx'
import { cx } from '../lib/cx.js'
import { buttonVariants } from './ui/button-variants.js'

/**
 * The sheet from the top, over a dimmed page. Its links take the row look
 * from here, whoever renders them (the site's MastNavLink, the admin shell's
 * NavLink), and `.active` is the current one.
 */
const SHEET =
  'm-0 max-h-dvh w-full max-w-none overflow-y-auto [border:0] [border-bottom:1px_solid_var(--line)] bg-card p-0 text-foreground backdrop:bg-(--overlay)'
const SHEET_LINKS =
  'grid [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:border-b [&_a]:border-border [&_a]:py-3 [&_a]:text-[1rem] [&_a]:text-foreground [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-solid [&_a]:focus-visible:outline-offset-2 [&_a]:focus-visible:outline-ring [&_a.active]:pl-3 [&_a.active]:font-semibold [&_a.active]:shadow-[inset_3px_0_0_var(--accent)]'

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
      className={cx('nav-sheet', SHEET, className)}
      returnFocus={returnFocusRef}
    >
      <div className="px-4 pt-3 pb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="kicker">{label}</span>
          <button
            type="button"
            className={`${buttonVariants({ variant: 'quiet', size: 'sm' })} max-[700px]:min-h-11`}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <nav aria-label={navLabel} className={SHEET_LINKS}>
          {children}
        </nav>
      </div>
    </Sheet>
  )
}
