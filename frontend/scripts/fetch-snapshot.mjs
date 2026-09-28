/**
 * Writes the public collection's build-time snapshot to public/snapshot/.
 *
 * Runs first in `npm run build`, before `vite build` copies public/ into
 * dist/. The free-tier API sleeps, so /collection would otherwise greet a
 * first-time visitor with a thirty-second wake-up; with these files it
 * paints at once and refreshes from the API when it wakes.
 *
 * Only runs where VITE_API_URL is set, which is the Render static site: CI
 * and local builds stay offline and deterministic (`npm run snapshot` fetches
 * from production on purpose). It never fails the build -- a sleeping or
 * broken API ships a build without a snapshot, which behaves exactly like
 * the site before the snapshot existed.
 *
 * The bodies are written verbatim, so every consumer parses them with the
 * code that parses the API. See scripts/README.md.
 */
import { realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The snapshots, the endpoint each copies, the shape it must have, and
 * whether the build can go without it. A required snapshot that fails fails
 * them all; an optional one is only left out.
 */
export const SNAPSHOTS = {
  items: { path: '/api/public/items', valid: Array.isArray, required: true },
  stats: {
    path: '/api/public/stats',
    valid: (body) => isObject(body) && 'total' in body,
    required: true,
  },
}

const WAKE_BUDGET_MS = 120_000
const WAKE_INTERVAL_MS = 5_000
const REQUEST_TIMEOUT_MS = 30_000

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

/**
 * Fetches one snapshot body, retrying once. /api/health doesn't touch the
 * database, so the first data request after a wake can still time out while
 * Neon resumes.
 */
async function getJsonWithRetry(fetchImpl, url, sleep) {
  try {
    return await getJson(fetchImpl, url)
  } catch {
    await sleep(WAKE_INTERVAL_MS)
    return getJson(fetchImpl, url)
  }
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
 * @param {() => number} [options.now] Milliseconds, for the wake budget.
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
  if (!(await wake({ apiUrl, fetchImpl, sleep, now }))) {
    log(`snapshot: ${apiUrl} did not wake in time; building without one`)
    return 'failed'
  }
  const bodies = {}
  for (const [name, snapshot] of Object.entries(SNAPSHOTS)) {
    try {
      const body = await getJsonWithRetry(
        fetchImpl,
        `${apiUrl}${snapshot.path}`,
        sleep,
      )
      if (!snapshot.valid(body)) {
        throw new Error(`${snapshot.path} returned an unexpected shape`)
      }
      bodies[name] = body
    } catch (error) {
      if (snapshot.required) {
        log(`snapshot: ${error.message}; building without one`)
        return 'failed'
      }
      log(`snapshot: ${error.message}; leaving ${name} out`)
    }
  }
  const tmpPaths = []
  try {
    await fs.mkdir(outDir, { recursive: true })
    for (const [name, body] of Object.entries(bodies)) {
      const tmpPath = path.join(outDir, `${name}.json.tmp`)
      tmpPaths.push(tmpPath)
      await fs.writeFile(tmpPath, JSON.stringify(body))
    }
    // Renames only start once every file is fully written, so a failed write
    // never leaves a half-published set.
    for (const tmpPath of tmpPaths) {
      await fs.rename(tmpPath, tmpPath.slice(0, -'.tmp'.length))
    }
  } catch (error) {
    // Best effort: cleanup must not turn a failed write into a rejection.
    await Promise.all(
      tmpPaths.map((tmpPath) =>
        fs.rm(tmpPath, { force: true }).catch(() => {}),
      ),
    )
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
