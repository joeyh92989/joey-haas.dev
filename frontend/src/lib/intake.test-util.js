import { vi } from 'vitest'

/**
 * Test fixtures for intake's pages: the kinds as `GET /api/intake/kinds`
 * serves them, and a fake of the sittings API that keeps its state in
 * memory, so a page test can walk a sitting from Shoot to Done and assert
 * what was sent.
 */

const field = (key, label, control, extra = {}) => ({
  key,
  label,
  control,
  options: [],
  per_item: false,
  required: false,
  ...extra,
})

const STATUS = field('status', 'Status', 'select', {
  options: ['backlog', 'active', 'paused', 'finished', 'abandoned'],
})
const ACQUIRED = field('acquired_at', 'Acquired', 'date')

/** The shelf's and closet's kinds, as the registry serves them. */
export const KINDS = [
  {
    key: 'game',
    area: 'shelf',
    label: 'Game',
    ways_in: ['photo', 'search', 'type'],
    has_details: true,
    source_state: 'ready',
    fields: [
      field('platform_id', 'Platform', 'select', { options: ['130', '508'] }),
      field('physical_format', 'Format', 'select', {
        options: ['game_card', 'game_key_card', 'code_in_box', 'disc'],
      }),
      STATUS,
      ACQUIRED,
    ],
  },
  {
    key: 'movie',
    area: 'shelf',
    label: 'Movie',
    ways_in: ['photo', 'search', 'type'],
    has_details: true,
    source_state: 'ready',
    fields: [
      field('disc_format', 'Disc', 'select', {
        options: ['dvd', 'bluray', 'uhd'],
      }),
      STATUS,
      ACQUIRED,
    ],
  },
  {
    key: 'comic',
    area: 'shelf',
    label: 'Comic',
    ways_in: ['photo', 'search', 'type'],
    has_details: true,
    source_state: 'ready',
    fields: [
      field('issues_owned', 'Issues owned', 'text', { per_item: true }),
      field('shelf_format', 'Shelf format', 'select', {
        options: ['singles', 'trades', 'omnibus'],
      }),
      STATUS,
      ACQUIRED,
    ],
  },
  {
    key: 'boardgame',
    area: 'shelf',
    label: 'Board game',
    ways_in: ['type'],
    has_details: true,
    source_state: 'Needs a BoardGameGeek key; added by typing for now.',
    fields: [STATUS, ACQUIRED],
  },
  {
    key: 'garment',
    area: 'closet',
    label: 'Garment',
    ways_in: ['photo', 'type'],
    has_details: false,
    source_state: null,
    fields: [field('name', 'Name', 'text')],
  },
]

/** A candidate as the importer stores it. */
export function candidate(id, title, year = 2012) {
  return {
    external_source: 'comicvine',
    external_id: String(id),
    title,
    year,
    thumbnail_url: null,
  }
}

/** An entry as the API serves it. */
export function entry(id, state, extra = {}) {
  return {
    id,
    photo_id: null,
    kind: 'comic',
    state,
    payload: {},
    candidates: [],
    chosen: null,
    garment_id: null,
    ...extra,
  }
}

/** A photo as the API serves it. */
export function photo(id, state, extra = {}) {
  return { id, state, filename: `${id}.jpg`, error: null, ...extra }
}

// A copy, as a real response is: the page must never share the fake's arrays.
const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => structuredClone(body),
})

/**
 * Stubs `fetch` with an in-memory intake API.
 *
 * @param {object} options
 * @param {Array<object>} [options.sittings] Full sittings (photos, entries).
 * @param {{remaining: number, enforced: boolean}} [options.budget]
 * @param {Array<(photo: object) => {status: string, entries?: object[],
 *   error?: string}>} [options.reads] What each read-next does to the
 *   oldest uploaded photo, in turn; a read with no script reads nothing.
 * @param {(sitting: object) => {status: number, body: object}} [options.commit]
 * @param {(area: string, query: string) => {results: object[],
 *   sources: object[]}} [options.search] The add bar's search answer.
 * @param {(body: object) => {status: number, body: object}} [options.add]
 *   `POST /api/intake/add`'s answer; by default one item added.
 * @param {Array<object>} [options.garments] The Closet's garments.
 * @returns {{fetch: import('vitest').Mock, state: object, calls: (method:
 *   string, pattern: RegExp) => Array<{url: string, body: unknown}>}}
 */
export function fakeIntakeApi({
  sittings = [],
  budget = { remaining: 30, enforced: true },
  reads = [],
  commit,
  search = () => ({ results: [], sources: [] }),
  add,
  garments = [],
} = {}) {
  const state = {
    garments: structuredClone(garments),
    sittings: Object.fromEntries(
      sittings.map((s) => [
        s.id,
        { photos: [], entries: [], step: null, label: null, ...s },
      ]),
    ),
    budget,
    reads: [...reads],
  }
  let next = 0
  const log = []

  const listRow = (s) => {
    const entries = {}
    for (const e of s.entries) entries[e.state] = (entries[e.state] ?? 0) + 1
    return {
      id: s.id,
      area: s.area,
      kind: s.kind,
      label: s.label,
      step: s.step,
      photos: s.photos.length,
      photos_waiting: s.photos.filter((p) =>
        ['uploaded', 'reading'].includes(p.state),
      ).length,
      entries,
      updated_at: '2026-11-10T19:42:00Z',
    }
  }

  const findEntry = (id) => {
    for (const s of Object.values(state.sittings)) {
      const found = s.entries.find((e) => e.id === id)
      if (found) return found
    }
    return null
  }

  const findPhoto = (id) => {
    for (const s of Object.values(state.sittings)) {
      const found = s.photos.find((p) => p.id === id)
      if (found) return found
    }
    return null
  }

  const fetch = vi.fn(async (url, options = {}) => {
    const method = (options.method ?? 'GET').toUpperCase()
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    let body = options.body
    if (typeof body === 'string') body = JSON.parse(body)
    log.push({ method, url: path, body })
    let m

    if (path.endsWith('/api/auth/me')) {
      return json(200, { email: 'admin@example.com' })
    }
    if (path === '/api/intake/kinds') return json(200, KINDS)
    if ((m = path.match(/^\/api\/intake\/search\?area=(\w+)&query=(.*)$/))) {
      return json(200, search(m[1], decodeURIComponent(m[2])))
    }
    if (path === '/api/intake/add' && method === 'POST') {
      if (add) {
        const answer = add(body)
        return json(answer.status, answer.body)
      }
      return json(201, {
        added: 1,
        already_owned: 0,
        issues_added: 0,
        created: body.kind === 'garment' ? [] : ['item-new'],
        garment_id: body.kind === 'garment' ? 'garment-new' : null,
      })
    }
    if ((m = path.match(/^\/api\/intake\/entries\/([\w-]+)\/tag-again$/))) {
      const found = findEntry(m[1])
      const garment = state.garments.find((g) => g.id === found.garment_id)
      garment.tag_attempts = 0
      return json(200, found)
    }
    if (path === '/api/closet/garments') {
      const counts = { total: state.garments.length }
      for (const g of state.garments)
        counts[g.status] = (counts[g.status] ?? 0) + 1
      return json(200, { garments: state.garments, counts })
    }
    if ((m = path.match(/^\/api\/closet\/garments\/([\w-]+)$/))) {
      const index = state.garments.findIndex((g) => g.id === m[1])
      if (method === 'DELETE') {
        state.garments.splice(index, 1)
        for (const s of Object.values(state.sittings)) {
          s.entries = s.entries.filter((e) => e.garment_id !== m[1])
        }
        return { ok: true, status: 204, json: async () => null }
      }
      if (method === 'PATCH') {
        Object.assign(state.garments[index], body, {
          tag_source: 'manual',
          status: 'active',
        })
      }
      return json(200, state.garments[index])
    }
    if (path === '/api/closet/tag' && method === 'POST') {
      return json(200, { tagged: 0, calls: 1, note: null, remaining: 1 })
    }
    if (path === '/api/intake/budget') {
      return json(200, { ...state.budget, resets_at: '2026-11-11T08:00:00Z' })
    }
    if (path === '/api/intake/counts') {
      const counts = { shelf: 0, closet: 0 }
      for (const s of Object.values(state.sittings)) {
        counts[s.area] += s.entries.filter((e) => e.state === 'check').length
      }
      return json(200, counts)
    }
    if ((m = path.match(/^\/api\/intake\/sittings\?area=(\w+)$/))) {
      return json(
        200,
        Object.values(state.sittings)
          .filter((s) => s.area === m[1])
          .map(listRow),
      )
    }
    if (path === '/api/intake/sittings' && method === 'POST') {
      const id = `new-${++next}`
      state.sittings[id] = {
        id,
        area: body.area,
        kind: body.kind ?? null,
        label: body.label ?? null,
        step: null,
        photos: [],
        entries: [],
      }
      return json(201, state.sittings[id])
    }
    if ((m = path.match(/^\/api\/intake\/sittings\/([\w-]+)$/))) {
      const sitting = state.sittings[m[1]]
      if (!sitting) return json(404, { detail: 'No such sitting' })
      if (method === 'DELETE') {
        delete state.sittings[m[1]]
        return { ok: true, status: 204, json: async () => null }
      }
      if (method === 'PATCH') Object.assign(sitting, body)
      return json(200, sitting)
    }
    if ((m = path.match(/^\/api\/intake\/sittings\/([\w-]+)\/entries$/))) {
      const sitting = state.sittings[m[1]]
      const added = entry(`t${++next}`, body.chosen ? 'ready' : 'typed', {
        kind: body.kind,
        payload: body.payload ?? {},
        chosen: body.chosen ?? null,
      })
      sitting.entries.push(added)
      return json(201, added)
    }
    if ((m = path.match(/^\/api\/intake\/sittings\/([\w-]+)\/photos$/))) {
      const sitting = state.sittings[m[1]]
      const file = options.body.get('photo')
      const added =
        sitting.area === 'closet'
          ? photo(`p${++next}`, 'read', { filename: file.name })
          : photo(`p${++next}`, 'uploaded', { filename: file.name })
      sitting.photos.push(added)
      if (sitting.area === 'closet') {
        sitting.entries.push(
          entry(`g${next}`, 'ready', {
            kind: 'garment',
            photo_id: added.id,
            garment_id: `garment-${next}`,
          }),
        )
      }
      return json(201, added)
    }
    if (
      (m = path.match(
        /^\/api\/intake\/sittings\/([\w-]+)\/photos\/([\w-]+)$/,
      )) &&
      method === 'DELETE'
    ) {
      const sitting = state.sittings[m[1]]
      if (!sitting) {
        return json(409, {
          detail:
            'This sitting has already been added or discarded, perhaps on another device.',
        })
      }
      if (!sitting.photos.some((p) => p.id === m[2])) {
        return json(404, { detail: 'No such photo' })
      }
      const dropped = sitting.entries.filter((e) => e.photo_id === m[2])
      state.garments = state.garments.filter(
        (g) => !dropped.some((e) => e.garment_id === g.id),
      )
      sitting.photos = sitting.photos.filter((p) => p.id !== m[2])
      sitting.entries = sitting.entries.filter((e) => e.photo_id !== m[2])
      return { ok: true, status: 204, json: async () => null }
    }
    if ((m = path.match(/^\/api\/intake\/sittings\/([\w-]+)\/read-next$/))) {
      const sitting = state.sittings[m[1]]
      const waiting = sitting.photos.find((p) => p.state === 'uploaded')
      if (!waiting)
        return json(200, { status: 'idle', photo: null, entries: [] })
      if (state.budget.enforced && state.budget.remaining <= 0) {
        return json(200, { status: 'waiting', photo: null, entries: [] })
      }
      const script = state.reads.shift() ?? (() => ({ status: 'empty' }))
      const outcome = script(waiting)
      const entries = (outcome.entries ?? []).map((e) => ({
        ...e,
        photo_id: waiting.id,
      }))
      waiting.state =
        outcome.status === 'read'
          ? 'read'
          : outcome.status === 'failed'
            ? 'failed'
            : 'empty'
      waiting.error = outcome.error ?? null
      sitting.entries.push(...entries)
      return json(200, { status: outcome.status, photo: waiting, entries })
    }
    if ((m = path.match(/^\/api\/intake\/photos\/([\w-]+)\/retry$/))) {
      const found = findPhoto(m[1])
      found.state = 'uploaded'
      found.error = null
      return json(200, found)
    }
    if ((m = path.match(/^\/api\/intake\/entries\/([\w-]+)$/))) {
      const found = findEntry(m[1])
      Object.assign(found, body)
      return json(200, found)
    }
    if ((m = path.match(/^\/api\/intake\/sittings\/([\w-]+)\/commit$/))) {
      const sitting = state.sittings[m[1]]
      if (!sitting) {
        return json(409, {
          detail:
            'This sitting has already been added or discarded, perhaps on another device.',
        })
      }
      if (commit) {
        const answer = commit(sitting)
        return json(answer.status, answer.body)
      }
      const written = sitting.entries.filter((e) =>
        ['exact', 'ready', 'typed'].includes(e.state),
      )
      const kept = sitting.entries.filter((e) =>
        ['check', 'probable', 'reading'].includes(e.state),
      )
      const answer = {
        added: written.length,
        already_owned: sitting.entries.filter((e) => e.state === 'owned')
          .length,
        issues_added: 0,
        skipped_kept: kept.length,
        photos_empty: sitting.photos.filter((p) => p.state === 'empty').length,
        photos_waiting: 0,
        refused: [],
        created: written.map((e) => `item-${e.id}`),
      }
      if (kept.length) sitting.entries = kept
      else delete state.sittings[m[1]]
      return json(200, answer)
    }
    if (path === '/api/items/visibility') {
      return json(200, { updated: body.ids.length })
    }
    return json(404, { detail: `unexpected ${method} ${path}` })
  })
  vi.stubGlobal('fetch', fetch)

  return {
    fetch,
    state,
    calls: (method, pattern) =>
      log.filter((call) => call.method === method && pattern.test(call.url)),
  }
}
