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

/**
 * How much type a printed title can take: a size tier from its width, where
 * a CJK character is about 1.4 Latin capitals. The spine is a fixed height,
 * so a long title gets smaller type instead of being clipped (#200).
 */
export function spineSize(read) {
  const width = [...read].reduce(
    (sum, char) => sum + (char.charCodeAt(0) >= 0x2e80 ? 1.4 : 1),
    0,
  )
  if (width <= 18) return undefined
  if (width <= 26) return 'md'
  if (width <= 34) return 'sm'
  return 'xs'
}

/**
 * Short spine labels, the way a real box prints an abbreviated spine. The
 * recording's `read` is the full title, and the matching and result rows
 * keep it; only the drawn spine is shortened (#200). A recorded row may
 * carry its own `spine`, which wins.
 */
const SPINE_LABELS = {
  'Resident Evil Origins Collection': 'Resident Evil Origins',
  'Borderlands Legendary Collection': 'Borderlands Legendary',
  'The Legend of Zelda: Breath of the Wild': 'Breath of the Wild',
  'Metal Gear Solid Master Collection Vol. 1': 'MGS Master Collection',
  '熱血硬派くにおくん外伝 リバーシティガールズ2': 'リバーシティガールズ2',
}

/**
 * The text printed on a drawn spine.
 *
 * @param {{read: string, spine?: string}} row A recording row.
 * @returns {string}
 */
export function spineLabel(row) {
  return row.spine ?? SPINE_LABELS[row.read] ?? row.read
}
