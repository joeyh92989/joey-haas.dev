/**
 * The owner's calls for a book (`comics_routes.py`, the admin volume editor).
 * Each returns the parsed body or throws a `VolumeError` whose `message` is
 * the API's own words and whose `fields` maps a 422's `loc` paths to
 * messages (`label`, `collects.2.series_name`, `collects.2.link.item_id`).
 */
import { apiFetch } from './api.js'

export class VolumeError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, string>} [fields]
   * @param {number} [status]
   */
  constructor(message, fields = {}, status = 0) {
    super(message)
    this.fields = fields
    this.status = status
  }
}

const base = '/api/comics'
const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** FastAPI's own "Value error, " prefix is noise to a person. */
const tidy = (msg) => String(msg).replace(/^Value error, /, '')

/**
 * A 422's `detail` list as `{ 'collects.2.series_name': 'Field required' }`.
 * The `body` segment is dropped; the rest of `loc` is joined with dots.
 * Anything without a `loc` is under `''`.
 *
 * @param {unknown} detail
 * @returns {Record<string, string>}
 */
export function fieldErrors(detail) {
  if (!Array.isArray(detail)) return {}
  const out = {}
  for (const entry of detail) {
    const loc = Array.isArray(entry?.loc) ? entry.loc : []
    const path = (loc[0] === 'body' ? loc.slice(1) : loc).join('.')
    if (!(path in out)) out[path] = tidy(entry?.msg ?? '')
  }
  return out
}

async function failure(response, fallback) {
  let body = null
  try {
    body = await response.json()
  } catch {
    // Not JSON; the fallback says enough.
  }
  const detail = body?.detail
  if (Array.isArray(detail)) {
    const fields = fieldErrors(detail)
    return new VolumeError(
      Object.values(fields)[0] || fallback,
      fields,
      response.status,
    )
  }
  return new VolumeError(
    typeof detail === 'string' ? detail : fallback,
    {},
    response.status,
  )
}

async function call(path, options, fallback) {
  let response
  try {
    response = await apiFetch(`${base}${path}`, options)
  } catch {
    throw new VolumeError(fallback)
  }
  if (!response.ok) throw await failure(response, fallback)
  return response.json()
}

const send = (method, body) => ({
  method,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
})

const enc = encodeURIComponent
const COPY_PARSE_FAILED = 'Couldn’t read the contents.'

/** A title's books, in line order. */
export const listVolumes = (itemId) =>
  call(`/${enc(itemId)}/volumes`, undefined, 'Couldn’t load the books.')

/** Adds a book by hand; the body is the fields (label, kind, line_number). */
export const createVolume = (itemId, fields) =>
  call(
    `/${enc(itemId)}/volumes`,
    send('POST', fields),
    'Couldn’t add that book.',
  )

export const getVolume = (volumeId) =>
  call(`/volumes/${enc(volumeId)}`, undefined, 'Couldn’t load this book.')

/** The whole book: fields, `owned`, `read` and the whole collects list. */
export const replaceVolume = (volumeId, body) =>
  call(
    `/volumes/${enc(volumeId)}`,
    send('PUT', body),
    'Couldn’t save that book.',
  )

/**
 * Reads the book's contents from its description and an optional pasted
 * reprint note. Answers `{entries_added, entries_replaced, used_model,
 * reason, collects}`; typed entries are never touched by the server.
 */
export const parseContents = (volumeId, note) =>
  call(
    `/volumes/${enc(volumeId)}/contents/parse`,
    send('POST', note ? { note } : {}),
    COPY_PARSE_FAILED,
  )

/** Owned and/or read, one write. */
export const markVolume = (volumeId, marks) =>
  call(
    `/volumes/${enc(volumeId)}`,
    send('PATCH', marks),
    'Couldn’t save that mark.',
  )

export const moveVolume = (volumeId, itemId) =>
  call(
    `/volumes/${enc(volumeId)}/move`,
    send('POST', { item_id: itemId }),
    'Couldn’t move that book.',
  )

export const deleteVolume = (volumeId) =>
  call(
    `/volumes/${enc(volumeId)}`,
    { method: 'DELETE' },
    'Couldn’t delete that book.',
  )

/** The preview response, for ShelfConfirm's loader. */
export const deletePreviewResponse = (volumeId) =>
  apiFetch(`${base}/volumes/${enc(volumeId)}/delete-preview`)

/** The editable fields of a saved book, as form state (nulls are ''). */
export function toFacts(volume) {
  return {
    label: volume.label ?? '',
    kind: volume.kind ?? 'trade',
    line_number: volume.line_number ?? '',
    pages: volume.pages ?? '',
    isbn: volume.isbn ?? '',
    description: volume.description ?? '',
  }
}

const numberOrNull = (value) => (value === '' ? null : Number(value))
const textOrNull = (value) => (value.trim() === '' ? null : value)

/** The facts form as the API wants it (`VolumeFieldsIn`). */
export function factsPayload(facts) {
  return {
    label: facts.label,
    kind: facts.kind,
    line_number: numberOrNull(facts.line_number),
    pages: numberOrNull(facts.pages),
    isbn: textOrNull(facts.isbn),
    description: textOrNull(facts.description),
  }
}

/**
 * A stored entry as the PUT wants it: its id (so an unchanged entry keeps its
 * source) and its link when both bounds are there. An entry linked to a title
 * with no bounds cannot be sent as a link, so it goes as text.
 *
 * @param {object} entry A `CollectOut`.
 */
export function collectBody(entry) {
  const link = entry.link
  return {
    id: entry.id,
    series_name: entry.series_name,
    issue_text: entry.issue_text,
    link:
      link && link.from_number != null && link.to_number != null
        ? {
            item_id: link.item_id,
            from_number: link.from_number,
            to_number: link.to_number,
          }
        : null,
  }
}

/** The PUT body: the saved facts and marks with a given collects list. */
export function replaceBody(volume, collects, facts = toFacts(volume)) {
  return {
    ...factsPayload(facts),
    owned: volume.owned,
    read: volume.read,
    collects,
  }
}

/**
 * An edit form's draft entry as a collects item. `id` is kept when the entry
 * exists; blank link fields mean no link.
 *
 * @param {{series_name: string, issue_text: string, item_id: string, from: string, to: string}} draft
 * @param {string} [id]
 */
export function draftBody(draft, id) {
  const linked = draft.item_id !== ''
  return {
    ...(id ? { id } : {}),
    series_name: draft.series_name,
    issue_text: draft.issue_text,
    link: linked
      ? {
          item_id: draft.item_id,
          from_number: Number(draft.from),
          to_number: Number(draft.to),
        }
      : null,
  }
}

/** The admin address of a book. */
export const adminVolumePath = (itemId, slug) =>
  `/admin/shelf/comics/${enc(itemId)}/${enc(slug)}`
