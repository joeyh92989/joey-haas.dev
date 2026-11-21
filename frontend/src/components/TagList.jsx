import { cx } from '../lib/cx.js'
import { badgeVariants } from './ui/badge-variants.js'

// The Badge's look (ui/badge-variants.js: cva only, so no Base UI in the entry
// chunk), allowed to grow past the badge's fixed 20px and to wrap, since a
// certification or an award is a sentence, not a word. `!` wins over the
// badge's own `h-5` and `whitespace-nowrap` without a class merge.
const CHIP = `${badgeVariants({ variant: 'outline' })} h-auto! min-h-5 max-w-full py-0.5 text-left whitespace-normal!`

/**
 * A wrapping row of badges: tech, tags, a toolbox, certifications.
 *
 * @param {object} props
 * @param {string[]} props.items The words; each is one badge and one list item.
 * @param {string} [props.className] Classes on the `ul`.
 */
export default function TagList({ items, className, ...rest }) {
  return (
    <ul
      className={cx('m-0 flex list-none flex-wrap gap-2 p-0', className)}
      role="list"
      {...rest}
    >
      {items.map((item) => (
        <li key={item} className={CHIP}>
          {item}
        </li>
      ))}
    </ul>
  )
}
