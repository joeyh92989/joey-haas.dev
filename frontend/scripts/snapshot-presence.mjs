/**
 * Whether the pages behind the Games and Comics tabs and the Denver footer link have
 * anything to show, read from the build-time snapshot (#125).
 *
 * `vite.config.js` calls this once per build and hands the answer to the
 * app as `__SNAPSHOT_PRESENCE__` (read by `src/lib/snapshotPresence.js`).
 * `npm run build` runs `fetch-snapshot.mjs` before `vite build`, and the
 * nightly job redeploys when the comics or spots snapshot changes, so the
 * answer is exactly as fresh as the snapshot the pages themselves paint,
 * with no request at runtime and no link that flashes in or out.
 *
 * Each key is `true` (something to show), `false` (the snapshot is there
 * and empty) or `null` (no readable snapshot: a local build, dev, or a
 * build whose optional fetch failed). Only `false` hides a link: an
 * unknown answer keeps it, rather than hiding real content.
 */
import fs from 'node:fs'
import path from 'node:path'

/** Each snapshot this reads, and how to count what its page would show. */
const COUNTS = {
  // /shelf/games shows "No games on the shelf yet." with no public game; the
  // items snapshot holds every public type, so the count is of games only.
  games: {
    file: 'items',
    count: (body) =>
      Array.isArray(body)
        ? body.filter((item) => item?.type === 'game').length
        : null,
  },
  // /shelf/comics shows "No comics on the shelf yet." with no series.
  comics: {
    file: 'comics',
    count: (body) => (Array.isArray(body?.series) ? body.series.length : null),
  },
  // /denver shows "No spots yet." with no spots.
  spots: {
    file: 'spots',
    count: (body) => (Array.isArray(body) ? body.length : null),
  },
}

/**
 * @param {string} dir The snapshot directory (public/snapshot).
 * @returns {{games: boolean|null, comics: boolean|null, spots: boolean|null}}
 */
export function snapshotPresence(dir) {
  const presence = {}
  for (const [name, { file, count }] of Object.entries(COUNTS)) {
    let body
    try {
      body = JSON.parse(fs.readFileSync(path.join(dir, `${file}.json`), 'utf8'))
    } catch {
      presence[name] = null
      continue
    }
    const n = count(body)
    presence[name] = n === null ? null : n > 0
  }
  return presence
}
