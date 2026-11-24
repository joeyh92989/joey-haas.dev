// Realistic admin Home and Jobs answers (#535, Home and Jobs slice), served
// from the page so the spec needs no backend: long titles, a 60-character
// unbroken name, three-digit counts, a failed night with a long note and a
// stopped schedule. The shapes are the ones the unit tests use.

const HOUR = 3600 * 1000
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString()
const UNBROKEN = 'Supercalifragilisticexpialidocious_Unbreakable_Name_Of_60Ch'

export const ITEMS = [
  [
    'The Legend of Zelda: Tears of the Kingdom – Collector’s Edition Deluxe Anniversary Remaster',
    'game',
    'active',
    2,
  ],
  [UNBROKEN, 'game', 'finished', 5],
  ['Dredge', 'game', 'backlog', 9],
  ['Saga', 'comic', 'active', 20],
  ['Celeste', 'game', 'finished', 30],
  ['Hades', 'game', 'finished', 60],
  ['Monstress', 'comic', 'backlog', 70],
  ['Outer Wilds', 'game', 'active', 80],
].map(([title, type, status, hours], index) => ({
  id: index + 1,
  title,
  type,
  status,
  owned_format: 'physical',
  is_public: true,
  rating: null,
  finished_at: status === 'finished' ? '2026-03-01' : null,
  updated_at: ago(hours),
}))

const tile = (slot, id, name, hex) => ({
  slot,
  id,
  name,
  primary_hex: hex,
  secondary_hex: null,
  image: null,
  qualifier: 'worn 2× this month',
  transient: false,
})

export const LEAD = {
  garments: [
    tile(
      'top',
      't1',
      'Navy oxford shirt with a very long descriptive name',
      '#223344',
    ),
    tile('bottom', 'b1', UNBROKEN, '#556677'),
    tile('shoes', 's1', 'White sneakers', '#eeeeee'),
  ],
  reason: 'Navy and grey keep it calm.',
  ranked_by: 'model',
}

export const CANDIDATES = [
  tile('top', 't2', 'Grey tee', '#888888'),
  tile('top', 't3', `Striped linen ${UNBROKEN}`, '#aa8866'),
  tile('top', 't4', 'White tee', '#f4f4f4'),
]

const run = (hours, extra = {}) => ({
  started_at: ago(hours),
  finished_at: ago(hours),
  ok: true,
  ...extra,
})

const STATUS = {
  sources: [
    {
      source: 'lrg',
      name: 'Limited Run Games',
      kind: 'store',
      last_run: run(1),
    },
    {
      source: 'ps',
      name: 'The Extremely Long Named Independent Publisher Registry Of America',
      kind: 'registry',
      last_run: run(1, { ok: false }),
    },
  ],
  totals: { pending_keys: 210 },
}

/**
 * Routes `/api/**` for Home and Jobs. `posts` collects the POSTs, so a spec
 * can see what a click sent. `stopped` answers with no source runs at all,
 * which reads as a schedule that has stopped.
 */
export async function serveHome(page, { posts = [], stopped = false } = {}) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    if (request.method() !== 'GET') {
      posts.push(`${request.method()} ${path}${url.search}`)
      return json({ ok: true, worn: null, state: 'ok' })
    }
    switch (path) {
      case '/api/auth/me':
        return json({ email: 'admin@example.com' })
      case '/api/items':
        return json(ITEMS)
      case '/api/closet/garments':
        return json({ counts: { untagged: 128 }, garments: [] })
      case '/api/closet/review':
        return json({ tiles: { flagged: 112 } })
      case '/api/intake/counts':
        return json({ shelf: 3, closet: 105 })
      case '/api/physical/status':
        return json(stopped ? { sources: [] } : STATUS)
      case '/api/recommendations/store-list':
        return json({ generated_at: { radar: ago(1.5), discover: ago(1.5) } })
      case '/api/closet/status':
        return json({
          'weather.last_run': { at: ago(1.5), state: 'ok', hours: 156 },
          'tag.last_run': { at: ago(2), state: 'ok' },
          'plan.last_run': {
            at: ago(3),
            state: 'failed',
            note: 'The model answered with something that was not an outfit, three times in a row',
          },
        })
      case '/api/intake/status':
        return json({ 'nightly.last_run': { at: ago(4), state: 'ok' } })
      case '/api/comics/status':
        return json({ 'refresh.last_run': { at: ago(5), state: 'ok' } })
      case '/api/closet/today':
        return json({
          plan: {
            day: '2026-11-09',
            occasion: 'office',
            bike: true,
            weather: { low: 34, high: 58 },
            lead: LEAD,
          },
          worn: null,
        })
      case '/api/closet/candidates':
        return json({ candidates: CANDIDATES })
      case '/api/picker/continuing':
        return json({
          cards: [
            {
              item_id: 'a1',
              type: 'game',
              title: `The Legend of Zelda: Tears of the Kingdom ${UNBROKEN}`,
              cover_url: null,
              platform: 'Nintendo Switch',
              last_played_on: '2026-10-20',
              journal_hours: 346.4,
              sessions: 128,
            },
          ],
        })
      case '/api/public/next':
        return json({
          tonight: { up_next: null, picks: [] },
          comics_this_week: Array.from({ length: 120 }, () => ({})),
        })
      case '/api/analytics':
        return json({
          views: 12840,
          visitors: 1203,
          pages: [{ value: `/shelf/games/${UNBROKEN}`, count: 300 }],
        })
      default:
        return json({}, 404)
    }
  })
}
