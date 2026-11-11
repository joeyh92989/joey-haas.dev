/**
 * Comics on the shelf: range expansion, the chip filters and the sorts.
 *
 * Validation is the API's (spec, D7): `backend/comics.py` is the one parser,
 * and these helpers only read the canonical text it returns ("1–54, 60,
 * 62–64"). A hyphen is accepted too, so a hand-typed value read back before
 * the server has answered still expands.
 */

/** Chip values for the one comics chip row, in display order. */
export const COMIC_CHIPS = ['all', 'following', 'gaps', 'unread', 'want']

export const COMIC_SORTS = ['next', 'title', 'publisher', 'missing']

const DAY_MONTH = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/**
 * Every issue number in a canonical ranges string, ascending.
 *
 * @param {string|null|undefined} text - "1–54, 60, 62–64", or empty.
 * @returns {number[]}
 */
export function expandRanges(text) {
  if (!text) return []
  const numbers = new Set()
  for (const part of text.split(',')) {
    const [from, to = from] = part.trim().split(/[–-]/).map(Number)
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue
    for (let n = from; n <= to; n += 1) numbers.add(n)
  }
  return [...numbers].sort((a, b) => a - b)
}

/**
 * A list of issue numbers as ranges the API accepts ("1-3, 5"). Hyphens, not
 * the canonical dash: the server canonicalises whatever it is sent.
 *
 * @param {Iterable<number>} numbers
 * @returns {string}
 */
export function compactRanges(numbers) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const parts = []
  let start = null
  let last = null
  for (const n of sorted) {
    if (start !== null && n === last + 1) {
      last = n
      continue
    }
    if (start !== null)
      parts.push(start === last ? `${start}` : `${start}-${last}`)
    start = n
    last = n
  }
  if (start !== null)
    parts.push(start === last ? `${start}` : `${start}-${last}`)
  return parts.join(', ')
}

/**
 * Which edition covers each issue it collects, first edition winning.
 *
 * @param {{label: string, from_issue: number, to_issue: number}[]} editions
 * @returns {Map<number, string>} Issue number to edition label.
 */
export function editionCoverage(editions) {
  const covered = new Map()
  for (const edition of editions ?? []) {
    for (let n = edition.from_issue; n <= edition.to_issue; n += 1) {
      if (!covered.has(n)) covered.set(n, edition.label)
    }
  }
  return covered
}

/** "Nov 11" for an ISO date, in UTC like the API's weeks. */
export function shortDate(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return DAY_MONTH.format(new Date(Date.UTC(year, month - 1, day)))
}

/** "54 / 72+", the `+` marking a series still coming out. */
export function runCount({ owned, released, ongoing }, separator = ' / ') {
  return `${owned}${separator}${released}${ongoing ? '+' : ''}`
}

/** Owned issues the read marker has not reached yet. */
export const isUnread = (row) => !row.wanted && row.read < row.owned

const CHIP_TEST = {
  all: () => true,
  following: (row) => row.following,
  gaps: (row) => row.run_state === 'gaps',
  unread: isUnread,
  want: (row) => row.wanted,
}

/**
 * The rows one chip and an optional publisher leave.
 *
 * @param {object[]} rows - PublicComicRow objects.
 * @param {string} chip - One of COMIC_CHIPS; anything else shows all.
 * @param {string|null} [publisher]
 */
export function filterComics(rows, chip, publisher = null) {
  const test = CHIP_TEST[chip] ?? CHIP_TEST.all
  return rows.filter(
    (row) => test(row) && (publisher == null || row.publisher === publisher),
  )
}

/** How many rows each chip would leave, for the chips' counts. */
export function chipCounts(rows) {
  return Object.fromEntries(
    COMIC_CHIPS.map((chip) => [chip, rows.filter(CHIP_TEST[chip]).length]),
  )
}

/** Publishers by row count, most first, then by name. */
export function publishersByCount(rows) {
  const counts = new Map()
  for (const row of rows) {
    if (row.publisher)
      counts.set(row.publisher, (counts.get(row.publisher) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([publisher, count]) => ({ publisher, count }))
}

/** Rows whose title contains the query, ignoring case. */
export function searchComics(rows, query) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return rows
  return rows.filter((row) => row.title.toLocaleLowerCase().includes(needle))
}

const byTitle = (a, b) =>
  a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })

const COMPARE = {
  // Dated series first by date, then the rest by title: comics.sort_series.
  next: (a, b) => {
    const da = a.next_issue?.store_date
    const db = b.next_issue?.store_date
    if (da && db && da !== db) return da < db ? -1 : 1
    if (da && !db) return -1
    if (db && !da) return 1
    return byTitle(a, b)
  },
  title: byTitle,
  // Unknown publishers last.
  publisher: (a, b) => {
    if (!a.publisher !== !b.publisher) return a.publisher ? -1 : 1
    return (
      (a.publisher ?? '').localeCompare(b.publisher ?? '', 'en', {
        sensitivity: 'base',
      }) || byTitle(a, b)
    )
  },
  missing: (a, b) => b.missing - a.missing || byTitle(a, b),
}

/**
 * The rows in one of COMIC_SORTS' orders, mirroring the API's.
 *
 * @param {object[]} rows
 * @param {string} key - Anything unknown sorts by next issue.
 */
export function sortComics(rows, key) {
  return [...rows].sort(COMPARE[key] ?? COMPARE.next)
}

/** The form's shelf formats, in the order the select lists them. */
export const SHELF_FORMATS = ['singles', 'trades', 'omnibus']

/** One blank edition row, as the form holds it: every field a string. */
export const EMPTY_EDITION = { kind: '', label: '', from: '', to: '' }

/**
 * Stored editions as the form's rows: strings, so the inputs stay
 * controlled.
 *
 * @param {{kind: string, label: string, from: number, to: number}[]|null} editions
 * @returns {{kind: string, label: string, from: string, to: string}[]}
 */
export function editionRows(editions) {
  return (editions ?? []).map(({ kind, label, from, to }) => ({
    kind,
    label,
    from: String(from),
    to: String(to),
  }))
}

const ISSUE_NUMBER = /^\d+$/

/**
 * The form's edition rows as the API's list. A row left wholly blank is
 * dropped; a missing "to" means one issue. Only the shape is checked here
 * (every field filled, whole numbers): the API judges lengths, bounds and
 * order (spec, D7).
 *
 * @param {{kind: string, label: string, from: string, to: string}[]} rows
 * @returns {{editions: object[]|null, error: string|null}}
 */
export function parseEditionRows(rows) {
  const editions = []
  for (const [index, row] of (rows ?? []).entries()) {
    const kind = row.kind.trim()
    const label = row.label.trim()
    const from = String(row.from).trim()
    const to = String(row.to).trim() || from
    if (!kind && !label && !from && !String(row.to).trim()) continue
    if (!kind || !label || !ISSUE_NUMBER.test(from) || !ISSUE_NUMBER.test(to)) {
      return {
        editions: null,
        error: `Edition ${index + 1}: give it a kind, a label and the issues it collects.`,
      }
    }
    editions.push({ kind, label, from: Number(from), to: Number(to) })
  }
  return { editions: editions.length ? editions : null, error: null }
}

/**
 * A comic form's own fields as the API takes them: blanks become null and
 * the edition rows a list. The error is the first edition row it could not
 * read.
 *
 * @param {object} form - Carries ComicFields' keys.
 * @returns {{fields: object, error: string|null}}
 */
export function comicPayload(form) {
  const { editions, error } = parseEditionRows(form.editions)
  const issues = form.issues_owned.trim()
  const skipped = (form.issues_skipped ?? '').trim()
  return {
    fields: {
      issues_owned: issues === '' ? null : issues,
      issues_skipped: skipped === '' ? null : skipped,
      editions,
      read_to: form.read_to === '' ? null : Number(form.read_to),
      shelf_format: form.shelf_format === '' ? null : form.shelf_format,
      following: form.following,
    },
    error,
  }
}

/**
 * Which comic field an API refusal is about, from the words `comics.py`
 * uses, so the form can show it beside that field. Null when it names none.
 *
 * @param {string} detail - A 422's `detail`.
 * @returns {'issues_owned'|'issues_skipped'|'read_to'|'editions'|null}
 */
export function comicErrorField(detail) {
  if (typeof detail !== 'string') return null
  if (detail.startsWith('Issues owned')) return 'issues_owned'
  if (detail.startsWith('Issues skipped') || detail.includes('be skipped'))
    return 'issues_skipped'
  if (detail.startsWith('Read to')) return 'read_to'
  if (/edition|collects|issue numbers run|editions/i.test(detail))
    return 'editions'
  return null
}
