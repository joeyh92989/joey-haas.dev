/**
 * The Closet's pure helpers: labels, the season window, the tile's stat line
 * and the page's filter. No fetches and no React, so each is tested alone.
 */
import { API_URL } from './api.js'

/** The grid/list choice, under the admin namespace like the shelf's own. */
export const VIEW_PREF = 'shelf.admin.closet.view'

/** A rack from the phone, one request: `MAX_UPLOAD_PHOTOS` in closet_routes. */
export const MAX_UPLOAD_PHOTOS = 24

/**
 * One photo's byte cap, checked before uploading: `MAX_PHOTO_BYTES` in
 * backend/closet_images.py is the authority (a 413 past it).
 */
export const MAX_PHOTO_BYTES = 14 * 1024 * 1024

/** What ＋ Camera offers: the formats the upload route accepts. */
export const PHOTO_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif'

/** The first file over the byte cap, as the owner's sentence, or null. */
export function oversizePhoto(files) {
  const big = files.find((file) => file.size > MAX_PHOTO_BYTES)
  if (!big) return null
  const cap = MAX_PHOTO_BYTES / (1024 * 1024)
  return `${big.name} is too large: at most ${cap} MB a photo.`
}

/** The garment slots, in the order the form and the chips show them. */
export const CATEGORIES = [
  { value: 'top', label: 'Top', plural: 'Tops' },
  { value: 'mid', label: 'Mid', plural: 'Mids' },
  { value: 'outer', label: 'Outer', plural: 'Outer' },
  { value: 'bottom', label: 'Bottom', plural: 'Bottoms' },
  { value: 'shoes', label: 'Shoes', plural: 'Shoes' },
  { value: 'accessory', label: 'Accessory', plural: 'Accessories' },
]

/** The statuses, in chip order. `untagged` is the upload's, never chosen. */
export const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'packed', label: 'Packed' },
  { value: 'untagged', label: 'Untagged' },
  { value: 'listed', label: 'Listed' },
  { value: 'gone', label: 'Gone' },
]

/** What a hand save may set (`HAND_STATUSES` in closet_routes). */
export const HAND_STATUSES = STATUSES.filter((s) => s.value !== 'untagged')

/** Warm and Smart: the attribute chips, 4 or 5 on their 1–5 scale. */
export const HIGH = 4

/** The tag queue gives a garment up after this many unusable answers. */
export const MAX_ATTEMPTS = 3

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** A month number, 1 to 12, as its short name. */
export function monthName(month) {
  return MONTHS[month - 1]
}

/**
 * A garment's months as a window: "Oct–Mar" across the new year, runs
 * joined with commas, "all year" for every month, null for none.
 *
 * @param {number[]} seasons Months, 1 to 12.
 */
export function seasonLabel(seasons) {
  const months = new Set((seasons ?? []).filter((m) => m >= 1 && m <= 12))
  if (months.size === 0) return null
  if (months.size === 12) return 'all year'
  const next = (m) => (m % 12) + 1
  const prev = (m) => ((m + 10) % 12) + 1
  const runs = []
  for (let m = 1; m <= 12; m += 1) {
    if (!months.has(m) || months.has(prev(m))) continue
    let end = m
    while (months.has(next(end))) end = next(end)
    runs.push(end === m ? monthName(m) : `${monthName(m)}–${monthName(end)}`)
  }
  return runs.join(', ')
}

/** A 'YYYY-MM-DD' day as "Nov 6", read in UTC like formatDate. */
export function shortDate(day) {
  return new Date(day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** The month a packed garment comes back, from `back_on` ("2027-05-01"). */
export function backMonth(backOn) {
  if (!backOn) return null
  const month = Number(backOn.slice(5, 7))
  return month >= 1 && month <= 12 ? monthName(month) : null
}

/** The slot's label, or null for a garment not yet given one. */
export function categoryLabel(category) {
  return CATEGORIES.find((c) => c.value === category)?.label ?? null
}

/** The garment's name, or what stands in for one before it has details. */
export function garmentTitle(garment) {
  if (garment.name) return garment.name
  return garment.status === 'untagged' ? 'Untagged · add details' : 'Unnamed'
}

/**
 * The tile's one stat line: the queue position story for an untagged
 * garment, the return month for a packed one, else wears and the season.
 */
export function statLine(garment) {
  if (garment.status === 'untagged') {
    if (garment.tag_source === 'manual') return 'Add details by hand'
    if (garment.tag_attempts >= MAX_ATTEMPTS)
      return 'Tagging gave up · add by hand'
    return 'In the tag queue'
  }
  if (garment.status === 'packed') {
    const month = backMonth(garment.back_on)
    return month ? `Packed · back in ${month}` : 'Packed'
  }
  if (garment.status === 'listed') return 'Listed for sale'
  if (garment.status === 'gone') return 'Gone'
  const worn = `Worn ${garment.wears_12mo}×`
  const window = seasonLabel(garment.seasons)
  return window && window !== 'all year' ? `${worn} · ${window}` : worn
}

/** The photo's URL on the API, or null for a garment without one. */
export function imageUrl(garment) {
  return garment.image ? `${API_URL}${garment.image}` : null
}

/** The default filter: Active pressed, nothing else. */
export const DEFAULT_FILTER = {
  status: 'active',
  category: null,
  warm: false,
  smart: false,
}

/** The garments the filter keeps, in the order given. */
export function filterGarments(garments, filter) {
  return garments.filter(
    (g) =>
      (!filter.status || g.status === filter.status) &&
      (!filter.category || g.category === filter.category) &&
      (!filter.warm || (g.warmth ?? 0) >= HIGH) &&
      (!filter.smart || (g.formality ?? 0) >= HIGH),
  )
}

/** The chips' counts, each from the whole closet as the shelf's are. */
export function chipCounts(garments) {
  const count = (test) => garments.filter(test).length
  return {
    status: Object.fromEntries(
      STATUSES.map((s) => [s.value, count((g) => g.status === s.value)]),
    ),
    category: Object.fromEntries(
      CATEGORIES.map((c) => [c.value, count((g) => g.category === c.value)]),
    ),
    warm: count((g) => (g.warmth ?? 0) >= HIGH),
    smart: count((g) => (g.formality ?? 0) >= HIGH),
  }
}

/** The header's subline: "143 pieces · 86 active · 41 packed · 16 untagged". */
export function countsLine(counts) {
  if (!counts) return null
  const parts = [`${counts.total} ${counts.total === 1 ? 'piece' : 'pieces'}`]
  for (const key of ['active', 'packed', 'untagged']) {
    if (counts[key]) parts.push(`${counts[key]} ${key}`)
  }
  return parts.join(' · ')
}

/**
 * `POST /api/closet/tag`'s answer in words: how many were tagged, what is
 * still queued, and the route's note when the model could not answer.
 *
 * @param {{tagged: number, calls: number, note: string|null, remaining: number}} body
 */
export function tagResult(body) {
  if (body.note) return body.note
  if (body.calls === 0) return 'nothing was waiting to be tagged'
  const queued =
    body.remaining > 0 ? `, ${body.remaining} still queued` : ', queue empty'
  return `${body.tagged} tagged${queued}`
}

/** A comma-separated line as its words, blanks dropped. */
export function splitWords(text) {
  return text
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean)
}

/** The profile form's state from `GET /api/closet/profile`. */
export function profileForm(body) {
  const keyed = (values, keys) =>
    Object.fromEntries(keys.map((key) => [key, values?.[key] ?? '']))
  return {
    sizes: keyed(
      body.sizes,
      CATEGORIES.map((c) => c.value),
    ),
    coloring: keyed(body.coloring, ['hair', 'skin', 'undertone']),
    build_fit: body.build_fit ?? '',
    style_words: (body.style_words ?? []).join(', '),
    dislikes: (body.dislikes ?? []).join(', '),
    weekly_occasions: [...body.weekly_occasions],
    weekly_bike: [...body.weekly_bike],
    spring_turn: body.spring_turn,
    autumn_turn: body.autumn_turn,
    repeat_top_days: String(body.repeat_top_days),
    repeat_outfit_weeks: String(body.repeat_outfit_weeks),
    tag_budget: String(body.tag_budget),
  }
}

/** A number field's value: blank is null (the route refuses it), never 0. */
function numberOrNull(value) {
  return String(value ?? '').trim() === '' ? null : Number(value)
}

/** The whole profile as one PATCH body; the route drops blank sizes. */
export function profileBody(form) {
  return {
    ...form,
    build_fit: form.build_fit.trim() || null,
    style_words: splitWords(form.style_words),
    dislikes: splitWords(form.dislikes),
    repeat_top_days: numberOrNull(form.repeat_top_days),
    repeat_outfit_weeks: numberOrNull(form.repeat_outfit_weeks),
    tag_budget: numberOrNull(form.tag_budget),
  }
}

/** Today's occasion chips, in the order `OCCASIONS` in closet.py lists them. */
export const OCCASION_LABELS = {
  office: 'Office',
  wfh: 'WFH',
  date: 'Date',
  weekend: 'Weekend',
  travel: 'Travel',
  event: 'Event',
}

/** Not this…'s reason chips: `NOT_THIS` in closet_rank.py holds the keys. */
export const NOT_THIS_REASONS = [
  { value: 'too_warm', label: 'Too warm' },
  { value: 'too_cold', label: 'Too cold' },
  { value: 'too_formal', label: 'Too formal' },
  { value: 'too_casual', label: 'Too casual' },
  { value: 'not_together', label: 'Not those together' },
  { value: 'tired', label: 'Tired of it' },
  { value: 'other', label: 'Other' },
]

/** The owner's zone: plans are made for the day in Denver. */
const OWNER_ZONE = 'America/Denver'

/** A plan's day, 'YYYY-MM-DD', as "Monday, Nov 9". */
export function longDate(day) {
  return new Date(day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * When the plan was made, in words: "planned just now" after a re-plan,
 * "planned last night" for the nightly job's (made before the plan's day
 * began in Denver), else the time of day.
 */
export function plannedWords(plan, justNow) {
  if (justNow) return 'planned just now'
  if (!plan?.planned_at) return null
  const at = new Date(plan.planned_at)
  if (Number.isNaN(at.getTime())) return null
  const madeOn = at.toLocaleDateString('en-CA', { timeZone: OWNER_ZONE })
  if (madeOn < plan.day) return 'planned last night'
  const time = at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: OWNER_ZONE,
  })
  return `planned at ${time}`
}

/** The footnote: what the plan chose from, and when it was made. */
export function footnoteLine(plan, justNow) {
  const note = plan.footnote ?? {}
  const parts = [`${note.active ?? 0} active`, `${note.fit ?? 0} fit today`]
  if (note.skipped_recent) {
    parts.push(`${note.skipped_recent} skipped as worn this week`)
  }
  const words = plannedWords(plan, justNow)
  if (words) parts.push(words)
  return parts.join(' · ')
}

/**
 * An outfit with one slot's tile replaced by the owner's choice. Nothing is
 * re-ranked; the reason says so once per slot.
 */
export function swapTile(outfit, tile) {
  const note = `(you swapped the ${tile.slot})`
  const reason = outfit.reason ?? ''
  return {
    ...outfit,
    garments: outfit.garments.map((g) => (g.slot === tile.slot ? tile : g)),
    reason: reason.includes(note) ? reason : `${reason} ${note}`.trim(),
  }
}

/** The outfit as `POST /api/closet/wore` takes it. */
export function woreGarments(outfit) {
  return outfit.garments.map((g) => ({ slot: g.slot, id: g.id }))
}

/**
 * Whether today's recorded outfit (`worn.garments`) is `outfit`: the same
 * pieces in the same slots, in any order. A worn record without garments
 * matches nothing, so the page never claims an outfit it cannot see.
 */
export function sameOutfit(worn, outfit) {
  if (!worn?.garments || !outfit?.garments) return false
  const keys = (garments) => garments.map((g) => `${g.slot}:${g.id}`).sort()
  const a = keys(worn.garments)
  const b = keys(outfit.garments)
  return a.length === b.length && a.every((key, i) => key === b[i])
}

const TEMPLATE_NOTE = 'picked without the model'

/**
 * The line under an outfit. A template outfit keeps its reason -- it
 * carries "You locked the …" and the swap note -- and says it was picked
 * without the model.
 */
export function outfitReason(outfit) {
  const reason = (outfit.reason ?? '').trim()
  if (outfit.ranked_by !== 'template') return reason
  if (!reason) return TEMPLATE_NOTE
  if (/[.!?]$/.test(reason)) return `${reason} Picked without the model.`
  return `${reason} · ${TEMPLATE_NOTE}`
}
