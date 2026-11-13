import { useId, useRef, useState } from 'react'
import { spine } from '../content/spine.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'

const copy = spine.next.capped

/** Rows shown before "Show all": six at desktop widths, four on a phone. */
export const DESKTOP_CAP = 6
export const PHONE_CAP = 4

/**
 * A long list of rows cut short, with "Show all N" under it (and "Show fewer"
 * once open). Nothing past the cap is in the page until asked for, so the
 * keyboard never lands on a hidden row. The button is one element for both
 * states, so focus stays on it; on closing, the page is brought back to it
 * because the list above has just shrunk.
 *
 * @param {object} props
 * @param {object[]} props.items - Every row.
 * @param {(item: object, index: number) => import('react').ReactNode} props.children
 *   Draws one row (a `NextRow`); the index is the row's place in the whole list.
 * @param {string} [props.className] - Classes for the `<ul>`.
 * @param {string} [props.label] - What the button is for, as its accessible
 *   name ("Show all 12 coming soon").
 */
export default function CappedList({
  items,
  children,
  className = 'next-rows',
  label,
}) {
  const phone = useMediaQuery('(max-width: 34rem)')
  const cap = phone ? PHONE_CAP : DESKTOP_CAP
  const [open, setOpen] = useState(false)
  const listId = useId()
  const button = useRef(null)
  const capped = items.length > cap
  const shown = capped && !open ? items.slice(0, cap) : items

  function toggle() {
    const closing = open
    setOpen(!open)
    if (closing) {
      requestAnimationFrame(() =>
        button.current?.scrollIntoView?.({ block: 'nearest' }),
      )
    }
  }

  return (
    <>
      <ul id={listId} className={className}>
        {shown.map((item, index) => children(item, index))}
      </ul>
      {capped && (
        <button
          ref={button}
          type="button"
          className="chip capped-toggle"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={
            label
              ? `${open ? copy.less : copy.more(items.length)} ${label}`
              : undefined
          }
          onClick={toggle}
        >
          {open ? copy.less : copy.more(items.length)}
        </button>
      )}
    </>
  )
}
