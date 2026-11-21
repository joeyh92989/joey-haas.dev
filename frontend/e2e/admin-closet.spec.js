import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import { unringed } from './closet-ring.js'
import { mockCloset } from './closet-mocks.js'

// The Closet area (#535, slice 2): every route with filled data, at the four
// review widths, in both themes. Desktop project only (viewport is set here).
const WIDTHS = [
  { width: 320, height: 700 },
  { width: 390, height: 800 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]
const ROUTES = [
  '/admin/closet/today',
  '/admin/closet',
  '/admin/closet/review',
  '/admin/closet/profile',
  '/admin/closet/add',
  '/admin/closet/a',
]
const THEMES = ['dark', 'light']
const GATED = ['serious', 'critical']

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  await page.route('**/api/track', (route) => route.abort())
  await mockCloset(page)
})

async function open(page, route, { width, height }, theme = 'light') {
  await page.setViewportSize({ width, height })
  await page.goto(route)
  await expect(page.locator('main h1').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.evaluate(
    (value) => document.documentElement.setAttribute('data-theme', value),
    theme,
  )
  await page.mouse.move(1, 1)
}

for (const size of WIDTHS) {
  for (const route of ROUTES) {
    test(`no sideways scroll at ${size.width}px on ${route}`, async ({
      page,
    }) => {
      await open(page, route, size)
      const { overflow, wide } = await page.evaluate(() => {
        const edge = document.documentElement.clientWidth
        const wide = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > edge + 0.5)
          // An element inside its own scroller is clipped, not overflowing.
          .filter((el) => {
            for (let p = el.parentElement; p; p = p.parentElement) {
              const o = getComputedStyle(p).overflowX
              if (o === 'auto' || o === 'scroll' || o === 'hidden') return false
            }
            return true
          })
          .slice(0, 4)
          .map((el) => `${el.tagName}.${el.className}`.slice(0, 80))
        return { overflow: document.documentElement.scrollWidth - edge, wide }
      })
      expect(overflow, `horizontal overflow in px: ${wide.join(' | ')}`).toBe(0)
    })
  }
}

// The list view of the Closet is a table: it scrolls inside its own wrapper.
for (const size of WIDTHS) {
  test(`list view fits at ${size.width}px`, async ({ page }) => {
    await open(page, '/admin/closet', size)
    await page.getByRole('button', { name: 'List', exact: true }).click()
    await expect(page.locator('table')).toBeVisible()
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })
}

for (const size of WIDTHS.filter((s) => [390, 1280].includes(s.width))) {
  for (const route of ROUTES) {
    for (const theme of THEMES) {
      test(`focus rings paint on every control at ${size.width}px, ${theme}, ${route}`, async ({
        page,
      }) => {
        test.setTimeout(180_000)
        await open(page, route, size, theme)
        const controls = page.locator(
          'main :is(a[href], button, input:not([type=hidden]), select, textarea):not(:disabled):visible',
        )
        expect(await unringed(page, controls)).toEqual([])
      })
    }
  }
}

for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`axe finds no serious violation on ${route}, ${theme}`, async ({
      page,
    }) => {
      await open(page, route, WIDTHS[2], theme)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      const fresh = results.violations.filter((v) => GATED.includes(v.impact))
      expect(
        fresh.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([])
    })
  }
}

// Review shots: set E2E_SHOT_DIR to save each Closet page at the four
// widths in both themes.
test('closet review shots', async ({ page }) => {
  test.skip(!process.env.E2E_SHOT_DIR, 'set E2E_SHOT_DIR to save the shots')
  test.setTimeout(600_000)
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      for (const route of ROUTES) {
        await open(page, route, size, theme)
        const name = route.replace(/^\/admin\//, '').replace(/\//g, '-')
        await page.screenshot({
          path: `${process.env.E2E_SHOT_DIR}/closet-${name}-${size.width}-${theme}.png`,
          fullPage: true,
        })
      }
    }
  }
})
