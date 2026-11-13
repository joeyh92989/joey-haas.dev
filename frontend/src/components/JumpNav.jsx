import { spine } from '../content/spine.js'

const copy = spine.next

/**
 * What's next's "On this page" row: a link to each section that renders,
 * sticky under the page top, one scrolling line on a phone. A section with
 * nothing in it has no heading and so no link (the caller leaves it out).
 *
 * @param {object} props
 * @param {{id: string, label: string, count?: number}[]} props.items - The
 *   sections, in page order; `id` is the element the link jumps to.
 */
export default function JumpNav({ items }) {
  if (items.length < 2) return null
  return (
    <nav className="jump-nav" aria-label={copy.jump.label}>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>
              {item.label}
              {item.count != null && (
                <span className="jump-count"> {item.count}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
