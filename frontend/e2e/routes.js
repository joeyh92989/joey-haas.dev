import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { BLOG_PAGE, STATIC_PAGES, TIL_PAGE } from '../src/content/pages.js'

/** A path that matches no route, so the NotFound page renders. */
export const NOT_FOUND_PATH = '/e2e-no-such-page'

/**
 * The public routes to test, in their canonical form, exactly as `pages.js` gives them (no trailing
 * slash, which is what the nav links and sitemap use; NavLink `end` would not
 * match `/shelf/`).
 *
 * Against a remote site (`remote` true) /blog and /til are always included.
 * Locally they are included only when the build prerendered them, since the
 * build leaves them out while nothing is published.
 *
 * @param {boolean} remote whether E2E_BASE_URL points at an existing site
 * @returns {string[]}
 */
export function routePaths(remote = !!process.env.E2E_BASE_URL) {
  const built = (page) =>
    existsSync(
      resolve(import.meta.dirname, '../dist', page.path.slice(1), 'index.html'),
    )
  const optional = [BLOG_PAGE, TIL_PAGE].filter((page) => remote || built(page))
  return [...STATIC_PAGES, ...optional].map((page) => page.path)
}
