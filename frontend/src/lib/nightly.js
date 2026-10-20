/**
 * The Dashboard's nightly status: the header's one line and the jobs panel
 * (Spine Next spec, A4; site refresh, T12).
 *
 * Read from the catalogue's run status, the two generate times and the
 * snapshot's build time; there is no table of nightly runs, so this reports
 * the latest catalogue run, whoever started it (K6). The stale state also
 * catches GitHub switching the schedule off after 60 days without
 * repository activity.
 */

/** Source kinds the nightly job refreshes; Refresh N64 is manual. */
const NIGHTLY_KINDS = new Set(['store', 'registry', 'resolve'])

/**
 * The kinds that date a night. Resolve is left out: it is often pressed by
 * hand, and a later manual Resolve would move the night past the store
 * walk and hide that walk's failure.
 */
const ANCHOR_KINDS = new Set(['store', 'registry'])

/** Hours after which a nightly job reads stale. */
export const STALE_HOURS = 36

/** Discover generates on Sunday evenings only, so a week and a day. */
export const DISCOVER_STALE_HOURS = 8 * 24

const HOUR_MS = 3600 * 1000

/** Runs this close to the night's catalogue run belong to that night. */
const SAME_NIGHT_MS = 6 * 3600 * 1000

const WHEN = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Summarises the latest night.
 *
 * The night is dated by the newest finished store or registry run. A
 * nightly-kind run within six hours of it that reports `ok: false` failed,
 * and so did one left open by a restart (`interrupted`) that started
 * within the last STALE_HOURS: it never finishes, so it has no other way
 * to show.
 *
 * @param {{sources?: Array<{name: string, kind: string, last_run: {started_at: string, finished_at: string|null, ok: boolean|null, interrupted?: boolean}|null}>}} status
 *   `GET /api/physical/status`.
 * @param {{radar?: string|null, discover?: string|null}} generated The two
 *   kinds' last generate times.
 * @param {number} [now] Milliseconds since the epoch.
 * @returns {{catalogueAt: number|null, failed: string[], stale: boolean, radarAt: string|null, discoverAt: string|null}}
 */
export function lastNightly(status, generated, now = Date.now()) {
  const sources = (status?.sources ?? []).filter((source) =>
    NIGHTLY_KINDS.has(source.kind),
  )
  const finished = sources.filter((source) => source.last_run?.finished_at)
  const finishedAt = (source) => Date.parse(source.last_run.finished_at)
  const anchors = finished
    .filter((source) => ANCHOR_KINDS.has(source.kind))
    .map(finishedAt)
  const catalogueAt = anchors.length ? Math.max(...anchors) : null
  const staleMs = STALE_HOURS * 3600 * 1000
  const failed = sources
    .filter((source) => {
      const run = source.last_run
      if (run?.interrupted) return now - Date.parse(run.started_at) <= staleMs
      return (
        Boolean(run?.finished_at) &&
        run.ok === false &&
        catalogueAt !== null &&
        Math.abs(catalogueAt - finishedAt(source)) <= SAME_NIGHT_MS
      )
    })
    .map((source) => source.name)
  return {
    catalogueAt,
    failed,
    stale: catalogueAt === null || now - catalogueAt > staleMs,
    radarAt: generated?.radar ?? null,
    discoverAt: generated?.discover ?? null,
  }
}

/** A run time as the Dashboard shows it: "Sun 18 Oct, 22:41". */
export function whenWords(ms) {
  return WHEN.format(ms)
}

/** Milliseconds from an ISO string, or null for a missing or bad one. */
function parsed(iso) {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ms) ? null : ms
}

/**
 * One row per nightly job, in the order the nightly runs them: the
 * catalogue refresh, Radar, Discover, and the public snapshot. A job with
 * no time is "unknown" rather than stale, except the catalogue, whose
 * absence is the clearest sign the schedule has stopped.
 *
 * The snapshot is never stale by age: the nightly redeploys the static
 * site only when the public bodies differ, so an old build time on a quiet
 * week is the job working. Its failures show in the workflow run instead.
 *
 * @param {ReturnType<typeof lastNightly>} summary
 * @param {string|null} snapshotAt `fetched_at` from `/snapshot/meta.json`.
 * @param {number} [now] Milliseconds since the epoch.
 * @returns {Array<{key: string, label: string, at: number|null, summary: string, state: 'ok'|'stale'|'failed'|'unknown', runNow: string|null}>}
 */
export function nightlyJobs(summary, snapshotAt, now = Date.now()) {
  const age = (at, hours) => {
    if (at === null) return 'unknown'
    return now - at > hours * HOUR_MS ? 'stale' : 'ok'
  }
  const radarAt = parsed(summary.radarAt)
  const discoverAt = parsed(summary.discoverAt)
  const builtAt = parsed(snapshotAt)
  let catalogue = 'Registries, stores and matching'
  if (summary.failed.length) catalogue = `Failed: ${summary.failed.join(', ')}`
  else if (summary.catalogueAt === null) catalogue = 'No catalog run yet'
  return [
    {
      key: 'catalog',
      label: 'Catalog refresh',
      at: summary.catalogueAt,
      summary: catalogue,
      state: summary.failed.length ? 'failed' : summary.stale ? 'stale' : 'ok',
      runNow: '/admin/catalogue',
    },
    {
      key: 'radar',
      label: 'Radar',
      at: radarAt,
      summary: radarAt === null ? 'Not generated yet' : 'Upcoming releases',
      state: age(radarAt, STALE_HOURS),
      runNow: '/admin/radar',
    },
    {
      key: 'discover',
      label: 'Discover',
      at: discoverAt,
      summary:
        discoverAt === null ? 'Not generated yet' : 'Sunday evenings only',
      state: age(discoverAt, DISCOVER_STALE_HOURS),
      runNow: '/admin/discover',
    },
    {
      key: 'snapshot',
      label: 'Public snapshot',
      at: builtAt,
      summary:
        builtAt === null
          ? 'No build time recorded'
          : 'Built when public data changes',
      state: builtAt === null ? 'unknown' : 'ok',
      runNow: null,
    },
  ]
}

const SEVERITY = ['unknown', 'ok', 'stale', 'failed']

/**
 * The header's nightly words: the worst known state and the newest time.
 * Unknown jobs are left out, so a local build without a snapshot still
 * reads ok; it is "unknown" only when nothing is known.
 *
 * @param {ReturnType<typeof nightlyJobs>} jobs
 * @returns {{state: 'ok'|'stale'|'failed'|'unknown', words: string}}
 */
export function nightlyHeadline(jobs) {
  const state = jobs.reduce(
    (worst, job) =>
      SEVERITY.indexOf(job.state) > SEVERITY.indexOf(worst) ? job.state : worst,
    'unknown',
  )
  const times = jobs.map((job) => job.at).filter((at) => at !== null)
  const words = times.length
    ? `nightly ${state} · ${whenWords(Math.max(...times))}`
    : `nightly ${state}`
  return { state, words }
}
