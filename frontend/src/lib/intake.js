/**
 * Intake's client half (spec: docs/planning/2026-11-10-intake-design.md).
 * Pure helpers and the few constants the Add page and a sitting share; the
 * kinds and their fields always come from `GET /api/intake/kinds`, never
 * from here, so a kind or field added on the server needs nothing new.
 */
import { FORMAT_OPTIONS, PLATFORM_OPTIONS } from '../components/ItemForm.jsx'
import { MAX_PHOTO_BYTES, PHOTO_ACCEPT } from './closet.js'
import { STATUS_LABEL } from './shelf.js'

/**
 * Words for option values the site already names elsewhere. Presentation
 * only: a value missing here is still offered, in words made from itself.
 */
const OPTION_WORDS = {
  platform_id: Object.fromEntries(
    PLATFORM_OPTIONS.map(([id, name]) => [String(id), name]),
  ),
  physical_format: Object.fromEntries(FORMAT_OPTIONS),
  status: STATUS_LABEL,
  shelf_format: {
    singles: 'Single issues',
    trades: 'Trade paperbacks',
    omnibus: 'Omnibus',
  },
  disc_format: { dvd: 'DVD', bluray: 'Blu-ray', uhd: '4K UHD' },
}

/** An option value in words: the site's own name, or the value made readable. */
export function optionLabel(fieldKey, value) {
  const known = OPTION_WORDS[fieldKey]?.[String(value)]
  if (known) return known
  const words = String(value).replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Entry states written by a commit (intake/commit.py). */
export const WRITTEN_STATES = ['exact', 'probable', 'ready', 'typed']

/** The skim grid's states: trusted matches, and what is already owned. */
export const SKIM_STATES = ['exact', 'probable', 'owned']

/**
 * A listed sitting's meter: ready (written at commit), to check, and still
 * reading (entries whose source was busy plus photos not yet read), and
 * the titles already on the shelf.
 *
 * @param {{entries?: Record<string, number>, photos_waiting?: number}} sitting
 */
export function meterCounts(sitting) {
  const entries = sitting.entries ?? {}
  const count = (state) => entries[state] ?? 0
  return {
    ready: WRITTEN_STATES.reduce((sum, state) => sum + count(state), 0),
    check: count('check'),
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

/** The page an area's committed things show on. */
export function shelfPath(area) {
  return area === 'closet' ? '/admin/closet' : '/admin/collection'
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
