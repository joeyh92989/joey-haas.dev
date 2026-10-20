import { usePageTitle } from '../lib/usePageTitle.js'

/**
 * Every admin page's header: the title, an optional one-line description,
 * and a right-hand slot for the page's status or controls (Generate,
 * Refresh, the Shelf/List toggle). It also sets the document title, so
 * every admin page follows one pattern: `<Page> · Admin · Joey Haas`.
 *
 * @param {object} props
 * @param {string} props.title The page's name, as one string.
 * @param {import('react').ReactNode} [props.description] One line under it.
 * @param {import('react').ReactNode} [props.children] The right-hand slot.
 */
export default function AdminPageHeader({ title, description, children }) {
  usePageTitle(`${title} · Admin · Joey Haas`)
  return (
    <header className="admin-head">
      <div className="admin-head-text">
        <h1>{title}</h1>
        {description && <p className="admin-head-desc">{description}</p>}
      </div>
      {children && <div className="admin-head-end">{children}</div>}
    </header>
  )
}
