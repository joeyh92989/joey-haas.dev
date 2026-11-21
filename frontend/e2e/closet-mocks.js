// Filled Closet API answers for the browser tests (#535). The admin suite's
// database has no garments, so the filled states are routed here, in the
// page, over the signed-in session. The shapes are the ones the unit tests
// use. Nothing is written: a PATCH, POST or DELETE answers with the body.

const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg=='

export function garment(id, name, fields = {}) {
  return {
    id,
    name,
    category: 'top',
    subtype: null,
    brand: 'Everlane',
    primary_color: 'navy',
    primary_hex: '#223344',
    secondary_color: null,
    secondary_hex: null,
    pattern: null,
    material: 'cotton',
    warmth: 2,
    formality: 2,
    seasons: [4, 5, 6],
    notes: null,
    acquired_on: '2025-06-01',
    status: 'active',
    back_on: null,
    tag_source: 'model',
    tag_attempts: 0,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    image: `/api/closet/garments/${id}/image?v=1`,
    wears_12mo: 0,
    last_worn: null,
    ...fields,
  }
}

export const GARMENTS = [
  garment('a', 'Navy oxford', { wears_12mo: 14, last_worn: '2026-11-06' }),
  garment('b', 'Grey chinos', { category: 'bottom', wears_12mo: 7 }),
  garment('c', 'Wool overcoat with a very long descriptive name', {
    category: 'outer',
    warmth: 5,
    formality: 4,
    status: 'packed',
    back_on: '2027-05-01',
  }),
  garment('d', null, {
    category: null,
    status: 'untagged',
    tag_source: null,
    warmth: null,
    formality: null,
  }),
]

const counts = { total: GARMENTS.length }
for (const s of ['untagged', 'active', 'packed', 'listed', 'gone'])
  counts[s] = GARMENTS.filter((g) => g.status === s).length

const tile = (slot, id, name) => ({
  slot,
  id,
  name,
  primary_hex: '#334455',
  secondary_hex: null,
  image: null,
  qualifier: 'worn 2× this month',
  transient: false,
})
const outfit = (names, reason) => ({
  garments: [
    tile('top', `${names[0]}-t`, names[0]),
    tile('bottom', `${names[1]}-b`, names[1]),
    tile('shoes', `${names[2]}-s`, names[2]),
  ],
  reason,
  ranked_by: 'model',
})

export const TODAY = {
  plan: {
    day: '2026-11-09',
    occasion: 'office',
    bike: false,
    planned_at: '2026-11-09T06:30:00Z',
    ranked_by: 'model',
    model_note: null,
    weather: {
      low: 34,
      high: 58,
      swing: 24,
      wet: false,
      snow: false,
      forecast: true,
      sentence:
        'Cold morning, mild afternoon, a light wind picking up by five.',
      hours: ['7a', '9a', '11a', '12p', '2p', '4p', '6p', '8p'].map(
        (label, i) => ({ label, temp: 34 + i * 3 }),
      ),
    },
    lead: outfit(
      ['navy oxford', 'grey chinos', 'white sneakers'],
      'Navy and grey keep it calm.',
    ),
    alternatives: [
      outfit(['grey tee', 'jeans', 'white sneakers'], 'Easy for a mild day.'),
      outfit(['white tee', 'jeans', 'loafers'], 'Template pick.'),
    ],
    footnote: { active: 40, fit: 22, skipped_recent: 3 },
    lock: null,
  },
  planned_just_now: false,
  worn: null,
  defaults: { occasion: 'office', bike: false },
  occasions: ['office', 'wfh', 'date', 'weekend', 'travel', 'event'],
}

const rev = (id, name, flags) => ({
  garment: garment(id, name),
  flags: flags.map(([kind, sentence]) => ({ kind, sentence })),
  opinion: null,
  suggested: 'donate',
  back_on: '2027-05-01',
  size: 'M',
})

export const REVIEW = {
  day: '2026-11-10',
  turn: { name: 'autumn', on: '2026-10-25', open: true },
  next_turn: 'late April',
  opinion_batch_on: '2026-11-08',
  banner: {
    turn: 'autumn',
    turn_on: '2026-10-25',
    season: 'summer',
    count: 2,
    until: 'May',
  },
  tiles: { active: 6, worn_30: 3, flagged: 3, gone_this_year: 1 },
  deck: [
    rev('g1', 'never worn', [
      ['unworn', 'Not worn in the last twelve months.'],
    ]),
    rev('g2', 'linen shirt', [['out_of_season', 'Out of season until May.']]),
  ],
  due_back: [],
  listed: [],
}

export const PROFILE = {
  sizes: { top: 'M' },
  coloring: {},
  build_fit: null,
  style_words: ['minimal'],
  dislikes: [],
  weekly_occasions: [
    'office',
    'office',
    'wfh',
    'office',
    'wfh',
    'weekend',
    'weekend',
  ],
  weekly_bike: [false, false, false, false, false, false, false],
  spring_turn: '04-25',
  autumn_turn: '10-01',
  repeat_top_days: 7,
  repeat_outfit_weeks: 3,
  tag_budget: 12,
  occasions: ['office', 'wfh', 'date', 'weekend', 'travel', 'event'],
}

/** Routes `/api/closet/**` to the fixtures above on `page`. */
export async function mockCloset(page) {
  await page.route('**/api/closet/**', async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    const json = (body) => route.fulfill({ json: body })
    if (/\/image$/.test(pathname))
      return route.fulfill({
        body: Buffer.from(PIXEL, 'base64'),
        contentType: 'image/png',
      })
    if (request.method() !== 'GET') return json(request.postDataJSON?.() ?? {})
    if (pathname === '/api/closet/garments')
      return json({ garments: GARMENTS, counts })
    if (pathname.startsWith('/api/closet/garments/')) return json(GARMENTS[0])
    if (pathname === '/api/closet/today') return json(TODAY)
    if (pathname === '/api/closet/review') return json(REVIEW)
    if (pathname === '/api/closet/profile') return json(PROFILE)
    return json({})
  })
}
