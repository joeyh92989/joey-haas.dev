// Realistic admin answers for the Add, sitting, Discover, Radar and Pull list
// pages (#535, slice c), served from the page so the spec needs no backend:
// long names, a 60-character unbroken name, many genres and store lines,
// three-digit counts. Nothing is written: every POST, PATCH and DELETE
// answers with a plausible body.

const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg=='

const UNBROKEN = 'Supercalifragilisticexpialidocious_Unbreakable_Name_Of_60Ch'
const LONG =
  'The Legend of Zelda: Tears of the Kingdom – Collector’s Edition Deluxe Anniversary Remaster'

const field = (key, label, control, options = []) => ({
  key,
  label,
  control,
  options,
  per_item: false,
  required: false,
})

export const KINDS = [
  {
    key: 'game',
    area: 'shelf',
    label: 'Game',
    ways_in: ['photo', 'search', 'type'],
    has_details: true,
    source_state: 'ready',
    fields: [
      field('platform_id', 'Platform', 'select', ['130', '508']),
      field('status', 'Status', 'select', ['backlog', 'active', 'finished']),
    ],
  },
  {
    key: 'movie',
    area: 'shelf',
    label: 'Movie',
    ways_in: ['photo', 'search', 'type'],
    has_details: true,
    source_state: 'Needs a TMDB token; added by typing for now.',
    fields: [field('status', 'Status', 'select', ['backlog', 'finished'])],
  },
  {
    key: 'comic',
    area: 'shelf',
    label: 'Comic',
    ways_in: ['photo', 'search', 'type'],
    has_details: true,
    source_state: 'ready',
    fields: [field('status', 'Status', 'select', ['backlog', 'finished'])],
  },
  {
    key: 'boardgame',
    area: 'shelf',
    label: 'Board game',
    ways_in: ['type'],
    has_details: true,
    source_state: 'Needs a BoardGameGeek key; added by typing for now.',
    fields: [field('status', 'Status', 'select', ['backlog', 'finished'])],
  },
  {
    key: 'garment',
    area: 'closet',
    label: 'Garment',
    ways_in: ['photo', 'type', 'file', 'link'],
    has_details: false,
    source_state: null,
    fields: [field('name', 'Name', 'text'), field('brand', 'Brand', 'text')],
  },
]

const sittingRow = (id, area, kind, label, extra = {}) => ({
  id,
  area,
  kind,
  label,
  step: 'shoot',
  photos: 120,
  photos_waiting: 111,
  entries: { exact: 140, check: 112, reading: 100, owned: 101 },
  created_at: '2026-11-10T19:42:00Z',
  updated_at: '2026-11-10T19:42:00Z',
  ...extra,
})

export const SITTINGS = {
  shelf: [
    sittingRow('s1', 'shelf', 'game', `${LONG} sitting`),
    sittingRow('s2', 'shelf', 'comic', UNBROKEN),
    sittingRow('s3', 'shelf', null, null, { photos: 1, entries: {} }),
  ],
  closet: [sittingRow('c1', 'closet', 'garment', 'Autumn closet clear-out')],
}

const photo = (id, state, extra = {}) => ({
  id,
  state,
  filename: `${id}.jpg`,
  error: state === 'failed' ? 'The model could not read this photo.' : null,
  ...extra,
})

export const SITTING = {
  id: 's1',
  area: 'shelf',
  kind: 'game',
  label: `${LONG} sitting`,
  step: 'shoot',
  photos: [
    photo('p1', 'read'),
    photo('p2', 'read'),
    photo('p3', 'failed'),
    photo('p4', 'uploaded'),
  ],
  photos_waiting: 1,
  entries: [
    {
      id: 'e1',
      photo_id: 'p1',
      kind: 'game',
      state: 'exact',
      payload: { title: 'Hades' },
      candidates: [],
      chosen: null,
      garment_id: null,
    },
    {
      id: 'e2',
      photo_id: 'p2',
      kind: 'game',
      state: 'exact',
      payload: { title: UNBROKEN },
      candidates: [],
      chosen: null,
      garment_id: null,
    },
  ],
  created_at: '2026-11-10T19:42:00Z',
  updated_at: '2026-11-10T19:42:00Z',
}

const candidate = (id, title, extra = {}) => ({
  external_source: 'igdb',
  external_id: String(id),
  title,
  year: 2023,
  thumbnail_url: null,
  ...extra,
})

const CANDIDATES = [
  candidate(1, UNBROKEN),
  candidate(2, LONG),
  candidate(3, 'Hades', { year: 2020 }),
]

const gameEntry = (id, photo, state, extra = {}) => ({
  id,
  photo_id: photo,
  kind: 'game',
  state,
  payload: { detected_title: UNBROKEN, detected_year: 2023 },
  candidates: CANDIDATES,
  chosen: null,
  garment_id: null,
  ...extra,
})

/** A sitting on Check: three titles to ask about, the first with a 60-char name. */
export const CHECK_SITTING = {
  ...SITTING,
  id: 'chk',
  step: 'check',
  photos: [photo('p1', 'read'), photo('p2', 'read')],
  photos_waiting: 0,
  entries: [
    gameEntry('c1', 'p1', 'check'),
    gameEntry('c2', 'p2', 'probable', {
      payload: { detected_title: LONG, detected_year: 2023 },
    }),
    gameEntry('c3', 'p2', 'check', {
      candidates: [],
      payload: { detected_title: 'Hades', reason: 'No candidates came back.' },
    }),
  ],
}

/** A sitting on Details: matched titles, one with a 60-char name. */
export const DETAILS_SITTING = {
  ...SITTING,
  id: 'det',
  step: 'details',
  photos: [photo('p1', 'read'), photo('p2', 'read')],
  photos_waiting: 0,
  entries: [
    gameEntry('d1', 'p1', 'ready', { chosen: CANDIDATES[0] }),
    gameEntry('d2', 'p2', 'ready', { chosen: CANDIDATES[1] }),
    gameEntry('d3', 'p2', 'exact', { chosen: CANDIDATES[2] }),
  ],
}

const SITTING_BY_ID = { s1: SITTING, chk: CHECK_SITTING, det: DETAILS_SITTING }

const GENRES = ['Adventure', 'Roguelike', 'Action RPG', 'Puzzle', 'Platformer']

const preorder = (n) => ({
  store: n % 2 ? 'Limited Run Games' : 'Best Buy',
  price: '59.99',
  currency: 'USD',
  availability: 'preorder',
  preorder_closes_at: '2026-12-08',
  url: `https://example.test/${n}`,
})

const rec = (id, title, extra = {}) => ({
  id,
  title,
  cover_url: null,
  release_date: '2026-12-04',
  release_precision: 'day',
  platform: 'Nintendo Switch 2',
  physical_format: 'game_card',
  format_note: null,
  reasons: [
    'IGDB lists it beside Dredge and a very long list of other games',
    `Matches the ${GENRES.length} genres you finish most`,
  ],
  based_on_titles: ['Hades', 'Dredge', 'Tunic', LONG],
  genres: GENRES,
  score: 70,
  status: 'pending',
  store_lines: [preorder(1), preorder(2), preorder(3)],
  hypes: 20,
  lane: 'dated',
  ...extra,
})

export const RADAR = {
  generated_at: '2026-11-19T10:00:00Z',
  personalised: true,
  catalogue: { stores_at: '2026-11-18T10:00:00Z', registry_at: null },
  sections: {
    suggested: [
      rec('r1', LONG),
      rec('r2', UNBROKEN, { lane: 'preorder' }),
      rec('r3', 'Pikmin 4', { release_date: '2027-01-16' }),
    ],
    dated_later: [
      rec('r4', 'Next Year', { release_precision: 'year', store_lines: [] }),
    ],
    digital: [
      rec('r5', 'Digital Only', {
        physical_format: null,
        format_note: 'no physical edition announced',
        lane: 'digital',
        store_lines: [],
      }),
    ],
  },
}

export const WATCHING = [
  {
    item: {
      id: 'w1',
      title: LONG,
      cover_url: null,
      year: 2026,
      status: 'backlog',
    },
    preorder: { ...preorder(9), closes_at: '2026-12-08' },
  },
  {
    item: { id: 'w2', title: UNBROKEN, cover_url: null, year: 2026 },
    preorder: null,
  },
]

export const DISCOVER = {
  generated_at: '2026-11-19T10:00:00Z',
  personalised: true,
  ranked_by: 'model',
  model_note: null,
  picks: [
    rec('d1', LONG, { release_date: '2025-03-01' }),
    rec('d2', UNBROKEN, { release_date: '2024-05-01' }),
    rec('d3', 'Hades II', { release_date: '2025-09-25' }),
  ],
}

export const FINISHED = [
  LONG,
  UNBROKEN,
  'Hades',
  'Celeste',
  'Tunic',
  'Dredge',
  'Pizza Tower',
].map((title, index) => ({
  id: `g${index}`,
  type: 'game',
  title,
  status: 'finished',
  rating: null,
  platform: 'Nintendo Switch 2',
  cover_url: null,
  year: 2020 + index,
  tags: [],
}))

const issue = (title, number, extra = {}) => ({
  item_id: `id-${title}`,
  title,
  publisher: 'The Extremely Long Named Independent Comics Publishing House',
  number,
  name: null,
  store_date: '2026-11-18',
  cover_url: null,
  owned_text: '1–172, 175–300',
  released: 312,
  on_shelf: true,
  ...extra,
})

export const PULL = {
  following: 114,
  last_refresh: '2026-11-19',
  weeks: [
    {
      start: '2026-11-16',
      this_week: true,
      rows: [
        issue(UNBROKEN, '173'),
        issue('Saga', '74'),
        issue('Monstress', 'Annual 1', { owned_text: '1–56', released: 56 }),
      ],
    },
    { start: '2026-11-23', this_week: false, rows: [] },
  ],
  undated: [{ item_id: 'id-Paper Girls', title: 'Paper Girls' }],
}

export const SEARCH = [
  {
    external_id: '49901',
    title: LONG,
    year: 2012,
    publisher: 'Image',
    issue_count: 372,
    thumbnail_url: null,
    item_id: 'id-1',
    in_shelf: true,
    wanted: false,
    following: true,
  },
  {
    external_id: '1234',
    title: 'Absolute Batman',
    year: 2024,
    publisher: 'DC',
    issue_count: 12,
    thumbnail_url: null,
    item_id: null,
    in_shelf: false,
    wanted: false,
    following: false,
  },
]

export const PLAYING = ['Hades', 'Tunic', LONG].map((title, index) => ({
  id: `p${index}`,
  type: 'game',
  title,
  status: 'active',
  rating: null,
  favorite: false,
  wanted: false,
  is_public: true,
  year: 2021,
  creator: 'Supergiant Games',
  platform: 'Nintendo Switch',
  platform_id: 130,
  physical_format: 'cartridge',
  owned_format: 'physical',
  cover_url: null,
  finished_at: null,
  times_completed: 0,
  created_at: '2026-01-01T00:00:00Z',
  started_at: '2026-10-0' + (index + 1),
  pinned_at: null,
  genres: ['Adventure'],
  tags: [],
  playthroughs: [],
}))

/** Serves the session and every page's answers; writes answer plausibly. */
export async function serveAdminAdd(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    const path = url.pathname
    const area = url.searchParams.get('area')
    if (/^\/api\/intake\/photos\/[\w-]+\/image$/.test(path))
      return route.fulfill({
        body: Buffer.from(PIXEL, 'base64'),
        contentType: 'image/png',
      })
    if (path === '/api/auth/me') return json({ email: 'admin@example.com' })
    if (path === '/api/track') return route.abort()
    if (path === '/api/intake/counts') return json({ shelf: 3, closet: 1 })
    if (path === '/api/intake/kinds') return json(KINDS)
    if (path === '/api/intake/search')
      return json({
        results: [
          {
            kind: 'game',
            external_source: 'igdb',
            external_id: '1',
            title: LONG,
            year: 2023,
            thumbnail_url: null,
            owned_item_id: null,
          },
          {
            kind: 'game',
            external_source: 'igdb',
            external_id: '2',
            title: UNBROKEN,
            year: 2020,
            thumbnail_url: null,
            owned_item_id: 'g1',
          },
          {
            kind: 'comic',
            external_source: 'comicvine',
            external_id: '3',
            title: 'Saga',
            year: 2012,
            thumbnail_url: null,
            owned_item_id: null,
          },
        ],
        sources: [{ kind: 'game', state: 'ok' }],
      })
    if (/^\/api\/intake\/entries\/[\w-]+$/.test(path)) {
      const id = path.split('/').pop()
      const found = [CHECK_SITTING, DETAILS_SITTING]
        .flatMap((sitting) => sitting.entries)
        .find((entry) => entry.id === id)
      let body = {}
      try {
        body = JSON.parse(request.postData() ?? '{}')
      } catch {
        // an empty body
      }
      return json({ ...found, ...body })
    }
    if (/^\/api\/intake\/sittings\/[\w-]+\/commit$/.test(path))
      return json({
        added: 3,
        already_owned: 101,
        issues_added: 0,
        skipped_kept: 0,
        photos_empty: 0,
        photos_waiting: 0,
        refused: [],
        created: ['i1', 'i2', 'i3'],
        titles_created: [
          { id: 't1', title: UNBROKEN },
          { id: 't2', title: LONG },
        ],
      })
    if (path === '/api/intake/budget')
      return json({ remaining: 30, enforced: true })
    if (path === '/api/intake/sittings' && method === 'GET')
      return json(SITTINGS[area] ?? [])
    if (path === '/api/intake/sittings' && method === 'POST')
      return json({ ...SITTING, id: 'new' }, 201)
    if (/^\/api\/intake\/sittings\/[\w-]+$/.test(path)) {
      if (method === 'GET')
        return json(SITTING_BY_ID[path.split('/').pop()] ?? SITTING)
      return json({}, method === 'DELETE' ? 204 : 200)
    }
    if (path === '/api/recommendations/watching') return json(WATCHING)
    if (path === '/api/recommendations')
      return json(url.searchParams.get('kind') === 'radar' ? RADAR : DISCOVER)
    if (path === '/api/comics/pull-list') return json(PULL)
    if (path === '/api/comics/search') return json(SEARCH)
    if (path === '/api/items' && url.searchParams.get('type') === 'game')
      return json(FINISHED)
    if (path === '/api/items') return json(PLAYING)
    if (path.startsWith('/api/closet')) return json({}, 404)
    return json({})
  })
}
