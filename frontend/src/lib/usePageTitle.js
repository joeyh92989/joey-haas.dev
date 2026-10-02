import { useEffect } from 'react'

/**
 * Sets the document title while the calling page is mounted.
 *
 * There is no cleanup: every routed page sets its own title, so restoring
 * the previous one on unmount would only flash it. A null title leaves the
 * current one alone. That is for a page that hands rendering to a child that
 * sets its own (NotFound): React runs a child's effects before its parent's,
 * so a parent that set a title too would overwrite the child's.
 *
 * The title must already be one string: callers build it with a template
 * literal, never as JSX children.
 *
 * @param {string | null} title The full title, or null to leave it alone.
 */
export function usePageTitle(title) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
