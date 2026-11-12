/* global __SNAPSHOT_PRESENCE__ */

/**
 * Whether Comics and Denver have anything to show, decided at build time
 * from the snapshot (`scripts/snapshot-presence.mjs`, injected by
 * `vite.config.js`). A static fact, like `hasNotes` and `hasTrips`: no
 * request, so the Comics tab and the Denver footer link never flash.
 *
 * Only a snapshot that was written and is empty hides a link. Dev, tests and
 * a build whose optional fetch failed have no answer, and keep both links.
 */
const presence =
  typeof __SNAPSHOT_PRESENCE__ === 'undefined' ? {} : __SNAPSHOT_PRESENCE__

/** False only when the build's comics snapshot holds no series. */
export const hasComics = presence.comics !== false

/** False only when the build's spots snapshot holds no spots. */
export const hasSpots = presence.spots !== false

/**
 * The pages whose snapshot is written and empty. They stay routable, but the
 * sitemap, search and changelog links leave them out. A future page joins by
 * adding a line here.
 *
 * Presence is read from the snapshot the build fetched, and `dist/snapshot`
 * is a copy of the same file (`public/snapshot`), so the prerender step and
 * the app agree whichever directory is read.
 *
 * @param {{comics?: boolean|null, spots?: boolean|null}} p A presence record.
 * @returns {string[]}
 */
export function hiddenPathsFor(p) {
  return [
    ...(p.spots === false ? ['/denver'] : []),
    ...(p.comics === false ? ['/shelf/comics'] : []),
  ]
}

/**
 * Whether an href or path is one of the hidden pages: judged on its
 * pathname, so `/denver#map`, `/denver?x=1` and `/denver/` all match.
 *
 * @param {string} href
 * @param {string[]} hidden
 * @returns {boolean}
 */
export function isHiddenPath(href, hidden) {
  const path = href.split(/[?#]/)[0]
  return hidden.includes(path.length > 1 ? path.replace(/\/+$/, '') : path)
}

/** This build's hidden pages. */
export const hiddenPaths = hiddenPathsFor(presence)
