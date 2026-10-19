import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/**
 * What a full page load does for free and a client-side route change does
 * not: start the new page at the top, and move focus into it so a screen
 * reader announces it and the next Tab starts in the content rather than
 * back in the masthead.
 *
 * Skipped on first render (the browser has just loaded the page), on a
 * link to a #fragment, and on back/forward, where the browser restores the
 * scroll position it remembers.
 *
 * @returns {import('react').RefObject<HTMLElement>} Attach to <main>.
 */
export function useRouteFocus() {
  const mainRef = useRef(null)
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (hash || navigationType === 'POP') return
    window.scrollTo(0, 0)
    const main = mainRef.current
    if (!main) return
    // The page's own heading names it best; <main> is the fallback.
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
