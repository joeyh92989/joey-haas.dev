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

/** Hours after which the line says the job may have stopped. */
export const STALE_HOURS = 36

/** Runs this close to the newest one belong to the same night. */
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
 * @param {{sources?: Array<{name: string, kind: string, last_run: {finished_at: string, ok: boolean|null}|null}>}} status
 *   `GET /api/physical/status`.
 * @param {{radar?: string|null, discover?: string|null}} generated The two
 *   kinds' last generate times.
 * @param {number} [now] Milliseconds since the epoch.
 * @returns {{catalogueAt: number|null, failed: string[], stale: boolean, radarAt: string|null, discoverAt: string|null}}
 */
export function lastNightly(status, generated, now = Date.now()) {
  const runs = (status?.sources ?? []).filter(
    (source) => NIGHTLY_KINDS.has(source.kind) && source.last_run?.finished_at,
  )
  const times = runs.map((source) => Date.parse(source.last_run.finished_at))
  const catalogueAt = times.length ? Math.max(...times) : null
  const failed = runs
    .filter(
      (source, index) =>
        catalogueAt - times[index] <= SAME_NIGHT_MS &&
        source.last_run.ok === false,
    )
    .map((source) => source.name)
  return {
    catalogueAt,
    failed,
    stale:
      catalogueAt === null || now - catalogueAt > STALE_HOURS * 3600 * 1000,
    radarAt: generated?.radar ?? null,
    discoverAt: generated?.discover ?? null,
  }
}

/**
 * The line as the admin landing shows it.
 *
 * @param {ReturnType<typeof lastNightly>} summary
 * @returns {string}
 */
export function nightlyWords(summary) {
  if (summary.catalogueAt === null)
    return 'Nightly may have stopped: no catalogue run yet'
  const parts = [
    `catalogue ${WHEN.format(summary.catalogueAt)}`,
    summary.failed.length ? `failed: ${summary.failed.join(', ')}` : 'ok',
  ]
  if (summary.radarAt)
    parts.push(`Radar ${WHEN.format(Date.parse(summary.radarAt))}`)
  if (summary.discoverAt)
    parts.push(`Discover ${WHEN.format(Date.parse(summary.discoverAt))}`)
  const lead = summary.stale ? 'Nightly may have stopped' : 'Last nightly'
  return `${lead}: ${parts.join(' · ')}`
}
