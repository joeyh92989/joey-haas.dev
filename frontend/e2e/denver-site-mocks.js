// Filled API answers for the Denver and Site admin browser tests (#535). The
// admin suite's database has no spots or views, so the filled states are
// routed here, in the page, over the signed-in session. Names, tags and
// numbers are the long, crowded kind a real library grows into, so the
// overflow and ring checks run on the worst case, not a tidy one. Nothing is
// written: a PATCH, POST or PUT answers with the body.

const ALL_TAGS = [
  'coffee',
  'park',
  'food',
  'kid-ok',
  'rainy-day',
  'bike-friendly',
]

const NAMES = [
  'The Tattered Cover Book Store on Colfax Avenue at Elizabeth Street (original flagship location)',
  'Corvus Coffee Roasters South Broadway',
  'Sloan’s Lake Park and the Boat House Café',
  'Union Station',
  'Denver Botanic Gardens at York Street with the Science Pyramid',
  'Cheesman Park Pavilion and the Memorial Esplanade',
  'Red Rocks Park and Amphitheatre',
  'City Park Jazz Pavilion',
  'Washington Park Boathouse',
  'Mestizo-Curtis Park Community Garden',
  'Great Divide Brewing Barrel Bar',
  'Denver Museum of Nature and Science',
]

export const SPOTS = NAMES.map((name, i) => ({
  id: `s${i}`,
  name,
  slug: `s${i}`,
  lat: 39.75 + i / 100,
  lng: -104.99,
  neighbourhood:
    i % 3 === 0
      ? 'Capitol Hill and Cheesman Park (the long-form name)'
      : 'LoHi',
  blurb: null,
  tags: i % 2 ? ALL_TAGS : ALL_TAGS.slice(0, 2),
  anchor: i % 4 === 0,
  is_public: i % 2 === 0,
  city: 'denver',
  source: null,
  source_id: null,
  last_visit: i % 3 ? '2026-11-01' : null,
  visit_count: i * 7,
}))

const CANDIDATES = [0, 1, 2].map((i) => ({
  id: `c${i}`,
  source: 'osm',
  source_id: `node/${i}`,
  name: `${NAMES[i]} (found by the finder)`,
  category: 'cafe_and_bookshop',
  distance: '0.6 mi from Union Station · on foot, about twelve minutes',
  fit: 80 - i,
  reason:
    'Near the station and open late, with a children’s section and somewhere dry to sit if the weather turns.',
  suggested_tags: ALL_TAGS.slice(0, 3),
}))

const hours = (offset) =>
  Array.from({ length: 13 }, (_, i) => ({
    hour: 8 + i,
    label: i + 8 < 12 ? `${i + 8}a` : i + 8 === 12 ? 'noon' : `${i - 4}p`,
    temp_f: 35 + offset + Math.round(18 * Math.sin(i / 4)),
    precip_pct: i > 8 ? 70 : 0,
    wind_mph: 6,
    wet: i > 8,
    rideable: i <= 8,
  }))

const day = (date, name, offset) => ({
  date,
  name,
  high: 58 + offset,
  low: 33 + offset,
  summary: 'Sunny through the morning, then rain moving in from the west',
  hours: hours(offset),
  verdict: {
    state: 'ok',
    text: 'Dry until 4p: ride before the rain',
    window: '8a–4p',
  },
})

const suggestion = (slot_key, slot, i, saved = false) => ({
  slot_key,
  slot,
  day: '2026-11-14',
  when: 'Saturday morning, before the rain',
  spot_id: `s${i}`,
  name: NAMES[i],
  tags: ALL_TAGS,
  distance: '1.2 mi from home · a 10 minute ride',
  reasons: [
    'Dry until noon, with the rain a few hours later than forecast',
    'Not been in over a month, and the kid asked about it twice',
    'On the way back from the park, so no extra trip',
  ],
  saved,
})

export const PLAN = {
  today: '2026-11-09',
  week: '2026-11-14',
  days: [day('2026-11-14', 'Saturday', 0), day('2026-11-15', 'Sunday', -4)],
  suggestions: [
    suggestion('best', 'Best bet', 0),
    suggestion('new', 'Somewhere new', 4, true),
    suggestion('while', 'While you’re out', 1),
  ],
  constraints: {
    kid_along: true,
    bike_if_dry: true,
    max_miles: 12.5,
    home_by: 17,
  },
  skips: [
    { spot_id: 's6', name: NAMES[6] },
    { spot_id: 's9', name: NAMES[9] },
  ],
  weather: {
    at: '2026-11-09T06:00:00Z',
    state: 'ok',
    gridpoint: 'BOU/62,61',
    hours: 156,
  },
  recent_visits: [0, 1, 2, 3, 4].map((i) => ({
    id: i + 1,
    spot_id: `s${i}`,
    name: NAMES[i],
    visited_on: '2026-11-01',
  })),
  seed: 0,
}

const days = (n) =>
  Array.from({ length: n }, (_, i) => ({
    day: new Date(Date.UTC(2026, 9, 15 + i)).toISOString().slice(0, 10),
    views: 1000 + ((i * 7919) % 40000),
  }))

export const analytics = (range) => {
  const n = { '7d': 7, '30d': 30, '90d': 90, all: 120 }[range] ?? 30
  const series = days(n)
  return {
    range,
    start: series[0].day,
    end: series[n - 1].day,
    views: 1234567,
    visitors: 345678,
    views_per_visitor: 3.57,
    best_day: {
      day: series[3].day,
      views: 98765,
      referrer: 'a-very-long-referrer-hostname.news.example.co.uk',
    },
    series,
    pages: [
      { value: '/', count: 456789 },
      {
        value:
          '/blog/a-very-long-post-slug-about-design-systems-focus-rings-and-horizontal-overflow-on-phones',
        count: 123456,
      },
      { value: '/projects', count: 23456 },
      { value: '/shelf/games', count: 3456 },
      { value: '/denver', count: 456 },
    ],
    referrers: [
      { value: '', count: 200000 },
      {
        value: 'a-very-long-referrer-hostname.news.example.co.uk',
        count: 34567,
      },
      { value: 'news.ycombinator.com', count: 3456 },
    ],
    devices: [
      { value: 'phone', count: 700000 },
      { value: 'desktop', count: 500000 },
      { value: 'tablet', count: 34567 },
    ],
    live_since: series[0].day,
  }
}

/** Routes `/api/**` to the fixtures above on `page`. */
export async function mockDenverSite(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const { pathname, searchParams } = new URL(request.url())
    const json = (body) => route.fulfill({ json: body })
    if (pathname === '/api/auth/me') return json({ email: 'admin@example.com' })
    if (request.method() !== 'GET') return json(request.postDataJSON?.() ?? {})
    if (pathname === '/api/analytics')
      return json(analytics(searchParams.get('range')))
    if (pathname === '/api/spots/plan') return json(PLAN)
    if (pathname === '/api/spots') return json(SPOTS)
    if (pathname === '/api/spots/candidates') return json(CANDIDATES)
    if (pathname === '/api/spots/status')
      return json({
        'candidates.last_run': {
          at: '2026-11-08T06:00:00Z',
          state: 'ok',
          found: 24,
          new: 3,
          ranked_by: 'model',
        },
      })
    return json({})
  })
}
