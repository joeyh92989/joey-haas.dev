// Synthetic bodies for the tools and data pages (#534). /stats and Pick for me
// read snapshots the shared fixture set (e2e/fixtures/snapshot)
// does not carry, and adding them there would change every other route's
// More menu and baselines; this spec serves them from the page instead.

const days = Array.from({ length: 30 }, (_, index) => ({
  day: `2026-10-${String(index + 1).padStart(2, '0')}`,
  views:
    [3, 8, 5, 0, 12, 9, 4, 7, 15, 11][index % 10] + (index === 17 ? 20 : 0),
}))

const summary = (views, visitors) => ({
  start: '2026-10-01',
  end: '2026-10-30',
  views,
  visitors,
  views_per_visitor: 1.7,
  best_day: { day: '2026-10-18', views: 35 },
  series: days,
  pages: [
    { value: '/', count: 120 },
    { value: '/shelf/games', count: 64 },
    { value: '/stats', count: 21 },
    { value: '/daily', count: 9 },
  ],
  referrers: [
    { value: '', count: 70 },
    { value: 'news.example.com', count: 31 },
    { value: 'search.example.org', count: 12 },
  ],
  referrers_other: 5,
  devices: [
    { value: 'desktop', count: 150 },
    { value: 'phone', count: 60 },
  ],
  live_since: '2026-01-01',
})

export const SITE_STATS = { thirty: summary(214, 118), all: summary(1834, 902) }

const card = (id, title, hours) => ({
  item_id: id,
  title,
  cover_url: null,
  platform: 'Nintendo Switch',
  time_to_beat_hours: hours,
  igdb_url: null,
  reasons: [`${title} matches games you finished.`],
})

const score = (id, total) => ({
  item_id: id,
  score: total,
  terms: { affinity: 82, similarity: 61, quality: 90, length_fit: 100 },
})

export const PICK_TABLE = {
  generated_on: '2026-11-08',
  weights: { affinity: 30, similarity: 25, quality: 20, length_fit: 15 },
  games: {
    a: card('a', 'Alpha Quest', 6),
    b: card('b', 'Beta Garden', 4),
    c: card('c', 'Gamma Station', 11),
  },
  combos: {
    'any|': [score('a', 88), score('b', 74), score('c', 61)],
    'short|': [score('b', 80), score('a', 66)],
    'any|cozy': [score('b', 77), score('a', 70)],
    'short|cozy': [score('b', 83)],
  },
}

export const NEXT = {
  generated_at: '2026-11-08T12:00:00Z',
  tonight: {
    picks: [
      {
        item_id: 'a',
        type: 'game',
        title: 'Alpha Quest',
        cover_url: null,
        platform: 'Nintendo Switch',
        slot_label: 'Best fit',
        time_to_beat_hours: 6,
        reasons: ['Alpha Quest matches games you finished.'],
      },
    ],
  },
  comics_this_week: [],
  wanted: [],
  buy_now: [],
  preorders: [],
  later: [],
  not_on_cartridge: [],
}

const BODIES = {
  'site-stats': SITE_STATS,
  'pick-for-me': PICK_TABLE,
  next: NEXT,
}

/**
 * Serves the named bodies both as the build's snapshot file and as the live
 * API answer, so a page paints and then settles without "failed to refresh".
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} names Keys of BODIES.
 */
export async function serve(page, names) {
  for (const name of names) {
    const json = (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(BODIES[name]),
      })
    await page.route(`**/snapshot/${name}.json`, json)
    await page.route(`**/api/public/${name}`, json)
  }
}
