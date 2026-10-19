import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/**
 * What a full page load does for free and a client-side route change does
 * not: start the new page at the top, and move focus into it so a screen
 * reader announces it and the next Tab starts in the content rather than
 * back in the masthead.
 *
 * Acts only when a link or navigate() pushes a new pathname. Not on the
 * first render (the browser has just loaded the page), not on a REPLACE
 * (the /collection redirects, which finish that same load), not on
 * back/forward (the browser restores the scroll it remembers), not on a
 * #fragment link, and not when only the query string changes.
 *
 * @returns {import('react').RefObject<HTMLElement>} Attach to <main>.
 */
export function useRouteFocus() {
  const mainRef = useRef(null)
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()
  const previous = useRef(pathname)

  useEffect(() => {
    if (pathname === previous.current) return
    previous.current = pathname
    if (navigationType !== 'PUSH' || hash) return
    window.scrollTo(0, 0)
    const main = mainRef.current
    if (!main) return
    // The page's own heading names it best; <main> is the fallback, as on a
    // lazy admin page whose chunk is still loading.
    const heading = main.querySelector('h1')
    if (heading) {
      if (!heading.hasAttribute('tabindex')) {
        heading.setAttribute('tabindex', '-1')
      }
      heading.focus({ preventScroll: true })
    } else {
      main.focus({ preventScroll: true })
    }
  }, [pathname, hash, navigationType])

  return mainRef
}
