/**
 * The cover wall's tiles (comic issue pages spec).
 *
 * Pure: turns a series' issues, editions and ownership into the tiles the
 * wall draws, in the order and under the rules of `comicRun.boxTiles` (an
 * issue is drawn once, inside the first edition that covers it; a long even
 * stretch folds), with covers in place of cells. Only a run of missing
 * issues folds: a held issue always gets its own tile.
 */
import { BUNDLE_MIN, runModel } from './comicRun.js'

/** `ed-<from>-<to>`, with `-2`, `-3`... on a repeated range. The backend mirrors it. */
export function editionSlugs(editions) {
  const seen = new Map()
  return (editions ?? []).map((edition) => {
    const from = edition.from ?? edition.from_issue
    const to = edition.to ?? edition.to_issue
    const base = `ed-${from}-${to}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
}

/**
 * One issue's state: 'read', 'owned', 'missing', 'not-out' or, only when a
 * `skipped` set is passed (signed in), 'skipped'.
 *
 * @param {object} input
 * @param {number} input.n
 * @param {Set<number>} input.owned - Held issues, singles and editions merged.
 * @param {number|null} [input.readTo]
 * @param {number} input.released
 * @param {Set<number>} [input.skipped]
 * @param {Set<number>} [input.reads] - The books marked read, one by one;
 *   without it `readTo` says (every held issue up to it).
 */
export function issueState({
  n,
  owned,
  readTo = null,
  released,
  skipped,
  reads,
}) {
  if (owned.has(n)) {
    const read = reads ? reads.has(n) : n <= (readTo ?? 0)
    return read ? 'read' : 'owned'
  }
  if (skipped?.has(n)) return 'skipped'
  if (n > released) return 'not-out'
  return 'missing'
}

/**
 * @param {object} input
 * @param {{number: string|number, store_date: string, cover_url: string|null}[]} input.issues
 * @param {{slug?: string, kind: string, label: string, from_issue: number, to_issue: number, cover_url: string|null}[]} input.editions
 * @param {Set<number>} input.owned
 * @param {number|null} input.readTo
 * @param {number} input.released
 * @param {{number: string, store_date: string}|null} input.nextIssue
 * @param {Set<number>} [input.skipped] - Signed in only.
 * @param {Set<number>} [input.reads] - The books read, one by one (the marks).
 * @param {boolean} [input.fold] - Fold long missing stretches into stacks
 *   (a visitor's wall; signed in, the wall is open). Default true.
 * @param {Set<string>} [open] - Keys (`<from>-<to>`) of stacks shown open.
 * @returns {object[]} Tiles: book, cover, stack, fold, not-out.
 */
export function wallTiles(
  {
    issues,
    editions,
    owned,
    readTo,
    released,
    nextIssue,
    skipped,
    reads,
    fold = true,
  },
  open = new Set(),
) {
  const model = runModel({
    singles: [...owned],
    editions,
    readTo,
    released,
    nextIssue,
    skipped: skipped ? [...skipped] : [],
  })
  const slugs = editionSlugs(editions)
  const rowOf = new Map((issues ?? []).map((row) => [Number(row.number), row]))
  const held = new Set(model.issues.filter((i) => i.held).map((i) => i.n))
  const read = readTo ?? 0
  // How far into a book the reading goes: the unbroken run from its first.
  const readInto = (book) => {
    if (!reads) return read >= book.from && read < book.to ? read : null
    let last = null
    for (let n = book.from; n <= book.to && reads.has(n); n += 1) last = n
    return last !== null && last < book.to ? last : null
  }

  const tiles = []
  const drawn = new Set()
  const bookTile = (book) => {
    drawn.add(book)
    tiles.push({
      kind: 'book',
      slug: editions[book.index].slug ?? slugs[book.index],
      edition: book,
      cover_url: editions[book.index].cover_url ?? null,
      readTo: readInto(book),
    })
  }
  const coverTile = (n) => {
    const row = rowOf.get(n)
    return {
      kind: 'cover',
      n,
      cover_url: row?.cover_url ?? null,
      store_date: row?.store_date ?? null,
      state: issueState({
        n,
        owned: held,
        readTo,
        released: model.released,
        skipped,
        reads,
      }),
    }
  }

  const list = model.issues
  let i = 0
  while (i < list.length) {
    const issue = list[i]
    if (issue.edition) {
      const book = issue.edition
      if (!drawn.has(book)) bookTile(book)
      while (i < list.length && list[i].edition === book) i += 1
      const last = list[i - 1].n
      for (const other of model.editions) {
        if (!drawn.has(other) && other.from <= last) bookTile(other)
      }
      continue
    }
    let j = i
    while (list[j + 1] && !list[j + 1].edition && list[j + 1].k === issue.k)
      j += 1
    const count = j - i + 1
    if (fold && issue.k === 'missing' && count >= BUNDLE_MIN) {
      const from = issue.n
      const to = list[j].n
      const key = `${from}-${to}`
      if (open.has(key)) tiles.push({ kind: 'fold', key })
      else {
        tiles.push({ kind: 'stack', key, from, to, count })
        i = j + 1
        continue
      }
    }
    for (let x = i; x <= j; x += 1) tiles.push(coverTile(list[x].n))
    i = j + 1
  }
  if (model.nextOut) {
    tiles.push({
      kind: 'not-out',
      n: Number(model.nextOut.number),
      store_date: model.nextOut.store_date,
    })
  }
  return tiles
}
