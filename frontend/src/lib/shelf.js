/**
 * Pure helpers shared by the public and admin shelves.
 *
 * Everything here is total over the rows the API returns: missing values sort
 * last, filters never throw on an absent field, and storage failures fall back
 * rather than propagate. Sorting and filtering are client-side because the
 * collection is small enough to hold in memory and the backend may be asleep.
 */

/** Statuses in the order every shelf control and chart lists them. */
export const STATUS_ORDER = [
  'backlog',
  'active',
  'paused',
  'finished',
  'abandoned',
]

/** Display names for statuses; `active` reads as "Playing" on a shelf. */
export const STATUS_LABEL = {
  backlog: 'Backlog',
  active: 'Playing',
  paused: 'Paused',
  finished: 'Finished',
  abandoned: 'Abandoned',
}

/**
 * A status in words for the item's type: an active comic is Reading, every
 * other pairing keeps the shelf's own name.
 *
 * @param {string} status
 * @param {string} [type]
 */
export function statusLabel(status, type) {
  if (type === 'comic' && status === 'active') return 'Reading'
  return STATUS_LABEL[status]
}

const GAME_WORDS = {
  runs: 'Playthroughs',
  run: 'playthrough',
  noRuns: 'No playthroughs yet.',
  addPast: 'Add a past playthrough',
  pastRun: 'Past playthrough',
  journalOn: 'Played on',
  tile: 'Played',
  again: 'Playing again',
  replay: 'Replay',
}

const COMIC_WORDS = {
  runs: 'Reads',
  run: 'read',
  noRuns: 'No reads yet.',
  addPast: 'Add a past read',
  pastRun: 'Past read',
  journalOn: 'Read on',
  tile: 'Read',
  again: 'Reading again',
  replay: 'Reread',
}

/**
 * The words for an item's runs (playthroughs for a game, reads for a comic).
 *
 * @param {string} [type]
 */
export function runWords(type) {
  return type === 'comic' ? COMIC_WORDS : GAME_WORDS
}

const TITLE_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/** The field each sort key reads. ISO date strings compare correctly as text. */
const SORT_FIELD = {
  added: 'created_at',
  finished: 'finished_at',
  rating: 'rating',
  year: 'year',
  title: 'title',
}

function compareValues(left, right) {
  if (typeof left === 'string' && typeof right === 'string') {
    return TITLE_COLLATOR.compare(left, right)
  }
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * mulberry32: a tiny seeded PRNG, so a shuffle is reproducible from its seed.
 *
 * @param {number} seed Any integer.
 * @returns {() => number} A generator of floats in [0, 1).
 */
function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Returns a sorted copy of `items`; never mutates the input.
 *
 * Nulls sort last in both directions, so an unrated item never tops a
 * lowest-rated list. Ties fall back to title. `random` is a seeded
 * Fisher-Yates shuffle and ignores `direction`.
 *
 * @param {object[]} items Shelf rows.
 * @param {'added'|'finished'|'rating'|'year'|'title'|'random'} key Sort key.
 * @param {'asc'|'desc'} direction Sort direction.
 * @param {number} seed Seed for `random`; ignored otherwise.
 * @returns {object[]} A new, sorted array.
 */
export function sortItems(items, key, direction, seed) {
  const copy = [...items]
  if (key === 'random') {
    const next = mulberry32(seed)
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1))
      ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
    }
    return copy
  }

  const field = SORT_FIELD[key] ?? SORT_FIELD.added
  const sign = direction === 'asc' ? 1 : -1
  return copy.sort((left, right) => {
    const a = left[field] ?? null
    const b = right[field] ?? null
    if (a === null || b === null) {
      if (a === b) return 0
      return a === null ? 1 : -1
    }
    const order = sign * compareValues(a, b)
    if (order !== 0 || field === 'title') return order
    return compareValues(left.title ?? '', right.title ?? '')
  })
}

/**
 * Counts rows per value of one field.
 *
 * @param {object[]} items Shelf rows.
 * @param {string} field The field to group by.
 * @returns {Record<string, number>} Count per value present.
 */
export function countBy(items, field) {
  const counts = {}
  for (const item of items) {
    const value = item[field]
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

/**
 * Favourites, highest rated first (unrated last), then by title: the order
 * of the favourites row and of every cover strip, kept in one place so the
 * two cannot disagree.
 *
 * @param {object[]} items Shelf rows.
 * @param {number} [limit] How many to keep; all of them by default.
 * @returns {object[]} A new array; the input is not mutated.
 */
export function topFavourites(items, limit = Infinity) {
  return sortItems(
    items.filter((item) => item.favorite),
    'rating',
    'desc',
    0,
  ).slice(0, limit)
}

/**
 * Applies the shelf's chip selection.
 *
 * `type`, `status` and `platform` are single-select with null meaning all;
 * `wanted`, `unrated` (finished and unrated, the admin nudge) and `private`
 * (admin rows only) are toggles ANDed on top.
 *
 * @param {object[]} items Shelf rows.
 * @param {{type: string|null, status: string|null, platform: string|null, wanted: boolean, unrated: boolean, private: boolean}} value
 *   The current selection.
 * @returns {object[]} The rows that match every part of the selection.
 */
export function filterItems(items, value) {
  return items.filter(
    (item) =>
      (!value.type || item.type === value.type) &&
      (!value.status || item.status === value.status) &&
      (!value.platform || item.platform === value.platform) &&
      (!value.wanted || item.wanted === true) &&
      (!value.unrated || (item.status === 'finished' && item.rating == null)) &&
      (!value.private || item.is_public === false),
  )
}

/**
 * The admin list a row of this type is on: Comics for a comic, Games for
 * anything else (the only other type with admin rows today).
 *
 * @param {string|undefined} type An item type.
 * @returns {string} `/admin/shelf/comics` or `/admin/shelf/games`.
 */
export function adminListPath(type) {
  return type === 'comic' ? '/admin/shelf/comics' : '/admin/shelf/games'
}

/** Lower case without accents, so "pokemon" finds "Pokémon". */
function fold(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * The rows whose title, creator or platform contain every word of the
 * query, ignoring case and accents. An empty query matches everything.
 *
 * @param {object[]} items Shelf rows.
 * @param {string} query What was typed in the shelf's search box.
 * @returns {object[]}
 */
export function searchItems(items, query) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return items
  return items.filter((item) => {
    const haystack = fold(
      [item.title, item.creator, item.platform].filter(Boolean).join(' '),
    )
    return words.every((word) => haystack.includes(word))
  })
}

/** The selection with nothing chosen. */
export const NO_FILTER = {
  type: null,
  status: null,
  platform: null,
  wanted: false,
  unrated: false,
  private: false,
}

/**
 * Reads a persisted shelf preference.
 *
 * Guarded because storage throws outright in some private-browsing modes, and
 * type-checked against the fallback so a stale or hand-edited value never
 * reaches the page.
 *
 * @template T
 * @param {string} key A namespaced key: `shelf.public.*` or `shelf.admin.*`.
 * @param {T} fallback Returned when nothing usable is stored.
 * @returns {T} The stored value, or the fallback.
 */
export function readShelfPref(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const value = JSON.parse(raw)
    return typeof value === typeof fallback ? value : fallback
  } catch {
    return fallback
  }
}

/**
 * Persists a shelf preference; a failure leaves the choice in effect for this
 * visit only.
 *
 * @param {string} key A namespaced key: `shelf.public.*` or `shelf.admin.*`.
 * @param {unknown} value Any JSON-serializable value.
 */
export function writeShelfPref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Unpersisted, not lost: the page state still holds it.
  }
}

/**
 * The platform chip group, or null while there is only one platform: a row
 * with one chip filters nothing. Shared with the admin shelf.
 *
 * @param {object[]} items - Shelf rows; those without a platform are ignored.
 * @returns {object|null} A FilterChips group.
 */
export function platformGroup(items) {
  const counts = countBy(
    items.filter((item) => item.platform),
    'platform',
  )
  const platforms = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
  if (platforms.length < 2) return null
  return {
    key: 'platform',
    label: 'Platform',
    options: platforms.map((platform) => ({
      value: platform,
      label: platform,
      count: counts[platform],
    })),
  }
}

/** Finished and abandoned fade back when dimming is on; the backlog never does. */
export const isDimmable = (item) =>
  item.status === 'finished' || item.status === 'abandoned'
