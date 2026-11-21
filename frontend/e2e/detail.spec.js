import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'

// The shelf detail pages (#533), against the fixture snapshot and the API
// fixtures: no sideways scroll with long titles and many tags, axe in both
// themes, flat covers and panels, and an inset ring on the neighbour strip.
// SHOTS_DIR=<dir> also writes a screenshot per page, width and theme.
test.skip(!!process.env.E2E_BASE_URL, 'fixture snapshot only')

const here = import.meta.dirname
const apiFixture = (name) =>
  readFileSync(resolve(here, 'fixtures/api', name), 'utf8')
const LONG =
  'The Extraordinarily Long and Winding Adventures of an Unreasonably Patient Hero in the Kingdom of Unbroken Sentences'
const SERIES = '22222222-bbbb-4bbb-8bbb-000000000002'
const GAME = '11111111-aaaa-4aaa-8aaa-000000000001'
const BOTH = '55555555-bbbb-4bbb-8bbb-000000000005'
const BOOK_LINE = '33333333-bbbb-4bbb-8bbb-000000000003'
const SINGLE = '44444444-bbbb-4bbb-8bbb-000000000004'

/** Per page: its path, what to wait for, and the API it reads. */
const PAGES = {
  'item-game': { path: `/shelf/${GAME}/`, ready: 'h1', long: 'snapshot' },
  'comic-run': {
    path: `/shelf/${SERIES}/`,
    ready: 'h1',
    routes: [[`**/api/public/items/${SERIES}`, 'public-comic-run.json']],
  },
  'comic-book-line': {
    path: `/shelf/${BOOK_LINE}/`,
    ready: 'h2',
    routes: [
      [`**/api/public/items/${BOOK_LINE}`, 'public-comic-book_line.json'],
    ],
  },
  'comic-single-book': {
    path: `/shelf/${SINGLE}/`,
    ready: 'h2',
    routes: [
      [`**/api/public/items/${SINGLE}`, 'public-comic-single_book.json'],
    ],
  },
  'comic-both': {
    path: `/shelf/${BOTH}/`,
    ready: 'h2',
    routes: [
      [`**/api/public/items/${BOTH}`, 'public-comic-both.json'],
      [`**/api/public/items/${BOTH}/issues`, 'public-comic-wall-both.json'],
    ],
  },
  issue: {
    path: `/shelf/${SERIES}/1/`,
    ready: 'h1',
    routes: [['**/api/public/items/*/issues/*', 'issue.json']],
  },
  volume: {
    path: `/shelf/${SERIES}/ed-1-1/`,
    ready: 'h1',
    routes: [['**/api/public/items/*/volumes/*', 'volume.json']],
  },
  year: { path: '/shelf/year/2025/', ready: 'h1' },
  month: { path: '/shelf/journal/2025-03/', ready: 'h1' },
}

async function open(page, openRoute, name, theme, { long = false } = {}) {
  const spec = PAGES[name]
  for (const [glob, file] of spec.routes ?? []) {
    let body = apiFixture(file)
    if (long) body = body.replace(/Paper Moons/g, LONG)
    await page.route(glob, (route) =>
      route.fulfill({ contentType: 'application/json', body }),
    )
  }
  if (long && spec.long === 'snapshot') {
    const items = JSON.parse(
      readFileSync(resolve(here, 'fixtures/snapshot/items.json'), 'utf8'),
    )
    const at = items.findIndex((item) => item.id === GAME)
    items[at] = {
      ...items[at],
      title: LONG,
      platforms: Array.from(
        { length: 14 },
        (_, i) => `Platform number ${i} of many`,
      ),
    }
    await page.route('**/snapshot/items.json', (route) =>
      route.fulfill({ json: items }),
    )
  }
  const result = await openRoute(spec.path, theme)
  await expect(page.locator(`${spec.ready}:visible`).first()).toBeVisible()
  // The fixtures paint in two steps (snapshot, then the API).
  await page.waitForTimeout(400)
  return result
}

for (const name of Object.keys(PAGES)) {
  for (const width of [320, 390, 1280, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`${name} does not scroll sideways at ${width}px with long titles (${theme})`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        await page.setViewportSize({ width, height: 900 })
        await open(page, openRoute, name, theme, { long: true })
        const { scroll, inner, wide } = await page.evaluate(() => {
          const inner = window.innerWidth
          const clipped = (el) => {
            for (let up = el.parentElement; up; up = up.parentElement) {
              const x = getComputedStyle(up).overflowX
              if (x === 'auto' || x === 'scroll') return true
            }
            return false
          }
          const wide = [...document.querySelectorAll('body *')]
            .filter(
              (el) =>
                el.getBoundingClientRect().right > inner + 0.5 && !clipped(el),
            )
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
          return { scroll: document.documentElement.scrollWidth, inner, wide }
        })
        expect(wide).toEqual([])
        expect(scroll).toBeLessThanOrEqual(inner)
        if (process.env.SHOTS_DIR) {
          mkdirSync(process.env.SHOTS_DIR, { recursive: true })
          await page.screenshot({
            path: `${process.env.SHOTS_DIR}/${name}-${width}-${theme}.png`,
            fullPage: true,
          })
        }
      })
    }
  }
  for (const theme of ['light', 'dark']) {
    test(`${name} has no serious a11y violations (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      await open(page, openRoute, name, theme)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      const serious = results.violations
        .filter((v) => ['serious', 'critical'].includes(v.impact))
        .map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(', ')}`,
        )
      expect(serious).toEqual([])
    })
  }
}

test('the cover is flat and a game chip is a mono outlined label', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  await open(page, openRoute, 'item-game', 'light')
  const cover = await page
    .locator('.item-cover .cover')
    .first()
    .evaluate((el) => getComputedStyle(el).boxShadow)
  expect(cover).toBe('none')
  const chip = page.locator('.item-chips li').first()
  if (await chip.count()) {
    const style = await chip.evaluate((el) => {
      const c = getComputedStyle(el)
      return { font: c.fontFamily, border: c.borderTopWidth }
    })
    expect(style.font).toMatch(/mono/i)
    expect(style.border).toBe('1px')
  }
})

test('a comic title panel is a 6px card with a 1px outline', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  await open(page, openRoute, 'comic-run', 'light')
  const panel = page.locator('section.item-card').first()
  await expect(panel).toBeVisible()
  const style = await panel.evaluate((el) => {
    const c = getComputedStyle(el)
    return { radius: c.borderTopLeftRadius, border: c.borderTopWidth }
  })
  expect(style.radius).toBe('6px')
  expect(style.border).toBe('1px')
})

// An outward outline would be clipped by the strip's own overflow, so the
// ring is inside the tile: four 3px bands just inside its edges differ once
// focused, and none lies outside the tile.
for (const theme of ['light', 'dark']) {
  test(`a focused neighbour tile paints its ring inside the tile (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
    await open(page, openRoute, 'issue', theme)
    const tile = page.locator('.neighbour-strip a.cover-tile').first()
    await tile.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    const box = await tile.boundingBox()
    const bands = [
      { x: box.x, y: box.y, width: box.width, height: 3 },
      { x: box.x, y: box.y + box.height - 3, width: box.width, height: 3 },
      { x: box.x, y: box.y, width: 3, height: box.height },
      { x: box.x + box.width - 3, y: box.y, width: 3, height: box.height },
    ]
    const before = await Promise.all(
      bands.map((clip) => page.screenshot({ clip })),
    )
    await tile.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(tile).toBeFocused()
    await page.mouse.move(0, 0)
    const after = await Promise.all(
      bands.map((clip) => page.screenshot({ clip })),
    )
    for (const [i, shot] of after.entries()) {
      expect(Buffer.compare(before[i], shot), `inside edge ${i}`).not.toBe(0)
    }
    const outline = await tile.evaluate(
      (el) => getComputedStyle(el).outlineOffset,
    )
    expect(parseFloat(outline)).toBeLessThan(0)
  })
}
