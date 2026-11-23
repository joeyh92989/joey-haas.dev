import { spine } from '../content/spine.js'

const copy = spine.next

// "On this page" (#191): sticky under the top, one line that scrolls on a
// phone with its right edge faded like the shelf tabs. The bar keeps its
// ground; only the list is masked, and its padding gives the focus ring room.
// The links are 44px tall on a phone (#276). They stay `display: block` (a
// flex box would drop the space before the count) and take a 44px line height
// there, so the label centres in the box (#598): it sat at the top of it.
const NAV =
  'jump-nav sticky top-[env(safe-area-inset-top,0px)] z-5 mt-4 border-b border-b-border bg-background'
// Written out, not joined: Tailwind reads each class from the source text.
const LIST =
  'm-0 flex list-none gap-4 overflow-x-auto px-1 py-2 text-[0.875rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [@media(max-width:700px)]:pr-8 [@media(max-width:700px)]:[-webkit-mask-image:linear-gradient(to_right,var(--mask-opaque)_calc(100%_-_2rem),transparent)] [@media(max-width:700px)]:[mask-image:linear-gradient(to_right,var(--mask-opaque)_calc(100%_-_2rem),transparent)]'
const LINK =
  'block rounded-[4px] whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring [@media(max-width:700px)]:min-h-11 [@media(max-width:700px)]:leading-[2.75rem]'

/**
 * What's next's "On this page" row: a link to each section that renders,
 * sticky under the page top, one scrolling line on a phone. A section with
 * nothing in it has no heading and so no link (the caller leaves it out).
 *
 * @param {object} props
 * @param {{id: string, label: string, count?: number}[]} props.items - The
 *   sections, in page order; `id` is the element the link jumps to.
 * @param {(id: string) => void} [props.onJump] - Called on every click of a
 *   link, including a repeat click that leaves the hash unchanged.
 */
export default function JumpNav({ items, onJump }) {
  if (items.length < 2) return null
  return (
    <nav className={NAV} aria-label={copy.jump.label}>
      <ul className={LIST}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={LINK}
              onClick={() => onJump?.(item.id)}
            >
              {item.label}
              {item.count != null && (
                <span className="text-(color:--text-3) tabular-nums">
                  {' '}
                  {item.count}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
