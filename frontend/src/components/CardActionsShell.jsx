import { useId, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import { Button } from './ui/button.jsx'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { cx } from '../lib/cx.js'
import {
  SHELF_ACTIONS_HOVER,
  SHELF_ACTIONS_SHEET,
  SHELF_SHEET,
} from './shelf-classes.js'

/**
 * The frame around an admin card's controls, shared by the Games and Comics
 * cards. On a pointer device the panel is always in the document and CSS
 * reveals it on hover and on focus-within (opacity, so a keyboard can still
 * reach it). On touch it collapses to one "…" button that opens the same
 * panel in a `Sheet` (the one modal), which handles Escape, a tap outside
 * and returning focus to the "…" button.
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
  const toggle = useRef(null)
  const sheetId = useId()

  if (hover) {
    return (
      <div
        className={cx('shelf-actions', SHELF_ACTIONS_HOVER, className)}
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
      className={cx('shelf-actions', SHELF_ACTIONS_SHEET, className)}
      data-mode="sheet"
    >
      <Button
        ref={toggle}
        variant="outline"
        size="icon-sm"
        className="rounded-full max-[700px]:size-11"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? sheetId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">…</span>
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={label}
        variant="bare"
        className={cx('shelf-sheet', SHELF_SHEET)}
        initialFocus={focusSelector}
        returnFocus={toggle}
      >
        <div id={sheetId}>{children}</div>
      </Sheet>
    </div>
  )
}
