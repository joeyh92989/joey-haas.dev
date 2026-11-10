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
 * A Denver or Closet job's row from its status summary (`{at, state, ok?,
 * note?}`, or null before its first run): `GET /api/spots/status` or
 * `GET /api/closet/status`. The jobs write their summary on a failed run
 * too, so a state in `job.failed` (default `["failed"]`) or `ok: false` is
 * a failed night.
 *
 * @param {{at?: string, state?: string, ok?: boolean, note?: string}|null|undefined} run
 * @param {{key: string, label: string, runNow: string, runWords?: string, hours: number, ok: string, quiet: Record<string, string>, failed?: string[]}} job
 *   `quiet` words the run states that succeeded without finding anything;
 *   `runWords` replaces "Run now" when the page it links to runs nothing.
 * @param {(at: number|null, hours: number) => string} age
 */
function runRow(run, job, age) {
  const at = parsed(run?.at)
  const row = { key: job.key, label: job.label, at, runNow: job.runNow }
  if (job.runWords) row.runWords = job.runWords
  if (at === null)
    return { ...row, summary: 'No run recorded', state: 'unknown' }
  const failed = job.failed ?? ['failed']
  if (failed.includes(run.state) || run.ok === false) {
    const why = run.note ? `: ${run.note}` : ''
    return { ...row, summary: `Failed${why}`, state: 'failed' }
  }
  // An ok run with a note degraded (the finder's template fallback when
  // the model could not rank): say so rather than the schedule line.
  const summary = run.note || job.quiet[run.state] || job.ok
  return { ...row, summary, state: age(at, job.hours) }
}

/**
 * One row per nightly job: the catalogue refresh, Radar, Discover, the
 * weekend forecast, the spot finder, the closet's tags, outfit plans and
 * Sunday opinions,
 * and the public snapshot. A job with
 * no time is "unknown" rather than stale, except the catalogue, whose
 * absence is the clearest sign the schedule has stopped.
 *
 * The snapshot goes stale on the catalogue's clock: What's next carries
 * its generate times, so the nightly redeploys the static site every night
 * (spec K8), and an old build time means the deploy hook has stopped.
 *
 * @param {ReturnType<typeof lastNightly>} summary
 * @param {string|null} snapshotAt `fetched_at` from `/snapshot/meta.json`.
 * @param {number} [now] Milliseconds since the epoch.
 * @param {{weather?: object|null, candidates?: object|null}|null} [spots]
 *   The Denver jobs' last runs from `GET /api/spots/status`; null when it
 *   could not be read, which leaves both rows unknown.
 * @param {{tag?: object|null, plan?: object|null, opinion?: object|null}|null} [closet]
 *   The Closet jobs' last runs from `GET /api/closet/status`; null leaves
 *   all three unknown.
 * @returns {Array<{key: string, label: string, at: number|null, summary: string, state: 'ok'|'stale'|'failed'|'unknown', runNow: string|null, runWords?: string, stopped?: boolean}>}
 *   `stopped` is on the catalogue row only: the schedule may have stopped,
 *   which a failure on its last night would otherwise hide.
 */
export function nightlyJobs(
  summary,
  snapshotAt,
  now = Date.now(),
  spots = null,
  closet = null,
) {
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
      stopped: summary.stale,
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
    runRow(
      spots?.weather,
      {
        key: 'weather',
        label: 'Weekend forecast',
        runNow: '/admin/weekend',
        hours: STALE_HOURS,
        ok: 'NWS hourly forecast',
        quiet: { empty: 'NWS sent no hours' },
      },
      age,
    ),
    runRow(
      spots?.candidates,
      {
        key: 'spots',
        label: 'Spot finder',
        runNow: '/admin/spots',
        hours: DISCOVER_STALE_HOURS,
        ok: 'Sunday evenings only',
        quiet: { no_anchors: 'No anchors to search from' },
      },
      age,
    ),
    runRow(
      closet?.tag,
      {
        key: 'closet-tags',
        label: 'Closet tags',
        runNow: '/admin/closet',
        hours: STALE_HOURS,
        ok: 'New photos tagged',
        quiet: { off: 'Tagging is off', empty: 'Nothing to tag' },
        failed: ['failed', 'stopped'],
      },
      age,
    ),
    runRow(
      closet?.plan,
      {
        key: 'closet-plans',
        label: 'Outfit plans',
        runNow: '/admin/closet/today',
        hours: STALE_HOURS,
        ok: 'Tomorrow planned',
        quiet: {
          empty: 'Nothing to plan from',
          template: 'Planned without the model',
        },
      },
      age,
    ),
    runRow(
      closet?.opinion,
      {
        key: 'closet-opinions',
        label: 'Closet opinions',
        runNow: '/admin/closet/review',
        // Review shows the opinions; nothing there starts the job.
        runWords: 'Open Review',
        hours: DISCOVER_STALE_HOURS,
        ok: 'Sunday evenings only',
        quiet: {
          empty: 'Nothing flagged',
          skipped: 'The model had nothing to add',
        },
      },
      age,
    ),
    {
      key: 'snapshot',
      label: 'Public snapshot',
      at: builtAt,
      summary: builtAt === null ? 'No build time recorded' : 'Rebuilt nightly',
      state: age(builtAt, STALE_HOURS),
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
