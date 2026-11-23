import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import { unringed } from './focus-ring.js'
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
  // The theme change fades colours (transition-colors): let it finish.
  await page.waitForTimeout(400)
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

// Sheets and revealed controls, opened first, then every control in them is
// ringed. A sheet is the only thing on screen that takes focus, so it is the
// scope; the revealed rows are in the page.
const STATES = [
  {
    name: 'Match sheet',
    route: '/admin/closet/today',
    scope: 'dialog[open]',
    prep: async (page) => {
      await page.getByRole('button', { name: /^Match this/ }).click()
      const sheet = page.getByRole('dialog')
      await sheet
        .getByRole('button', { name: /closet/i })
        .first()
        .click()
      await expect(sheet.locator('.today-pick').first()).toBeVisible()
    },
  },
  {
    name: 'Swap sheet',
    route: '/admin/closet/today',
    scope: 'dialog[open]',
    prep: async (page) => {
      await page.getByRole('button', { name: /^Swap/ }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.locator('.swap-choice').first()).toBeVisible()
    },
  },
  {
    name: 'Not this reasons',
    route: '/admin/closet/today',
    scope: 'main',
    prep: async (page) => {
      await page.getByRole('button', { name: /^Not this/ }).click()
    },
  },
  {
    name: 'Sell sheet',
    route: '/admin/closet/review',
    scope: 'dialog[open]',
    prep: async (page) => {
      await page.getByRole('button', { name: /^Sell/ }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    name: 'Pack month',
    route: '/admin/closet/review',
    scope: 'main',
    prep: async (page) => {
      await page.getByRole('button', { name: /^Pack away/ }).click()
      await expect(page.locator('.pack-month')).toBeVisible()
    },
  },
  {
    name: 'Delete confirm',
    route: '/admin/closet/a',
    scope: 'main',
    prep: async (page) => {
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Keep it' })).toBeVisible()
    },
  },
]

for (const size of WIDTHS.filter((s) => [390, 1280].includes(s.width))) {
  for (const state of STATES) {
    for (const theme of THEMES) {
      test(`focus rings paint in ${state.name} at ${size.width}px, ${theme}`, async ({
        page,
      }) => {
        test.setTimeout(180_000)
        await open(page, state.route, size, theme)
        await state.prep(page)
        await page.mouse.move(1, 1)
        const controls = page.locator(
          `${state.scope} :is(a[href], button, input:not([type=hidden]), select, textarea):not(:disabled):visible`,
        )
        expect(await controls.count()).toBeGreaterThan(0)
        expect(await unringed(page, controls)).toEqual([])
      })
    }
  }
}

// #276: on a phone a control is 44px tall. The classes that say so are on
// every chip and small button, and the intake row's buttons; here the height
// is measured, so a rule that loses to another is caught.
for (const route of ROUTES) {
  test(`phone tap targets are 44px on ${route}`, async ({ page }) => {
    await open(page, route, WIDTHS[1])
    const short = await page.evaluate(() => {
      const small = [
        ...document.querySelectorAll(
          'main button.h-8, main a.h-8, main label.h-8',
        ),
      ]
      const chips = [
        ...document.querySelectorAll(
          'main button[aria-pressed]:not(.h-6), main label:has(input[type=radio]), main .intake-waiting button',
        ),
      ]
      return [...new Set([...small, ...chips])]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .filter((el) => el.getBoundingClientRect().height < 43.5)
        .map(
          (el) =>
            `${el.tagName}.${String(el.className).slice(0, 30)} "${el.textContent.trim().slice(0, 16)}" ${Math.round(el.getBoundingClientRect().height)}px`,
        )
    })
    expect(short).toEqual([])
  })
}

// The ring's room in a narrow chip row (the first chip's left ring) must not
// move rows that reset their padding: a public row's start margin is 0.
// Pick for me's row and the tag picker's carry their reset as utilities on the
// element itself (`PICK_CHIP_ROW` and `TAG_PICKER`, pinned in
// closetStyle.test.js), so they are not in this wrapper-and-bare-row check.
test('public chip rows keep their start margin at 390px', async ({ page }) => {
  await open(page, '/admin/closet', WIDTHS[1])
  const margins = await page.evaluate(() => {
    const out = {}
    for (const parent of ['ctl-row']) {
      const wrap = document.createElement('div')
      wrap.className = parent
      const row = document.createElement('div')
      row.className = 'chip-row'
      wrap.append(row)
      document.body.append(wrap)
      out[parent] = getComputedStyle(row).marginInlineStart
      wrap.remove()
    }
    return out
  })
  expect(margins).toEqual({ 'ctl-row': '0px' })
})

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
  // The opened states, at the phone width.
  for (const theme of THEMES) {
    for (const state of STATES) {
      await open(page, state.route, WIDTHS[1], theme)
      await state.prep(page)
      await page.waitForTimeout(400)
      const name = state.name.toLowerCase().replace(/ /g, '-')
      await page.screenshot({
        path: `${process.env.E2E_SHOT_DIR}/closet-state-${name}-390-${theme}.png`,
        fullPage: true,
      })
    }
  }
})
