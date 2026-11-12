import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { BLOG_PAGE, STATIC_PAGES, TIL_PAGE } from '../src/content/pages.js'

/** A path with exactly one trailing slash, as `vite preview` serves it. */
const slashed = (path) => (path.endsWith('/') ? path : `${path}/`)

/** A path that matches no route, so the NotFound page renders. */
export const NOT_FOUND_PATH = '/e2e-no-such-page/'

/**
 * Routes whose h1 renders only after an API call succeeds. With no backend
 * (local runs) they show their error alert instead, so smoke accepts either.
 */
export const API_BACKED = new Set(['/shelf/comics/'])

/**
 * The public routes to test, as trailing-slash paths.
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
  return [...STATIC_PAGES, ...optional].map((page) => slashed(page.path))
}
