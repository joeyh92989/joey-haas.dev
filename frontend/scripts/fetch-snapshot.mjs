/**
 * Writes the public collection's build-time snapshot to public/snapshot/.
 *
 * Runs first in `npm run build`, before `vite build` copies public/ into
 * dist/. The free-tier API sleeps, so /spine would otherwise greet a
 * first-time visitor with a thirty-second wake-up; with these files it
 * paints at once and refreshes from the API when it wakes.
 *
 * Only runs where VITE_API_URL is set, which is the Render static site: CI
 * and local builds stay offline and deterministic (`npm run snapshot` fetches
 * from production on purpose). It never fails the build -- a sleeping or
 * broken API ships a build without a snapshot, which behaves exactly like
 * the site before the snapshot existed.
 *
 * The bodies are written verbatim -- the response text, byte for byte, after
 * checking that it parses to the expected shape -- so every consumer parses
 * them with the code that parses the API, and the snapshot workflow can
 * compare them with the live API. When an API URL is set, each run first
 * removes the files an earlier run left, so a failed run never ships stale
 * ones. See scripts/README.md.
 */
import { realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The stats body. Keep in step with `isStatsBody` in src/lib/snapshot.js:
 * the two predicates must be identical.
 */
const isStatsBody = (body) =>
  isObject(body) &&
  'total' in body &&
  isObject(body.rating_histogram) &&
  isObject(body.finishes_by_month)

/**
 * What's next's body: Next.jsx reads `.length` on each of these lists, so a
 * body missing one would blank the page. `comics_this_week` is optional, so
 * a snapshot written before comics still paints. Keep in step with `isNextBody` in
 * src/lib/snapshot.js: the two predicates must be identical.
 */
const NEXT_LISTS = [
  'wanted',
  'buy_now',
  'preorders',
  'later',
  'not_on_cartridge',
]
const isNextBody = (body) =>
  isObject(body) &&
  isObject(body.tonight) &&
  Array.isArray(body.tonight.picks) &&
  NEXT_LISTS.every((key) => Array.isArray(body[key])) &&
  (body.comics_this_week === undefined || Array.isArray(body.comics_this_week))

/**
 * The status strip's body (spine tour). Keep in step with `isStatusBody` in
 * src/lib/snapshot.js: the two predicates must be identical.
 */
const STATUS_COUNTS = ['titles', 'platforms', 'stores_watched', 'listings']
const isStatusBody = (body) =>
  isObject(body) &&
  (body.refreshed_at === null || typeof body.refreshed_at === 'string') &&
  STATUS_COUNTS.every((key) => Number.isInteger(body[key]))

/**
 * The comics shelf's body (/shelf/comics). Keep in step with `isComicsBody`
 * in src/lib/snapshot.js: the two predicates must be identical.
 */
const isComicsBody = (body) =>
  isObject(body) &&
  Array.isArray(body.series) &&
  isObject(body.stats) &&
  isObject(body.this_week) &&
  Array.isArray(body.this_week.weeks) &&
  Array.isArray(body.this_week.later)

/**
 * The /stats page's body: both ranges with the figures the tiles show and
 * the lists the page draws. Keep in step with `isSiteStatsBody` in src/lib/snapshot.js:
 * the two predicates must be identical.
 */
const SUMMARY_LISTS = ['series', 'pages', 'referrers', 'devices']
const isSummary = (body) =>
  isObject(body) &&
  Number.isInteger(body.views) &&
  Number.isInteger(body.visitors) &&
  SUMMARY_LISTS.every((key) => Array.isArray(body[key]))
const isSiteStatsBody = (body) =>
  isObject(body) && isSummary(body.thirty) && isSummary(body.all)

/**
 * Pick for me's table (Pick for me spec): the games it names and every
 * combination's list. Keep in step with `isPickForMeBody` in src/lib/snapshot.js:
 * the two predicates must be identical.
 */
const isPickForMeBody = (body) =>
  isObject(body) &&
  isObject(body.games) &&
  isObject(body.combos) &&
  Object.values(body.combos).every(Array.isArray)

/**
 * /denver's spots (Denver spots spec): each row with the fields the map and
 * the list need. Keep in step with `isSpotsBody` in src/lib/snapshot.js:
 * the two predicates must be identical.
 */
const isSpot = (row) =>
  isObject(row) &&
  typeof row.spot_id === 'string' &&
  typeof row.name === 'string' &&
  Number.isFinite(row.lat) &&
  Number.isFinite(row.lng) &&
  Array.isArray(row.tags)
const isSpotsBody = (body) => Array.isArray(body) && body.every(isSpot)

/**
 * The snapshots, the endpoint each copies, the shape it must have, and
 * whether the build can go without it. A required snapshot that fails fails
 * them all; an optional one is only left out.
 */
export const SNAPSHOTS = {
  items: { path: '/api/public/items', valid: Array.isArray, required: true },
  stats: {
    path: '/api/public/stats',
    valid: isStatsBody,
    required: true,
  },
  // Optional: on a deploy that ships this endpoint, the static build can
  // run before the API has finished deploying. What's next (Spine Next spec,
  // C12).
  next: {
    path: '/api/public/next',
    valid: isNextBody,
    required: false,
  },
  // Optional for the same reason: the status strip (spine tour). It is not
  // in the nightly compare; next differs every night, so the redeploy that
  // follows carries a fresh one.
  status: {
    path: '/api/public/status',
    valid: isStatusBody,
    required: false,
  },
  // Optional like next: the comics shelf (comics spec), new in the release
  // that ships its endpoint.
  comics: {
    path: '/api/public/comics',
    valid: isComicsBody,
    required: false,
  },
  // Optional like next: the /stats page (public stats spec). Not in the
  // nightly compare either: next differs every night, so the redeploy that
  // follows carries a fresh one, and the rollup runs before the compare.
  'site-stats': {
    path: '/api/public/site-stats',
    valid: isSiteStatsBody,
    required: false,
  },
  // Optional like next: Pick for me's table, new in the release that ships
  // its endpoint. Not in the nightly compare: next differs every night.
  'pick-for-me': {
    path: '/api/public/pick-for-me',
    valid: isPickForMeBody,
    required: false,
  },
  // Optional like next: /denver's spots, new in the release that ships its
  // endpoint. In the nightly compare as an optional output, like comics.
  spots: {
    path: '/api/public/spots',
    valid: isSpotsBody,
    required: false,
  },
}

/**
 * Written beside the snapshots, never fetched: `{fetched_at}`, so the admin
 * Dashboard can say when the public snapshot was last built. It is part of
 * the published set and is cleared with it.
 */
const META = 'meta'

const WAKE_BUDGET_MS = 120_000
const WAKE_INTERVAL_MS = 5_000
const REQUEST_TIMEOUT_MS = 30_000

/** Fetches a response body as text, exactly as the server sent it. */
async function getText(fetchImpl, url) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.text()
}

/**
 * Fetches one snapshot body as text, retrying once. /api/health doesn't touch the
 * database, so the first data request after a wake can still time out while
 * Neon resumes.
 */
async function getTextWithRetry(fetchImpl, url, sleep) {
  try {
    return await getText(fetchImpl, url)
  } catch {
    await sleep(WAKE_INTERVAL_MS)
    return getText(fetchImpl, url)
  }
}

/**
 * Removes every file this script writes, temp files included. Best effort: a
 * file that cannot be removed must not turn a failed run into a rejection.
 */
async function clearSnapshotFiles(outDir) {
  await Promise.all(
    [...Object.keys(SNAPSHOTS), META].flatMap((name) =>
      [`${name}.json`, `${name}.json.tmp`].map((file) =>
        fs.rm(path.join(outDir, file), { force: true }).catch(() => {}),
      ),
    ),
  )
}

/** Polls /api/health until it answers OK or the budget runs out. */
async function wake({ apiUrl, fetchImpl, sleep, now }) {
  const deadline = now() + WAKE_BUDGET_MS
  while (now() < deadline) {
    try {
      const response = await fetchImpl(`${apiUrl}/api/health`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.ok) return true
    } catch {
      // Asleep or unreachable: wait and ask again.
    }
    await sleep(WAKE_INTERVAL_MS)
  }
  return false
}

/**
 * Fetches every snapshot and writes the ones that validated.
 *
 * @param {object} options
 * @param {string|undefined} options.apiUrl API origin, no trailing slash.
 * @param {string} options.outDir Directory to write `{name}.json` into.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {() => number} [options.now] Milliseconds, for the wake budget
 *   and the time recorded in `meta.json`.
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<'skipped'|'written'|'failed'>} Never rejects.
 */
export async function fetchSnapshot({
  apiUrl,
  outDir,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  now = Date.now,
  log = console.log,
}) {
  if (!apiUrl) {
    log('snapshot: no API URL set; building without one')
    return 'skipped'
  }
  // A failed run must leave nothing behind for the build to pick up.
  await clearSnapshotFiles(outDir)
  if (!(await wake({ apiUrl, fetchImpl, sleep, now }))) {
    await clearSnapshotFiles(outDir)
    log(`snapshot: ${apiUrl} did not wake in time; building without one`)
    return 'failed'
  }
  const bodies = {}
  const texts = {}
  for (const [name, snapshot] of Object.entries(SNAPSHOTS)) {
    try {
      const text = await getTextWithRetry(
        fetchImpl,
        `${apiUrl}${snapshot.path}`,
        sleep,
      )
      const body = JSON.parse(text)
      if (!snapshot.valid(body)) {
        throw new Error(`${snapshot.path} returned an unexpected shape`)
      }
      bodies[name] = body
      texts[name] = text
    } catch (error) {
      if (snapshot.required) {
        await clearSnapshotFiles(outDir)
        log(`snapshot: ${error.message}; building without one`)
        return 'failed'
      }
      log(`snapshot: ${error.message}; leaving ${name} out`)
    }
  }
  texts[META] = JSON.stringify({ fetched_at: new Date(now()).toISOString() })
  const tmpPaths = []
  try {
    await fs.mkdir(outDir, { recursive: true })
    for (const [name, text] of Object.entries(texts)) {
      const tmpPath = path.join(outDir, `${name}.json.tmp`)
      tmpPaths.push(tmpPath)
      await fs.writeFile(tmpPath, text)
    }
    // Renames only start once every file is fully written, so a failed write
    // never leaves a half-published set.
    for (const tmpPath of tmpPaths) {
      await fs.rename(tmpPath, tmpPath.slice(0, -'.tmp'.length))
    }
  } catch (error) {
    await clearSnapshotFiles(outDir)
    log(`snapshot: could not write (${error.message}); building without one`)
    return 'failed'
  }
  log(
    `snapshot: wrote ${Object.keys(bodies).join(', ')} (${bodies.items.length} items)`,
  )
  return 'written'
}

/** True when this file was started directly, through symlinks or not. */
function isEntryPoint() {
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const apiUrl = (
    process.env.SNAPSHOT_API_URL ??
    process.env.VITE_API_URL ??
    ''
  ).replace(/\/$/, '')
  await fetchSnapshot({
    apiUrl,
    outDir: path.join(here, '..', 'public', 'snapshot'),
  })
}
