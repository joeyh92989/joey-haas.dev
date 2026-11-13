/**
 * A comic sitting's books at Check (comics item, 5a): pure helpers over the
 * entries the intake routes answer with. The mark under each number comes
 * from the server (`entry.number_check`); this only reads it, finds the books
 * still without a number, flags a repeat and sums what each series gains.
 */
import { comicIntake } from '../content/comicIntake.js'
import { MAX_ISSUE, displayRanges } from './comicRun.js'
import { expandRanges } from './comics.js'

const COUNTED = ['exact', 'ready', 'typed', 'owned']

/**
 * A comic the reader made a book of: it carries `number_source`. A comic
 * added by search or typing has none and keeps the grid and the Edit issues
 * row it always had.
 */
export const isBook = (entry) =>
  entry.kind === 'comic' && entry.payload?.number_source !== undefined

/** A book the sitting would write: ticked, not removed. */
export const isTicked = (entry) =>
  isBook(entry) && COUNTED.includes(entry.state)

export const isCollected = (entry) => entry.payload?.format === 'collected'

/** The series a book belongs to, for repeats and sums. */
export function seriesKey(entry) {
  const chosen = entry.chosen
  return chosen?.external_id
    ? `${chosen.external_source}:${chosen.external_id}`
    : `read:${(entry.payload?.detected_title ?? entry.id).toLowerCase()}`
}

/**
 * Whether a ticked single book still has no number: no number read or
 * typed, and none typed as text in the add bar (`issues_owned`).
 */
export function needsNumber(entry) {
  return (
    isTicked(entry) &&
    !isCollected(entry) &&
    entry.payload?.issue_number == null &&
    !entry.payload?.issues_owned
  )
}

/** The mark's words for an entry, from the server's run check. */
export function markWords(entry) {
  if (isCollected(entry)) return null
  return comicIntake.marks[entry.number_check?.state ?? 'none']
}

/**
 * The ids of ticked single books that repeat an earlier one: the same
 * series and number. The first stays unflagged.
 */
export function repeats(entries) {
  const seen = new Set()
  const flagged = new Set()
  for (const entry of entries) {
    const number = entry.payload?.issue_number
    if (!isTicked(entry) || isCollected(entry) || number == null) continue
    const key = `${seriesKey(entry)}#${number}`
    if (seen.has(key)) flagged.add(entry.id)
    else seen.add(key)
  }
  return flagged
}

/**
 * A typed number as the API takes it: a whole number 1 to MAX_ISSUE, null
 * when blank, `undefined` when it is not one ("#4" is allowed).
 */
export function parseNumber(text) {
  const clean = String(text ?? '')
    .trim()
    .replace(/^#/, '')
  if (clean === '') return null
  if (!/^\d+$/.test(clean)) return undefined
  const n = Number(clean)
  return n >= 1 && n <= MAX_ISSUE ? n : undefined
}

/**
 * What each series in the sitting would gain, in the order first seen:
 * its title, the numbers that are new, those the shelf holds already, its
 * collected editions, and how many single books still lack a number.
 *
 * @param {object[]} entries The sitting's entries.
 * @returns {Array<{key: string, title: string, added: number[],
 *   already: number[], editions: object[], missing: number}>}
 */
export function seriesAdds(entries) {
  const groups = new Map()
  for (const entry of entries.filter(isTicked)) {
    const key = seriesKey(entry)
    const group = groups.get(key) ?? {
      key,
      title: entry.chosen?.title ?? entry.payload?.detected_title ?? 'Untitled',
      numbers: new Set(),
      held: new Set(expandRanges(entry.on_shelf?.owned_text)),
      editions: [],
      missing: 0,
    }
    if (isCollected(entry)) {
      const { collects_from: from, collects_to: to } = entry.payload
      if (from != null && to != null)
        group.editions.push({
          kind: comicIntake.editionKinds[entry.payload.edition_kind ?? 'trade'],
          label: entry.payload.detected_title ?? group.title,
          from,
          to,
        })
    } else if (entry.payload?.issue_number != null) {
      group.numbers.add(entry.payload.issue_number)
    } else if (entry.payload?.issues_owned) {
      for (const n of expandRanges(entry.payload.issues_owned))
        group.numbers.add(n)
    } else {
      group.missing += 1
    }
    groups.set(key, group)
  }
  return [...groups.values()].map(
    ({ numbers, held, editions, missing, key, title }) => {
      const sorted = [...numbers].sort((a, b) => a - b)
      return {
        key,
        title,
        added: sorted.filter((n) => !held.has(n)),
        already: sorted.filter((n) => held.has(n)),
        editions,
        missing,
      }
    },
  )
}

/** "#1–4, #6": numbers as the site writes a run, "#" once per range. */
export const hashRanges = (numbers) =>
  displayRanges(numbers)
    .split(', ')
    .map((part) => `#${part}`)
    .join(', ')
