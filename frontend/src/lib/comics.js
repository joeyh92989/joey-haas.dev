import { DAY as DAY_MONTH, MONTH_YEAR } from './formatDate.js'
import { toIsbn13 } from './isbn.js'
import { titleKind } from './titleKind.js'
import { spine } from '../content/spine.js'
/**
 * Comics on the shelf: range expansion, the chip filters and the sorts.
 *
 * Validation is the API's (spec, D7): `backend/comics.py` is the one parser,
 * and these helpers only read the canonical text it returns ("1–54, 60,
 * 62–64"). A hyphen is accepted too, so a hand-typed value read back before
 * the server has answered still expands.
 */

/** Chip values for the one comics chip row, in display order. */
// The public shelf's chips. Following is private, so it is not one of them:
// the public body does not carry it (#301); the admin shelf adds it itself.
export const COMIC_CHIPS = ['all', 'gaps', 'unread', 'want', 'books', 'issues']

export const COMIC_SORTS = ['next', 'title', 'publisher', 'missing']

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

/** "Nov 11" for an ISO date, in UTC like the API's weeks. */
export function shortDate(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return DAY_MONTH.format(new Date(Date.UTC(year, month - 1, day)))
}

/** "Aug 1997" for an ISO date: a cover's caption, where a back issue's year
 *  matters and the day does not (the approved cover-wall mockup). */
export function monthYear(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return MONTH_YEAR.format(new Date(Date.UTC(year, month - 1, day)))
}

/** Owned issues the read marker has not reached yet. */
export const isUnread = (row) => !row.wanted && row.read < row.owned

/** Kinds that hold books, and kinds that hold single issues (`title_kind`). */
const HOLDS_BOOKS = ['book_line', 'single_book', 'both']
const HOLDS_ISSUES = ['run', 'both']

const CHIP_TEST = {
  all: () => true,
  following: (row) => row.following,
  gaps: (row) => row.run_state === 'gaps',
  unread: isUnread,
  want: (row) => row.wanted,
  // A row from before the kind existed is a run (`titleKind`).
  books: (row) => HOLDS_BOOKS.includes(titleKind(row)),
  issues: (row) => HOLDS_ISSUES.includes(titleKind(row)),
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
    Object.keys(CHIP_TEST).map((chip) => [
      chip,
      rows.filter(CHIP_TEST[chip]).length,
    ]),
  )
}

/** More owned numbers than this and a run of three or more reads "a to b". */
const PLAIN_LIST_MAX = 8

/** "Vol." numbers as words: runs of 3+ become "a to b" once the list is long. */
function numberTokens(numbers) {
  if (numbers.length <= PLAIN_LIST_MAX) return numbers.map(String)
  const tokens = []
  for (let i = 0; i < numbers.length; i += 1) {
    let j = i
    while (numbers[j + 1] === numbers[j] + 1) j += 1
    if (j - i >= 2) {
      tokens.push(`${numbers[i]} to ${numbers[j]}`)
      i = j
    } else tokens.push(String(numbers[i]))
  }
  return tokens
}

/**
 * Which books of a line are owned, as words: "Vol. 1, 2 and 4". Books with no
 * number are added after ("and 1 book with no number"): the count the API
 * gives of owned books with no line number (two books sharing a number are
 * both numbered). The line's size is not stored anywhere, so it is printed
 * ("of 6") only when a caller passes one, which nothing does yet.
 *
 * @param {number[]|undefined} numbers - The owned books' line numbers.
 * @param {number} unnumbered - How many owned books have no line number.
 * @param {number} [lineSize] - How many books the line has, when known.
 * @returns {string} Empty when no book is owned.
 */
export function volumesOwnedText(numbers, unnumbered, lineSize) {
  const sorted = [...new Set(numbers ?? [])].sort((a, b) => a - b)
  const loose = Math.max(0, unnumbered ?? 0)
  const extra =
    loose > 0 ? `${loose} ${loose === 1 ? 'book' : 'books'} with no number` : ''
  if (sorted.length === 0) return extra
  const tokens = numberTokens(sorted)
  const list =
    tokens.length === 1
      ? tokens[0]
      : `${tokens.slice(0, -1).join(', ')} and ${tokens.at(-1)}`
  const size = lineSize > 0 ? ` of ${lineSize}` : ''
  return `Vol. ${list}${size}${extra ? `, and ${extra}` : ''}`
}

/**
 * What a shelf card says about its title: the kind in words and, for a title
 * that holds books, which are owned. The same on the public and admin shelves.
 *
 * @param {object} row - A shelf row (`kind`, `volumes_owned`, `volume_numbers`).
 * @returns {{kind: string, word: string, volumes: string|null}}
 */
export function kindSummary(row) {
  const kind = titleKind(row)
  const numbers = row.volume_numbers ?? []
  // A single book says only its number; a run says nothing of books.
  const text =
    kind === 'run' || (kind === 'single_book' && numbers.length === 0)
      ? ''
      : volumesOwnedText(numbers, row.volumes_unnumbered ?? 0)
  return { kind, word: spine.comics.kinds[kind], volumes: text || null }
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

/**
 * A payload safe to PATCH: a sitting saved before `books` existed holds
 * `editions`, which the server no longer takes. Moved to `books` (if absent).
 */
export function withoutLegacyEditions(payload) {
  if (!payload || !('editions' in payload)) return payload
  const { editions, ...rest } = payload
  return editions?.length && !rest.books ? { ...rest, books: editions } : rest
}

/** One blank book row, as the form holds it: every field a string. */
export const EMPTY_BOOK = { kind: '', label: '', from: '', to: '', isbn: '' }

/**
 * A comic's collected books as the form's rows: strings, so the inputs stay
 * controlled.
 *
 * @param {{kind: string, label: string, from: number, to: number, isbn?: string}[]|null} books
 * @returns {{kind: string, label: string, from: string, to: string, isbn: string}[]}
 */
export function bookRows(books) {
  return (books ?? []).map(({ kind, label, from, to, isbn }) => ({
    kind,
    label,
    from: String(from),
    to: String(to),
    isbn: isbn ?? '',
  }))
}

const ISSUE_NUMBER = /^\d+$/

/**
 * The form's book rows as the API's list. A row left wholly blank is
 * dropped; a missing "to" means one issue. Only the shape is checked here
 * (every field filled, whole numbers): the API judges lengths, bounds and
 * order (spec, D7).
 *
 * @param {{kind: string, label: string, from: string, to: string}[]} rows
 * @returns {{books: object[]|null, error: string|null}}
 */
export function parseBookRows(rows) {
  const books = []
  for (const [index, row] of (rows ?? []).entries()) {
    const kind = row.kind.trim()
    const label = row.label.trim()
    const from = String(row.from).trim()
    const to = String(row.to).trim() || from
    const typedIsbn = String(row.isbn ?? '').trim()
    if (!kind && !label && !from && !String(row.to).trim() && !typedIsbn)
      continue
    if (!kind || !label || !ISSUE_NUMBER.test(from) || !ISSUE_NUMBER.test(to)) {
      return {
        books: null,
        error: `Book ${index + 1}: give it a kind, a label and the issues it collects.`,
      }
    }
    const book = { kind, label, from: Number(from), to: Number(to) }
    // Sent as the ISBN-13, so the editor's rows match what the server stores.
    if (typedIsbn) {
      const isbn = toIsbn13(typedIsbn)
      if (!isbn) {
        return {
          books: null,
          error: `Book ${index + 1}: that ISBN is not valid. Check the digits, or clear it.`,
        }
      }
      book.isbn = isbn
    }
    books.push(book)
  }
  return { books: books.length ? books : null, error: null }
}

/**
 * A comic form's own fields as the API takes them: blanks become null.
 * `error` is always null now that the form has no edition rows; it stays so
 * the caller's shape holds.
 *
 * @param {object} form - Carries ComicFields' keys.
 * @returns {{fields: object, error: string|null}}
 */
export function comicPayload(form) {
  const issues = form.issues_owned.trim()
  const skipped = (form.issues_skipped ?? '').trim()
  return {
    fields: {
      issues_owned: issues === '' ? null : issues,
      issues_skipped: skipped === '' ? null : skipped,
      read_to: form.read_to === '' ? null : Number(form.read_to),
      shelf_format: form.shelf_format === '' ? null : form.shelf_format,
      following: form.following,
    },
    error: null,
  }
}

/**
 * Which comic field an API refusal is about, from the words `comics.py`
 * uses, so the form can show it beside that field. Null when it names none.
 *
 * @param {string} detail - A 422's `detail`.
 * @returns {'issues_owned'|'issues_skipped'|'read_to'|null}
 */
export function comicErrorField(detail) {
  if (typeof detail !== 'string') return null
  if (detail.startsWith('Issues owned')) return 'issues_owned'
  if (detail.startsWith('Issues skipped') || detail.includes('be skipped'))
    return 'issues_skipped'
  if (detail.startsWith('Read to')) return 'read_to'
  return null
}

/**
 * The book-first figures over a list of rows, for the admin shelf (the public
 * page reads the same three from the API's `stats`; the definitions are
 * `backend/public_comics.py` `comic_stats`).
 *
 * `books`: owned volumes, plus one for each title with no owned volume that
 * is a finished one-issue volume with its issue held. `volumesMissing`: per
 * book line, the line numbers from 1 to the highest owned that no owned book
 * has. `issuesRead`: the rows' `issues_read`, the count of read marks, the
 * public figure's own definition.
 *
 * @param {Array<object>} rows Admin shelf rows.
 * @returns {{books: number, volumesMissing: number, issuesRead: number, hasLine: boolean}}
 */
export function bookFigures(rows) {
  let books = 0
  let volumesMissing = 0
  let issuesRead = 0
  let hasLine = false
  for (const row of rows) {
    issuesRead += row.issues_read ?? 0
    const owned = row.volumes_owned ?? 0
    if (owned > 0) {
      books += owned
    } else if (
      !row.wanted &&
      row.released === 1 &&
      !row.ongoing &&
      row.owned > 0
    ) {
      books += 1
    }
    if (row.kind === 'book_line') {
      hasLine = true
      const numbers = row.volume_numbers ?? []
      if (numbers.length > 0) {
        volumesMissing += numbers[numbers.length - 1] - numbers.length
      }
    }
  }
  return { books, volumesMissing, issuesRead, hasLine }
}
