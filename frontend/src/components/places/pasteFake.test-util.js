import { vi } from 'vitest'

/**
 * A faithful in-memory fake of the intake routes the paste way calls
 * (backend/intake/place_paste.py, routes.py, commit.py): sittings, paste,
 * resolve, pick, PATCH, commit, list, read and delete. It keeps the
 * server's rules: entry states and notes, the 200-line paste cap, duplicate
 * lines, one search per resolve, two failed searches make a check entry,
 * a 409 while another call holds the entry, a resolve from a check entry
 * dropping its old position and choice, a left-out place not blocking its
 * twin, links with nothing readable never searched, `g.co` as a short link,
 * a 404 for a sitting that is gone, a pick that copies the stored
 * candidate, ready needing a position and a name, commit writing only the
 * ready entries and keeping check and reading ones, deleting the sitting
 * when none is kept.
 *
 * Past outings (story #350): a paste with `outings: true` splits each line
 * into a place and a date as `outing_dates.py` does (the leftmost comma whose
 * rest reads as a date), stores `payload.outing` and serves `outing` on every
 * entry; a place already saved with an outing of the same period start and
 * precision is flagged `duplicate_of` and skipped; PATCH takes
 * `outing_date_text` (re-read here) and `outing_skip`, and ignores any
 * `visited_on` or `precision` sent; the commit refuses an unread date (422,
 * `refused` with the entry id, nothing written), skips what is skipped, and
 * answers `outings_new`.
 */

/** The id the server gives an entry (a UUID). */
export const entryId = (n) =>
  `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** The id the server gives a spot (a UUID). */
export const spotId = (n) =>
  `5b000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const MONTH_NAMES = Object.fromEntries(
  MONTHS.flatMap((name, at) => [
    [name, at + 1],
    [name.slice(0, 3), at + 1],
  ]),
)
const monthWord = (word) => MONTH_NAMES[word.replace(/\.$/, '')]
const pad = (n) => String(n).padStart(2, '0')
const LABEL_MONTHS = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1))

/** `outing_dates.read_date`, for the forms the tests use: ISO, a year, and
 *  English month names. `today` is the frozen owner's day (ISO text). */
export function readDate(text, today = '2026-11-19') {
  const words = String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
  if (!words || words.length > 40) return null
  let year
  let month
  let day = null
  let precision
  let m
  if ((m = words.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    ;[year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
    precision = 'day'
  } else if ((m = words.match(/^(\d{4})-(\d{2})$/))) {
    ;[year, month, precision] = [Number(m[1]), Number(m[2]), 'month']
  } else if (/^\d{4}$/.test(words)) {
    ;[year, month, precision] = [Number(words), 1, 'year']
  } else if (
    (m = words.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))
  ) {
    ;[year, month, day] = [Number(m[3]), monthWord(m[1]), Number(m[2])]
    precision = 'day'
  } else if (
    (m = words.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/))
  ) {
    ;[year, month, day] = [Number(m[3]), monthWord(m[2]), Number(m[1])]
    precision = 'day'
  } else if ((m = words.match(/^([a-z]+)\.?,?\s+(\d{4})$/))) {
    ;[year, month, precision] = [Number(m[2]), monthWord(m[1]), 'month']
  } else return null
  if (!month || year < 1950) return null
  const probe = new Date(Date.UTC(year, month - 1, day ?? 1))
  if (probe.getUTCMonth() !== month - 1) return null
  const start =
    precision === 'year'
      ? `${year}-01-01`
      : `${year}-${pad(month)}-${pad(day ?? 1)}`
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + 1)
  if (new Date(`${start}T00:00:00Z`) > limit) return null
  return { visited_on: start, precision }
}

/** `outing_dates.split_outing_line`. */
export function splitOutingLine(line, today) {
  const text = line.trim()
  const commas = [...text].flatMap((c, at) => (c === ',' ? [at] : []))
  for (const at of commas) {
    const place = text.slice(0, at).trim()
    const rest = text.slice(at + 1).trim()
    if (place && readDate(rest, today)) return [place, rest]
  }
  if (commas.length) {
    const at = commas[commas.length - 1]
    const place = text.slice(0, at).trim()
    if (place) return [place, text.slice(at + 1).trim() || null]
  }
  return [text, null]
}

/** The words of a stored period (`outing_dates.label_for`). */
const labelOf = (visitedOn, precision) => {
  const [y, mo, d] = visitedOn.split('-').map(Number)
  if (precision === 'year') return String(y)
  if (precision === 'month') return `${LABEL_MONTHS[mo - 1]} ${y}`
  return `${LABEL_MONTHS[mo - 1]} ${d}, ${y}`
}

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
// Short links: these hosts on any path (`g.co/kgs/...` included).
const SHORT = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)\//i
// A known map host: a link on it with nothing readable is never searched.
const MAP_HOST =
  /^https?:\/\/(www\.google\.com\/maps|google\.com\/maps|maps\.google\.com|(www\.)?openstreetmap\.org)/i

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
        name: `Short link from ${new URL(line).hostname}`,
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
  const search = line.match(/google\.com\/maps\/search\/([^/?]+)/i)
  if (search) {
    return {
      state: 'reading',
      payload: {
        ...base,
        name: decodeURIComponent(search[1].replace(/\+/g, ' ')),
        attempts: 0,
      },
    }
  }
  if (MAP_HOST.test(line)) {
    return {
      state: 'check',
      payload: {
        ...base,
        name: `Link from ${new URL(line).hostname}`,
        note: 'Could not read a place from this link. Type the name.',
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
    today = '2026-11-19',
    refuseOutings = [],
  } = options
  const calls = []
  const sittings = new Map()
  let sittingN = 0
  let entryN = 0
  let spotN = spots.length
  let visitN = 0
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

  const entryJson = (e) => {
    const outing = e.payload.outing
    return {
      id: e.id,
      photo_id: null,
      kind: 'place',
      state: e.state,
      payload: e.payload,
      candidates: [],
      chosen: e.chosen ?? null,
      garment_id: null,
      on_shelf: null,
      ...(outing && {
        outing: {
          date_text: outing.date_text,
          label: outing.visited_on
            ? labelOf(outing.visited_on, outing.precision)
            : null,
          visited_on: outing.visited_on,
          precision: outing.precision,
          skip: outing.skip,
          duplicate_of: outing.duplicate_of ?? null,
          repeat_of: outing.repeat_of ?? null,
        },
      }),
    }
  }

  /** `place_paste.flag_duplicates` for one entry: a stored outing of the
   *  entry's spot with the same period start and precision. A newly found
   *  repeat is skipped; one found again keeps the owner's answer. */
  function flagDuplicate(entry) {
    const outing = entry.payload.outing
    if (!outing) return
    const spot = spots.find((s) => s.id === entry.payload.owned_spot_id)
    const found =
      spot && outing.visited_on
        ? (spot.outings ?? []).find(
            (o) =>
              o.visited_on === outing.visited_on &&
              o.precision === outing.precision,
          )
        : null
    const before = outing.duplicate_of
    const next = { ...outing }
    if (found) {
      next.duplicate_of = found.id
      if (before !== found.id) next.skip = true
    } else if (before) {
      delete next.duplicate_of
      next.skip = false
    }
    entry.payload = { ...entry.payload, outing: next }
  }

  const findEntry = (id) => {
    for (const s of sittings.values()) {
      const entry = s.entries.find((e) => e.id === id)
      if (entry) return { entry, sitting: s }
    }
    return null
  }

  /** `place_paste.flag_repeats`: a line that repeats an earlier, not skipped
   *  line of the sitting (same place, period start and precision) is skipped. */
  function flagRepeat(entry, sitting) {
    const outing = entry.payload.outing
    if (!outing?.visited_on) return
    const who = (e) =>
      e.payload.owned_spot_id ?? e.chosen?.source_id ?? key(e.payload.name)
    const earlier = sitting.entries.find(
      (other) =>
        other !== entry &&
        other.payload.outing?.visited_on === outing.visited_on &&
        other.payload.outing?.precision === outing.precision &&
        !other.payload.outing?.skip &&
        who(other) === who(entry),
    )
    if (earlier) {
      entry.payload = {
        ...entry.payload,
        outing: { ...outing, repeat_of: earlier.id, skip: true },
      }
    }
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
    const saved = spots.find((spot) => spot.source_id === row.source_id)
    if (row.owned_spot_id || saved) {
      entry.state = 'owned'
      payload.note = 'Already on your list'
      payload.owned_spot_id = row.owned_spot_id ?? saved.id
    } else if (
      !payload.outing &&
      // Only entries that will be written count: a place left out (check,
      // with `chosen` kept) does not block its twin.
      sitting.entries.some(
        (other) =>
          other !== entry &&
          ['ready', 'owned'].includes(other.state) &&
          other.chosen?.source_id === row.source_id,
      )
    ) {
      entry.state = 'ignored'
      payload.note = 'same place as another line'
    } else entry.state = 'ready'
    entry.payload = payload
    flagDuplicate(entry)
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
      if (entry.state === 'check') {
        // A new search drops the old position and choice first.
        delete payload.lat
        delete payload.lng
        delete payload.owned_spot_id
        entry.chosen = null
      }
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

  function paste(sitting, text, mode = {}) {
    let raw = text.split('\n')
    if (raw.length && raw[raw.length - 1].trim() === '') raw.pop()
    const overLimit = Math.max(0, raw.length - 200)
    raw = raw.slice(0, 200)
    const held = new Set(
      sitting.entries.flatMap((e) =>
        mode.outings
          ? [key(e.payload.source_line ?? '')]
          : [key(e.payload.source_line ?? ''), key(e.payload.name ?? '')],
      ),
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
      let { state, payload } = entryFor(
        mode.outings ? splitOutingLine(line, today)[0] : line,
      )
      if (mode.outings) {
        const [, dateText] = splitOutingLine(line, today)
        const read = readDate(dateText, today)
        payload = {
          ...payload,
          source_line: line.slice(0, 300),
          city: (mode.city ?? 'denver').toLowerCase(),
          outing: {
            date_text: dateText,
            visited_on: read?.visited_on ?? null,
            precision: read?.precision ?? null,
            skip: false,
          },
        }
      }
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
      const entry = { id: entryId(++entryN), state, payload, chosen: null }
      flagDuplicate(entry)
      if (mode.outings) flagRepeat(entry, sitting)
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

  /** The commit of a sitting of past outings (`commit.py`): one outing per
   *  ready or owned entry that is not skipped, all or nothing. */
  function commitOutings(sitting) {
    const kept = sitting.entries.filter((e) =>
      ['check', 'reading'].includes(e.state),
    )
    if (kept.length === sitting.entries.length && kept.length) {
      return json({ detail: 'Nothing to add' }, 409)
    }
    const writing = sitting.entries.filter(
      (e) => ['ready', 'owned'].includes(e.state) && !e.payload.outing?.skip,
    )
    const refused = writing.flatMap((e) => {
      const read = readDate(e.payload.outing?.date_text, today)
      if (!read) {
        return [
          {
            entry_id: e.id,
            field: 'date',
            message: "Read this outing's date before it is added",
          },
        ]
      }
      return refuseOutings.includes(e.payload.name)
        ? [
            {
              entry_id: e.id,
              field: null,
              message: 'Another spot took that name',
            },
          ]
        : []
    })
    if (refused.length) {
      return json(
        {
          detail: `${refused.length} to fix before anything is added`,
          refused,
          added: 0,
          already_owned: 0,
          skipped_kept: kept.length,
        },
        422,
      )
    }
    const fresh = []
    let outings = 0
    for (const e of writing) {
      const read = readDate(e.payload.outing.date_text, today)
      let spot = spots.find(
        (s) => s.id === e.payload.owned_spot_id || s.name === e.payload.name,
      )
      if (!spot) {
        spotN += 1
        spot = { id: spotId(spotN), name: e.payload.name, outings: [] }
        spots.push(spot)
        fresh.push({ id: spot.id, name: spot.name })
      }
      spot.outings = [
        ...(spot.outings ?? []),
        { id: `visit-${++visitN}`, ...read },
      ]
      outings += 1
    }
    sitting.entries = kept
    if (!kept.length) sittings.delete(sitting.id)
    return json({
      added: fresh.length,
      spots_new: fresh,
      spots_owned: [],
      skipped_kept: kept.length,
      refused: [],
      ...(outings && { outings_new: outings }),
    })
  }

  function commit(sitting) {
    if (nothing) return json({ detail: 'Nothing to add' }, 409)
    if (sitting.entries.some((e) => e.payload.outing)) {
      return commitOutings(sitting)
    }
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
      spots.push({ id: spotId(spotN), name: e.payload.name, ...e.payload })
      return { id: spotId(spotN), name: e.payload.name }
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
    if ('outing_date_text' in body || 'outing_skip' in body) {
      if (!entry.payload.outing) {
        return json({ detail: 'This entry is not a past outing' }, 422)
      }
      let outing = { ...entry.payload.outing }
      if ('outing_date_text' in body) {
        const read = readDate(body.outing_date_text, today)
        outing = {
          ...outing,
          date_text: body.outing_date_text.trim(),
          visited_on: read?.visited_on ?? null,
          precision: read?.precision ?? null,
        }
      }
      if ('outing_skip' in body) outing.skip = body.outing_skip
      entry.payload = { ...entry.payload, outing }
      flagDuplicate(entry)
    }
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
      if (sit[2] === '/paste') {
        return json(
          paste(sitting, body.text, { outings: body.outings, city: body.city }),
        )
      }
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
