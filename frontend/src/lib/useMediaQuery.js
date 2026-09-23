import { useCallback, useSyncExternalStore } from 'react'

function supported() {
  return (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  )
}

/**
 * Whether a media query matches, following changes.
 *
 * Anything viewport-dependent goes through this hook rather than calling
 * matchMedia directly: jsdom has no matchMedia, so this returns false there,
 * and tests stub the hook to render either variant.
 *
 * @param {string} query A media query, e.g. `(max-width: 34rem)`.
 * @returns {boolean} True while the query matches.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (!supported()) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  const read = () => (supported() ? window.matchMedia(query).matches : false)
  return useSyncExternalStore(subscribe, read, () => false)
}
