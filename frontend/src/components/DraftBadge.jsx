import { badgeVariants } from './ui/badge-variants.js'

/** The "Draft" mark on a post or note that is not published. A badge: it
 *  names the thing, and the words carry the meaning. */
export default function DraftBadge() {
  return <span className={badgeVariants({ variant: 'outline' })}>Draft</span>
}
