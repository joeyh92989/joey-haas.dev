/**
 * The run model behind the comic lanes and box (comic series display spec).
 *
 * Pure: every view (card, series page, admin edit) derives what it draws
 * from the ranges, the editions and `read_to` through these functions, so
 * the three never disagree. Nothing here parses for validity: the API is
 * the one range parser (comics spec, D7) and these read its canonical text.
 *
 * An issue is **held** when it is a single issue I own or an edition
 * covers it, and it is counted once either way.
 */
import { expandRanges } from './comics.js'

/** A run of this many issues or fewer draws a block per issue. */
export const SHORT_RUN = 12

/** Consecutive same-state issues outside an edition fold into a bundle. */
export const BUNDLE_MIN = 12

/** The API's highest issue number (comics.MAX_ISSUE); past it is a typo. */
export const MAX_ISSUE = 9999

/**
 * One edition in the model's shape, from either the public API's
 * `{from_issue, to_issue}` or the admin form's `{from, to}`.
 */
function normaliseEdition(edition, index) {
  const from = edition.from ?? edition.from_issue
  const to = Math.min(edition.to ?? edition.to_issue, MAX_ISSUE)
  return { kind: edition.kind, label: edition.label, from, to, index }
}

/**
 * Issue numbers from ranges text or a list, up to MAX_ISSUE. A range typed
 * past it is cut there: the API refuses it on Save, and the run must not
 * try to draw a million issues while it is being typed.
 */
function toNumbers(value) {
  if (Array.isArray(value)) return value.filter((n) => n <= MAX_ISSUE)
  const capped = (value ?? '').replace(/\d+/g, (digits) =>
    String(Math.min(Number(digits), MAX_ISSUE + 1)),
  )
  return expandRanges(capped).filter((n) => n <= MAX_ISSUE)
}

/**
 * The per-issue state of a run and the counts every view shows.
 *
 * @param {object} input
 * @param {string|number[]} [input.singles] - Single issues owned. Public
 *   callers pass `owned_text`, which already includes edition issues.
 * @param {object[]} [input.editions] - `{kind, label, from|from_issue, to|to_issue}`.
 * @param {number|null} [input.readTo]
 * @param {number} input.released - Issues out, per the API.
 * @param {boolean} [input.ongoing]
 * @param {{number: string, store_date: string}|null} [input.nextIssue]
 * @param {string|number[]} [input.skipped] - Admin only; never passed publicly.
 * @param {boolean} [input.wanted]
 */
export function runModel({
  singles = '',
  editions = [],
  readTo = null,
  released,
  ongoing = false,
  nextIssue = null,
  skipped = '',
  wanted = false,
}) {
  const books = (editions ?? [])
    .map(normaliseEdition)
    .filter((book) => book.from <= book.to)
  const singleSet = new Set(toNumbers(singles))
  const skipSet = new Set(toNumbers(skipped))
  const editionOf = new Map()
  for (const book of books) {
    for (let n = book.from; n <= book.to; n += 1) {
      if (!editionOf.has(n)) editionOf.set(n, book)
    }
  }
  let highestHeld = 0
  for (const n of singleSet) if (n > highestHeld) highestHeld = n
  for (const n of editionOf.keys()) if (n > highestHeld) highestHeld = n
  const total = Math.max(released ?? 0, highestHeld)
  const read = readTo ?? 0

  const issues = []
  for (let n = 1; n <= total; n += 1) {
    const edition = editionOf.get(n) ?? null
    const single = singleSet.has(n)
    const held = Boolean(edition) || single
    const k = held
      ? n <= read
        ? 'read'
        : 'owned'
      : skipSet.has(n)
        ? 'skip'
        : 'missing'
    issues.push({ n, k, held, edition, single })
  }

  const held = issues.filter((issue) => issue.held).length
  const missing = issues.filter((issue) => issue.k === 'missing').length
  const readCount = issues.filter((issue) => issue.k === 'read').length
  // Held both ways: inside an edition and as a single. Only an admin
  // caller can know this; the public owned_text merges the two.
  const twice = issues.filter((issue) => issue.edition && issue.single).length
  const readNext = issues.find((issue) => issue.k === 'owned') ?? null
  const firstGap = issues.find((issue) => issue.k === 'missing') ?? null

  let state
  if (held === 0) state = wanted ? 'want' : 'unrecorded'
  else if (missing > 0) state = 'gaps'
  else state = ongoing ? 'up_to_date' : 'complete'

  const nextNumber = nextIssue ? Number(nextIssue.number) : NaN
  return {
    issues,
    editions: books,
    released: total,
    ongoing: Boolean(ongoing),
    readTo,
    nextIssue,
    // A dated next issue that is not already a drawn issue.
    nextOut:
      nextIssue && !(Number.isInteger(nextNumber) && nextNumber <= total)
        ? nextIssue
        : null,
    held,
    missing,
    read: readCount,
    unread: held - readCount,
    twice,
    skipped: issues.filter((issue) => issue.k === 'skip').length,
    readNext,
    firstGap,
    state,
  }
}

/** "1–57, 60": numbers as ranges, with the canonical dash, for reading. */
export function displayRanges(numbers) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const parts = []
  for (let i = 0; i < sorted.length; i += 1) {
    let j = i
    while (sorted[j + 1] === sorted[j] + 1) j += 1
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : `${sorted[i]}`)
    i = j
  }
  return parts.join(', ')
}

/**
 * The box: a book per edition, a cell per issue, a bundle for a long even
 * stretch, and one cell for the next dated issue, in issue order. An issue
 * is drawn once: inside its book or as a cell. Each edition is one book,
 * once: where editions overlap, an issue belongs to the first that covers
 * it, and a nested edition's book follows the book it sits inside.
 *
 * @param {ReturnType<typeof runModel>} model
 * @param {Set<number>} [open] - Issues shown as cells: a stretch holding any
 *   of them is drawn open (a fold, then its cells), never as a bundle. Keyed
 *   by issue rather than by bundle, so a stretch that grows or merges after
 *   an admin tap stays open around the issue that was tapped.
 * @returns {object[]} Tiles: `{type: 'book'|'cell'|'bundle'|'fold'|'next', ...}`.
 */
export function boxTiles(model, open = new Set()) {
  const tiles = []
  const { issues, readTo } = model
  const read = readTo ?? 0
  const drawn = new Set()
  const bookTile = (book) => {
    drawn.add(book)
    tiles.push({
      type: 'book',
      edition: book,
      from: book.from,
      to: book.to,
      k: read >= book.to ? 'read' : 'owned',
      readTo: read >= book.from && read < book.to ? read : null,
    })
  }
  let i = 0
  while (i < issues.length) {
    const issue = issues[i]
    if (issue.edition) {
      const book = issue.edition
      if (!drawn.has(book)) bookTile(book)
      while (i < issues.length && issues[i].edition === book) i += 1
      // An edition wholly inside one already drawn owns no issue of its
      // own: its book follows the one it sits in.
      const last = issues[i - 1].n
      for (const other of model.editions) {
        if (!drawn.has(other) && other.from <= last) bookTile(other)
      }
      continue
    }
    let j = i
    while (
      issues[j + 1] &&
      !issues[j + 1].edition &&
      issues[j + 1].k === issue.k
    )
      j += 1
    const count = j - i + 1
    const from = issue.n
    const to = issues[j].n
    let opened = false
    for (let x = from; x <= to && !opened; x += 1) opened = open.has(x)
    if (count >= BUNDLE_MIN && !opened) {
      tiles.push({
        type: 'bundle',
        from,
        to,
        k: issue.k,
        count,
      })
    } else {
      if (count >= BUNDLE_MIN)
        tiles.push({ type: 'fold', from, to, k: issue.k, count })
      for (let x = i; x <= j; x += 1) {
        const cell = issues[x]
        tiles.push({ type: 'cell', n: cell.n, k: cell.k, issue: cell })
      }
    }
    i = j + 1
  }
  if (model.nextOut) {
    tiles.push({
      type: 'next',
      number: model.nextOut.number,
      date: model.nextOut.store_date,
    })
  }
  return tiles
}

/** Run-length stretches of issues by a key. */
function stretches(issues, keyOf) {
  const out = []
  for (const issue of issues) {
    const k = keyOf(issue)
    const last = out[out.length - 1]
    if (last && last.k === k && last.to === issue.n - 1) last.to = issue.n
    else out.push({ k, from: issue.n, to: issue.n })
  }
  return out
}

/**
 * The full lanes: Run, Read, and (admin) Skipped, on one axis of
 * `released` issues. An ongoing run adds a tail of fixed width, drawn by
 * the component: it says "more is coming", not how much.
 *
 * @param {ReturnType<typeof runModel>} model
 */
export function laneSpans(model) {
  const { issues, released } = model
  const short = released <= SHORT_RUN
  const run = short
    ? issues.map((issue) => ({
        k: issue.held ? 'owned' : issue.k,
        from: issue.n,
        to: issue.n,
      }))
    : stretches(issues, (issue) => (issue.held ? 'owned' : issue.k))
  return {
    released,
    short,
    run,
    readTo: Math.min(model.readTo ?? 0, released),
    skipped: stretches(
      issues.filter((issue) => issue.k === 'skip'),
      () => 'skip',
    ),
    tail: model.ongoing,
  }
}

/**
 * The mini lanes for a shelf card or Runs row, from a public list row's
 * `segments` (owned, missing, upcoming). The upcoming length is dropped:
 * the tail is a fixed width.
 *
 * @param {object} row - A PublicComicRow.
 */
export function laneSpansFromRow(row) {
  const run = []
  let at = 1
  for (const { kind, length } of row.segments ?? []) {
    if (kind === 'upcoming') continue
    run.push({ k: kind, from: at, to: at + length - 1 })
    at += length
  }
  const released = at - 1
  const short = released <= SHORT_RUN
  return {
    released,
    short,
    run: short
      ? run.flatMap((span) =>
          Array.from({ length: span.to - span.from + 1 }, (_, i) => ({
            k: span.k,
            from: span.from + i,
            to: span.from + i,
          })),
        )
      : run,
    readTo: Math.min(row.read_to ?? 0, released),
    skipped: [],
    tail: Boolean(row.ongoing),
  }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * The lanes' accessible name: "58 of 72 issues owned, 14 missing, series
 * still coming out, read to number 54".
 */
export function lanesLabel({ held, released, missing, ongoing, readTo }) {
  const parts = [`${held} of ${plural(released, 'issue')} owned`]
  if (missing) parts.push(`${missing} missing`)
  if (ongoing) parts.push('series still coming out')
  if (readTo) parts.push(`read to number ${readTo}`)
  return parts.join(', ')
}

/**
 * The box's text equivalent: "I own #1–57, 60 and have read to #54."
 *
 * @param {ReturnType<typeof runModel>} model
 */
export function runSentence(model) {
  const owned = displayRanges(
    model.issues.filter((issue) => issue.held).map((issue) => issue.n),
  )
  const reading =
    model.read > 0 ? ` and have read to #${model.readTo}` : ', none read yet'
  return `I own #${owned}${reading}.`
}

/** "58/72+": a run's count, the `+` marking a series still coming out. */
export const countText = ({ held, released, ongoing }, separator = '/') =>
  `${held}${separator}${released}${ongoing ? '+' : ''}`

/**
 * A comic card's two lines, from a public list row.
 *
 * Line one is the count and the first of: the next dated issue, the missing
 * count, Up to date, Complete run. A want, or a series with no issues
 * out, says so instead; a released run with none owned draws its gaps. Line two is where reading stands. A row from a snapshot written
 * before `read_next` existed falls back to `read to #n`.
 *
 * @param {object} row - A PublicComicRow.
 * @param {(iso: string) => string} formatDate - "Dec 2" for an ISO date.
 * @returns {{count: string|null, status: string, reading: string|null, lanes: boolean}}
 */
export function cardLines(row, formatDate) {
  if (row.wanted && !row.owned) {
    return {
      count: null,
      status: `${row.released} out · none owned`,
      reading: null,
      lanes: false,
    }
  }
  if (!row.owned && !(row.released > 0 && row.segments?.length)) {
    return {
      count: null,
      status: 'Issues not recorded',
      reading: null,
      lanes: false,
    }
  }
  // A row from an older snapshot may lack `missing`; with nothing owned,
  // every issue out is missing, so it can never read as complete.
  const missing = row.missing ?? (row.owned ? 0 : row.released)
  let status
  if (row.next_issue)
    status = `Next #${row.next_issue.number} · ${formatDate(row.next_issue.store_date)}`
  else if (missing > 0) status = `${missing} missing`
  else status = row.ongoing ? 'Up to date' : 'Complete run'

  let reading
  // Nothing owned, so nothing to read: the track alone shows the gaps.
  if (!row.owned) reading = null
  else if ('read_next' in row)
    reading =
      row.read_next == null ? 'all read' : `read next: #${row.read_next}`
  else if (row.read >= row.owned) reading = 'all read'
  else reading = row.read_to ? `read to #${row.read_to}` : 'none read yet'

  return {
    count: countText({
      held: row.owned,
      released: row.released,
      ongoing: row.ongoing,
    }),
    status,
    reading,
    lanes: true,
  }
}

/** The near-cells strip: this many issues before an added one, and after. */
export const NEAR_BEFORE = 3
export const NEAR_AFTER = 2

/**
 * What an intake row brings to a series already on the shelf: the issues
 * it adds, those already held (loose or in an edition: the shelf's
 * `owned_text` merges both), and the run before and after.
 *
 * @param {object} input
 * @param {string} input.ownedText - The series' `owned_text` before the add.
 * @param {string|number[]} input.issues - The row's issues, as typed or as numbers.
 * @param {number} input.released
 * @param {boolean} [input.ongoing]
 * @returns {{before: ReturnType<typeof runModel>, after: ReturnType<typeof runModel>,
 *   added: number[], already: number[]}}
 */
export function seriesGrowth({ ownedText, issues, released, ongoing = false }) {
  const held = new Set(toNumbers(ownedText))
  const brought = [...new Set(toNumbers(issues))].sort((a, b) => a - b)
  const added = brought.filter((n) => !held.has(n))
  const already = brought.filter((n) => held.has(n))
  return {
    before: runModel({ singles: [...held], released, ongoing }),
    after: runModel({ singles: [...held, ...added], released, ongoing }),
    added,
    already,
  }
}

/**
 * The cells around a change, for an intake row: up to NEAR_BEFORE issues
 * before each added issue and NEAR_AFTER after it, the added ones as
 * `new`, and a gap where the run goes on beyond what is drawn. With
 * nothing added, the cells around `around` (an issue already held).
 *
 * @param {ReturnType<typeof runModel>} model - The run after the add.
 * @param {number[]} added
 * @param {number[]} [around]
 * @returns {Array<{type: 'cell', n: number, k: string}|{type: 'gap', after: number}>}
 */
export function nearCells(model, added, around = []) {
  const focus = added.length ? added : around
  const total = model.released
  const shown = new Set()
  for (const n of focus) {
    for (let x = n - NEAR_BEFORE; x <= n + NEAR_AFTER; x += 1) {
      if (x >= 1 && x <= total) shown.add(x)
    }
  }
  if (!shown.size) return []
  const isAdded = new Set(added)
  const tiles = []
  let last = 0
  for (const n of [...shown].sort((a, b) => a - b)) {
    if (n > last + 1) tiles.push({ type: 'gap', after: last })
    tiles.push({
      type: 'cell',
      n,
      k: isAdded.has(n) ? 'new' : model.issues[n - 1].k,
    })
    last = n
  }
  if (last < total) tiles.push({ type: 'gap', after: last })
  return tiles
}
