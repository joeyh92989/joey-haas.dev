// Computed-style dump (#536): proves a CSS move changed nothing the browser
// computes. See README.md in this folder.
//
//   node e2e/tools/style-dump.mjs <baseUrl> <out.json>
//
// Opens a fixed list of pages (themes x desktop/phone, plus print and
// reduced-motion passes) and records getComputedStyle of a stable property
// subset for every element and its ::before/::after.
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { GARMENTS, mockCloset } from '../closet-mocks.js'
import { serveHome } from '../admin-home.fixtures.js'
import { COMICS, GAMES, serveAdmin } from '../admin-shelf.fixtures.js'
import { serveAdminAdd } from '../admin-add.fixtures.js'
import { mockDenverSite } from '../denver-site-mocks.js'
import { NEXT, SPOTS, PICK_TABLE } from '../tools-data.fixtures.js'

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
  { path, theme, vp, kind, media, reduce, noIndex, touch },
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
  await page.waitForLoadState('networkidle')
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
      if (after) await after(page)
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

for (const theme of ['dark', 'light']) {
  for (const vp of ['desktop', 'phone']) {
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
await browser.close()

writeFileSync(out, JSON.stringify(result))
let elements = 0
for (const rows of Object.values(result)) elements += Object.keys(rows).length
console.log(
  `${Object.keys(result).length} scenarios, ${elements} element records, ${PROPS.length} properties each`,
)
