import { Link } from 'react-router'

/**
 * The one empty state (docs/design-system.md → One of each): a sentence
 * saying what is missing, an optional second line, and the next step when
 * there is one. A page passes words from `content/`, never inline.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.title - What is missing.
 * @param {import('react').ReactNode} [props.line] - One more line of context.
 * @param {{label: string, to?: string, onClick?: () => void}} [props.action]
 *   The next step: a link with `to`, a button with `onClick`.
 */
export default function EmptyState({ title, line, action }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {line && <p className="empty-state-line muted">{line}</p>}
      {action &&
        (action.to ? (
          <Link className="empty-state-action" to={action.to}>
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            className="btn sm empty-state-action"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
    </div>
  )
}
