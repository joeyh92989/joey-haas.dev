// Group G2's scenarios for style-dump.mjs (#536): everything still left in
// index.css. Three parts, one per commit: `g2a` (the Tour and the Colophon's
// architecture figure), `g2b` (Travel, in two vite dev servers: see README)
// and `g2c` (the leftovers). A scenario whose element the page does not draw
// logs `absent: <selector>` and is dumped as it stands, the same on both
// sides. Edge widths (`w544`, `w545`, `w960`, `w961`, `w320`) are viewports in
// style-dump.mjs: the Tour's breakpoints are 34rem and 60rem, inclusive.
import { NEXT, PICK_TABLE } from '../../tools-data.fixtures.js'

const json = (route, body) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })

const STATUS = {
  stores_watched: 4,
  listings: 12345,
  titles: 678,
  platforms: 5,
}

const row = (title, extra = {}) => ({
  title,
  platform: 'Nintendo Switch 2',
  physical_format: 'game_card',
  release_date: '2026-12-01',
  release_precision: 'day',
  cover_url: null,
  igdb_url: null,
  reasons: ['Matches the genres you finish most'],
  top_pick: false,
  new: false,
  item_id: null,
  ...extra,
})

const TOUR_NEXT = {
  ...NEXT,
  buy_now: [
    row('A Remarkably Long Game Title That Keeps Going', { top_pick: true }),
  ],
  preorders: [row('Pre Order One')],
  later: [row('Later One')],
  not_on_cartridge: [row('Digital Only', { physical_format: 'digital' })],
}

/** Answers the Tour's three reads (items stays the build's snapshot). */
async function answerTour(page, next = TOUR_NEXT) {
  for (const [name, body] of [
    ['next', next],
    ['pick-for-me', PICK_TABLE],
    ['status', STATUS],
  ]) {
    await page.route(`**/snapshot/${name}.json`, (r) => json(r, body))
    await page.route(`**/api/public/${name}`, (r) => json(r, body))
  }
  await page.reload()
  await page.locator('h1').first().waitFor({ timeout: 15000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(500)
}

/**
 * @param {{record: Function}} tools style-dump's own helper.
 * @param {string} theme
 * @param {string} vp
 */
export async function g2({ record }, theme, vp) {
  const at = (tag, name) => `screen ${theme} ${vp} g2${tag} ${name}`
  const spec = (path, kind, extra = {}) => ({
    path,
    theme,
    vp,
    kind,
    ...extra,
  })
  const on =
    (selector, action, n = 0, then) =>
    async (page) => {
      const target = page.locator(selector).nth(n)
      if (!(await target.count())) {
        console.error(`absent: ${selector}`)
        return
      }
      if (action === 'hover') await target.hover()
      if (action === 'focus') {
        await page.keyboard.press('Tab')
        await target.focus()
      }
      if (action === 'press') await target.click()
      await page.waitForTimeout(300)
      if (then) await then(page)
    }
  const withTour = (inner) => async (page) => {
    await answerTour(page)
    if (inner) await inner(page)
  }

  // ---------- g2a: the Tour and the architecture figure ----------
  const how = spec('/shelf/how', 'next')
  await record(at('a', 'tour'), how, withTour())
  await record(
    at('a', 'tour empty'),
    how,
    withTour(async (page) => {
      await page.route('**/api/public/next', (r) => json(r, NEXT))
      await page.reload()
      await page.waitForTimeout(800)
    }),
  )
  await record(at('a', 'tour print'), { ...how, media: 'print' }, withTour())
  await record(at('a', 'tour reduce'), { ...how, reduce: true }, withTour())
  await record(
    at('a', 'tour toc hover'),
    how,
    withTour(on('.tour-toc a', 'hover', 2)),
  )
  await record(
    at('a', 'tour toc focus'),
    how,
    withTour(on('.tour-toc a', 'focus', 4)),
  )
  await record(
    at('a', 'tour toc pressed'),
    how,
    withTour(on('.tour-toc a', 'press', 3)),
  )
  await record(
    at('a', 'tour code link hover'),
    how,
    withTour(on('.tour-code-link', 'hover', 1)),
  )
  await record(
    at('a', 'tour code link focus'),
    how,
    withTour(on('.tour-code-link', 'focus', 0)),
  )
  await record(
    at('a', 'tour code block focus'),
    how,
    withTour(on('.tour-code', 'focus', 0)),
  )
  await record(
    at('a', 'tour closing hover'),
    how,
    withTour(on('.tour-closing a', 'hover', 0)),
  )
  await record(
    at('a', 'tour cover hover'),
    how,
    withTour(on('.tour-covers a', 'hover', 0)),
  )
  if (vp === 'desktop')
    for (const edge of ['w320', 'w544', 'w545', 'w960', 'w961']) {
      await record(
        `screen ${theme} g2a tour ${edge}`,
        { path: '/shelf/how', theme, vp: edge, kind: 'next' },
        withTour(),
      )
      await record(`screen ${theme} g2a colophon ${edge}`, {
        path: '/colophon',
        theme,
        vp: edge,
      })
      await record(`screen ${theme} g2a projects ${edge}`, {
        path: '/projects',
        theme,
        vp: edge,
      })
    }
  await record(at('a', 'colophon'), spec('/colophon'))
  await record(
    at('a', 'colophon print'),
    spec('/colophon', undefined, { media: 'print' }),
  )
  await record(at('a', 'projects'), spec('/projects'))
  await record(
    at('a', 'projects print'),
    spec('/projects', undefined, { media: 'print' }),
  )

  // ---------- g2b: Travel (two vite dev servers, see README) ----------
  const TRIP = '/travel/croatia-greece-2026'
  await record(at('b', 'travel index'), spec('/travel'))
  await record(
    at('b', 'travel card hover'),
    spec('/travel'),
    on('.trip-card', 'hover', 0),
  )
  await record(
    at('b', 'travel card focus'),
    spec('/travel'),
    on('.trip-card', 'focus', 0),
  )
  await record(at('b', 'travel index print'), {
    ...spec('/travel'),
    media: 'print',
  })
  await record(at('b', 'trip'), spec(TRIP))
  await record(at('b', 'trip print'), { ...spec(TRIP), media: 'print' })
  await record(at('b', 'trip reduce'), { ...spec(TRIP), reduce: true })
  await record(at('b', 'trip touch'), { ...spec(TRIP), touch: true })
  await record(
    at('b', 'trip pin hover'),
    spec(TRIP),
    on('.drawn-map__pin', 'hover', 1),
  )
  await record(
    at('b', 'trip pin hover reduce'),
    { ...spec(TRIP), reduce: true },
    on('.drawn-map__pin', 'hover', 1),
  )
  await record(
    at('b', 'trip pin focus'),
    spec(TRIP),
    on('.drawn-map__pin', 'focus', 0),
  )
  await record(
    at('b', 'trip pin focus last'),
    spec(TRIP),
    on('.drawn-map__pin', 'focus', 3),
  )
  await record(
    at('b', 'trip stop link hover'),
    spec(TRIP),
    on('.drawn-map__stops a', 'hover', 1),
  )
  await record(
    at('b', 'trip place chip focus'),
    spec(TRIP),
    on('.trip-places a', 'focus', 1),
  )
  await record(
    at('b', 'trip place chip hover'),
    spec(TRIP),
    on('.trip-places a', 'hover', 1),
  )
  await record(
    at('b', 'trip photo hover'),
    spec(TRIP),
    on('.trip-photo__open', 'hover', 0),
  )
  await record(
    at('b', 'trip photo focus'),
    spec(TRIP),
    on('.trip-photo__open', 'focus', 0),
  )
  await record(
    at('b', 'trip nav hover'),
    spec(TRIP),
    on('.trip-nav a', 'hover', 0),
  )
  const lightbox = (inner) =>
    on('.trip-photo__open', 'press', 0, async (page) => {
      await page.locator('dialog.lightbox[open]').waitFor()
      await page.waitForTimeout(400)
      if (inner) await inner(page)
    })
  await record(at('b', 'lightbox open'), spec(TRIP), lightbox())
  await record(
    at('b', 'lightbox next'),
    spec(TRIP),
    lightbox(async (page) => {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(300)
    }),
  )
  await record(
    at('b', 'lightbox prev focus'),
    spec(TRIP),
    lightbox(async (page) => {
      await page.keyboard.press('Shift+Tab')
      await page.waitForTimeout(300)
    }),
  )
  await record(
    at('b', 'lightbox close focus'),
    spec(TRIP),
    lightbox(async (page) => {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(300)
    }),
  )
  await record(
    at('b', 'lightbox close hover'),
    spec(TRIP),
    lightbox(async (page) => {
      await page.locator('.lightbox__close').hover()
      await page.waitForTimeout(300)
    }),
  )
  if (vp === 'desktop')
    for (const edge of ['w320', 'w544', 'w640', 'w641', 'w960']) {
      await record(`screen ${theme} g2b trip ${edge}`, {
        path: TRIP,
        theme,
        vp: edge,
      })
      await record(
        `screen ${theme} g2b lightbox ${edge}`,
        { path: TRIP, theme, vp: edge },
        lightbox(),
      )
      await record(`screen ${theme} g2b travel ${edge}`, {
        path: '/travel',
        theme,
        vp: edge,
      })
    }
}
