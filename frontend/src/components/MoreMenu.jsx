import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { isUnder } from '../lib/navMore.js'
import { buttonVariants } from './ui/button-variants.js'

/**
 * The masthead's More: a disclosure button at the end of the nav that opens
 * a small panel of links. Not a dialog, so there is no focus trap. It closes
 * on Escape (focus goes back to the button), a click outside, focus leaving
 * the panel and following a link.
 *
 * The button is underlined like a current link when the route is one of its
 * pages, except an item with `underlinesMore: false`; the row of the current
 * page carries aria-current either way. The panel is always rendered and
 * hidden, so aria-controls always points at something.
 *
 * @param {object} props
 * @param {{to: string, label: string, desc: string,
 *   underlinesMore?: boolean}[]} props.items From `moreItems()`.
 */
export default function MoreMenu({ items }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()
  const { pathname } = useLocation()
  const underlined = items.some(
    (item) => item.underlinesMore !== false && isUnder(pathname, item.to),
  )

  useEffect(() => {
    if (!open) return
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function onKeyDown(event) {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  function onBlur(event) {
    const next = event.relatedTarget
    if (next && !rootRef.current?.contains(next)) setOpen(false)
  }

  return (
    <div className="more" ref={rootRef} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        type="button"
        ref={buttonRef}
        className={`${buttonVariants({ variant: 'nav' })} more-btn ${
          underlined
            ? 'active border-b-primary font-semibold'
            : 'text-muted-foreground aria-expanded:text-foreground'
        } gap-1`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        More
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <div id={panelId} className="more-panel" hidden={!open}>
        <ul>
          {items.map((item) => {
            const current = isUnder(pathname, item.to)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={current ? 'active' : undefined}
                  aria-current={current ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="t">{item.label}</span>
                  <span className="d">{item.desc}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
