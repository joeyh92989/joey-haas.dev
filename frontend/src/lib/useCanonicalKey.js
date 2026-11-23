import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * Replaces the address with the slug form once the item's slug is known: an
 * old `/shelf/<uuid>/` link, or a stale key, lands on `/shelf/<slug>/` with no
 * extra history entry (#479). Quiet when the key already is the slug, or when
 * the data has no slug (an API older than the column).
 *
 * @param {string} key The key the URL carries.
 * @param {string | null | undefined} slug The item's slug, once known.
 * @param {(slug: string) => string} pathFor The page's path for a slug.
 */
export function useCanonicalKey(key, slug, pathFor) {
  const navigate = useNavigate()
  const { search, hash } = useLocation()
  useEffect(() => {
    if (slug && slug !== key) {
      navigate(`${pathFor(slug)}${search}${hash}`, { replace: true })
    }
    // pathFor is a stable builder at each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slug, search, hash, navigate])
}
