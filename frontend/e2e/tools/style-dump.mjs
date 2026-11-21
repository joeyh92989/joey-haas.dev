// Computed-style dump (#536): proves a CSS move changed nothing the browser
// computes. See README.md in this folder.
//
//   node e2e/tools/style-dump.mjs <baseUrl> <out.json>
//
// Opens a fixed list of pages (themes x desktop/phone, plus print and
// reduced-motion passes) and records getComputedStyle of a stable property
// subset for every element and its ::before/::after.
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { GARMENTS, mockCloset } from '../closet-mocks.js'
import { serveHome } from '../admin-home.fixtures.js'
import { COMICS, GAMES, serveAdmin } from '../admin-shelf.fixtures.js'
import { serveAdminAdd } from '../admin-add.fixtures.js'
import { mockDenverSite } from '../denver-site-mocks.js'
import { NEXT, SPOTS, PICK_TABLE, serve } from '../tools-data.fixtures.js'

const [base, out] = process.argv.slice(2)
if (!base || !out) {
  console.error('usage: style-dump.mjs <baseUrl> <out.json>')
  process.exit(2)
}

const PROPS = [
  'color',
  'background-color',
  'background-image',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration-line',
  'text-transform',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-top-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'border-top-left-radius',
  'display',
  'position',
  'width',
  'height',
  'min-width',
  'max-width',
  'flex-direction',
  'flex-wrap',
  'gap',
  'grid-template-columns',
  'align-items',
  'justify-content',
  'overflow-x',
  'overflow-y',
  'opacity',
  'box-shadow',
  'transform',
  'z-index',
  'cursor',
  'outline-width',
  'outline-style',
  'outline-color',
  'outline-offset',
  'box-sizing',
  'white-space',
  'visibility',
  'clip-path',
  'content',
  'transition-property',
  'animation-name',
  'page-break-inside',
  'break-inside',
  'list-style-type',
  'vertical-align',
  'border-collapse',
  'resize',
  'text-indent',
  'appearance',
]

const PLAY_CARD = {
  item_id: 'p1',
  type: 'game',
  title: 'Pinned Game',
  cover_url: null,
  platform: 'Nintendo Switch 2',
  time_to_beat_hours: 30,
  playthrough: 1,
  playing_since: '2026-10-24',
  last_played_on: '2026-11-07',
  journal_hours: 31,
  sessions: 9,
  stale: false,
}
const playPick = (id, title, slot, slotLabel) => ({
  slot,
  slot_label: slotLabel,
  score: 80,
  reasons: [`Reason for ${title}`],
  item: {
    id,
    title,
    year: 2020,
    cover_url: null,
    type: 'game',
    platform: 'Nintendo Switch',
    genres: ['Indie', 'Platform', 'Action', 'Extra'],
    time_to_beat_hours: 8,
  },
})
const PLAY_PICKS = {
  picks: [
    playPick('a', 'Dead Cells', 'best_fit', 'Best fit'),
    playPick('b', 'Slay the Spire', 'short_and_sweet', 'Short and sweet'),
    playPick('c', 'Old Puzzle', 'overdue_classic', 'Overdue classic'),
  ],
  candidate_count: 12,
  profile_size: 9,
}

const NOW = new Date('2026-12-15T18:00:00Z')
const SERIES = '/shelf/22222222-bbbb-4bbb-8bbb-000000000002/'
const ITEM = '/shelf/11111111-aaaa-4aaa-8aaa-000000000001/'
const PUBLIC = [
  '/',
  '/about',
  '/projects',
  '/blog/how-my-shelf-works',
  '/shelf/games',
  ITEM,
  SERIES,
  '/e2e-no-such-page',
  '/daily',
  '/stats',
  '/now',
  '/denver',
  '/shelf/how',
  '/shelf/year/2025/',
  '/colophon',
  '/shelf/comics',
  '/blog',
  '/til',
  '/til/profile-before-parallelizing-ci',
  '/til/render-rewrites-need-the-slash',
  '/travel',
  '/shelf/intake',
  '/shelf/year',
  '/shelf/how/',
]
const ADMIN = [
  ['/admin', 'home'],
  ['/admin/jobs', 'home'],
  ['/admin/shelf/games', 'shelf'],
  ['/admin/closet/today', 'closet'],
  ['/admin/closet', 'closet'],
  ['/admin/closet/profile', 'closet'],
  ['/admin/closet/review', 'closet'],
  [`/admin/closet/${GARMENTS[0].id}`, 'closet'],
  ['/admin/shelf/comics', 'shelf'],
  ['/admin/collection/add', 'add'],
  ['/admin/closet/add', 'add'],
  ['/admin/collection/add/s1', 'add'],
  ['/admin/collection/add/chk', 'add'],
  ['/admin/collection/add/det', 'add'],
  ['/admin/discover', 'add'],
  ['/admin/radar', 'add'],
  ['/admin/pull-list', 'add'],
  [`/admin/collection/${GAMES[2].id}`, 'item'],
  [`/admin/shelf/comics/${COMICS[0].id}`, 'comic'],
  ['/admin/play-next', 'shelf'],
  ['/admin/catalogue', 'shelf'],
]
// Denver, spots and the map (slice D3): the public /denver page's snapshot
// (the four tools-data spots, a crowded extra one, one outside the drawing),
// What's next's body (for the jump row) and the admin Denver pages' mocks.
const edge = (id, name, lat, lng) => ({
  spot_id: id,
  name,
  slug: id,
  neighbourhood: 'Edge',
  tags: ['park'],
  blurb: null,
  lat,
  lng,
})
const DENVER_SPOTS = [
  ...SPOTS,
  // Pins near the drawing's top, left, right and bottom edges, so the
  // popover's below / start / end placements all show.
  edge('e1', 'Top left corner', 39.7718, -105.0224),
  edge('e2', 'Top right corner', 39.7718, -104.9568),
  edge('e3', 'Bottom right corner', 39.7368, -104.9568),
  edge('e4', 'Middle left edge', 39.7521, -105.0224),

  {
    spot_id: 's5',
    name: 'Red Rocks Park and Amphitheatre with a long name that wraps',
    slug: 'red-rocks',
    neighbourhood: 'Morrison and the foothills of the whole front range',
    tags: ['park', 'kid-ok', 'rainy-day', 'coffee', 'food', 'bike-friendly'],
    blurb: 'A long blurb that wraps over a couple of lines on a phone, too.',
    lat: 39.6654,
    lng: -105.2057,
  },
  {
    spot_id: 's6',
    name: 'Boulder Creek Path',
    slug: 'boulder-creek',
    neighbourhood: 'Boulder',
    tags: ['bike-friendly'],
    blurb: null,
    lat: 40.015,
    lng: -105.27,
  },
]
const NEXT_ROWS = {
  ...NEXT,
  buy_now: ['One', 'Two'].map((title) => ({
    title,
    platform: 'Nintendo Switch 2',
    physical_format: 'game_card',
    release_date: null,
    release_precision: null,
    cover_url: null,
    igdb_url: null,
    reasons: [],
    top_pick: false,
    new: false,
    item_id: null,
  })),
}
// The signed-out gate and the access-denied gate (AdminLayout, no shell).
const GATES = ['/admin', '/admin?error=access_denied']
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 393, height: 851 },
}

async function dumpPage(page) {
  return page.evaluate((props) => {
    const rows = {}
    const path = (el) => {
      const parts = []
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const sib = n.parentElement
          ? [...n.parentElement.children].indexOf(n)
          : 0
        parts.push(`${n.tagName.toLowerCase()}[${sib}]`)
      }
      return parts.reverse().join('>')
    }
    const read = (el, pseudo) => {
      const cs = getComputedStyle(el, pseudo)
      return props.map((p) => cs.getPropertyValue(p)).join('|')
    }
    for (const el of document.querySelectorAll('html, body, body *')) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue
      const key = path(el)
      rows[key] = read(el)
      if (['INPUT', 'TEXTAREA'].includes(el.tagName) && el.placeholder)
        rows[key + '::placeholder'] = read(el, '::placeholder')
      for (const pseudo of ['::before', '::after']) {
        if (getComputedStyle(el, pseudo).content !== 'none')
          rows[key + pseudo] = read(el, pseudo)
      }
    }
    return rows
  }, PROPS)
}

async function openSearch(page, query) {
  await page.keyboard.press('Control+k')
  if (!(await page.locator('.search-dialog[open]').count()))
    await page
      .getByRole('button', { name: /search/i })
      .first()
      .click()
  await page.locator('.search-dialog[open]').waitFor()
  if (query) await page.locator('.search-input').fill(query)
  await page.waitForTimeout(400)
}

async function openMore(page) {
  const button = page.locator('.more-btn')
  if (await button.isVisible()) await button.click()
  await page.waitForTimeout(300)
}

async function open(
  browser,
  { path, theme, vp, kind, media, reduce, noIndex, serve: served, touch },
) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[vp],
    reducedMotion: reduce ? 'reduce' : 'no-preference',
    ...(touch ? { hasTouch: true, isMobile: true } : {}),
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  await page.clock.setFixedTime(NOW)
  await page.route('**/api/**', (r) => r.abort())
  if (kind === 'signed-in')
    await page.route('**/api/auth/me', (r) =>
      r.fulfill({ json: { email: 'a@example.com' } }),
    )
  if (noIndex) await page.route('**/search-index.json', (r) => r.abort())
  if (kind === 'home') await serveHome(page)
  if (kind === 'shelf') await serveAdmin(page, GAMES)
  if (kind === 'shelf-comics') await serveAdmin(page, COMICS)
  if (kind === 'play-next') {
    await serveAdmin(page, GAMES)
    await page.route('**/api/picker/**', (route) => {
      const path = new URL(route.request().url()).pathname
      const json = (body) =>
        route.fulfill({ contentType: 'application/json', json: body })
      if (path.endsWith('/continuing')) return json({ cards: [PLAY_CARD] })
      if (path.endsWith('/skipped-today')) return json({ item_ids: [] })
      if (path.endsWith('/next')) return json(PLAY_PICKS)
      return json({})
    })
  }
  if (served) await serve(page, served)
  if (kind === 'denver' || kind === 'next') {
    const json = (body) => (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    const bodies =
      kind === 'denver'
        ? { spots: DENVER_SPOTS }
        : { next: NEXT_ROWS, 'pick-for-me': PICK_TABLE }
    for (const [name, body] of Object.entries(bodies)) {
      await page.route(`**/snapshot/${name}.json`, json(body))
      await page.route(`**/api/public/${name}`, json(body))
    }
  }
  if (kind === 'denver-admin') await mockDenverSite(page)
  if (kind === 'gate') {
    await page.route('**/api/auth/me', (r) =>
      r.fulfill({ status: 401, json: { detail: 'no' } }),
    )
  }
  if (kind === 'comics') await serveAdmin(page, COMICS)
  if (kind === 'add') await serveAdminAdd(page)
  if (kind === 'item' || kind === 'comic') {
    const rows = kind === 'item' ? GAMES : COMICS
    await serveAdmin(page, rows)
    await page.route(/\/api\/items\/[\w-]+$/, (r) =>
      r.request().method() === 'GET'
        ? r.fulfill({
            json: rows.find((x) => r.request().url().endsWith(x.id)) ?? {},
          })
        : r.fallback(),
    )
  }
  if (kind === 'admin-comics') await serveAdmin(page, COMICS)
  if (kind === 'skeleton') {
    await page.route('**/snapshot/**', (r) => r.abort())
    await page.route('**/api/**', () => {})
  }
  if (kind === 'admin-add' || kind === 'closet-add') await serveAdminAdd(page)
  if (kind === 'closet-add') {
    await page.route('**/api/auth/me', (r) =>
      r.fulfill({ json: { email: 'a@example.com' } }),
    )
    await mockCloset(page)
  }
  if (kind === 'closet') {
    await page.route('**/api/auth/me', (r) =>
      r.fulfill({ json: { email: 'a@example.com' } }),
    )
    await mockCloset(page)
  }
  await page.addInitScript((value) => {
    localStorage.setItem('theme', value)
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      value: true,
      configurable: true,
    })
  }, theme)
  await page.goto(base + path)
  await page
    .locator('h1')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {})
  if (kind !== 'skeleton') await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => {
    for (const img of document.querySelectorAll('img[loading="lazy"]'))
      img.loading = 'eager'
  })
  await page.mouse.move(1, 1)
  await page.waitForTimeout(600)
  if (media) await page.emulateMedia({ media })
  return { context, page }
}

const browser = await chromium.launch()
const result = {}
async function record(label, spec, after) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(label)) return
  // A busy machine can time a step out: try the scenario once more.
  for (let attempt = 1; ; attempt++) {
    const { context, page } = await open(browser, spec)
    try {
      if (after)
        await after(page).catch((error) =>
          console.error(`${label}: ${String(error).split('\n')[0]}`),
        )
      // Let hover, focus and state transitions settle: a half-faded colour is
      // timing, not a style.
      await page.waitForTimeout(500)
      result[label] = await dumpPage(page)
      return
    } catch (error) {
      if (attempt === 3) throw error
      console.error(`retrying ${label}: ${error.message.split('\n')[0]}`)
    } finally {
      await context.close()
    }
  }
}

// Slice D3's scenarios: /denver in list and map view, a selected spot at each
// pin, a pressed chip, hover and focus on a pin, a card name and a chip, the
// What's next jump row, and the admin Weekend, Spots and Analytics pages.
async function denverScenarios(theme, vp) {
  const denver = { path: '/denver', theme, vp, kind: 'denver' }
  const pins = '.spot-map-pin'
  const showMap = async (page) => {
    const toggle = page.getByRole('button', { name: 'Map', exact: true })
    if (await toggle.count()) await toggle.click()
    await page.locator(pins).first().waitFor()
  }
  await record(`screen ${theme} ${vp} denver-list`, denver)
  await record(`screen ${theme} ${vp} denver-map`, denver, showMap)
  for (let i = 0; i < 6; i += 1)
    await record(
      `screen ${theme} ${vp} denver-pin-${i}`,
      denver,
      async (page) => {
        await showMap(page)
        if ((await page.locator(pins).count()) <= i) return
        await page.locator(pins).nth(i).click()
        await page.mouse.move(1, 1)
        await page.waitForTimeout(300)
      },
    )
  await record(
    `screen ${theme} ${vp} denver-pin-hover`,
    denver,
    async (page) => {
      await showMap(page)
      await page.locator(pins).nth(1).hover()
      await page.waitForTimeout(300)
    },
  )
  await record(
    `screen ${theme} ${vp} denver-pin-focus`,
    denver,
    async (page) => {
      await showMap(page)
      await page.locator(pins).nth(1).focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await page.waitForTimeout(300)
    },
  )
  await record(
    `screen ${theme} ${vp} denver-card-selected`,
    denver,
    async (page) => {
      await page.locator('.spot-card-name button').nth(1).click()
      await page.mouse.move(1, 1)
      await page.waitForTimeout(300)
    },
  )
  await record(
    `screen ${theme} ${vp} denver-card-hover`,
    denver,
    async (page) => {
      await page.locator('.spot-card-name button').nth(2).hover()
    },
  )
  await record(
    `screen ${theme} ${vp} denver-card-focus`,
    denver,
    async (page) => {
      for (let i = 0; i < 9; i += 1) await page.keyboard.press('Tab')
    },
  )
  await record(
    `screen ${theme} ${vp} denver-chip-pressed`,
    denver,
    async (page) => {
      await page.getByRole('button', { name: /^Park/ }).click()
      await page.mouse.move(1, 1)
      await page.waitForTimeout(300)
    },
  )
  await record(
    `screen ${theme} ${vp} denver-chip-hover`,
    denver,
    async (page) => {
      await page.getByRole('button', { name: /^Kid/ }).hover()
    },
  )
  await record(
    `screen ${theme} ${vp} denver-chip-focus`,
    denver,
    async (page) => {
      for (let i = 0; i < 4; i += 1) await page.keyboard.press('Tab')
    },
  )
  await record(
    `screen ${theme} ${vp} denver-no-match`,
    denver,
    async (page) => {
      await page.goto(`${base}/denver?tag=park,coffee`)
      await page.waitForTimeout(600)
    },
  )
  await record(`screen ${theme} ${vp} denver-empty`, denver, async (page) => {
    for (const url of ['**/snapshot/spots.json', '**/api/public/spots'])
      await page.route(url, (route) =>
        route.fulfill({ contentType: 'application/json', body: '[]' }),
      )
    await page.goto(`${base}/denver`)
    await page.waitForTimeout(600)
  })
  await record(
    `screen ${theme} ${vp} denver-clear-focus`,
    denver,
    async (page) => {
      await showMap(page)
      await page.locator(pins).nth(1).click()
      await page.getByRole('button', { name: 'Clear selection' }).focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
    },
  )
  const next = { path: '/shelf/next', theme, vp, kind: 'next' }
  await record(`screen ${theme} ${vp} next-jump`, next)
  await record(`screen ${theme} ${vp} next-jump-hover`, next, async (page) => {
    await page.locator('.jump-nav a').nth(1).hover()
  })
  await record(`screen ${theme} ${vp} next-jump-focus`, next, async (page) => {
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab')
  })
  await record(
    `screen ${theme} ${vp} next-jump-scrolled`,
    next,
    async (page) => {
      await page.evaluate(() => window.scrollTo(0, 600))
      await page.waitForTimeout(300)
    },
  )
  for (const path of ['/admin/weekend', '/admin/spots', '/admin/analytics'])
    await record(`screen ${theme} ${vp} ${path}`, {
      path,
      theme,
      vp,
      kind: 'denver-admin',
    })
  const click = (name) => async (page) => {
    await page.getByRole('button', { name }).first().click()
    await page.waitForTimeout(300)
  }
  const admin = (path) => ({ path, theme, vp, kind: 'denver-admin' })
  await record(
    `screen ${theme} ${vp} weekend-edit`,
    admin('/admin/weekend'),
    click(/^Edit/),
  )
  await record(
    `screen ${theme} ${vp} spots-form`,
    admin('/admin/spots'),
    click('Add by hand'),
  )
  await record(
    `screen ${theme} ${vp} analytics-all`,
    admin('/admin/analytics'),
    click('All'),
  )
  await record(
    `screen ${theme} ${vp} weekend-tab`,
    admin('/admin/weekend'),
    async (page) => {
      for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab')
    },
  )
  await record(
    `screen ${theme} ${vp} spots-tab`,
    admin('/admin/spots'),
    async (page) => {
      for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab')
    },
  )
}

// Slice D4 (#536): the shelf lists, tools and charts. Fixture titles for the
// Daily game's guesses.
const FIXTURE_GAMES = JSON.parse(
  readFileSync(
    new URL('../fixtures/snapshot/items.json', import.meta.url),
    'utf8',
  ),
)
  .filter((item) => item.type === 'game')
  .map((item) => item.title)

async function guess(page, titles) {
  const box = page.getByRole('combobox', { name: 'Your guess' })
  for (const title of titles) {
    if (await page.locator('.daily-result').count()) return
    await box.fill(title)
    await box.press('Enter')
    await page.waitForTimeout(150)
  }
}

async function press(page, name) {
  const button = page.getByRole('button', { name, exact: false }).first()
  if (await button.isVisible()) await button.click()
  await page.waitForTimeout(250)
}

async function d4(theme, vp) {
  const shelf = ['/shelf/games', '/shelf/comics']
  for (const path of shelf) {
    const at = (name) => `screen ${theme} ${vp} d4 ${path} ${name}`
    await record(at('spines'), { path: path + '?view=spines', theme, vp })
    await record(at('search'), { path: path + '?q=a', theme, vp })
    await record(at('empty'), { path: path + '?q=zzqqxx', theme, vp })
    await record(at('filtered'), { path, theme, vp }, async (page) => {
      await page.locator('.chip-rows .chip, .chip-row .chip').nth(2).click()
      await page.waitForTimeout(300)
    })
    await record(at('sorted'), { path, theme, vp }, async (page) => {
      const select = page.locator('.sort-select select')
      if (await select.count()) await select.selectOption({ index: 1 })
      await press(page, 'Order:')
    })
    await record(at('dim'), { path, theme, vp }, (page) =>
      press(page, 'Dim finished'),
    )
    await record(at('dim-hover'), { path, theme, vp }, async (page) => {
      await press(page, 'Dim finished')
      await page.locator('.poster-card[data-dimmed]').first().hover()
      await page.waitForTimeout(300)
    })
    await record(at('compact'), { path, theme, vp }, (page) =>
      press(page, 'Compact'),
    )
    await record(at('show-all'), { path, theme, vp }, (page) =>
      press(page, 'Show all'),
    )
    await record(at('overview-open'), { path, theme, vp }, async (page) => {
      await press(page, 'charts')
      await page.locator('#overview').scrollIntoViewIfNeeded()
    })
    await record(at('card-hover'), { path, theme, vp }, async (page) => {
      await page.locator('.poster-card').nth(1).hover()
      await page.waitForTimeout(300)
    })
    await record(at('tab-focus'), { path, theme, vp }, async (page) => {
      await page.getByRole('searchbox').first().focus()
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab')
        if (
          await page.evaluate(
            () => !!document.activeElement.closest('.poster-card'),
          )
        )
          break
      }
    })
    await record(at('reduce'), { path, theme, vp, reduce: true }, (page) =>
      page.locator('.poster-card').nth(1).hover(),
    )
  }
  for (const path of [
    '/shelf/journal/2025-03',
    '/shelf/year/2025/',
    '/shelf/year',
  ])
    await record(`screen ${theme} ${vp} d4 ${path}`, { path, theme, vp })
  await record(
    `screen ${theme} ${vp} d4 /stats data`,
    { path: '/stats', theme, vp, serve: ['site-stats'] },
    async (page) => {
      await page.locator('.day-bars').waitFor()
      await page.locator('.day-bar').nth(8).hover()
    },
  )
  await record(`screen ${theme} ${vp} d4 /daily empty`, {
    path: '/daily',
    theme,
    vp,
  })
  await record(
    `screen ${theme} ${vp} d4 /daily mid`,
    { path: '/daily', theme, vp },
    (page) => guess(page, FIXTURE_GAMES.slice(1, 3)),
  )
  await record(
    `screen ${theme} ${vp} d4 /daily open-list`,
    { path: '/daily', theme, vp },
    async (page) => {
      await page.getByRole('combobox', { name: 'Your guess' }).fill('Fixture')
      await page.waitForTimeout(300)
    },
  )
  await record(
    `screen ${theme} ${vp} d4 /daily done`,
    { path: '/daily', theme, vp },
    (page) => guess(page, FIXTURE_GAMES.slice(1, 14)),
  )
  await record(
    `screen ${theme} ${vp} d4 /daily share`,
    { path: '/daily', theme, vp },
    async (page) => {
      await guess(page, FIXTURE_GAMES.slice(1, 14))
      await press(page, 'Share')
      await page.waitForTimeout(400)
    },
  )
  const next = {
    path: '/shelf/next',
    theme,
    vp,
    serve: ['next', 'pick-for-me'],
  }
  await record(`screen ${theme} ${vp} d4 /shelf/next`, next)
  await record(
    `screen ${theme} ${vp} d4 /shelf/next pick`,
    next,
    async (page) => {
      await page.locator('#pick-for-me').waitFor()
      await page
        .getByRole('radio', { name: /Any length/ })
        .check({ force: true })
      await page.getByRole('button', { name: 'Cozy' }).click()
      await page.locator('.pick-cards > li').first().waitFor()
    },
  )
  await record(
    `screen ${theme} ${vp} d4 /shelf/next pick-tab`,
    next,
    async (page) => {
      await page.locator('#pick-for-me').waitFor()
      await page.getByRole('radio', { name: /Any length/ }).focus()
      for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab')
    },
  )
  for (const [path, kind] of [
    ['/admin/shelf/games', 'shelf'],
    ['/admin/shelf/comics', 'shelf-comics'],
  ]) {
    const at = (name) => `screen ${theme} ${vp} d4 ${path} ${name}`
    await record(at('hover'), { path, theme, vp, kind }, async (page) => {
      await page.locator('.poster-card').nth(1).hover()
      await page.waitForTimeout(300)
    })
    await record(at('tab-focus'), { path, theme, vp, kind }, async (page) => {
      await page.getByRole('searchbox').first().focus()
      for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab')
    })
    await record(at('dim'), { path, theme, vp, kind }, (page) =>
      press(page, 'Dim finished'),
    )
    // The admin lists start dimmed; Dim finished above turns it off.
    await record(at('dim-hover'), { path, theme, vp, kind }, async (page) => {
      await page.locator('.poster-card[data-dimmed]').first().hover()
      await page.waitForTimeout(300)
    })
    await record(at('star-hover'), { path, theme, vp, kind }, async (page) => {
      const card = page.locator('.poster-card').nth(1)
      await card.hover()
      await page.waitForTimeout(300)
      await card.locator('.quick-rate-target').nth(5).hover()
      await page.waitForTimeout(200)
    })
    await record(at('empty'), { path: path + '?q=zzqqxx', theme, vp, kind })
    await record(at('spines'), { path: path + '?view=spines', theme, vp, kind })
    if (vp === 'phone') {
      await record(
        at('sheet-open'),
        { path, theme, vp, kind, touch: true },
        async (page) => {
          await page
            .getByRole('button', { name: /^Actions for / })
            .nth(1)
            .click()
          await page.locator('dialog.shelf-sheet[open]').waitFor()
          await page.waitForTimeout(300)
        },
      )
      await record(at('touch'), { path, theme, vp, kind, touch: true })
    }
    if (path.endsWith('comics'))
      await record(at('plain'), { path, theme, vp, kind })
  }
  await record(`screen ${theme} ${vp} d4 /admin/play-next`, {
    path: '/admin/play-next',
    theme,
    vp,
    kind: 'play-next',
  })
}

async function loaded(page) {
  await page
    .locator('.stat-tile, .poster-card, .status-bar, .day-bars')
    .first()
    .waitFor({ timeout: 6000 })
    .catch(() => {})
  await page.waitForTimeout(300)
}

async function act(page, selector, n, action) {
  const found = await page
    .locator(selector)
    .first()
    .waitFor({ timeout: 6000 })
    .then(
      () => true,
      () => false,
    )
  if (!found) {
    console.error(`absent: ${selector}`)
    return
  }
  await page.locator(selector).nth(n)[action]({ timeout: 5000 })
  await page.waitForTimeout(250)
}

// Slice D4b (#536): the shelf overview, the charts and the stat tiles.
async function d4b(theme, vp) {
  const at = (name) => `screen ${theme} ${vp} d4b ${name}`
  const overview = async (page) => {
    await loaded(page)
    await press(page, 'charts')
    if (await page.locator('#overview').count())
      await page.locator('#overview').scrollIntoViewIfNeeded()
  }
  const focusBar = (selector, n) => async (page) => {
    await overview(page)
    await act(page, selector, n, 'focus')
  }
  const hoverBar = (selector, n) => async (page) => {
    await overview(page)
    await act(page, selector, n, 'hover')
  }
  for (const [path, kind] of [
    ['/shelf/games', undefined],
    ['/shelf/comics', undefined],
    ['/admin/shelf/games', 'shelf'],
    ['/admin/shelf/comics', 'shelf-comics'],
  ]) {
    const base = { path, theme, vp, kind }
    const name = (s) => at(`${path} ${s}`)
    await record(name('overview'), base, overview)
    await record(name('rating-hover'), base, hoverBar('.rating-bar', 6))
    await record(name('rating-focus'), base, focusBar('.rating-bar', 6))
    await record(name('month-hover'), base, hoverBar('.month-bar', 11))
    await record(name('month-focus'), base, focusBar('.month-bar', 11))
    await record(
      name('reduce'),
      { ...base, reduce: true },
      hoverBar('.month-bar', 11),
    )
    await record(name('closed'), base, loaded)
    await record(name('favourite-focus'), base, async (page) => {
      await overview(page)
      await act(page, '.favourite-link', 0, 'focus')
    })
    await record(name('now-hover'), base, async (page) => {
      await act(page, '.now-playing-card', 0, 'hover')
    })
    await record(name('now-focus'), base, async (page) => {
      await act(page, '.now-playing-card', 0, 'focus')
    })
    await record(
      name('query-empty'),
      { ...base, path: path + '?q=zzqqxx' },
      loaded,
    )
  }
  await record(
    at('admin-games-touch'),
    {
      path: '/admin/shelf/games',
      theme,
      vp,
      kind: 'shelf',
      touch: true,
    },
    loaded,
  )
  await record(at('/shelf/games item'), { path: ITEM, theme, vp }, loaded)
  await record(at('/shelf/comics series'), { path: SERIES, theme, vp }, loaded)
  for (const path of ['/shelf/year/2025/', '/shelf/year/2025'])
    await record(at(path), { path, theme, vp }, (page) =>
      act(page, '.month-bar', 2, 'hover'),
    )
  await record(
    at('/shelf/year/2025 focus'),
    { path: '/shelf/year/2025/', theme, vp },
    (page) => act(page, '.month-bar', 2, 'focus'),
  )
  await record(
    at('/stats'),
    { path: '/stats', theme, vp, serve: ['site-stats'] },
    async (page) => {
      await page.locator('.day-bars').waitFor()
      await act(page, '.day-bar', 8, 'hover')
    },
  )
  await record(
    at('/stats all'),
    { path: '/stats', theme, vp, serve: ['site-stats'] },
    async (page) => {
      await page.locator('.day-bars').waitFor()
      await press(page, 'All')
    },
  )
  for (const range of [undefined, 'All'])
    await record(
      at(`/admin/analytics ${range ?? '30'}`),
      { path: '/admin/analytics', theme, vp, kind: 'denver-admin' },
      async (page) => {
        await page.locator('.day-bars').waitFor()
        if (range) await press(page, range)
        await act(page, '.day-bar', 8, 'hover')
      },
    )
  await record(at('/admin/catalogue'), {
    path: '/admin/catalogue',
    theme,
    vp,
    kind: 'home',
  })
  await record(at('/admin/closet/review'), {
    path: '/admin/closet/review',
    theme,
    vp,
    kind: 'closet',
  })
}

// Slice D5 (#536): the Closet leftovers and the admin intake (add) flow.
async function click(page, name, opts = {}) {
  const button = page.getByRole('button', { name, ...opts }).first()
  await button.click()
  await page.waitForTimeout(300)
}

async function d5(theme, vp) {
  const at = (name) => `screen ${theme} ${vp} d5 ${name}`
  const closet = (path) => ({ path, theme, vp, kind: 'closet' })
  const add = (path) => ({ path, theme, vp, kind: 'admin-add' })
  await record(at('/admin/closet/today'), closet('/admin/closet/today'))
  await record(
    at('today match sheet'),
    closet('/admin/closet/today'),
    async (page) => {
      await click(page, /^Match this/)
      const sheet = page.getByRole('dialog')
      await sheet
        .getByRole('button', { name: /closet/i })
        .first()
        .click()
      await page.waitForTimeout(300)
    },
  )
  await record(at('today swap sheet'), closet('/admin/closet/today'), (page) =>
    click(page, /^Swap/),
  )
  await record(at('today not-this'), closet('/admin/closet/today'), (page) =>
    click(page, /^Not this/),
  )
  await record(
    at('today tab-focus'),
    closet('/admin/closet/today'),
    async (page) => {
      for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab')
      // The focus ring's colour fades in (a transition): let it settle.
      await page.waitForTimeout(500)
    },
  )
  await record(at('/admin/closet'), closet('/admin/closet'))
  await record(at('/admin/closet list'), closet('/admin/closet'), (page) =>
    click(page, 'List', { exact: true }),
  )
  await record(
    at('/admin/closet tile-hover'),
    closet('/admin/closet'),
    async (page) => {
      await page.locator('.garment-tile').nth(1).hover()
      await page.waitForTimeout(300)
    },
  )
  await record(at('/admin/closet/review'), closet('/admin/closet/review'))
  await record(
    at('review sell sheet'),
    closet('/admin/closet/review'),
    (page) => click(page, /^Sell/),
  )
  await record(
    at('review pack month'),
    closet('/admin/closet/review'),
    (page) => click(page, /^Pack away/),
  )
  await record(at('/admin/closet/profile'), closet('/admin/closet/profile'))
  await record(at('/admin/closet/a'), closet('/admin/closet/a'))
  await record(at('garment delete'), closet('/admin/closet/a'), (page) =>
    click(page, 'Delete', { exact: true }),
  )
  await record(at('closet add'), add('/admin/closet/add'))
  const closetAdd = { path: '/admin/closet', theme, vp, kind: 'closet-add' }
  await record(at('closet add-bar'), closetAdd)
  await record(at('closet add links'), closetAdd, (page) =>
    click(page, /^Add from product links/),
  )
  await record(at('closet add typed'), closetAdd, async (page) => {
    await page.getByRole('textbox', { name: 'Add', exact: true }).fill('shirt')
    await page.waitForTimeout(300)
  })
  await record(at('add'), add('/admin/collection/add'))
  await record(at('add discard'), add('/admin/collection/add'), (page) =>
    click(page, /^Discard /),
  )
  await record(at('sitting'), add('/admin/collection/add/s1'))
  await record(at('sitting check'), add('/admin/collection/add/chk'))
  await record(at('sitting details'), add('/admin/collection/add/det'))
  await record(at('sitting done'), add('/admin/collection/add/det'), (page) =>
    click(page, /^Add \d+ to/),
  )
  await record(at('discover'), add('/admin/discover'))
  await record(at('radar'), add('/admin/radar'))
  await record(at('pull list'), add('/admin/pull-list'))
  await record(at('games'), add('/admin/shelf/games'))
  await record(
    at('games add results'),
    add('/admin/shelf/games'),
    async (page) => {
      await page.getByRole('searchbox', { name: 'Add' }).fill('zelda')
      await page.keyboard.press('Enter')
      await page.getByRole('list', { name: /^Results for/ }).waitFor()
    },
  )
  await record(
    at('games add drawer'),
    add('/admin/shelf/games'),
    async (page) => {
      await page.getByRole('searchbox', { name: 'Add' }).fill('zelda')
      await page.keyboard.press('Enter')
      await page.getByRole('list', { name: /^Results for/ }).waitFor()
      await click(page, /^Add (The Legend|Super)/)
    },
  )
  await record(at('games scanner'), add('/admin/shelf/games'), async (page) => {
    await click(page, /^Scan a barcode/)
    // The camera is refused after a moment: wait for that state.
    await page.waitForTimeout(1500)
  })
  await record(at('games wrap-up sheet'), add('/admin/shelf/games'), (page) =>
    click(page, /^Wrap up/),
  )
  await record(at('/shelf/intake'), { path: '/shelf/intake', theme, vp })
  await record(at('/shelf/intake reduce'), {
    path: '/shelf/intake',
    theme,
    vp,
    reduce: true,
  })
}

for (const theme of ['dark', 'light']) {
  for (const vp of ['desktop', 'phone']) {
    await d4(theme, vp)
    await d4b(theme, vp)
    for (const path of PUBLIC)
      await record(`screen ${theme} ${vp} ${path}`, { path, theme, vp })
    for (const [path, kind] of ADMIN)
      await record(`screen ${theme} ${vp} ${path}`, { path, theme, vp, kind })
    for (const path of GATES)
      await record(`screen ${theme} ${vp} gate ${path}`, {
        path,
        theme,
        vp,
        kind: 'gate',
      })
    // Admin states: the account menu, the swap sheets, the phone's page sheet
    // and the shelf's action sheet (slice D2 of #536).
    await record(
      `screen ${theme} ${vp} admin account-open`,
      { path: '/admin', theme, vp, kind: 'home' },
      async (page) => {
        await page.getByRole('button', { name: /^Account/ }).click()
        await page.mouse.move(1, 1)
        await page.waitForTimeout(400)
      },
    )
    await record(
      `screen ${theme} ${vp} admin home swap-open`,
      { path: '/admin', theme, vp, kind: 'home' },
      async (page) => {
        await page.getByRole('button', { name: 'Swap', exact: true }).click()
        await page.getByRole('dialog').waitFor()
        await page.mouse.move(1, 1)
        await page.waitForTimeout(400)
      },
    )
    await record(
      `screen ${theme} ${vp} admin closet-today swap-open`,
      { path: '/admin/closet/today', theme, vp, kind: 'closet' },
      async (page) => {
        await page.getByRole('button', { name: /^Swap/ }).first().click()
        await page.locator('.swap-choice').first().waitFor()
        await page.mouse.move(1, 1)
        await page.waitForTimeout(400)
      },
    )
    if (vp === 'phone') {
      await record(
        `screen ${theme} ${vp} admin segment-sheet-open`,
        { path: '/admin/shelf/games', theme, vp, kind: 'shelf' },
        async (page) => {
          await page
            .locator('.admin-subnav button[aria-haspopup="dialog"]')
            .first()
            .click()
          await page.locator('dialog[open]').waitFor()
          await page.mouse.move(1, 1)
          await page.waitForTimeout(400)
        },
      )
      await record(
        `screen ${theme} ${vp} admin shelf-actions-open`,
        { path: '/admin/shelf/games', theme, vp, kind: 'shelf', touch: true },
        async (page) => {
          await page
            .getByRole('button', { name: /^Actions for/ })
            .first()
            .click()
          await page.locator('dialog[open]').waitFor()
          await page.mouse.move(1, 1)
          await page.waitForTimeout(400)
        },
      )
    }
    await record(
      `screen ${theme} ${vp} search-open`,
      { path: '/', theme, vp },
      (page) => openSearch(page),
    )
    await record(
      `screen ${theme} ${vp} search-results`,
      { path: '/', theme, vp },
      (page) => openSearch(page, 'shelf'),
    )
    await record(
      `screen ${theme} ${vp} search-none`,
      { path: '/', theme, vp },
      (page) => openSearch(page, 'zzqqxx'),
    )
    await record(
      `screen ${theme} ${vp} search-unavailable`,
      { path: '/', theme, vp, noIndex: true },
      (page) => openSearch(page),
    )
    if (vp === 'phone')
      await record(
        `screen ${theme} ${vp} nav-sheet`,
        { path: '/now', theme, vp },
        async (page) => {
          await page.getByRole('button', { name: 'Menu' }).click()
          await page.locator('dialog.nav-sheet[open]').waitFor()
          await page.waitForTimeout(300)
        },
      )
    if (vp === 'phone')
      await record(
        `screen ${theme} ${vp} nav-sheet-about`,
        { path: '/about', theme, vp },
        async (page) => {
          await page.getByRole('button', { name: 'Menu' }).click()
          await page.locator('dialog.nav-sheet[open]').waitFor()
          await page.waitForTimeout(300)
        },
      )
    await record(
      `screen ${theme} ${vp} more-open-now`,
      { path: '/now', theme, vp },
      (page) => openMore(page),
    )
    await record(
      `screen ${theme} ${vp} more-open-hover`,
      { path: '/', theme, vp },
      async (page) => {
        await openMore(page)
        const link = page.locator('.more-btn + div a').nth(1)
        if (await link.isVisible()) await link.hover()
      },
    )
    await record(
      `screen ${theme} ${vp} nav-hover`,
      { path: '/about', theme, vp },
      async (page) => {
        const link = page.locator('.site-nav > a').nth(1)
        if (await link.isVisible()) await link.hover()
      },
    )
    await record(
      `screen ${theme} ${vp} tab-focus`,
      { path: '/about', theme, vp },
      async (page) => {
        for (let i = 0; i < 5; i += 1) await page.keyboard.press('Tab')
      },
    )
    await denverScenarios(theme, vp)
    await record(
      `screen ${theme} ${vp} footer-signed-in`,
      { path: '/about', theme, vp, kind: 'signed-in' },
      async (page) => {
        await page.locator('footer').scrollIntoViewIfNeeded()
      },
    )
    if (vp === 'phone')
      await record(
        `screen ${theme} ${vp} nav-sheet-open`,
        { path: '/', theme, vp },
        async (page) => {
          await page.getByRole('button', { name: 'Menu' }).click()
          await page.waitForTimeout(600)
        },
      )
    await d5(theme, vp)
  }
  for (const path of [
    '/about',
    '/blog/how-my-shelf-works',
    '/',
    '/projects',
    '/colophon',
    '/shelf/comics',
  ]) {
    await record(`print ${theme} ${path}`, {
      path,
      theme,
      vp: 'desktop',
      media: 'print',
    })
  }
  for (const path of ['/denver', '/shelf/next'])
    await record(`print ${theme} ${path}`, {
      path,
      theme,
      vp: 'desktop',
      media: 'print',
      kind: path === '/denver' ? 'denver' : 'next',
    })
  await record(
    `reduce ${theme} denver-pin`,
    { path: '/denver', theme, vp: 'desktop', reduce: true, kind: 'denver' },
    async (page) => {
      await page.locator('.spot-map-pin').nth(0).click()
      await page.waitForTimeout(300)
    },
  )
  await record(
    `reduce ${theme} search-open`,
    { path: '/', theme, vp: 'desktop', reduce: true },
    (page) => openSearch(page, 'shelf'),
  )
  await record(`reduce ${theme} /`, {
    path: '/',
    theme,
    vp: 'desktop',
    reduce: true,
  })
  await record(`reduce ${theme} /shelf/games`, {
    path: '/shelf/games',
    theme,
    vp: 'phone',
    reduce: true,
  })
}

// Shelf toolbar, chips, sort and results (slice D4c of #536).
const pressFirst = async (page, sel) => {
  const el = page.locator(sel).first()
  if (await el.isVisible().catch(() => false)) await el.click()
  await page.waitForTimeout(300)
}
for (const theme of ['dark', 'light']) {
  for (const vp of ['desktop', 'phone']) {
    const spec = { theme, vp }
    const tag = `d4c ${theme} ${vp}`
    for (const path of ['/shelf/games', '/shelf/comics'])
      await record(`${tag} ${path}`, { ...spec, path })
    await record(`${tag} /shelf/next`, {
      ...spec,
      path: '/shelf/next',
      kind: 'next',
    })
    await record(
      `${tag} games-pressed`,
      { ...spec, path: '/shelf/games' },
      async (page) => {
        await pressFirst(page, '.shelf-toolbar .chip[aria-pressed="false"]')
        await pressFirst(page, '.shelf-toolbar .chip[aria-pressed="false"]')
      },
    )
    await record(
      `${tag} games-search-focus`,
      { ...spec, path: '/shelf/games' },
      async (page) => {
        await page.locator('.shelf-search input').focus()
        await page.keyboard.type('zzqq')
        await page.waitForTimeout(500)
      },
    )
    await record(
      `${tag} games-hover-chip`,
      { ...spec, path: '/shelf/games' },
      async (page) => {
        const el = page.locator('.shelf-toolbar .chip').nth(2)
        if (await el.isVisible()) await el.hover()
      },
    )
    await record(
      `${tag} games-tab-focus`,
      { ...spec, path: '/shelf/games' },
      async (page) => {
        await page.locator('.shelf-search input').focus()
        for (let i = 0; i < 4; i += 1) await page.keyboard.press('Tab')
      },
    )
    await record(
      `${tag} games-disclosure`,
      { ...spec, path: '/shelf/games' },
      async (page) => {
        await pressFirst(page, '.disclosure')
      },
    )
    await record(
      `${tag} games-skeleton`,
      { ...spec, path: '/shelf/games', kind: 'skeleton' },
      (page) => page.waitForTimeout(4500),
    )
    await record(
      `${tag} item-skeleton`,
      { ...spec, path: ITEM, kind: 'skeleton' },
      (page) => page.waitForTimeout(4500),
    )
    await record(
      `${tag} comics-pressed`,
      { ...spec, path: '/shelf/comics' },
      async (page) => {
        await pressFirst(page, '.shelf-toolbar .chip[aria-pressed="false"]')
      },
    )
    await record(
      `${tag} comics-spines`,
      { ...spec, path: '/shelf/comics' },
      async (page) => {
        const el = page.getByRole('button', { name: /spines/i }).first()
        if (await el.isVisible()) await el.click()
        await page.waitForTimeout(400)
      },
    )
    await record(
      `${tag} comics-search-none`,
      { ...spec, path: '/shelf/comics' },
      async (page) => {
        await page.locator('.shelf-search input').fill('zzqqxx')
        await page.waitForTimeout(500)
      },
    )
    await record(
      `${tag} admin-games-pressed`,
      { ...spec, path: '/admin/shelf/games', kind: 'shelf' },
      async (page) => {
        await pressFirst(page, '.shelf-toolbar .chip[aria-pressed="false"]')
      },
    )
    await record(
      `${tag} admin-games-focus`,
      { ...spec, path: '/admin/shelf/games', kind: 'shelf' },
      async (page) => {
        await page.locator('.shelf-search input').focus()
        for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab')
      },
    )
    await record(`${tag} admin-comics`, {
      ...spec,
      path: '/admin/shelf/comics',
      kind: 'admin-comics',
    })
    await record(
      `${tag} admin-comics-pressed`,
      { ...spec, path: '/admin/shelf/comics', kind: 'admin-comics' },
      async (page) => {
        await pressFirst(page, '.shelf-toolbar .chip[aria-pressed="false"]')
      },
    )
    for (const path of [
      '/admin/closet/review',
      '/admin/closet/profile',
      '/admin/closet',
    ])
      await record(`${tag} ${path}`, { ...spec, path, kind: 'closet' })
    await record(
      `${tag} denver-chip`,
      { ...spec, path: '/denver', kind: 'denver' },
      async (page) => {
        await pressFirst(page, '.chip[aria-pressed="false"]')
      },
    )
  }
  await record(`d4c ${theme} reduce games`, {
    path: '/shelf/games',
    theme,
    vp: 'desktop',
    reduce: true,
  })
  await record(`d4c ${theme} print games`, {
    path: '/shelf/games',
    theme,
    vp: 'desktop',
    media: 'print',
  })
}
await browser.close()

writeFileSync(out, JSON.stringify(result))
let elements = 0
for (const rows of Object.values(result)) elements += Object.keys(rows).length
console.log(
  `${Object.keys(result).length} scenarios, ${elements} element records, ${PROPS.length} properties each`,
)
