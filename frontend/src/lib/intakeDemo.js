/**
 * The public intake demo's reading of its recording (pure). The file is
 * `content/intake-demo.json`, only ever written by
 * `backend/scripts/record_intake_demo.py`; until Joey records a shelf it
 * is a placeholder, `{"provisional": true}`, which reads as no recording.
 */

/** The longest a stage lights while the recording replays, in ms. */
export const STAGE_CAP_MS = 1200

/**
 * The recording, or null for the placeholder or anything malformed: the
 * page then says the demo is not recorded yet rather than inventing one.
 *
 * @param {unknown} raw The parsed JSON file.
 * @returns {object|null}
 */
export function readRecording(raw) {
  if (!raw || typeof raw !== 'object' || raw.provisional !== false) return null
  if (!Array.isArray(raw.titles) || raw.titles.length === 0) return null
  if (!raw.stages || typeof raw.stages !== 'object') return null
  return raw
}

/**
 * How many were read, by confidence, and how many a commit would add
 * (exact only; a probable match or a check waits for a person).
 *
 * @param {object[]} titles The recording's rows.
 */
export function demoCounts(titles) {
  const count = (state) =>
    titles.filter((row) => row.confidence === state).length
  const exact = count('exact')
  const probable = count('probable')
  return {
    read: titles.length,
    exact,
    probable,
    check: count('check'),
    adds: exact,
  }
}

/** A row's title: the source's for a match, else what was read. */
export function rowTitle(row) {
  return row.match?.title ?? row.read
}

/**
 * A row's second line: what was read, then the match's year, the years in
 * doubt for a check with several candidates, or that nothing matched.
 */
export function rowMeta(row) {
  const read = `read “${row.read}”`
  if (!row.match) return `${read} · no match found`
  const years = [...new Set(row.candidates.map((c) => c.year).filter(Boolean))]
  if (row.confidence === 'check' && years.length > 1) {
    return `${read} · ${years.join(' or ')}?`
  }
  return row.match.year ? `${read} · ${row.match.year}` : read
}

/**
 * How long Read and Match light during the replay: the recorded time,
 * capped at STAGE_CAP_MS, or nothing at all when motion is reduced.
 *
 * @param {{read_ms: number, match_ms: number}} stages
 * @param {{reduced?: boolean}} [options]
 */
export function stageDelays(stages, { reduced = false } = {}) {
  const delay = (ms) =>
    reduced ? 0 : Math.min(Math.max(Number(ms) || 0, 0), STAGE_CAP_MS)
  return { read: delay(stages.read_ms), match: delay(stages.match_ms) }
}
