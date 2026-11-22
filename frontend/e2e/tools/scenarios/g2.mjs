// Group G2's scenarios for style-dump.mjs (#536): everything still left in
// index.css. Three parts, one per commit: `g2a` (the Tour and the Colophon's
// architecture figure), `g2b` (Travel, in two vite dev servers: see README)
// and `g2c` (the leftovers). A scenario whose element the page does not draw
// logs `absent: <selector>` and is dumped as it stands, the same on both
// sides. Edge widths (`w544`, `w545`, `w960`, `w961`, `w320`) are viewports in
// style-dump.mjs: the Tour's breakpoints are 34rem and 60rem, inclusive.
import { readFileSync } from 'node:fs'
import { NEXT, PICK_TABLE } from '../../tools-data.fixtures.js'
import {
  COMIC_ID,
  GAME_ID,
  VOLUME_SLUG,
  mockAdminData,
} from '../../admin-data-mocks.js'

const api = (name) =>
  JSON.parse(
    readFileSync(new URL(`../../fixtures/api/${name}.json`, import.meta.url)),
  )
const BOOK_LINE = '33333333-bbbb-4bbb-8bbb-000000000003'
const SINGLE = '44444444-bbbb-4bbb-8bbb-000000000004'

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
    on('.drawn-map__pin', 'focus', 2),
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

  // ---------- g2c: the comic admin pages, the add form, the Book page ----------
  const admin = (path) => spec(path, undefined, { mock: mockAdminData })
  const page = (path, routes) =>
    spec(path, undefined, {
      mock: async (p) => {
        for (const [pattern, name] of routes)
          await p.route(pattern, (r) => json(r, api(name)))
      },
    })
  const comic = admin(`/admin/shelf/comics/${COMIC_ID}`)
  const volume = admin(`/admin/shelf/comics/${COMIC_ID}/${VOLUME_SLUG}`)
  await record(at('c', 'admin comic'), comic)
  await record(
    at('c', 'admin comic issue focus'),
    comic,
    on('.admin-comic-add input', 'focus', 0),
  )
  await record(
    at('c', 'admin comic hint'),
    comic,
    on('.comic-hint', 'hover', 0),
  )
  await record(at('c', 'admin comic touch'), { ...comic, touch: true })
  await record(at('c', 'admin comic print'), { ...comic, media: 'print' })
  await record(at('c', 'admin volume'), volume)
  await record(at('c', 'admin volume touch'), { ...volume, touch: true })
  await record(
    at('c', 'admin comic book hover'),
    comic,
    on('.admin-book', 'hover', 0),
  )
  await record(
    at('c', 'admin comic field focus'),
    comic,
    on('.admin-book-add-fields input', 'focus', 0),
  )
  await record(
    at('c', 'admin volume collect'),
    volume,
    on('.admin-collect', 'hover', 0),
  )
  await record(
    at('c', 'admin volume neighbour hover'),
    volume,
    on('.edition-neighbour', 'hover', 0),
  )
  await record(
    at('c', 'admin volume neighbour focus'),
    volume,
    on('.edition-neighbour', 'focus', 0),
  )
  await record(
    at('c', 'admin comic add error'),
    comic,
    on(
      '.admin-book-add button[type=submit], .admin-book-add button',
      'press',
      0,
    ),
  )
  await record(
    at('c', 'admin volume collect add'),
    volume,
    on('.admin-collect-actions button', 'press', 0),
  )
  await record(at('c', 'admin game'), admin(`/admin/collection/${GAME_ID}`))
  await record(
    at('c', 'admin game tag focus'),
    admin(`/admin/collection/${GAME_ID}`),
    on('.tag-picker input, .tag-picker button', 'focus', 0),
  )
  // The Games page: its List view (the item table) and the full add form.
  const games = spec('/admin/shelf/games', 'shelf')
  const list = async (page) => {
    await page.getByRole('button', { name: 'List', exact: true }).click()
    await page.waitForTimeout(400)
  }
  const form = async (page) => {
    await page.locator('.full-add-form summary').click()
    await page.waitForTimeout(400)
  }
  await record(at('c', 'admin games list'), games, list)
  await record(
    at('c', 'admin games list touch'),
    { ...games, touch: true },
    list,
  )
  await record(
    at('c', 'admin games list button hover'),
    games,
    async (page) => {
      await list(page)
      await page.locator('.item-table button').first().hover()
      await page.waitForTimeout(300)
    },
  )
  await record(
    at('c', 'admin games list select focus'),
    games,
    async (page) => {
      await list(page)
      await page.locator('.item-table select').first().focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await page.waitForTimeout(300)
    },
  )
  await record(at('c', 'admin games form'), games, form)
  await record(at('c', 'admin games form field focus'), games, async (page) => {
    await form(page)
    await page.locator('.item-form input').first().focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)
  })
  await record(
    at('c', 'admin games form select focus'),
    games,
    async (page) => {
      await form(page)
      await page.locator('.item-form select').first().focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await page.waitForTimeout(300)
    },
  )
  await record(
    at('c', 'admin games form button hover'),
    games,
    async (page) => {
      await form(page)
      await page.locator('.item-form button').first().hover()
      await page.waitForTimeout(300)
    },
  )
  await record(
    at('c', 'admin games form submit empty'),
    games,
    async (page) => {
      await form(page)
      await page.locator('.item-form button[type=submit]').first().click()
      await page.waitForTimeout(400)
    },
  )
  await record(at('c', 'admin collection add'), admin('/admin/collection/add'))
  await record(
    at('c', 'admin volume link'),
    volume,
    on('.comic-edition-link', 'hover', 0),
  )
  await record(
    at('c', 'public single book'),
    page(`/shelf/${SINGLE}`, [
      [`**/api/public/items/${SINGLE}`, 'public-comic-single_book'],
    ]),
  )
  await record(
    at('c', 'public book line'),
    page(`/shelf/${BOOK_LINE}`, [
      [`**/api/public/items/${BOOK_LINE}`, 'public-comic-book_line'],
    ]),
  )
  await record(
    at('c', 'public volume'),
    page(`/shelf/${BOOK_LINE}/vol-1`, [
      [`**/api/public/items/${BOOK_LINE}/volumes/vol-1`, 'volume'],
    ]),
  )
  await record(
    at('c', 'public volume neighbour hover'),
    page(`/shelf/${BOOK_LINE}/vol-1`, [
      [`**/api/public/items/${BOOK_LINE}/volumes/vol-1`, 'volume'],
    ]),
    on('.edition-neighbour', 'hover', 0),
  )
  await record(
    at('c', 'public volume neighbour focus'),
    page(`/shelf/${BOOK_LINE}/vol-1`, [
      [`**/api/public/items/${BOOK_LINE}/volumes/vol-1`, 'volume'],
    ]),
    on('.edition-neighbour', 'focus', 0),
  )
  await record(at('c', 'load state'), spec('/shelf/games', 'skeleton'), (p) =>
    p.waitForTimeout(4500),
  )
  await record(at('c', 'now'), spec('/now'))
}
