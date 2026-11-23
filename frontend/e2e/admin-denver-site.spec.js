import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import { tabRings } from './focus-ring.js'
import { mockDenverSite } from './denver-site-mocks.js'

// The Denver and Site areas (#535, slice 3): Weekend, Spots and Analytics with
// long names, every tag and big numbers, at the four review widths, in both
// themes. Desktop project only (the viewport is set here). The API is routed
// in the page (denver-site-mocks.js), so no database rows are needed.
const WIDTHS = [
  { width: 320, height: 700 },
  { width: 390, height: 800 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]
const THEMES = ['dark', 'light']
const GATED = ['serious', 'critical']

// A state is a route and what to press to reach it.
const STATES = [
  { name: 'weekend', route: '/admin/weekend' },
  {
    name: 'weekend-constraints',
    route: '/admin/weekend',
    prepare: (page) => page.getByRole('button', { name: /^Edit/ }).click(),
  },
  { name: 'spots', route: '/admin/spots' },
  {
    name: 'spots-form',
    route: '/admin/spots',
    prepare: (page) =>
      page.getByRole('button', { name: 'Add by hand' }).click(),
  },
  { name: 'analytics', route: '/admin/analytics' },
  {
    name: 'analytics-all',
    route: '/admin/analytics',
    prepare: (page) => page.getByRole('button', { name: 'All' }).click(),
  },
]

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  await page.route('**/api/track', (route) => route.abort())
  await mockDenverSite(page)
})

async function open(page, state, { width, height }, theme = 'light') {
  await page.setViewportSize({ width, height })
  await page.goto(state.route)
  await expect(page.locator('main h1').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  // The pages' own words, so a page that is still empty is not measured.
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0)
  await state.prepare?.(page)
  await page.evaluate(
    (value) => document.documentElement.setAttribute('data-theme', value),
    theme,
  )
  await page.mouse.move(1, 1)
  // The theme change fades colours (transition-colors): let it finish.
  await page.waitForTimeout(400)
}

for (const size of WIDTHS) {
  for (const state of STATES) {
    test(`no sideways scroll at ${size.width}px on ${state.name}`, async ({
      page,
    }) => {
      await open(page, state, size)
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

// The spots table scrolls inside its own wrapper; it must not widen the page,
// and it must say so rather than clip: the wrapper is the only scroller.
for (const size of WIDTHS) {
  test(`the spots table stays in its wrapper at ${size.width}px`, async ({
    page,
  }) => {
    await open(page, STATES[2], size)
    const result = await page.evaluate(() => {
      const table = document.querySelector('table')
      const wrap = table.parentElement
      return {
        wrap: wrap.getBoundingClientRect().right,
        edge: document.documentElement.clientWidth,
        scrolls: getComputedStyle(wrap).overflowX,
        // A visually hidden label inside a scroller escapes it, and widens
        // the page, unless the scroller is positioned.
        position: getComputedStyle(wrap).position,
      }
    })
    expect(result.wrap).toBeLessThanOrEqual(result.edge)
    expect(result.scrolls).toBe('auto')
    expect(result.position).toBe('relative')
  })
}

// #598: the Best day tile's detail ("Sun, Oct 18 · <referrer>") wraps inside
// its tile at the narrow widths, with nothing clipped by the tile's own
// overflow, and the phone's page links are 44px tall with the label centred.
for (const width of [320, 390]) {
  test(`the Best day detail is not clipped at ${width}px`, async ({ page }) => {
    await open(page, STATES[4], { width, height: 800 })
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('.stat-detail')]
        .filter((el) => el.scrollWidth > el.clientWidth)
        .map((el) => el.textContent),
    )
    expect(clipped).toEqual([])
  })
}

for (const width of [320, 390]) {
  test(`the shell's phone page links are 44px with the label centred at ${width}px`, async ({
    page,
  }) => {
    await open(page, STATES[2], { width, height: 800 })
    const links = page.locator('.admin-subnav a, .admin-subnav button')
    await expect(links.first()).toBeVisible()
    const boxes = await links.evaluateAll((list) =>
      list.map((el) => {
        const box = el.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(el)
        const text = range.getBoundingClientRect()
        return {
          height: box.height,
          gap: Math.abs(text.top - box.top - (box.bottom - text.bottom)),
        }
      }),
    )
    expect(boxes.length).toBeGreaterThan(0)
    for (const { height, gap } of boxes) {
      expect(height).toBeGreaterThanOrEqual(44)
      expect(gap).toBeLessThanOrEqual(1)
    }
  })
}

// Every action in the spots table is reached by real Tab presses, whole, with
// its ring painted, at the widths the half-width column is tightest. At 1280
// and above the table needs no sideways scroll at all.
for (const width of [1440, 1280, 1100, 900, 390, 320]) {
  test(`spots table actions are whole under Tab at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await open(page, STATES[2], { width, height: 800 })
    const fits = await page.evaluate(() => {
      const wrap = document.querySelector('table').parentElement
      return wrap.scrollWidth - wrap.clientWidth
    })
    if (width >= 1280) expect(fits, 'the table scrolls sideways').toBe(0)
    const controls = page.locator(
      'main table :is(button, input):not(:disabled)',
    )
    expect(await tabRings(page, controls)).toEqual([])
  })
}

for (const size of WIDTHS.filter((s) => [390, 1280].includes(s.width))) {
  for (const state of STATES) {
    for (const theme of THEMES) {
      test(`focus rings paint on every control at ${size.width}px, ${theme}, ${state.name}`, async ({
        page,
      }) => {
        test.setTimeout(240_000)
        await open(page, state, size, theme)
        const controls = page.locator(
          'main :is(a[href], button, input:not([type=hidden]), select, textarea):not(:disabled):visible',
        )
        expect(await tabRings(page, controls)).toEqual([])
      })
    }
  }
}

// A phone tap target is 44px tall (#276). Buttons and links must reach it;
// text fields and selects are 40px (the Input look). Checkboxes are native.
for (const state of STATES) {
  test(`every button and link is 44px tall at 390px on ${state.name}`, async ({
    page,
  }) => {
    await open(page, state, WIDTHS[1])
    const short = await page.evaluate(() =>
      [...document.querySelectorAll('main :is(a[href], button):not(nav *)')]
        .filter((el) => !el.disabled && el.getBoundingClientRect().height > 0)
        .map((el) => [
          `${el.textContent.trim().slice(0, 24) || el.getAttribute('aria-label')}`,
          Math.round(el.getBoundingClientRect().height),
        ])
        .filter(([, height]) => height < 44)
        .map(([name, height]) => `${name}: ${height}px`),
    )
    expect(short).toEqual([])
  })
}

// Computed styles the legacy sheet and the utilities fight over: a utility
// width (`w-full`) must not beat the page's own narrow fields, and the saved
// card's green border must not lose to the Card look's border colour.
test('the constraints fields keep their narrow widths at 1280px', async ({
  page,
}) => {
  await open(page, STATES[1], WIDTHS[2])
  const widths = await page.evaluate(() => ({
    miles: document.querySelector('.wk-field input').getBoundingClientRect()
      .width,
    home: document.querySelector('.wk-field select').getBoundingClientRect()
      .width,
    rows: [...document.querySelectorAll('.wk-field')].map(
      (el) => el.getBoundingClientRect().height,
    ),
  }))
  expect(widths.miles).toBe(96)
  expect(widths.home).toBeLessThan(160)
  // One line each: the label does not wrap.
  for (const height of widths.rows) expect(height).toBeLessThan(50)
})

test('the saved suggestion keeps its green border', async ({ page }) => {
  await open(page, STATES[0], WIDTHS[2])
  const { card, ok, plain } = await page.evaluate(() => {
    const probe = document.createElement('i')
    probe.style.color = 'var(--ok)'
    document.body.append(probe)
    const ok = getComputedStyle(probe).color
    probe.remove()
    const saved = document.querySelector('.sug.saved')
    const other = document.querySelector('.sug:not(.saved):not(.lead)')
    return {
      card: getComputedStyle(saved).borderTopColor,
      ok,
      plain: getComputedStyle(other).borderTopColor,
    }
  })
  expect(card).toBe(ok)
  expect(card).not.toBe(plain)
})

for (const state of STATES) {
  for (const theme of THEMES) {
    test(`axe finds no serious violation on ${state.name}, ${theme}`, async ({
      page,
    }) => {
      await open(page, state, WIDTHS[2], theme)
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

// Review shots: set E2E_SHOT_DIR to save each state at the four widths in
// both themes.
test('denver and site review shots', async ({ page }) => {
  test.skip(!process.env.E2E_SHOT_DIR, 'set E2E_SHOT_DIR to save the shots')
  test.setTimeout(900_000)
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      for (const state of STATES) {
        await open(page, state, size, theme)
        await page.screenshot({
          path: `${process.env.E2E_SHOT_DIR}/${state.name}-${size.width}-${theme}.png`,
          fullPage: true,
        })
      }
    }
  }
})

// Review shots of the keyboard state: Tab to an action far down the spots
// table (the viewport as the browser scrolled it) and the saved suggestion.
test('denver and site focus shots', async ({ page }) => {
  test.skip(!process.env.E2E_SHOT_DIR, 'set E2E_SHOT_DIR to save the shots')
  test.setTimeout(300_000)
  for (const theme of THEMES) {
    for (const size of [WIDTHS[1], WIDTHS[2]]) {
      await open(page, STATES[2], size, theme)
      await page.locator('main h1').focus()
      for (let i = 0; i < 120; i++) {
        await page.keyboard.press('Tab')
        const label = await page.evaluate(
          () => document.activeElement?.getAttribute('aria-label') ?? '',
        )
        if (label.startsWith('Log a visit to Great Divide')) break
      }
      await page.waitForTimeout(300)
      await page.screenshot({
        path: `${process.env.E2E_SHOT_DIR}/focus-spots-${size.width}-${theme}.png`,
      })
    }
    await open(page, STATES[0], WIDTHS[2], theme)
    await page.locator('.sug.saved').screenshot({
      path: `${process.env.E2E_SHOT_DIR}/focus-saved-${theme}.png`,
    })
  }
})
