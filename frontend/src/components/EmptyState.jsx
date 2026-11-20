import { Link } from 'react-router'
import { Button, buttonVariants } from './ui/button.jsx'
import { Card } from './ui/card.jsx'
import { cn } from '../lib/utils.js'

/**
 * The one empty state (docs/design-system.md → One of each): a sentence
 * saying what is missing, an optional second line, and the next step when
 * there is one. A page passes words from `content/`, never inline.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.title - What is missing.
 * @param {import('react').ReactNode} [props.line] - One more line of context.
 * @param {import('react').Ref<HTMLParagraphElement>} [props.titleRef] - Makes
 *   the title a focus target (tabIndex -1) for a page that moves focus here.
 * @param {{label: string, to?: string, onClick?: () => void}} [props.action]
 *   The next step: a link with `to`, a button with `onClick`.
 */
export default function EmptyState({ title, line, action, titleRef }) {
  return (
    <Card className="empty-state items-start gap-2 px-4">
      <p
        className="empty-state-title"
        ref={titleRef}
        tabIndex={titleRef ? -1 : undefined}
      >
        {title}
      </p>
      {line && <p className="empty-state-line muted">{line}</p>}
      {action &&
        (action.to ? (
          <Link
            className={cn(
              'empty-state-action',
              buttonVariants({ variant: 'link', size: 'default' }),
            )}
            to={action.to}
          >
            {action.label}
          </Link>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="btn sm empty-state-action"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
    </Card>
  )
}
