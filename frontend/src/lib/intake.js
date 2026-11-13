/**
 * Intake's client half (spec: docs/planning/2026-11-10-intake-design.md).
 * Pure helpers and the few constants the Add page and a sitting share; the
 * kinds and their fields always come from `GET /api/intake/kinds`, never
 * from here, so a kind or field added on the server needs nothing new.
 */
import { FORMAT_OPTIONS, PLATFORM_OPTIONS } from '../components/ItemForm.jsx'
import { MAX_ATTEMPTS, MAX_PHOTO_BYTES, PHOTO_ACCEPT } from './closet.js'
import { statusLabel } from './shelf.js'

/**
 * Words for option values the site already names elsewhere. Presentation
 * only: a value missing here is still offered, in words made from itself.
 */
const OPTION_WORDS = {
  platform_id: Object.fromEntries(
    PLATFORM_OPTIONS.map(([id, name]) => [String(id), name]),
  ),
  physical_format: Object.fromEntries(FORMAT_OPTIONS),
  shelf_format: {
    singles: 'Single issues',
    trades: 'Trade paperbacks',
    omnibus: 'Omnibus',
  },
  disc_format: { dvd: 'DVD', bluray: 'Blu-ray', uhd: '4K UHD' },
}

/**
 * An option value in words: the site's own name, or the value made readable.
 * `kindKey` is the sitting's kind, for the words that follow the item type.
 */
export function optionLabel(fieldKey, value, kindKey) {
  const known =
    fieldKey === 'status'
      ? statusLabel(String(value), kindKey)
      : OPTION_WORDS[fieldKey]?.[String(value)]
  if (known) return known
  const words = String(value).replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Entry states written by a commit (intake/commit.py). */
export const WRITTEN_STATES = ['exact', 'ready', 'typed']

/** Entry states asked one at a time in Check (a probable match is asked too). */
export const CHECK_STATES = ['check', 'probable']

/** The skim grid's states: trusted matches, and what is already owned. */
export const SKIM_STATES = ['exact', 'owned']

/**
 * A listed sitting's meter: ready (written at commit), to check (check and
 * probable entries, asked one at a time), and still reading (entries whose
 * source was busy plus photos not yet read), and the titles already on the
 * shelf.
 *
 * @param {{entries?: Record<string, number>, photos_waiting?: number}} sitting
 */
export function meterCounts(sitting) {
  const entries = sitting.entries ?? {}
  const count = (state) => entries[state] ?? 0
  return {
    ready: WRITTEN_STATES.reduce((sum, state) => sum + count(state), 0),
    check: CHECK_STATES.reduce((sum, state) => sum + count(state), 0),
    reading: count('reading') + (sitting.photos_waiting ?? 0),
    owned: count('owned'),
  }
}

/** The area an admin path is under: `shelf` or `closet`. */
export function areaOfPath(pathname) {
  return /^\/admin\/closet(\/|$)/.test(pathname) ? 'closet' : 'shelf'
}

/** The Add page of an area. */
export function addPath(area) {
  return area === 'closet' ? '/admin/closet/add' : '/admin/collection/add'
}

/**
 * The page an area's committed things show on. A comic sitting's rows are
 * comics, which the Games page doesn't list; any other (or a mixed) sitting
 * lands on Games.
 */
export function shelfPath(area, kind = null) {
  if (area === 'closet') return '/admin/closet'
  return kind === 'comic' ? '/admin/shelf/comics' : '/admin/shelf/games'
}

/**
 * A file the server would refuse, in words naming it, or null. Checked
 * before uploading so a 14 MB photo is not sent only to be refused.
 *
 * @param {File} file
 * @returns {string|null}
 */
export function refuseFile(file) {
  const accepted = PHOTO_ACCEPT.split(',')
  if (!accepted.includes(file.type)) {
    return `${file.name} is ${file.type || 'not an image'}; upload JPEG, PNG, WebP or HEIC photos`
  }
  if (file.size > MAX_PHOTO_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024))
    return `${file.name} is ${mb} MB; upload photos of at most ${MAX_PHOTO_BYTES / (1024 * 1024)} MB`
  }
  return null
}

/** What a waiting photo says when the day's model budget is spent. */
export const BUDGET_WAITING = 'waiting for tomorrow’s budget'

/** The title an entry is known by: its match's, else what was read or typed. */
export function entryTitle(entry) {
  return (
    entry.chosen?.title ??
    entry.payload?.title ??
    entry.payload?.detected_title ??
    entry.payload?.name ??
    'Untitled'
  )
}

/** An entry's cover: the match's cover, or the importer's thumbnail. */
export function entryCover(entry) {
  return entry.chosen?.cover_url ?? entry.chosen?.thumbnail_url ?? null
}

/** The owner's local calendar day, as the status route takes it. */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const SITTING_STARTED = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Denver',
})

/** When a sitting began, as "Nov 11, 7:42 PM" in the owner's Denver time. */
export function startedAt(when) {
  return SITTING_STARTED.format(new Date(when))
}

/** A default name for a new sitting: its kind and when it began. */
export function sittingLabel(kind, now = new Date()) {
  return `${kind.label} · ${startedAt(now)}`
}

/**
 * The fields a form holds, as the API takes them: blanks left out, text
 * trimmed, a number field as a number. Select values stay strings; the
 * server reads "3" as 3 where a field is a number.
 *
 * @param {Array<{key: string, control: string}>} fields
 * @param {Record<string, unknown>} values
 */
export function fieldPayload(fields, values) {
  const payload = {}
  for (const field of fields) {
    const raw = values[field.key]
    if (raw == null) continue
    const text = String(raw).trim()
    if (text === '') continue
    payload[field.key] = field.control === 'number' ? Number(text) : text
  }
  return payload
}

/**
 * What the add bar says about one source's answer, or null when it
 * answered (`GET /api/intake/search`'s `sources`).
 *
 * @param {{state: string, reason: string|null}} source
 * @param {{label: string}} kind
 */
export function sourceWords(source, kind) {
  if (source.state === 'not_configured') {
    return `${kind.label} search is off: ${source.reason}`
  }
  if (source.state === 'busy') return `${kind.label}: ${source.reason}`
  if (source.state === 'failed') {
    return `${kind.label} search failed: ${source.reason}`
  }
  return null
}

/**
 * Whether Clothes · Check asks about a piece: the tag queue gave up on it
 * (untagged, never saved by hand, out of attempts). A piece still queued
 * waits for Tag now or the nightly instead.
 */
export function garmentNeedsCheck(garment) {
  return (
    garment.status === 'untagged' &&
    garment.tag_source == null &&
    garment.tag_attempts >= MAX_ATTEMPTS
  )
}

/** The labels of the fields a record leaves empty, in field order. */
export function missingFields(fields, record) {
  return fields
    .filter((field) => record[field.key] == null || record[field.key] === '')
    .map((field) => field.label)
}

/**
 * The extra words after a comic's `Title (year)`: "Image · 66 issues". A
 * result without a publisher or count (every other source) yields nothing.
 *
 * @param {{publisher?: string|null, issue_count?: number|null}} result
 * @returns {string[]}
 */
export function comicDetails(result) {
  const count = result.issue_count
  return [
    result.publisher,
    Number.isInteger(count) && count >= 0
      ? `${count} ${count === 1 ? 'issue' : 'issues'}`
      : null,
  ].filter(Boolean)
}
