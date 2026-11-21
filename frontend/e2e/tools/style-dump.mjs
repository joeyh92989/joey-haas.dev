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
import { mockCloset } from '../closet-mocks.js'
import { serveHome } from '../admin-home.fixtures.js'
import { GAMES, serveAdmin } from '../admin-shelf.fixtures.js'

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
]
const ADMIN = [
  ['/admin', 'home'],
  ['/admin/jobs', 'home'],
  ['/admin/shelf/games', 'shelf'],
  ['/admin/closet/today', 'closet'],
]
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
  { path, theme, vp, kind, media, reduce, noIndex },
) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[vp],
    reducedMotion: reduce ? 'reduce' : 'no-preference',
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
  const { context, page } = await open(browser, spec)
  if (after) await after(page)
  result[label] = await dumpPage(page)
  await context.close()
}

for (const theme of ['dark', 'light']) {
  for (const vp of ['desktop', 'phone']) {
    for (const path of PUBLIC)
      await record(`screen ${theme} ${vp} ${path}`, { path, theme, vp })
    for (const [path, kind] of ADMIN)
      await record(`screen ${theme} ${vp} ${path}`, { path, theme, vp, kind })
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
        const link = page.locator('.more-panel a').nth(1)
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
    await record(
      `screen ${theme} ${vp} footer-signed-in`,
      { path: '/about', theme, vp, kind: 'signed-in' },
      async (page) => {
        await page.locator('footer').scrollIntoViewIfNeeded()
      },
    )
  }
  for (const path of ['/about', '/blog/how-my-shelf-works', '/']) {
    await record(`print ${theme} ${path}`, {
      path,
      theme,
      vp: 'desktop',
      media: 'print',
    })
  }
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
