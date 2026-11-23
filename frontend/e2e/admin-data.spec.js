import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import { tabRingsByLook as tabRings } from './focus-ring.js'
import {
  COMIC_ID,
  GAME_ID,
  VOLUME_SLUG,
  mockAdminData,
} from './admin-data-mocks.js'

// The admin Shelf data and edit pages (#535): Sources, Store list, the item
// edit page, the comic edit page and a book's page, filled with realistic
// data. Desktop project only (the viewport is set here); the session and the
// API are routed in the page, so no backend is needed.
const WIDTHS = [
  { width: 320, height: 700 },
  { width: 390, height: 800 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]
const ROUTES = [
  '/admin/catalogue',
  '/admin/store-list',
  `/admin/collection/${GAME_ID}`,
  `/admin/shelf/comics/${COMIC_ID}`,
  `/admin/shelf/comics/${COMIC_ID}/${VOLUME_SLUG}`,
]
const THEMES = ['dark', 'light']
const GATED = ['serious', 'critical']

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  await mockAdminData(page)
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

// ---- No sideways scroll, with a named offender ----
// One page load per route; each width is a resize of the same page.
async function sideways(page) {
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
    // A scroller that is not positioned does not clip an absolutely
    // placed child (a visually-hidden label): name those too.
    const escaped = [...document.querySelectorAll('body *')]
      .filter((el) => getComputedStyle(el).position === 'absolute')
      .filter((el) => el.getBoundingClientRect().right > edge + 0.5)
      .slice(0, 4)
      .map((el) => `abs ${el.tagName}.${el.className}`.slice(0, 80))
    // Text cut off inside an `overflow: hidden` ancestor is not page
    // overflow, but it is lost: a name must wrap, not clip.
    const cut = [
      ...document.querySelectorAll('main :is(p, h2, h3, li, strong)'),
    ]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .filter((el) => {
        for (let p = el; p; p = p.parentElement)
          if (getComputedStyle(p).overflowX === 'hidden') return true
        return false
      })
      .slice(0, 4)
      .map((el) => `clipped ${el.tagName}.${el.className}`.slice(0, 80))
    return {
      overflow: document.documentElement.scrollWidth - edge + cut.length * 1000,
      wide: [...wide, ...escaped, ...cut],
    }
  })
  return { overflow, wide }
}

for (const route of ROUTES) {
  test(`no sideways scroll at 320, 390, 1280 and 1440px on ${route}`, async ({
    page,
  }) => {
    await open(page, route, WIDTHS[0])
    for (const size of WIDTHS) {
      await page.setViewportSize(size)
      await page.waitForTimeout(150)
      const { overflow, wide } = await sideways(page)
      expect(
        overflow,
        `horizontal overflow in px at ${size.width}: ${wide.join(' | ')}`,
      ).toBe(0)
    }
  })
}

// ---- Painted focus rings on every control ----
// The phone's fixed tab bar is the shell's: Tab leaves a control that is
// already on screen where it is, even under the bar, so a control near the
// bottom edge has its ring band under the bar. That is a shell matter (the
// scroll-padding only moves controls that are off screen); the bar is hidden
// for these checks so they measure the pages' own rings.
async function hideTabBar(page) {
  await page.addStyleTag({
    content: '.admin-tabs { display: none !important }',
  })
}

const RING_WIDTHS = WIDTHS.filter((s) => [390, 1280].includes(s.width))
const PAGE_CONTROLS =
  'main :is(a[href], button, input:not([type=hidden]), select, textarea):not(:disabled):visible'

/** The theme is an attribute: switch it on the page already open. */
async function setTheme(page, theme) {
  await page.evaluate(
    (value) => document.documentElement.setAttribute('data-theme', value),
    theme,
  )
  await page.mouse.move(1, 1)
  await page.waitForTimeout(400)
}

for (const size of RING_WIDTHS) {
  for (const route of ROUTES) {
    test(`focus rings paint on every control at ${size.width}px, both themes, ${route}`, async ({
      page,
    }) => {
      test.setTimeout(300_000)
      await open(page, route, size, THEMES[0])
      await hideTabBar(page)
      for (const theme of THEMES) {
        await setTheme(page, theme)
        const rings = await tabRings(page, page.locator(PAGE_CONTROLS))
        expect(rings, theme).toEqual([])
      }
    })
  }
}

// Opened states: each control in them is ringed too.
const STATES = [
  {
    name: 'Item Delete confirm',
    route: `/admin/collection/${GAME_ID}`,
    scope: 'main',
    prep: async (page) => {
      await page.getByRole('button', { name: /^Delete Star Fox/ }).click()
      await expect(page.getByRole('button', { name: /^Keep / })).toBeVisible()
    },
  },
  {
    name: 'Comic Delete confirm',
    route: `/admin/shelf/comics/${COMIC_ID}`,
    scope: 'main',
    prep: async (page) => {
      await page
        .getByRole('button', { name: /^Delete Saga/ })
        .first()
        .click()
      await expect(page.getByRole('button', { name: /^Keep / })).toBeVisible()
    },
  },
  {
    name: 'Book Delete confirm',
    route: `/admin/shelf/comics/${COMIC_ID}/${VOLUME_SLUG}`,
    scope: 'main',
    prep: async (page) => {
      await page
        .getByRole('button', { name: /^Delete Saga/ })
        .first()
        .click()
      await expect(page.getByRole('button', { name: /^Keep / })).toBeVisible()
    },
  },
  {
    name: 'Sources needs-match platform',
    route: '/admin/catalogue',
    scope: '.needs-match, [aria-labelledby=needs-match-heading]',
    prep: async (page) => {
      await page.getByLabel(/^Platform for Mystery/).selectOption({ index: 1 })
    },
  },
  {
    name: 'Store list answered row',
    route: '/admin/store-list',
    scope: 'main',
    prep: async (page) => {
      await page.getByRole('button', { name: /^Got it: Game a/ }).click()
      await expect(page.getByText('Game a', { exact: true })).toHaveCount(0)
      // Focus goes to the next row's first answer, never to the page.
      await expect(
        page.getByRole('button', { name: /^Got it: Game c/ }),
      ).toBeFocused()
    },
  },
]

for (const size of RING_WIDTHS) {
  for (const state of STATES) {
    test(`focus rings paint in ${state.name} at ${size.width}px, both themes`, async ({
      page,
    }) => {
      test.setTimeout(300_000)
      await open(page, state.route, size, THEMES[0])
      await state.prep(page)
      await hideTabBar(page)
      for (const theme of THEMES) {
        await setTheme(page, theme)
        const controls = page
          .locator(state.scope)
          .locator(
            ':is(a[href], button, input:not([type=hidden]), select, textarea):not(:disabled):visible',
          )
        expect(await controls.count()).toBeGreaterThan(0)
        expect(await tabRings(page, controls), theme).toEqual([])
      }
    })
  }
}

// ---- #276: a control is 44px tall on a phone ----
for (const route of ROUTES) {
  test(`phone tap targets are 44px on ${route}`, async ({ page }) => {
    await open(page, route, WIDTHS[1])
    const short = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          'main :is(button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), a.btn, [role=button])',
        ),
      ]
        .filter((el) => !el.closest('nav'))
        .filter((el) => el.getBoundingClientRect().height > 0)
        .filter((el) => el.getBoundingClientRect().height < 43.5)
        .map(
          (el) =>
            `${el.tagName}.${String(el.className).slice(0, 40)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 16)}" ${Math.round(el.getBoundingClientRect().height)}px`,
        ),
    )
    expect(short).toEqual([])
  })
}

// ---- Computed contrast of states, in the built CSS, both themes ----
async function textContrast(control) {
  await control.page().waitForTimeout(400)
  return control.evaluate((el) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const rgba = (css) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const layers = []
    for (let up = el; up; up = up.parentElement) {
      const [r, g, b, a] = rgba(getComputedStyle(up).backgroundColor)
      if (a > 0) layers.push([r, g, b, a])
      if (a === 1) break
    }
    let back = [255, 255, 255]
    for (const [r, g, b, a] of layers.reverse())
      back = [
        r * a + back[0] * (1 - a),
        g * a + back[1] * (1 - a),
        b * a + back[2] * (1 - a),
      ]
    const [fr, fg, fb, fa] = rgba(getComputedStyle(el).color)
    const fore = [
      fr * fa + back[0] * (1 - fa),
      fg * fa + back[1] * (1 - fa),
      fb * fa + back[2] * (1 - fa),
    ]
    const lum = ([r, g, b]) =>
      [r, g, b]
        .map((c) => c / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
    const [hi, lo] = [lum(fore), lum(back)].sort((a, b) => b - a)
    return (hi + 0.05) / (lo + 0.05)
  })
}

for (const theme of THEMES) {
  test(`every control and note keeps 4.5:1 text on each page (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(240_000)
    for (const route of ROUTES) {
      await open(page, route, WIDTHS[2], theme)
      const items = page.locator(
        'main :is(button, a[href], select, input:not([type=hidden]):not([type=checkbox]), textarea, th, label, .muted):visible',
      )
      const count = await items.count()
      const low = []
      for (let i = 0; i < count; i++) {
        const item = items.nth(i)
        const text = (await item.textContent())?.trim()
        const hasText =
          text ||
          (await item.evaluate(
            (el) => el.value || el.placeholder || el.selectedOptions?.length,
          ))
        if (!hasText) continue
        const value = await item.evaluate((el) => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          const rgba = (css) => {
            ctx.clearRect(0, 0, 1, 1)
            ctx.fillStyle = '#000'
            ctx.fillStyle = css
            ctx.fillRect(0, 0, 1, 1)
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
            return [r, g, b, a / 255]
          }
          const layers = []
          for (let up = el; up; up = up.parentElement) {
            const [r, g, b, a] = rgba(getComputedStyle(up).backgroundColor)
            if (a > 0) layers.push([r, g, b, a])
            if (a === 1) break
          }
          let back = [255, 255, 255]
          for (const [r, g, b, a] of layers.reverse())
            back = [
              r * a + back[0] * (1 - a),
              g * a + back[1] * (1 - a),
              b * a + back[2] * (1 - a),
            ]
          const [fr, fg, fb, fa] = rgba(getComputedStyle(el).color)
          const fore = [
            fr * fa + back[0] * (1 - fa),
            fg * fa + back[1] * (1 - fa),
            fb * fa + back[2] * (1 - fa),
          ]
          const lum = ([r, g, b]) =>
            [r, g, b]
              .map((c) => c / 255)
              .map((c) =>
                c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
              )
              .reduce((sum, c, k) => sum + c * [0.2126, 0.7152, 0.0722][k], 0)
          const [hi, lo] = [lum(fore), lum(back)].sort((a, b) => b - a)
          return (hi + 0.05) / (lo + 0.05)
        })
        if (value < 4.5)
          low.push(
            `${route} ${await item.evaluate((el) => `${el.tagName}.${String(el.className).slice(0, 30)}`)} "${(text ?? '').slice(0, 20)}" ${value.toFixed(2)}`,
          )
      }
      expect(low, `low contrast at ${route}`).toEqual([])
    }
  })

  test(`armed and pressed states keep 4.5:1 text (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(240_000)
    for (const [route, name] of [
      [`/admin/collection/${GAME_ID}`, /^Delete Star Fox/],
      [`/admin/shelf/comics/${COMIC_ID}`, /^Delete Saga/],
      [`/admin/shelf/comics/${COMIC_ID}/${VOLUME_SLUG}`, /^Delete Saga/],
    ]) {
      await open(page, route, WIDTHS[2], theme)
      await page.getByRole('button', { name }).first().click()
      for (const armed of [/for good/, /^Keep /]) {
        expect(
          await textContrast(page.getByRole('button', { name: armed })),
          `armed ${armed} on ${route}`,
        ).toBeGreaterThan(4.5)
      }
    }
    await open(
      page,
      `/admin/shelf/comics/${COMIC_ID}/${VOLUME_SLUG}`,
      WIDTHS[2],
      theme,
    )
    for (const pressed of await page
      .locator('main button[aria-pressed=true]')
      .all())
      expect(await textContrast(pressed), 'pressed mark').toBeGreaterThan(4.5)
  })
}

// ---- Colours that changed from the legacy look (fail on the old code) ----
/** An element's computed colour and a token's, both through a canvas. */
async function paint(control, property, token) {
  return control.evaluate(
    (el, [prop, tok]) => {
      const ctx = document.createElement('canvas').getContext('2d', {
        willReadFrequently: true,
      })
      const rgba = (css) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000'
        ctx.fillStyle = css
        ctx.fillRect(0, 0, 1, 1)
        return [...ctx.getImageData(0, 0, 1, 1).data].join(',')
      }
      return {
        have: rgba(getComputedStyle(el)[prop]),
        want: rgba(
          getComputedStyle(document.documentElement).getPropertyValue(tok),
        ),
      }
    },
    [property, token],
  )
}

for (const theme of THEMES) {
  test(`item page states use the new look and keep 4.5:1 (${theme})`, async ({
    page,
  }) => {
    await open(page, `/admin/collection/${GAME_ID}`, WIDTHS[2], theme)
    await page.waitForTimeout(400)
    // Save is the brand fill (the legacy button was a surface box).
    const save = page.getByRole('button', { name: 'Save', exact: true })
    const fill = await paint(save, 'backgroundColor', '--accent')
    expect(fill.have, 'Save fill is --accent').toBe(fill.want)
    expect(await textContrast(save), 'Save').toBeGreaterThan(4.5)
    // A pressed tag keeps the card surface and a heavier word (the legacy
    // pressed chip was a solid ink fill); an unpressed one is plain.
    const on = page.getByRole('button', { name: 'RPG', exact: true })
    const off = page.getByRole('button', { name: 'Shooter', exact: true })
    await expect(on).toHaveAttribute('aria-pressed', 'true')
    await expect(off).toHaveAttribute('aria-pressed', 'false')
    const surface = await paint(on, 'backgroundColor', '--surface')
    expect(surface.have, 'pressed tag sits on --surface').toBe(surface.want)
    expect(await on.evaluate((el) => getComputedStyle(el).fontWeight)).toBe(
      '500',
    )
    expect(await textContrast(on), 'pressed tag').toBeGreaterThan(4.5)
    expect(await textContrast(off), 'unpressed tag').toBeGreaterThan(4.5)
    // The journal's Delete is a text button with a name per session.
    const del = page.getByRole('button', { name: /^Delete the session on/ })
    await expect(del).toHaveCount(2)
    expect(await textContrast(del.first()), 'session Delete').toBeGreaterThan(
      4.5,
    )
  })
}

// ---- axe, both themes ----
async function serious(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  return results.violations
    .filter((v) => GATED.includes(v.impact))
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

for (const route of ROUTES) {
  test(`axe finds no serious violation on ${route}, both themes`, async ({
    page,
  }) => {
    await open(page, route, WIDTHS[2], THEMES[0])
    for (const theme of THEMES) {
      await setTheme(page, theme)
      expect(await serious(page), theme).toEqual([])
    }
  })
}

// The Store list with nothing left to show: its sentence holds links to
// Discover and Radar in running text, which must not rely on colour alone
// (link-in-text-block).
test('axe finds no serious violation on the empty Store list, both themes', async ({
  page,
}) => {
  await page.route('**/api/recommendations/store-list', (route) =>
    route.fulfill({
      json: {
        generated_at: { radar: null, discover: null },
        catalogue: { stores_at: null, registry_at: null },
        sections: {
          buy_now: [],
          preorders: [],
          later: [],
          not_on_cartridge: [],
        },
      },
    }),
  )
  await open(page, '/admin/store-list', WIDTHS[2], THEMES[0])
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Discover' }),
  ).toBeVisible()
  for (const theme of THEMES) {
    await setTheme(page, theme)
    expect(await serious(page), theme).toEqual([])
  }
})

// ---- Review shots: set E2E_SHOT_DIR ----
test('data pages review shots', async ({ page }) => {
  test.skip(!process.env.E2E_SHOT_DIR, 'set E2E_SHOT_DIR to save the shots')
  test.setTimeout(900_000)
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      for (const route of ROUTES) {
        await open(page, route, size, theme)
        const name = route.replace(/^\/admin\//, '').replace(/\//g, '-')
        await page.screenshot({
          path: `${process.env.E2E_SHOT_DIR}/data-${name}-${size.width}-${theme}.png`,
          fullPage: true,
        })
      }
    }
  }
  for (const theme of THEMES) {
    for (const state of STATES) {
      await open(page, state.route, WIDTHS[1], theme)
      await state.prep(page)
      await page.waitForTimeout(400)
      const name = state.name.toLowerCase().replace(/ /g, '-')
      await page.screenshot({
        path: `${process.env.E2E_SHOT_DIR}/data-state-${name}-390-${theme}.png`,
        fullPage: true,
      })
    }
  }
})
