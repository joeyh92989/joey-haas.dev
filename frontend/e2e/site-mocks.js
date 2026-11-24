// Filled API answers for the Site admin browser tests (#535). The admin
// suite's database has no views, so the filled state is routed here, in the
// page, over the signed-in session. Names and numbers are the long, crowded
// kind a real site grows into, so the overflow and ring checks run on the
// worst case, not a tidy one. Nothing is written: a PATCH, POST or PUT
// answers with the body.

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
      { value: '/shelf/comics', count: 456 },
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
export async function mockSite(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const { pathname, searchParams } = new URL(request.url())
    const json = (body) => route.fulfill({ json: body })
    if (pathname === '/api/auth/me') return json({ email: 'admin@example.com' })
    if (request.method() !== 'GET') return json(request.postDataJSON?.() ?? {})
    if (pathname === '/api/analytics')
      return json(analytics(searchParams.get('range')))
    return json({})
  })
}
