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
