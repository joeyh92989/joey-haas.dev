import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { test, expect } from './fixtures.js'
import { COMICS, GAMES, serveAdmin } from './admin-shelf.fixtures.js'

// The admin Games and Comics lists (#532, slice b), with realistic mocked
// rows (long titles, an unbroken 60-character name, many tags, private rows)
// and no backend: no sideways scroll from 320px to 1440px (naming the
// element past the edge), 44px targets on a phone, focus rings measured in
// pixels on every control including the ones inside the opened "..." sheet
// and an armed Delete, and axe in both themes.
test.skip(!!process.env.E2E_BASE_URL, 'mocked rows only')

const PAGES = [
  { name: 'games', path: '/admin/shelf/games', rows: GAMES, card: 'Star Fox' },
  { name: 'comics', path: '/admin/shelf/comics', rows: COMICS, card: 'Saga' },
]
const THEMES = ['light', 'dark']

async function open(page, openRoute, spec, theme, view) {
  await serveAdmin(page, spec.rows)
  if (view) {
    await page.addInitScript(
      (value) =>
        localStorage.setItem('shelf.admin.view', JSON.stringify(value)),
      view,
    )
  }
  await openRoute(spec.path, theme)
  await expect(page.locator('main h1').first()).toBeVisible()
  await expect(page.locator('.poster-card, .item-table').first()).toBeVisible()
}

/** The elements past the right edge that no scroller contains. */
async function wideElements(page) {
  return page.evaluate(() => {
    const inner = document.documentElement.clientWidth
    const name = (el) => {
      const own = (node) =>
        node.tagName.toLowerCase() +
        (typeof node.className === 'string' && node.className
          ? `.${node.className.trim().split(/\s+/).slice(0, 3).join('.')}`
          : '')
      // The element, its nearest classed ancestor and a bit of its text.
      let up = el.parentElement
      while (up && !(typeof up.className === 'string' && up.className))
        up = up.parentElement
      const text = (el.textContent || '').trim().slice(0, 24)
      return `${own(el)} in ${up ? own(up) : '-'} "${text}"`
    }
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > inner + 0.5)
      .filter((el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const overflow = getComputedStyle(p).overflowX
          if (overflow === 'auto' || overflow === 'scroll') return false
        }
        return true
      })
      .slice(0, 5)
      .map(name)
    return {
      wide,
      scroll: document.documentElement.scrollWidth,
      inner,
    }
  })
}

for (const spec of PAGES) {
  for (const width of [320, 390, 1280, 1440]) {
    for (const theme of THEMES) {
      test(`${spec.path} does not scroll sideways at ${width}px (${theme})`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        await page.setViewportSize({ width, height: 900 })
        await open(page, openRoute, spec, theme)
        const found = await wideElements(page)
        expect(found.wide, 'elements past the right edge').toEqual([])
        expect(found.scroll).toBeLessThanOrEqual(found.inner)
      })
    }
  }
}

for (const width of [320, 390, 1280, 1440]) {
  test(`${PAGES[0].path} list view does not scroll sideways at ${width}px`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    await page.setViewportSize({ width, height: 900 })
    await open(page, openRoute, PAGES[0], 'light', 'list')
    const found = await wideElements(page)
    expect(found.wide, 'elements past the right edge').toEqual([])
    expect(found.scroll).toBeLessThanOrEqual(found.inner)
  })
}

for (const spec of PAGES) {
  for (const theme of THEMES) {
    test(`${spec.path} has no serious axe violations (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      await open(page, openRoute, spec, theme)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact),
      )
      expect(
        serious.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`),
      ).toEqual([])
    })
  }
}

// ---- Focus rings, measured in pixels ----

const BAND = 6

/** The sides of `card` whose inside edge strip does not change on focus. */
async function insideRing(page, card, link) {
  await page.mouse.move(0, 0)
  await card.scrollIntoViewIfNeeded()
  await link.evaluate((el) => el.blur())
  const box = await card.boundingBox()
  const strips = {
    top: { x: box.x + 12, y: box.y + 1, width: box.width - 24, height: 3 },
    bottom: {
      x: box.x + 12,
      y: box.y + box.height - 4,
      width: box.width - 24,
      height: 3,
    },
    // The card's own 3px accent edge is the ring's colour: start past it.
    left: { x: box.x + 4, y: box.y + 12, width: 3, height: box.height - 24 },
    right: {
      x: box.x + box.width - 4,
      y: box.y + 12,
      width: 3,
      height: box.height - 24,
    },
  }
  const before = {}
  for (const [side, clip] of Object.entries(strips))
    before[side] = await page.screenshot({ clip })
  await page.keyboard.press('Shift')
  await link.focus()
  await page.mouse.move(0, 0)
  const missing = []
  for (const [side, clip] of Object.entries(strips)) {
    if (before[side].equals(await page.screenshot({ clip }))) missing.push(side)
  }
  return missing
}

/** The 6px strips around a box, those that stay inside the viewport. */
async function bands(page, box) {
  const view = page.viewportSize()
  const wanted = {
    top: { x: box.x, y: box.y - BAND, width: box.width, height: BAND },
    bottom: { x: box.x, y: box.y + box.height, width: box.width, height: BAND },
    left: { x: box.x - BAND, y: box.y, width: BAND, height: box.height },
    right: { x: box.x + box.width, y: box.y, width: BAND, height: box.height },
  }
  const out = {}
  for (const [side, clip] of Object.entries(wanted)) {
    const inside =
      clip.x >= 0 &&
      clip.y >= 0 &&
      clip.x + clip.width <= view.width &&
      clip.y + clip.height <= view.height
    if (inside) out[side] = await page.screenshot({ clip })
  }
  return out
}

/**
 * Focuses each control by keyboard and returns the sides with no painted
 * ring. A ring clipped by an ancestor, or drawn in the page's colour, leaves
 * the band unchanged. `park` is where the pointer rests, so a hover-revealed
 * panel is shown both before and after.
 */
async function unringed(page, locator, park) {
  const missing = []
  const count = await locator.count()
  for (let i = 0; i < count; i++) {
    const control = locator.nth(i)
    if (!(await control.isVisible())) continue
    await control.scrollIntoViewIfNeeded()
    await control.evaluate((el) => el.blur())
    if (park) await park()
    else await page.mouse.move(1, 1)
    const box = await control.boundingBox()
    const before = await bands(page, box)
    await page.keyboard.press('Shift')
    await control.focus()
    const after = await bands(page, box)
    const label = (
      (await control.getAttribute('aria-label')) ??
      (await control.textContent()) ??
      (await control.evaluate((el) => el.tagName))
    )
      .trim()
      .slice(0, 24)
    const sides = Object.keys(before)
    expect(
      sides.length,
      `${label}: no band inside the viewport`,
    ).toBeGreaterThan(0)
    for (const side of sides) {
      if (before[side].equals(after[side])) missing.push(`${label}:${side}`)
    }
  }
  return missing
}

for (const spec of PAGES) {
  for (const theme of THEMES) {
    test(`${spec.path}: focus rings paint on the header, search, toolbar and card controls (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
      await page.setViewportSize({ width: 1440, height: 1000 })
      await open(page, openRoute, spec, theme)

      const header = page.locator('.admin-head-end').locator('a, button')
      expect(await unringed(page, header), 'header').toEqual([])
      const search = page.getByRole('searchbox').first()
      expect(await unringed(page, search), 'search').toEqual([])
      const toolbar = page.locator(
        '.shelf-toolbar button, .shelf-toolbar select',
      )
      expect(await unringed(page, toolbar), 'toolbar').toEqual([])

      // The card: its link ring is inset (the card clips the outside), so it
      // is measured on the four strips just inside the card's edges.
      const card = page
        .locator('.poster-card')
        .filter({ hasText: spec.card })
        .first()
      const link = card.locator('a.poster-link')
      expect(await insideRing(page, card, link), 'card link').toEqual([])

      // The owner controls, shown by hovering the card, which stays hovered.
      const panel = card.locator(
        '.shelf-actions button, .shelf-actions select, .shelf-actions input, .shelf-actions a',
      )
      expect(await panel.count()).toBeGreaterThan(3)
      expect(
        await unringed(page, panel, () => card.hover()),
        'card controls',
      ).toEqual([])
    })

    test(`${spec.path}: an armed Delete paints rings on both buttons (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
      await page.setViewportSize({ width: 1440, height: 1000 })
      await open(page, openRoute, spec, theme)
      const card = page
        .locator('.poster-card')
        .filter({ hasText: spec.card })
        .first()
      await card.hover()
      await card.getByRole('button', { name: `Delete ${spec.card}` }).click()
      const armed = card.getByRole('button', {
        name: new RegExp(`Delete ${spec.card} for good|Keep ${spec.card}`),
      })
      await expect(armed).toHaveCount(2)
      expect(
        await unringed(page, armed, () => card.hover()),
        'armed buttons',
      ).toEqual([])
    })
  }
}

test('the games list view paints rings on its bulk and row controls', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard focus')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await open(page, openRoute, PAGES[0], 'light', 'list')
  await page
    .getByRole('checkbox', { name: /^Select / })
    .first()
    .check()
  const bar = page.getByRole('group', { name: /selected/i })
  await expect(bar).toBeVisible()
  // Apply is disabled until something is chosen, and a disabled button
  // cannot take focus.
  await bar.locator('select').first().selectOption({ index: 1 })
  expect(
    await unringed(page, bar.locator('select, button')),
    'bulk bar',
  ).toEqual([])
})

// ---- Pressed and armed states: computed colours, both themes, at 1280 ----

/**
 * The contrast of `control`'s text against what is painted behind it, read
 * from the computed colours (so a class that never applied cannot pass).
 * Colours are normalised through a canvas, which resolves any CSS colour
 * (color-mix, oklch) to sRGB; backgrounds are composited up the ancestors.
 */
async function textContrast(control) {
  // The Button look eases its colours over 150ms: measure once settled.
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
  test(`pressed and armed states keep 4.5:1 text on the games list (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    await page.setViewportSize({ width: 1280, height: 1000 })
    await open(page, openRoute, PAGES[0], theme)
    const card = page
      .locator('.poster-card')
      .filter({ hasText: 'Star Fox' })
      .first()
    const toggle = page.getByRole('button', { name: 'Shelf', exact: true })
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(await textContrast(toggle), 'pressed view toggle').toBeGreaterThan(
      4.5,
    )
    await card.hover()
    const upNext = card.getByRole('button', { name: 'Up next' })
    await upNext.click()
    await expect(upNext).toHaveAttribute('aria-pressed', 'true')
    await card.hover()
    expect(await textContrast(upNext), 'pressed Up next').toBeGreaterThan(4.5)
    expect(
      await textContrast(card.getByRole('combobox', { name: /^Status for / })),
      'status select',
    ).toBeGreaterThan(4.5)
    await card.getByRole('button', { name: 'Delete Star Fox' }).click()
    for (const name of [/for good/, /^Keep /]) {
      expect(
        await textContrast(card.getByRole('button', { name })),
        `armed ${name}`,
      ).toBeGreaterThan(4.5)
    }
  })

  test(`a pressed Follow keeps 4.5:1 text on the comics list (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    await page.setViewportSize({ width: 1280, height: 1000 })
    await open(page, openRoute, PAGES[1], theme)
    const card = page
      .locator('.poster-card')
      .filter({ hasText: 'Saga' })
      .first()
    await card.hover()
    const follow = card.getByRole('button', { name: 'Follow' })
    await expect(follow).toHaveAttribute('aria-pressed', 'true')
    expect(await textContrast(follow), 'pressed Follow').toBeGreaterThan(4.5)
    const label = card.locator('label:has(input[type=checkbox])')
    expect(
      (await label.boundingBox()).height,
      'Public label is a 24px target',
    ).toBeGreaterThanOrEqual(24)
  })
}

// ---- Round trips: the mocked API keeps the rows, so a click shows ----

test('publishing a game and following a series update the page', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'pointer panel')
  await page.setViewportSize({ width: 1280, height: 1000 })
  await open(page, openRoute, PAGES[0], 'light')
  await expect(page.getByText('22 of 30 public')).toBeVisible()
  const card = page
    .locator('.poster-card')
    .filter({ hasText: 'Star Fox' })
    .first()
  await card.hover()
  // Controlled: the box follows the reload, so click rather than uncheck().
  await card.getByRole('checkbox', { name: 'Public: Star Fox' }).click()
  await expect(page.getByText('21 of 30 public')).toBeVisible()

  await open(page, openRoute, PAGES[1], 'light')
  const saga = page.locator('.poster-card').filter({ hasText: 'Saga' }).first()
  await saga.hover()
  await saga.getByRole('button', { name: 'Follow' }).click()
  await saga.hover()
  await expect(saga.getByRole('button', { name: 'Follow' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

// ---- The phone: 44px targets, and the controls inside the opened sheet ----

for (const spec of PAGES) {
  for (const theme of THEMES) {
    test(`${spec.path}: phone targets are 44px and the sheet's controls paint rings (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'phone', 'phone project only')
      await open(page, openRoute, spec, theme)

      const small = async (locator, what) => {
        const heights = await locator.evaluateAll((els) =>
          els
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => ({
              name: (
                el.getAttribute('aria-label') ||
                el.textContent ||
                el.tagName
              )
                .trim()
                .slice(0, 28),
              height: Math.round(el.getBoundingClientRect().height),
            }))
            .filter((entry) => entry.height < 43.5),
        )
        expect(heights, `${what} under 44px`).toEqual([])
      }
      // The "View /shelf/..." text link keeps its 24px floor (adminPolish).
      await small(
        page
          .locator('.admin-head-end')
          .locator("a[data-slot='button'], button"),
        'header',
      )
      await small(page.locator('.shelf-toolbar button'), 'toolbar')

      const card = page
        .locator('.poster-card')
        .filter({ hasText: spec.card })
        .first()
      const toggle = card.getByRole('button', {
        name: `Actions for ${spec.card}`,
      })
      await toggle.scrollIntoViewIfNeeded()
      await small(toggle, 'the "..." button')
      await toggle.click()
      const sheet = page.locator('dialog[open]')
      await expect(sheet).toBeVisible()
      await small(
        sheet.locator('button, select, label:has(input[type=checkbox]), a'),
        'sheet controls',
      )
      const found = await wideElements(page)
      expect(found.wide, 'past the edge with the sheet open').toEqual([])
      expect(
        await unringed(page, sheet.locator('button, select, input, a')),
        'sheet controls',
      ).toEqual([])

      // Arm Delete inside the sheet: its two buttons need rings and targets.
      await sheet.getByRole('button', { name: `Delete ${spec.card}` }).click()
      const armed = sheet.getByRole('button', {
        name: new RegExp(`Delete ${spec.card} for good|Keep ${spec.card}`),
      })
      await expect(armed).toHaveCount(2)
      await small(armed, 'armed buttons')
      expect(await unringed(page, armed), 'armed buttons').toEqual([])
    })

    test(`${spec.path}: axe with the sheet open (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'phone', 'phone project only')
      await open(page, openRoute, spec, theme)
      await page
        .getByRole('button', { name: `Actions for ${spec.card}` })
        .click()
      await expect(page.locator('dialog[open]')).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact),
      )
      expect(
        serious.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`),
      ).toEqual([])
    })
  }
}

// ---- Screenshots for review (ADMIN_SHELF_SHOTS=<dir>) ----
const SHOTS = process.env.ADMIN_SHELF_SHOTS
if (SHOTS) {
  for (const spec of PAGES) {
    for (const width of [320, 390, 1280, 1440]) {
      for (const theme of THEMES) {
        test(`shot ${spec.name} ${width} ${theme}`, async ({
          page,
          openRoute,
        }, testInfo) => {
          test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
          await page.setViewportSize({ width, height: 1000 })
          await open(page, openRoute, spec, theme)
          // The toolbar and the first cards, where the new look is.
          await page
            .locator(width <= 390 ? '.poster-grid' : '.shelf-toolbar')
            .first()
            .evaluate((el) => el.scrollIntoView())
          mkdirSync(SHOTS, { recursive: true })
          await page.screenshot({
            path: `${SHOTS}/${spec.name}-${width}-${theme}.png`,
            fullPage: false,
          })
        })
      }
    }
  }
}
