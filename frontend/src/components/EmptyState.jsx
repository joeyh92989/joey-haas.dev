import { Link } from 'react-router'

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
 * @param {{label: string, onClick: () => void}[]} [props.actions] Several
 *   next steps as buttons under the text (none by default), for a page whose
 *   empty state offers more than one way on.
 */
export default function EmptyState({ title, line, action, actions, titleRef }) {
  return (
    <div className="empty-state">
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
      {actions?.length > 0 && (
        <div className="intake-actions">
          {actions.map((item) => (
            <button
              key={item.label}
              type="button"
              className="btn"
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
