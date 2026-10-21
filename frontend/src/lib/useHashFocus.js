import { useEffect } from 'react'
import { useLocation } from 'react-router'

/**
 * The other half of useRouteFocus, which leaves #fragment navigations
 * alone: on a page whose sections are anchors, a link to `#stop-3` should
 * land focus on that section's heading, not leave it on the link a
 * keyboard user just pressed. Runs on mount with a hash and whenever the
 * hash changes; an id that isn't on the page does nothing.
 *
 * getElementById, not a selector, so a hand-typed hash can't throw.
 */
export function useHashFocus() {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    let id
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      return
    }
    const heading = document.getElementById(id)?.querySelector('h2')
    if (!heading) return
    if (!heading.hasAttribute('tabindex')) {
      heading.setAttribute('tabindex', '-1')
    }
    heading.scrollIntoView?.({ block: 'start' })
    heading.focus({ preventScroll: true })
  }, [hash])
}
