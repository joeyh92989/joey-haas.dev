import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { isUnder } from '../lib/navMore.js'
import { cx } from '../lib/cx.js'
import { buttonVariants } from './ui/button-variants.js'

const LINK =
  'group grid items-center whitespace-nowrap rounded-[4px] px-3 py-2 text-foreground hover:bg-secondary hover:no-underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring'
const LINK_CURRENT =
  'border-b-primary bg-secondary font-semibold shadow-[inset_2px_0_0_var(--accent)]'
const LABEL =
  "text-[0.875rem] font-medium text-foreground group-aria-[current=page]:font-semibold group-aria-[current=page]:after:ml-2 group-aria-[current=page]:after:font-mono group-aria-[current=page]:after:text-[0.75rem] group-aria-[current=page]:after:leading-[normal] group-aria-[current=page]:after:font-normal group-aria-[current=page]:after:text-(--text-3) group-aria-[current=page]:after:content-['This_page']"

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
    <div
      className="relative flex self-stretch"
      ref={rootRef}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <button
        type="button"
        ref={buttonRef}
        className={`group ${buttonVariants({ variant: 'nav', size: 'bare' })} more-btn ${
          underlined ? 'active border-b-primary font-semibold' : ''
        }`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        More
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className="[transition:transform_0.12s] group-aria-expanded:[transform:rotate(180deg)] motion-reduce:transition-none"
        >
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <div
        id={panelId}
        className="absolute top-[calc(100%+0.25rem)] -left-3 z-2 w-72 rounded-[var(--radius)] border border-(--line-strong) bg-card p-2"
        hidden={!open}
      >
        <ul className="grid list-none">
          {items.map((item) => {
            const current = isUnder(pathname, item.to)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cx(LINK, current && cx('active', LINK_CURRENT))}
                  aria-current={current ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className={cx('t', LABEL)}>{item.label}</span>
                  <span className="text-[0.75rem] leading-[1.4] text-(--text-3)">
                    {item.desc}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
