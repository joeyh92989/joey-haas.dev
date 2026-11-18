import { vi } from 'vitest'

/**
 * A faithful in-memory fake of the intake routes the paste way calls
 * (backend/intake/place_paste.py, routes.py, commit.py): sittings, paste,
 * resolve, pick, PATCH, commit, list, read and delete. It keeps the
 * server's rules: entry states and notes, the 200-line paste cap, duplicate
 * lines, one search per resolve, two failed searches make a check entry,
 * a 409 while another call holds the entry, a pick that copies the stored
 * candidate, ready needing a position and a name, commit writing only the
 * ready entries and keeping check and reading ones, deleting the sitting
 * when none is kept.
 */

const json = (body, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })

/** A stable number for a name, so every name has its own OSM id. */
const idOf = (name) =>
  [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1000003, 7)

/** A search row as the server builds it (`place_kind.row_for`). */
export const hit = (name, extra = {}) => ({
  kind: 'place',
  external_source: 'osm',
  external_id: `way/${idOf(name)}`,
  source_id: `way/${idOf(name)}`,
  title: name,
  address: `${name.length} Main St, Denver`,
  lat: 39.7 + (idOf(name) % 1000) / 10000,
  lng: -104.9,
  category: 'Park',
  map_url: null,
  owned_spot_id: null,
  attribution: 'OSM',
  ...extra,
})

/** Metres between two points (flat earth is enough at 75 m). */
const metres = (a, b) =>
  Math.hypot(
    (a.lat - b.lat) * 111000,
    (a.lng - b.lng) * 111000 * Math.cos((b.lat * Math.PI) / 180),
  )

const key = (text) => text.trim().replace(/\s+/g, ' ').toLowerCase()
const SHORT = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co)\//i

/** What a pasted line makes, as `place_paste.entry_for_line` decides. */
function entryFor(line) {
  const base = {
    city: 'denver',
    tags: [],
    blurb: null,
    is_public: false,
    source_line: line.slice(0, 300),
  }
  if (SHORT.test(line)) {
    return {
      state: 'check',
      payload: {
        ...base,
        name: 'Short link from maps.app.goo.gl',
        note: 'This short link could not be read.',
      },
    }
  }
  const google = line.match(
    /google\.com\/maps\/place\/([^/@]+)\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
  )
  if (google) {
    return {
      state: 'ready',
      payload: {
        ...base,
        name: decodeURIComponent(google[1].replace(/\+/g, ' ')),
        lat: Number(google[2]),
        lng: Number(google[3]),
      },
    }
  }
  const osm = line.match(
    /openstreetmap\.org\/.*mlat=(-?[\d.]+)&mlon=(-?[\d.]+)/,
  )
  if (osm) {
    return {
      state: 'check',
      payload: {
        ...base,
        name: `Place at ${osm[1]}, ${osm[2]}`,
        lat: Number(osm[1]),
        lng: Number(osm[2]),
        note: 'This place needs a name.',
      },
    }
  }
  if (line.length > 300) {
    return {
      state: 'check',
      payload: {
        ...base,
        name: line.slice(0, 200),
        note: 'This line is too long',
      },
    }
  }
  return { state: 'reading', payload: { ...base, name: line, attempts: 0 } }
}

/**
 * @param {object} [options]
 * @param {Record<string, object[]>} [options.world] Search hits by lower-case
 *   name; a name not listed is found as one place.
 * @param {Record<string, number>} [options.fails] Name -> how many searches
 *   fail first (a failed search, or `net` for a dropped connection).
 * @param {Record<string, number>} [options.busy] Entry name -> how many
 *   resolves answer 409 "being looked up" first.
 * @param {string[]} [options.netFail] Names whose resolve always fails at the
 *   network (status 0).
 * @param {(entry: object) => Promise<void>} [options.hold] Awaited inside a
 *   resolve, so a test can keep one in flight.
 * @param {object[]} [options.spots] Saved spots (`source_id`).
 * @param {string} [options.refuse] A 422 message for the next commits.
 * @param {Array<{id: string, entries: object[]}>} [options.sittings]
 */
export function fakePaste(options = {}) {
  const {
    world = {},
    fails = {},
    busy = {},
    netFail = [],
    hold,
    spots = [],
    refuse = null,
    nothing = false,
  } = options
  const calls = []
  const sittings = new Map()
  let sittingN = 0
  let entryN = 0
  let spotN = spots.length
  let inflight = 0
  const stats = { maxInflight: 0, resolves: [] }
  const failsLeft = { ...fails }
  const busyLeft = { ...busy }

  for (const given of options.sittings ?? []) {
    sittings.set(given.id, {
      id: given.id,
      area: 'places',
      kind: 'place',
      label: 'Earlier',
      entries: given.entries,
      updated: ++sittingN,
    })
  }

  const entryJson = (e) => ({
    id: e.id,
    photo_id: null,
    kind: 'place',
    state: e.state,
    payload: e.payload,
    candidates: [],
    chosen: e.chosen ?? null,
    garment_id: null,
    on_shelf: null,
  })

  const findEntry = (id) => {
    for (const s of sittings.values()) {
      const entry = s.entries.find((e) => e.id === id)
      if (entry) return { entry, sitting: s }
    }
    return null
  }

  /** The entry a hit makes (`place_paste._apply_choice`). */
  function apply(entry, sitting, row) {
    const payload = { ...entry.payload }
    delete payload.candidates
    delete payload.note
    const searched = payload.name
    payload.name = row.title
    payload.lat = row.lat
    payload.lng = row.lng
    if (searched) payload.searched_as = searched
    entry.chosen = {
      source: 'osm',
      source_id: row.source_id,
      title: row.title,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
    }
    if (
      row.owned_spot_id ||
      spots.some((spot) => spot.source_id === row.source_id)
    ) {
      entry.state = 'owned'
      payload.note = 'Already on your list'
    } else if (
      sitting.entries.some(
        (other) => other !== entry && other.chosen?.source_id === row.source_id,
      )
    ) {
      entry.state = 'ignored'
      payload.note = 'same place as another line'
    } else entry.state = 'ready'
    entry.payload = payload
  }

  async function resolve(id) {
    const found = findEntry(id)
    if (!found) return json({ detail: 'No such entry' }, 404)
    const { entry, sitting } = found
    inflight += 1
    stats.maxInflight = Math.max(stats.maxInflight, inflight)
    try {
      if (!['reading', 'check'].includes(entry.state)) {
        return json(
          {
            detail: 'Only a place that is waiting or to check can be looked up',
          },
          409,
        )
      }
      const name = entry.payload.name
      if (busyLeft[key(name)] > 0) {
        busyLeft[key(name)] -= 1
        return json({ detail: 'This place is being looked up' }, 409)
      }
      stats.resolves.push(name)
      if (hold) await hold(entry)
      if (netFail.includes(key(name)))
        return Promise.reject(new TypeError('net'))
      const payload = { ...entry.payload }
      delete payload.candidates
      delete payload.note
      let attempts = entry.state === 'check' ? 0 : (payload.attempts ?? 0)
      if (failsLeft[key(name)] > 0) {
        failsLeft[key(name)] -= 1
        attempts += 1
        payload.attempts = attempts
        if (attempts >= 2) {
          entry.state = 'check'
          payload.note = 'The search did not answer.'
        } else {
          entry.state = 'reading'
          payload.note = 'The place search timed out.'
        }
        entry.payload = payload
      } else {
        payload.attempts = attempts
        entry.payload = payload
        const hits = world[key(name)] ?? [hit(name)]
        if (hits.length === 1 && Math.abs(hits[0].lat) > 90) {
          // `clean_chosen` refuses it: the entry is checked with the error.
          entry.state = 'check'
          entry.payload = {
            ...payload,
            note: 'The latitude must be between -90 and 90',
          }
        } else if (hits.length === 1) apply(entry, sitting, hits[0])
        else if (hits.length > 1) {
          entry.state = 'check'
          entry.payload = {
            ...payload,
            candidates: hits.slice(0, 5),
            note: `${hits.length} places found`,
          }
        } else {
          entry.state = 'check'
          entry.payload = {
            ...payload,
            note: 'No place found. Change the words and look again.',
          }
        }
      }
      sitting.updated = ++sittingN
      return json({
        ...entryJson(entry),
        remaining: sitting.entries.filter((e) => e.state === 'reading').length,
      })
    } finally {
      inflight -= 1
    }
  }

  function paste(sitting, text) {
    let raw = text.split('\n')
    if (raw.length && raw[raw.length - 1].trim() === '') raw.pop()
    const overLimit = Math.max(0, raw.length - 200)
    raw = raw.slice(0, 200)
    const held = new Set(
      sitting.entries.flatMap((e) => [
        key(e.payload.source_line ?? ''),
        key(e.payload.name ?? ''),
      ]),
    )
    let blank = 0
    let duplicates = 0
    const made = []
    for (const rawLine of raw) {
      const line = rawLine.trim().replace(/\s+/g, ' ')
      if (!line) {
        blank += 1
        continue
      }
      if (held.has(key(line))) {
        duplicates += 1
        continue
      }
      held.add(key(line))
      let { state, payload } = entryFor(line)
      // Saved already, by name within 75 m (`flag_owned` at paste).
      const owned =
        ['ready', 'check'].includes(state) && payload.lat != null
          ? spots.find(
              (spot) =>
                key(spot.name ?? '') === key(payload.name) &&
                spot.lat != null &&
                metres(spot, payload) <= 75,
            )
          : null
      if (owned) {
        state = 'owned'
        payload = {
          ...payload,
          owned_spot_id: owned.id,
          note: 'Already on your list',
        }
      }
      const entry = { id: `entry-${++entryN}`, state, payload, chosen: null }
      sitting.entries.push(entry)
      made.push(entry)
    }
    sitting.updated = ++sittingN
    return {
      entries: made.map(entryJson),
      added: made.length,
      blank,
      duplicates,
      over_limit: overLimit,
    }
  }

  function commit(sitting) {
    if (nothing) return json({ detail: 'Nothing to add' }, 409)
    const ready = sitting.entries.filter((e) => e.state === 'ready')
    const kept = sitting.entries.filter((e) =>
      ['check', 'reading'].includes(e.state),
    )
    if (kept.length === sitting.entries.length && kept.length) {
      return json({ detail: 'Nothing to add' }, 409)
    }
    if (refuse) {
      return json(
        {
          detail: '1 to fix before anything is added',
          refused: [{ message: refuse }],
        },
        422,
      )
    }
    const bad = ready.find(
      (e) => e.payload.is_public && e.payload.city !== 'denver',
    )
    if (bad) {
      return json(
        {
          detail: '1 to fix before anything is added',
          refused: [{ message: 'Only a Denver place can be public' }],
        },
        422,
      )
    }
    const fresh = ready.map((e) => {
      spotN += 1
      spots.push({ id: `spot-${spotN}`, name: e.payload.name, ...e.payload })
      return { id: `spot-${spotN}`, name: e.payload.name }
    })
    sitting.entries = kept
    if (!kept.length) sittings.delete(sitting.id)
    return json({
      added: fresh.length,
      spots_new: fresh,
      spots_owned: [],
      skipped_kept: kept.length,
      refused: [],
    })
  }

  function patch(entry, body) {
    if (body.payload) {
      const owner = {}
      for (const k of ['name', 'city', 'tags', 'blurb', 'is_public']) {
        if (k in body.payload) owner[k] = body.payload[k]
      }
      entry.payload = { ...entry.payload, ...owner }
    }
    if (body.state) {
      if (!['ready', 'check'].includes(body.state)) {
        return json(
          { detail: 'A place can only be marked ready or to check' },
          422,
        )
      }
      if (
        body.state === 'ready' &&
        !(Number.isFinite(entry.payload.lat) && entry.payload.name)
      ) {
        return json({ detail: 'This place has no coordinates yet' }, 422)
      }
      entry.state = body.state
    }
    return json(entryJson(entry))
  }

  const fetch = vi.fn((url, init = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body })
    if (url === '/api/intake/sittings?area=places') {
      const list = [...sittings.values()]
        .sort((a, b) => b.updated - a.updated)
        .map((s) => ({
          id: s.id,
          area: 'places',
          kind: 'place',
          label: s.label,
          step: 'add',
          photos: 0,
          photos_waiting: 0,
          entries: s.entries.reduce(
            (counts, e) => ({
              ...counts,
              [e.state]: (counts[e.state] ?? 0) + 1,
            }),
            {},
          ),
        }))
      return json(list)
    }
    if (url === '/api/intake/sittings' && method === 'POST') {
      const id = `sit-${++sittingN}`
      sittings.set(id, {
        id,
        area: 'places',
        kind: 'place',
        label: body.label,
        entries: [],
        updated: sittingN,
      })
      return json({ id }, 201)
    }
    const sit = url.match(
      /^\/api\/intake\/sittings\/([^/]+)(\/paste|\/commit)?$/,
    )
    if (sit) {
      const sitting = sittings.get(sit[1])
      if (!sitting) return json({ detail: 'No such sitting' }, 404)
      if (sit[2] === '/paste') return json(paste(sitting, body.text))
      if (sit[2] === '/commit') return commit(sitting)
      if (method === 'DELETE') {
        sittings.delete(sit[1])
        return Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.resolve(null),
        })
      }
      return json({
        id: sitting.id,
        area: 'places',
        kind: 'place',
        label: sitting.label,
        step: 'add',
        photos: [],
        entries: sitting.entries.map(entryJson),
      })
    }
    const ent = url.match(
      /^\/api\/intake\/entries\/([^/]+)(\/resolve|\/pick)?$/,
    )
    if (ent) {
      if (ent[2] === '/resolve') return resolve(ent[1])
      const found = findEntry(ent[1])
      if (!found) return json({ detail: 'No such entry' }, 404)
      const { entry, sitting } = found
      if (ent[2] === '/pick') {
        const row = entry.payload.candidates?.[body.index]
        if (entry.state !== 'check' || !row) {
          return json(
            { detail: 'Only a place to check with candidates can be picked' },
            422,
          )
        }
        apply(entry, sitting, row)
        return json(entryJson(entry))
      }
      if (method === 'PATCH') return patch(entry, body)
    }
    return json({ detail: 'Not found' }, 404)
  })

  return { fetch, calls, sittings, spots, stats }
}

/** The calls to one route, by method and a path fragment. */
export const callsTo = (calls, method, part) =>
  calls.filter((c) => c.method === method && c.url.includes(part))
