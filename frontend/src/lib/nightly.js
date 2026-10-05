/**
 * The admin landing's "Last nightly" line (Spine Next spec, A4).
 *
 * Read from the catalogue's run status and the two generate times; there is
 * no table of nightly runs, so this reports the latest catalogue run,
 * whoever started it (K6). The stale warning also catches GitHub switching
 * the schedule off after 60 days without repository activity.
 */

/** Source kinds the nightly job refreshes; Refresh N64 is manual. */
const NIGHTLY_KINDS = new Set(['store', 'registry', 'resolve'])

/**
 * The kinds that date a night. Resolve is left out: it is often pressed by
 * hand, and a later manual Resolve would move the night past the store
 * walk and hide that walk's failure.
 */
const ANCHOR_KINDS = new Set(['store', 'registry'])

/** Hours after which the line says the job may have stopped. */
export const STALE_HOURS = 36

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

/**
 * The line as the admin landing shows it. Text only: the landing adds the
 * link to the README when `summary.stale`.
 *
 * @param {ReturnType<typeof lastNightly>} summary
 * @returns {string}
 */
export function nightlyWords(summary) {
  const failed = `failed: ${summary.failed.join(', ')}`
  if (summary.catalogueAt === null)
    return summary.failed.length
      ? `Nightly may have stopped: no catalogue run finished · ${failed}`
      : 'Nightly may have stopped: no catalogue run yet'
  const parts = [
    `catalogue ${WHEN.format(summary.catalogueAt)}`,
    summary.failed.length ? failed : 'ok',
  ]
  if (summary.radarAt)
    parts.push(`Radar ${WHEN.format(Date.parse(summary.radarAt))}`)
  if (summary.discoverAt)
    parts.push(`Discover ${WHEN.format(Date.parse(summary.discoverAt))}`)
  const lead = summary.stale ? 'Nightly may have stopped' : 'Last nightly'
  return `${lead}: ${parts.join(' · ')}`
}
