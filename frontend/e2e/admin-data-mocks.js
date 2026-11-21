// Filled answers for the admin Shelf data and edit pages (#535): Sources,
// Store list, the item and comic edit pages and a book's page. The admin
// suite's database holds none of this, so the reads are routed here, in the
// page, over a signed-in session. Names are realistic or worse: a 60-character
// unbroken one, long store lines, three-digit counts. A write answers with its
// own body and changes nothing.

import { readFileSync } from 'node:fs'

const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/api/${name}.json`, import.meta.url)),
  )
const volumeFixture = read('admin-volume')
const volumesFixture = read('admin-volumes')
const previewFixture = read('admin-volume-delete-preview')

export const GAME_ID = 'g1'
export const COMIC_ID = volumeFixture.item_id
export const VOLUME_SLUG = volumeFixture.slug

const LONG = 'Averyveryveryverylongunbrokenname0123456789abcdefghijklmnopqrstuv'
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg=='

function run(source, fields = {}) {
  return {
    source,
    name: source,
    started_at: '2026-11-19T12:00:00Z',
    finished_at: '2026-11-19T12:01:00Z',
    ok: true,
    rows_seen: 842,
    rows_changed: 3,
    rows_retired: 0,
    items_synced: 0,
    unresolved_remaining: 0,
    short_run: false,
    errors: [],
    ...fields,
  }
}

const STATUS = {
  sources: [
    {
      source: 'super_rare',
      name: 'Super Rare Games',
      kind: 'store',
      last_run: run('super_rare'),
      consecutive_failures: 0,
      needs_attention: false,
    },
    {
      source: 'gamefairy',
      name: `GameFairy ${LONG}`,
      kind: 'store',
      last_run: run('gamefairy', {
        ok: false,
        errors: [
          { code: 'http_error', detail: `HTTP 500 from ${LONG}${LONG}` },
          { code: 'timeout', detail: 'Timed out after 30 seconds' },
        ],
      }),
      consecutive_failures: 3,
      needs_attention: true,
    },
    {
      source: 'nscollectors',
      name: 'r/NSCollectors registry',
      kind: 'registry',
      last_run: run('nscollectors', { short_run: true, rows_seen: 1204 }),
      consecutive_failures: 0,
      needs_attention: false,
    },
    {
      source: 'igdb_platform',
      name: 'N64 (IGDB)',
      kind: 'platform',
      last_run: null,
      consecutive_failures: 0,
      needs_attention: false,
    },
  ],
  totals: {
    live_editions: 1100,
    live_listings: 900,
    cached_games: 300,
    unresolved_keys: 142,
    pending_keys: 12,
    keys_without_platform: 4,
    disagreements: 2,
    switch1_unmatched: 17,
  },
}

const NEEDS_MATCH = {
  total: 14,
  keys: [
    {
      title_normalized: 'star-fox',
      title: 'Star Fox Zero: The Battle Begins Again Collectors Edition',
      platform: 'Nintendo Switch 2',
      platform_id: 508,
      sources: ['super_rare', 'gamefairy', 'nscollectors'],
      rows: 7,
      candidates: [
        { external_id: '1', title: 'Star Fox Zero', year: 2016 },
        { external_id: '2', title: `Star Fox ${LONG}`, year: 1993 },
        { external_id: '3', title: 'Star Fox 64', year: null },
      ],
    },
    {
      title_normalized: 'no-platform',
      title: 'Mystery Cartridge',
      platform: null,
      platform_id: 0,
      sources: ['gamefairy'],
      rows: 1,
      candidates: [],
    },
  ],
}

const DISAGREEMENTS = {
  items: [
    {
      item_id: 'g1',
      title: `Celeste ${LONG}`,
      region: 'USA',
      yours: 'game_card',
      yours_source: 'manual',
      registry: 'game_key_card',
      cart_id: 'HAC-P-AAAAA',
    },
    {
      item_id: 'g2',
      title: 'Hades',
      region: 'EU',
      yours: null,
      registry: 'disc',
      cart_id: null,
    },
  ],
}

function storeRow(id, fields = {}) {
  return {
    id,
    title: `Game ${id}`,
    cover_url: null,
    igdb_url: `https://www.igdb.com/games/game-${id}`,
    release_date: '2026-09-01',
    release_precision: 'day',
    platform: 'Nintendo Switch 2',
    physical_format: 'game_card',
    format_note: 'Limited run of 5,000 copies',
    reasons: [`Reason ${id}`],
    score: 50,
    status: 'pending',
    store_lines: [
      {
        store: 'super_rare',
        url: 'https://example.test/a',
        price: 59.99,
        currency: 'USD',
        availability: 'preorder',
      },
      {
        store: 'gamefairy',
        url: 'https://example.test/b',
        price: 62,
        currency: 'GBP',
        availability: 'in_stock',
      },
    ],
    hypes: null,
    lane: 'dated',
    top_pick: false,
    new: false,
    kind: 'radar',
    ...fields,
  }
}

const STORE_LIST = {
  generated_at: { radar: '2026-11-19T00:44:00Z', discover: null },
  catalogue: { stores_at: null, registry_at: null },
  sections: {
    buy_now: [
      storeRow('a', { top_pick: true, kind: 'discover' }),
      storeRow('b', { title: `Game ${LONG}`, platform: 'Nintendo Switch' }),
      storeRow('c'),
    ],
    preorders: [storeRow('d', { release_date: '2026-12-15' })],
    later: [],
    not_on_cartridge: [storeRow('e', { physical_format: 'game_key_card' })],
  },
}

const GAME = {
  id: GAME_ID,
  type: 'game',
  title: `Star Fox ${LONG}`,
  status: 'playing',
  rating: 8,
  notes: 'Played on the couch.',
  is_public: false,
  year: 1993,
  creator: 'Nintendo EAD',
  cover_url: null,
  external_source: 'igdb',
  external_id: '111',
  favorite: true,
  started_at: null,
  finished_at: null,
  times_completed: 1,
  owned_format: 'physical',
  platform_id: 508,
  physical_format: 'game_card',
  cart_id: 'HAC-P-AAAAA',
  region: 'USA',
  acquired_at: '2026-03-01',
  release_date: '2026-09-01',
  pinned_at: null,
  play_next_excluded: true,
  tags: [
    { group: 'play_style', tag: 'rpg' },
    { group: 'tone', tag: 'comedy' },
  ],
  source_metadata: {},
  playthroughs: [
    {
      number: 1,
      started_on: '2024-03-01',
      finished_on: '2024-03-20',
      paused_on: null,
      outcome: 'finished',
      journal_days: 3,
      journal_minutes: 640,
    },
    {
      number: 2,
      started_on: '2026-10-03',
      finished_on: null,
      paused_on: null,
      outcome: null,
      journal_days: 0,
      journal_minutes: 0,
    },
  ],
}

const REGISTRY = {
  note: 'The registry lists this edition as a Game-Key Card; yours says a full game on cartridge.',
  agrees: false,
  edition: { id: 'e1' },
}

const COMIC = {
  id: COMIC_ID,
  type: 'comic',
  title: `Saga ${LONG}`,
  status: 'playing',
  rating: 9,
  notes: 'private words',
  is_public: true,
  favorite: false,
  following: true,
  year: 2012,
  creator: 'Brian K. Vaughan',
  cover_url: null,
  external_source: 'comicvine',
  external_id: '22918',
  owned_format: 'physical',
  issues_owned: '1–8, 10, 12–15',
  issues_skipped: '6',
  editions: [],
  read_to: null,
  tags: [],
  source_metadata: { publisher: 'Image Comics', issue_count: 66 },
  comic_run: { owned: 13, released: 66, missing: 53, read: 4 },
  playthroughs: [],
}

const WALL = {
  wall: {
    series_title: 'Saga',
    publisher: 'Image Comics',
    issues: Array.from({ length: 15 }, (_, i) => ({
      number: i + 1,
      name: null,
      store_date: null,
      cover_url: null,
      owned: i < 8,
      read: i < 4,
    })),
    editions: [],
  },
  comic: {
    owned_text: '1–8',
    released: 66,
    read_to: 4,
    read: 4,
    next_issue: 5,
    editions: [],
    status: 'playing',
  },
}

const VOLUME = {
  ...volumeFixture,
  label: `Saga, Book Two ${LONG}`,
  title: { ...volumeFixture.title, title: `Saga ${LONG}` },
}

const TITLES = [
  { id: COMIC_ID, title: 'Saga', is_public: true },
  { id: 'b2', title: `Hidden Run ${LONG}`, is_public: false },
  { id: 'b3', title: 'Paper Moons', is_public: true },
]

/** Routes every API read the five pages make. */
export async function mockAdminData(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const json = (body, status = 200) => route.fulfill({ status, json: body })
    if (path === '/api/track') return route.abort()
    if (path === '/api/auth/me')
      return json({ signed_in: true, email: 'admin@example.com' })
    if (method !== 'GET') {
      let body = {}
      try {
        body = JSON.parse(request.postData() ?? '{}')
      } catch {
        // Not JSON.
      }
      if (path.endsWith('/delete-preview'))
        return json({
          items: 1,
          playthroughs: 2,
          play_sessions: 3,
          comic_issues: 4,
          pick_events: 0,
          titles: ['x'],
        })
      return json({ ...GAME, ...body })
    }
    if (path === '/api/physical/status') return json(STATUS)
    if (path === '/api/physical/needs-match') return json(NEEDS_MATCH)
    if (path === '/api/physical/disagreements') return json(DISAGREEMENTS)
    if (path.startsWith('/api/physical/items/')) return json(REGISTRY)
    if (path === '/api/recommendations/store-list') return json(STORE_LIST)
    if (path === `/api/items/${GAME_ID}`) return json(GAME)
    if (path === `/api/items/${COMIC_ID}`) return json(COMIC)
    if (path.endsWith('/sessions'))
      return json([
        { id: 's1', played_on: '2026-11-18', minutes: 95, note: 'Boss two' },
        { id: 's2', played_on: '2026-11-12', minutes: null, note: null },
      ])
    if (path.includes('search-metadata')) return json([])
    if (path === `/api/comics/${COMIC_ID}/wall`) return json(WALL)
    if (path === `/api/comics/${COMIC_ID}/volumes`) return json(volumesFixture)
    if (path.endsWith('/delete-preview')) return json(previewFixture)
    if (path.startsWith('/api/comics/volumes/')) return json(VOLUME)
    if (path === '/api/items') return json(TITLES)
    if (path.endsWith('.png'))
      return route.fulfill({
        body: Buffer.from(PNG, 'base64'),
        contentType: 'image/png',
      })
    return json({}, 404)
  })
}
