/**
 * Shelfle, the daily puzzle at /daily: the pure rules, with no React, no
 * network and no `import.meta`, so the prerender script can import the pool
 * filter and every rule is unit tested without a browser.
 *
 * The answer pool is the public shelf's owned games with a platform, a
 * release year, at least one genre and a time to beat (see `dailyPool`).
 * One of them is the answer for every Denver calendar day, picked by a
 * salted hash of the date, and each guess grades its platform, year, lead
 * genre and size band against it.
 *
 * The salt is a parameter here, never read from the environment: the page
 * passes `DAILY_SALT` from lib/dailyConfig.js. It is in the shipped bundle,
 * so anyone who wants tomorrow's answer can compute it; the salt only stops
 * the casual case of reading the snapshot order.
 */
import { SIZE_LABELS, sizeBand } from './sizeBand.js'

/** Day 1. Set to the day the puzzle shipped. */
export const DAILY_EPOCH = '2026-11-10'

/** The build fails when a snapshot's pool is smaller than this. */
export const MIN_POOL = 30

/** Guesses per day. */
export const MAX_GUESSES = 6

/** A day's pick never repeats any of this many previous days' picks. */
export const RECENT_DAYS = 7

/** A year this close to the answer's grades close. */
export const YEAR_CLOSE = 2

/** The last line of the share text. */
export const SHARE_URL = 'joey-haas.dev/daily'

/** The graded columns, in board and share order. The title is never graded. */
export const GRADE_KEYS = ['platform', 'year', 'genre', 'size']

/** The share grid's cell per state. */
export const SHARE_EMOJI = { match: '🟩', close: '🟨', no: '⬛' }

/**
 * Platforms that grade close against each other, keyed on the ten strings
 * `PLATFORM_NAMES` in backend/sources/igdb.py can resolve an owned copy to.
 */
export const PLATFORM_FAMILIES = [
  ['Nintendo Switch', 'Nintendo Switch 2'],
  ['PlayStation 4', 'PlayStation 5'],
  ['Xbox One', 'Xbox Series X|S'],
]

const PLATFORM_SHORT = {
  'Nintendo Switch': 'Switch',
  'Nintendo Switch 2': 'Switch 2',
  'Nintendo 64': 'N64',
  'Nintendo 3DS': '3DS',
  'PlayStation 4': 'PS4',
  'PlayStation 5': 'PS5',
  'Xbox Series X|S': 'Series X|S',
}

const GENRE_SHORT = {
  'Role-playing (RPG)': 'RPG',
  "Hack and slash/Beat 'em up": 'Hack & slash',
  'Turn-based strategy (TBS)': 'TBS',
  'Real Time Strategy (RTS)': 'RTS',
  'Card & Board Game': 'Card & board',
  'Point-and-click': 'Point & click',
  'Quiz/Trivia': 'Quiz',
}

/**
 * The platform as the board shows it: the family name without the maker.
 *
 * @param {string} name A `PLATFORM_NAMES` string.
 * @returns {string}
 */
export function shortPlatform(name) {
  return PLATFORM_SHORT[name] ?? name
}

/**
 * The genre as the board shows it: IGDB's long forms cut to fit a cell.
 *
 * @param {string} name An IGDB genre name.
 * @returns {string}
 */
export function shortGenre(name) {
  return GENRE_SHORT[name] ?? name
}

/**
 * The release year of a public item, from `year` or the date.
 *
 * @param {object} item A public item.
 * @returns {number | null}
 */
export function yearOf(item) {
  if (Number.isInteger(item.year)) return item.year
  if (typeof item.release_date === 'string' && item.release_date.length >= 4) {
    const year = Number(item.release_date.slice(0, 4))
    return Number.isInteger(year) ? year : null
  }
  return null
}

/**
 * The answer pool: public, owned games that every column can grade, sorted
 * by id so the order is the same in every build and browser.
 *
 * @param {object[]} items The public items snapshot.
 * @returns {object[]}
 */
export function dailyPool(items) {
  return items
    .filter(
      (item) =>
        item.type === 'game' &&
        !item.wanted &&
        typeof item.platform === 'string' &&
        item.platform !== '' &&
        yearOf(item) != null &&
        Array.isArray(item.genres) &&
        item.genres.length > 0 &&
        sizeBand(item.time_to_beat_hours) != null,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

const DAY_MS = 86_400_000

function utcMidnight(isoDay) {
  const [year, month, day] = isoDay.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * A 'YYYY-MM-DD' day some days after another, on the calendar (no zone,
 * no daylight saving).
 *
 * @param {string} isoDay The start day.
 * @param {number} days Days to add; negative goes back.
 * @returns {string}
 */
export function addDays(isoDay, days) {
  return new Date(utcMidnight(isoDay) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/**
 * The puzzle's day number: 1 on the epoch, counted on the calendar, so a
 * daylight-saving change never adds or drops a day.
 *
 * @param {string} isoDay A 'YYYY-MM-DD' Denver day (see `ownerDay`).
 * @param {string} [epoch] Day 1, by default `DAILY_EPOCH`.
 * @returns {number} The day number; 0 or less before the epoch.
 */
export function dayNumber(isoDay, epoch = DAILY_EPOCH) {
  return Math.round((utcMidnight(isoDay) - utcMidnight(epoch)) / DAY_MS) + 1
}

/**
 * 32-bit FNV-1a over a string's UTF-16 code units. Small, stable and the
 * same in every engine, which is all a daily pick needs.
 *
 * @param {string} text
 * @returns {number} An unsigned 32-bit integer.
 */
export function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Every day's pick from the epoch up to a day, in order. Each day hashes
 * the salt and its date into an index over the pool, then steps forward
 * past any of the previous `RECENT_DAYS` picks, so the rule is well
 * defined from day 1 and costs one hash per day.
 *
 * @param {string} isoDay The last day to pick for.
 * @param {object[]} pool The answer pool, from `dailyPool`.
 * @param {string} salt The build's salt.
 * @param {string} [epoch] Day 1, by default `DAILY_EPOCH`.
 * @returns {{ day: number, isoDay: string, item: object }[]} Empty before
 *   the epoch or with an empty pool.
 */
export function picksThrough(isoDay, pool, salt, epoch = DAILY_EPOCH) {
  const last = dayNumber(isoDay, epoch)
  if (pool.length === 0 || last < 1) return []
  const picks = []
  for (let day = 1; day <= last; day += 1) {
    const date = addDays(epoch, day - 1)
    const recent = new Set(
      picks.slice(-RECENT_DAYS).map((pick) => pick.item.id),
    )
    let index = fnv1a(salt + date) % pool.length
    // A pool no larger than the window could be all recent: stop after a
    // full turn rather than loop.
    for (let step = 0; step < pool.length && recent.has(pool[index].id);) {
      index = (index + 1) % pool.length
      step += 1
    }
    picks.push({ day, isoDay: date, item: pool[index] })
  }
  return picks
}

/**
 * Today's pick.
 *
 * @returns {{ day: number, isoDay: string, item: object } | null}
 */
export function pickFor(isoDay, pool, salt, epoch = DAILY_EPOCH) {
  return picksThrough(isoDay, pool, salt, epoch).at(-1) ?? null
}

/**
 * Yesterday's pick, null on day 1.
 *
 * @returns {{ day: number, isoDay: string, item: object } | null}
 */
export function yesterdayPick(isoDay, pool, salt, epoch = DAILY_EPOCH) {
  return picksThrough(isoDay, pool, salt, epoch).at(-2) ?? null
}

function sameFamily(a, b) {
  return PLATFORM_FAMILIES.some(
    (family) => family.includes(a) && family.includes(b),
  )
}

function sameSet(a, b) {
  return a.length === b.length && a.every((value) => b.includes(value))
}

/**
 * Grade a guess against the answer, one cell per graded column.
 *
 * - platform: the same string is a match, the same family is close.
 * - year: equal is a match, within `YEAR_CLOSE` is close; the arrow and
 *   word say where the answer lies (↑ later, ↓ earlier), on close and no.
 * - genre: the same set, or the same lead genre, is a match; any genre in
 *   common is close. The cell shows the guess's lead genre.
 * - size: the same band is a match, the next band is close (↑ longer, ↓
 *   shorter); a guess with no time to beat shows — and grades no.
 *
 * @param {object} guess A pool item (or any public game).
 * @param {object} answer A pool item.
 * @returns {Record<'platform' | 'year' | 'genre' | 'size',
 *   { state: 'match' | 'close' | 'no', value: string, arrow?: string, word?: string }>}
 */
export function grade(guess, answer) {
  const platform = {
    value: shortPlatform(guess.platform ?? '—'),
    state:
      guess.platform === answer.platform
        ? 'match'
        : sameFamily(guess.platform, answer.platform)
          ? 'close'
          : 'no',
  }

  const guessYear = yearOf(guess)
  const yearDiff = yearOf(answer) - guessYear
  const year = { value: guessYear == null ? '—' : String(guessYear) }
  if (guessYear == null) {
    year.state = 'no'
  } else if (yearDiff === 0) {
    year.state = 'match'
  } else {
    year.state = Math.abs(yearDiff) <= YEAR_CLOSE ? 'close' : 'no'
    year.arrow = yearDiff > 0 ? '↑' : '↓'
    year.word = yearDiff > 0 ? 'later' : 'earlier'
  }

  const guessGenres = guess.genres ?? []
  const genre = { value: shortGenre(guessGenres[0] ?? '—') }
  if (
    guessGenres.length > 0 &&
    (sameSet(guessGenres, answer.genres) || guessGenres[0] === answer.genres[0])
  ) {
    genre.state = 'match'
  } else if (guessGenres.some((name) => answer.genres.includes(name))) {
    genre.state = 'close'
  } else {
    genre.state = 'no'
  }

  const guessBand = sizeBand(guess.time_to_beat_hours)
  const size = { value: guessBand == null ? '—' : SIZE_LABELS[guessBand] }
  if (guessBand == null) {
    size.state = 'no'
  } else {
    const bandDiff = sizeBand(answer.time_to_beat_hours) - guessBand
    if (bandDiff === 0) {
      size.state = 'match'
    } else {
      size.state = Math.abs(bandDiff) === 1 ? 'close' : 'no'
      size.arrow = bandDiff > 0 ? '↑' : '↓'
      size.word = bandDiff > 0 ? 'longer' : 'shorter'
    }
  }

  return { platform, year, genre, size }
}

function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function byTitle(a, b) {
  return a.title.localeCompare(b.title)
}

/**
 * Autocomplete: titles starting with the query first, then titles
 * containing it, each alphabetical, without the titles already guessed,
 * at most `limit`. Case and accents are ignored.
 *
 * @param {string} query What the visitor typed.
 * @param {object[]} pool The answer pool.
 * @param {Iterable<string>} [excludedIds] Ids already guessed.
 * @param {number} [limit] Rows to return, by default 6.
 * @returns {object[]}
 */
export function suggest(query, pool, excludedIds = [], limit = 6) {
  const needle = fold(query)
  if (needle === '') return []
  const excluded = new Set(excludedIds)
  const candidates = pool.filter((item) => !excluded.has(item.id))
  const starts = candidates
    .filter((item) => fold(item.title).startsWith(needle))
    .sort(byTitle)
  const contains = candidates
    .filter(
      (item) =>
        !fold(item.title).startsWith(needle) &&
        fold(item.title).includes(needle),
    )
    .sort(byTitle)
  return [...starts, ...contains].slice(0, limit)
}

/**
 * The pool item whose title is exactly what the visitor typed, case and
 * accents aside, so Enter on a full title submits without a highlight.
 *
 * @param {string} query What the visitor typed.
 * @param {object[]} pool The answer pool.
 * @returns {object | null}
 */
export function matchTitle(query, pool) {
  const needle = fold(query)
  if (needle === '') return null
  return pool.find((item) => fold(item.title) === needle) ?? null
}

/**
 * The share text, exactly: the day and score, one line of four cells per
 * guess, then the site. `X/6` for a loss.
 *
 * @param {number} day The day number.
 * @param {ReturnType<typeof grade>[]} grades Every guess's grade, in order.
 * @param {boolean} won Whether the last guess was the answer.
 * @returns {string}
 */
export function shareText(day, grades, won) {
  const score = won ? String(grades.length) : 'X'
  const rows = grades.map((row) =>
    GRADE_KEYS.map((key) => SHARE_EMOJI[row[key].state]).join(''),
  )
  return [`Shelfle ${day} · ${score}/${MAX_GUESSES}`, ...rows, SHARE_URL].join(
    '\n',
  )
}

/**
 * The same result as words, one line per guess, for assistive technology
 * and anyone who does not want emoji.
 *
 * @param {ReturnType<typeof grade>[]} grades Every guess's grade, in order.
 * @returns {string[]} For example 'Row 1: platform match, year close (later), …'.
 */
export function shareWords(grades) {
  return grades.map((row, index) => {
    const cells = GRADE_KEYS.map((key) => {
      const cell = row[key]
      return cell.word
        ? `${key} ${cell.state} (${cell.word})`
        : `${key} ${cell.state}`
    })
    return `Row ${index + 1}: ${cells.join(', ')}`
  })
}

const KICKER_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/**
 * The header's kicker: 'Day 37 · 8 Nov'.
 *
 * @param {number} day The day number.
 * @param {string} isoDay The day as 'YYYY-MM-DD'.
 * @returns {string}
 */
export function dayKicker(day, isoDay) {
  return `Day ${day} · ${KICKER_DATE.format(new Date(utcMidnight(isoDay)))}`
}
