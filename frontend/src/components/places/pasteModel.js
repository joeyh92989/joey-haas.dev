import { HOME_CITY, cityLabel, emptyFields } from './PlaceFields.jsx'

/** The server's note for a search that found nothing (place_paste.py). Any
 *  other note on a searched entry says the place found could not be used. */
export const NO_PLACE_NOTE = 'No place found. Change the words and look again.'

/** The most lines one paste takes; the server counts the rest as over. */
export const MAX_LINES = 200

/** Groups in the order the page draws them. */
export const GROUPS = ['check', 'ready', 'wait', 'saved', 'same']

/** The kinds of row a to-check entry can be, by what it carries. */
const CHECK_KINDS = new Set([
  'several',
  'unusable',
  'coords',
  'short',
  'long',
  'none',
  'failed',
  'left',
])

/** The text a line is searched by, or the name a place will be saved under. */
export const nameOf = (entry) => entry.payload?.name ?? ''

/** The line as pasted. */
export const lineOf = (entry) => entry.payload?.source_line ?? nameOf(entry)

const hasPosition = (entry) =>
  Number.isFinite(entry.payload?.lat) && Number.isFinite(entry.payload?.lng)

/** Whether a stored entry came from a paste (it carries the line). */
export const isPasted = (entry) =>
  typeof entry.payload?.source_line === 'string'

/**
 * What an entry is on the page. A READING entry is `wait`, or `failed` when
 * the page gave up on it (`failedIds`); a CHECK entry is told by what it
 * carries: candidates, a position, the search having run (`attempts`), or
 * the line being a link. `leftOut` holds entries the owner left out this
 * visit (their note, if any, is the old one).
 *
 * @param {object} entry The server's entry.
 * @param {Set<string>} failedIds
 * @param {Set<string>} leftOut
 * @returns {'ready'|'saved'|'same'|'wait'|'failed'|'several'|'coords'|'short'|'long'|'none'|'unusable'|'left'|'other'}
 */
export function kindOf(entry, failedIds, leftOut) {
  switch (entry.state) {
    case 'ready':
      return 'ready'
    case 'owned':
      return 'saved'
    case 'ignored':
      return 'same'
    case 'reading':
      return failedIds.has(entry.id) ? 'failed' : 'wait'
    case 'check': {
      const payload = entry.payload ?? {}
      if (Array.isArray(payload.candidates) && payload.candidates.length) {
        return 'several'
      }
      if ((payload.attempts ?? 0) >= 2) return 'failed'
      if (hasPosition(entry)) {
        return leftOut.has(entry.id) || !payload.note ? 'left' : 'coords'
      }
      if ('attempts' in payload) {
        return payload.note === NO_PLACE_NOTE ? 'none' : 'unusable'
      }
      // A short link is named "Short link from <host>" by the server; any
      // other line the paste could not read is one that was too long.
      return /^Short link from /.test(payload.name ?? '') ? 'short' : 'long'
    }
    default:
      return 'other'
  }
}

/** The group a kind is listed under. */
export function groupOf(kind) {
  if (kind === 'ready') return 'ready'
  if (kind === 'saved') return 'saved'
  if (kind === 'same') return 'same'
  if (kind === 'wait') return 'wait'
  return CHECK_KINDS.has(kind) ? 'check' : null
}

/** The fields an entry starts with: its stored owner fields. */
export function fieldsOf(entry) {
  const payload = entry.payload ?? {}
  const base = emptyFields()
  const city = typeof payload.city === 'string' ? payload.city : HOME_CITY
  return {
    ...base,
    city,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    blurb: payload.blurb ?? '',
    isPublic: payload.is_public === true && city === HOME_CITY,
  }
}

/** "Denver, private, 2 tags": the one-line summary of a ready row's fields. */
export function setParts(values) {
  const city =
    values.city === 'other' ? values.otherCity.trim() || HOME_CITY : values.city
  return {
    city: cityLabel(city),
    isPublic: values.isPublic && city.toLowerCase() === HOME_CITY,
    tags: values.tags.length,
  }
}

/** The address line under a place's name. */
export function addressOf(entry) {
  const chosen = entry.chosen
  if (chosen?.address) return chosen.address
  if (hasPosition(entry)) {
    return `${entry.payload.lat.toFixed(4)}, ${entry.payload.lng.toFixed(4)}`
  }
  return ''
}

/** What the pasted line was, when the place's name is not it. */
export function fromOf(entry, words) {
  const line = lineOf(entry)
  if (/^https?:\/\//i.test(line)) {
    if (/google\./i.test(line)) return words.fromGoogle
    if (/openstreetmap\./i.test(line)) return words.fromOsm
    return words.fromLink
  }
  const name = nameOf(entry)
  if (line && name && line.toLowerCase() !== name.toLowerCase()) {
    return words.pastedAs(line.length > 40 ? `${line.slice(0, 40)}…` : line)
  }
  return ''
}

/** The pasted blob's line count (a trailing newline is not a line) and its
 *  non-blank count, for the live count under the box. */
export function countLines(text) {
  if (!text) return { total: 0, filled: 0 }
  const lines = text.replace(/\n$/, '').split('\n')
  return {
    total: lines.length,
    filled: lines.filter((line) => line.trim()).length,
  }
}

/** The entry with the fewest tries among those waiting, first in order. */
export function nextWaiting(entries, skip) {
  let best = null
  for (const entry of entries) {
    if (entry.state !== 'reading' || skip.has(entry.id)) continue
    const tries = entry.payload?.attempts ?? 0
    if (!best || tries < (best.payload?.attempts ?? 0)) best = entry
  }
  return best
}
