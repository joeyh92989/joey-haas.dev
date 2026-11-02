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
    if (start !== null) parts.push(start === last ? `${start}` : `${start}-${last}`)
    start = n
    last = n
  }
  if (start !== null) parts.push(start === last ? `${start}` : `${start}-${last}`)
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

/** "54 of 72 issues owned, ongoing": the run bar's text equivalent. */
export function runLabel({ owned, released, ongoing }) {
  const issues = released === 1 ? 'issue' : 'issues'
  return `${owned} of ${released} ${issues} owned${ongoing ? ', ongoing' : ''}`
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
    if (row.publisher) counts.set(row.publisher, (counts.get(row.publisher) ?? 0) + 1)
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
