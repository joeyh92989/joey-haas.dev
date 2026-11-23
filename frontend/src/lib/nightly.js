import { WEEKDAY_DAY_TIME as WHEN } from './formatDate.js'
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

/**
 * The jobs that start from their row, by row key: the POST path (query
 * string included) and its JSON body. The quick, safe ones only; the rest
 * keep their "Open ..." link (docs/planning/2026-11-19-jobs-run-now-design.md).
 * The paths and bodies match the buttons on each job's own page.
 */
export const JOB_RUNS = {
  weather: { path: '/api/spots/weather/refresh' },
  radar: { path: '/api/recommendations/generate', body: { kind: 'radar' } },
  'comic-refresh': { path: '/api/comics/refresh' },
  'comic-issues': { path: '/api/comics/issues/sync?budget=10' },
}

/**
 * What each job does, in a sentence, and when it is scheduled: `nightly`
 * (every night) or `sunday` (Sunday evening in Denver, Monday 00:17 UTC).
 * Keyed by job key; `nightlyJobs` merges it into each row.
 */
export const JOB_INFO = {
  catalog: {
    purpose:
      'Pulls new physical releases from the registries and online stores, then matches them to your catalogue.',
    schedule: 'nightly',
  },
  radar: {
    purpose: 'Builds the list of games and comics coming out soon.',
    schedule: 'nightly',
  },
  discover: {
    purpose: 'Suggests games and comics you might like next.',
    schedule: 'sunday',
  },
  weather: {
    purpose: 'Fetches the hourly forecast that the weekend plan uses.',
    schedule: 'nightly',
  },
  spots: {
    purpose: 'Searches near your anchor places for new outing spots.',
    schedule: 'sunday',
  },
  'closet-tags': {
    purpose:
      'Reads new closet photos and tags each piece by colour, kind and season.',
    schedule: 'nightly',
  },
  'closet-plans': {
    purpose: 'Plans tomorrow’s outfit from the closet and the forecast.',
    schedule: 'nightly',
  },
  'closet-opinions': {
    purpose: 'Writes a short opinion on each closet piece flagged for review.',
    schedule: 'sunday',
  },
  intake: {
    purpose: 'Reads the photos waiting in Add and fills in what they show.',
    schedule: 'nightly',
  },
  'comic-refresh': {
    purpose: 'Checks the comic series you follow for new volumes.',
    schedule: 'nightly',
  },
  'comic-issues': {
    purpose: 'Fetches the issue list for each comic series.',
    schedule: 'nightly',
  },
  'comic-tags': {
    purpose: 'Tags new comic series so the shelf can filter them.',
    schedule: 'nightly',
  },
  snapshot: {
    purpose:
      'Rebuilds the public site’s saved copy of the shelf, so it loads while the server sleeps.',
    schedule: 'nightly',
  },
}

/** The nightly workflow starts at 00:17 UTC (`nightly.yml`). */
const START_MS = 17 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * When a schedule next starts after `now`: the next 00:17 UTC for a nightly
 * job, the next Monday 00:17 UTC (Sunday evening in Denver) for a Sunday
 * one. It is when the workflow starts; a later step starts later.
 *
 * @param {'nightly'|'sunday'} schedule
 * @param {number} [now] Milliseconds since the epoch.
 * @returns {number}
 */
export function nextRunAt(schedule, now = Date.now()) {
  let next = Math.floor(now / DAY_MS) * DAY_MS + START_MS
  if (next <= now) next += DAY_MS
  if (schedule === 'sunday') {
    // getUTCDay: 1 is Monday.
    while (new Date(next).getUTCDay() !== 1) next += DAY_MS
  }
  return next
}

const RELATIVE = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

/**
 * A time as a distance from now: "3 hours ago", "in 2 days", "now".
 *
 * @param {number} ms
 * @param {number} [now]
 */
export function relativeWords(ms, now = Date.now()) {
  const minutes = Math.round((ms - now) / 60000)
  const abs = Math.abs(minutes)
  if (abs < 1) return 'just now'
  if (abs < 60) return RELATIVE.format(minutes, 'minute')
  if (abs < 48 * 60) return RELATIVE.format(Math.round(minutes / 60), 'hour')
  return RELATIVE.format(Math.round(minutes / 1440), 'day')
}

/** A run time as the Dashboard shows it: "Sun, Oct 18, 10:41 PM". */
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
 * @param {{key: string, label: string, runNow: string, runWords?: string, firstRun?: string, hours: number, ok: string, quiet: Record<string, string>, failed?: string[]}} job
 *   `quiet` words the run states that succeeded without finding anything;
 *   `runWords` words the link to the page that shows the job: none of these
 *   links starts a job, so none says "Run now";
 *   `firstRun` says when a weekly job that has never run will first run.
 * @param {(at: number|null, hours: number) => string} age
 */
function runRow(run, job, age) {
  const at = parsed(run?.at)
  const row = { key: job.key, label: job.label, at, runNow: job.runNow }
  if (job.runWords) row.runWords = job.runWords
  if (at === null) {
    // A weekly job that has not had its first evening yet is waiting, not
    // lost: say when it runs. The state stays unknown, so it never counts
    // as ok before it has run.
    if (job.firstRun)
      return {
        ...row,
        summary: `First run ${job.firstRun}`,
        state: 'unknown',
        stateWords: 'scheduled',
        scheduled: true,
      }
    return { ...row, summary: 'No run recorded', state: 'unknown' }
  }
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
 * Sunday opinions, intake's photo reading, the comic refresh, issue sync and tags,
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
 * @param {{at?: string, state?: string, ok?: boolean, note?: string}|null} [intake]
 *   Intake's nightly run from `GET /api/intake/status`; null leaves it
 *   unknown.
 * @param {{issues?: object|null, refresh?: object|null, tags?: object|null}|null} [comics]
 *   The comic jobs' last runs from `GET /api/comics/status` (issue sync,
 *   followed refresh, tags); null leaves all three unknown.
 * @returns {Array<{key: string, label: string, at: number|null, summary: string, state: 'ok'|'stale'|'failed'|'unknown', runNow: string|null, runWords?: string, stateWords?: string, stopped?: boolean}>}
 *   `stopped` is on the catalogue row only: the schedule may have stopped,
 *   which a failure on its last night would otherwise hide.
 */
export function nightlyJobs(
  summary,
  snapshotAt,
  now = Date.now(),
  spots = null,
  closet = null,
  intake = null,
  comics = null,
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
  else if (summary.catalogueAt === null) catalogue = 'Sources haven’t run yet'
  const jobs = [
    {
      key: 'catalog',
      label: 'Sources refresh',
      at: summary.catalogueAt,
      summary: catalogue,
      state: summary.failed.length ? 'failed' : summary.stale ? 'stale' : 'ok',
      runNow: '/admin/catalogue',
      runWords: 'Open Sources',
      stopped: summary.stale,
    },
    {
      key: 'radar',
      label: 'Radar',
      at: radarAt,
      summary: radarAt === null ? 'Not generated yet' : 'Upcoming releases',
      state: age(radarAt, STALE_HOURS),
      runNow: '/admin/radar',
      runWords: 'Open Radar',
    },
    {
      key: 'discover',
      label: 'Discover',
      at: discoverAt,
      summary:
        discoverAt === null ? 'Not generated yet' : 'Sunday evenings only',
      state: age(discoverAt, DISCOVER_STALE_HOURS),
      runNow: '/admin/discover',
      runWords: 'Open Discover',
    },
    runRow(
      spots?.weather,
      {
        key: 'weather',
        label: 'Weekend forecast',
        runNow: '/admin/weekend',
        runWords: 'Open Weekend',
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
        runWords: 'Open Spots',
        hours: DISCOVER_STALE_HOURS,
        ok: 'Sunday evenings only',
        // Only a status that loaded can say the job has not run yet.
        firstRun: spots ? 'Sunday evening' : undefined,
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
        runWords: 'Open Closet',
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
        runWords: 'Open Today',
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
        firstRun: closet ? 'Sunday evening' : undefined,
        quiet: {
          empty: 'Nothing flagged',
          skipped: 'The model had nothing to add',
        },
      },
      age,
    ),
    runRow(
      intake,
      {
        key: 'intake',
        label: 'Intake',
        // A sitting's Shoot step reads waiting photos while it is open.
        runNow: '/admin/collection/add',
        runWords: 'Open Intake',
        hours: STALE_HOURS,
        ok: 'Waiting photos read',
        quiet: {
          empty: 'Nothing to read',
          waiting: "Today's budget spent; photos wait",
        },
        failed: ['failed', 'stopped'],
      },
      age,
    ),
    runRow(
      comics?.refresh ?? null,
      {
        key: 'comic-refresh',
        label: 'Comic refresh',
        runNow: '/admin/pull-list',
        runWords: 'Open Pull list',
        hours: STALE_HOURS,
        ok: 'Followed series refreshed',
        quiet: {},
      },
      age,
    ),
    runRow(
      comics?.issues ?? null,
      {
        key: 'comic-issues',
        label: 'Comic issues',
        runNow: '/admin/pull-list',
        runWords: 'Open Pull list',
        hours: STALE_HOURS,
        ok: 'Every series synced',
        quiet: { partial: 'Budget spent; the rest sync tomorrow' },
      },
      age,
    ),
    runRow(
      comics?.tags ?? null,
      {
        key: 'comic-tags',
        label: 'Comic tags',
        runNow: '/admin/shelf/comics',
        runWords: 'Open Comics',
        hours: STALE_HOURS,
        ok: 'Series tagged',
        quiet: { partial: 'Budget spent; the rest tag tomorrow' },
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
  return jobs.map((job) => ({
    ...job,
    ...JOB_INFO[job.key],
    next: nextRunAt(JOB_INFO[job.key].schedule, now),
  }))
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
