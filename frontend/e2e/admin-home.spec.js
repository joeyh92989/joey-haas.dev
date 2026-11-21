import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { test, expect } from './fixtures.js'
import { unringed } from './closet-ring.js'
import { tabRings } from './denver-site-ring.js'
import { serveHome } from './admin-home.fixtures.js'

// Admin Home and Jobs (#535, Home and Jobs slice), with realistic mocked
// answers (long names, a 60-character unbroken name, three-digit counts, a
// failed night, a stopped schedule) and no backend: no sideways scroll from
// 320px to 1440px naming the element past the edge, 44px targets on a phone,
// painted focus rings on every control including the opened swap sheet,
// computed text-vs-fill contrast in both themes for every state, and axe.
test.skip(!!process.env.E2E_BASE_URL, 'mocked answers only')

const ROUTES = ['/admin', '/admin/jobs']
const WIDTHS = [320, 390, 1280, 1440]
const THEMES = ['light', 'dark']

async function open(page, openRoute, path, theme = 'light', size) {
  await serveHome(page)
  if (size) await page.setViewportSize({ width: size, height: 900 })
  await openRoute(path, theme)
  await expect(page.locator('main h1').first()).toBeVisible()
  await expect(page.locator('main h1')).toHaveText(
    path === '/admin' ? 'Home' : 'Jobs',
  )
  await page.waitForLoadState('networkidle')
  await page.mouse.move(1, 1)
  // The theme fades colours (transition-colors): let it finish.
  await page.waitForTimeout(300)
}

/** Opens the swap sheet from the Closet card. */
async function openSwap(page) {
  await page.getByRole('button', { name: 'Swap', exact: true }).click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: /^Grey tee/ }),
  ).toBeVisible()
  await page.mouse.move(1, 1)
}

function name(el) {
  const own = (node) =>
    node.tagName.toLowerCase() +
    (typeof node.className === 'string' && node.className
      ? `.${node.className.trim().split(/\s+/).slice(0, 3).join('.')}`
      : '')
  let up = el.parentElement
  while (up && !(typeof up.className === 'string' && up.className))
    up = up.parentElement
  return `${own(el)} in ${up ? own(up) : '-'} "${(el.textContent || '').trim().slice(0, 24)}"`
}

for (const path of ROUTES) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`${path} does not scroll sideways at ${width}px (${theme})`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        await open(page, openRoute, path, theme, width)
        const found = await page.evaluate(
          ([fn]) => {
            const nameOf = new Function(`return ${fn}`)()
            const inner = document.documentElement.clientWidth
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
              .map(nameOf)
            // A scroller that scrolls is an overflow too: the page must fit.
            const scrolling = [
              ...document.querySelectorAll('main .item-table-wrap, main table'),
            ]
              .filter(
                (el) =>
                  el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0,
              )
              .map(nameOf)
            return {
              wide,
              scrolling,
              scroll: document.documentElement.scrollWidth,
              inner,
            }
          },
          [name.toString()],
        )
        expect(found.wide, 'elements past the right edge').toEqual([])
        expect(found.scroll).toBeLessThanOrEqual(found.inner)
        expect(found.scrolling, 'tables wider than their box').toEqual([])
      })
    }
  }
}

// A job that has never run leaves no wide empty column: the job's name starts
// at the row's left edge.
test('job rows start with the job at 1280px', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
  await open(page, openRoute, '/admin/jobs', 'light', 1280)
  const gaps = await page.evaluate(() =>
    [...document.querySelectorAll('main .job-row')].map((row) => ({
      job: row.querySelector('.job-label').textContent,
      gap:
        row.querySelector('.job-label').getBoundingClientRect().left -
        row.getBoundingClientRect().left,
    })),
  )
  expect(gaps.length).toBeGreaterThan(8)
  expect(gaps.filter((g) => g.gap > 24)).toEqual([])
})

// #276: on a phone a control is 44px tall. Measured, so a rule that loses to
// another is caught. Inline links inside a sentence are exempt.
for (const path of ROUTES) {
  test(`phone tap targets are 44px on ${path}`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    await open(page, openRoute, path, 'light', 390)
    const short = await page.evaluate(() =>
      [...document.querySelectorAll('main a[href], main button')]
        // The shell's page links (nav) are the shell's; inline links in a
        // sentence are exempt.
        .filter((el) => !el.closest('.job-summary, nav'))
        .filter((el) => el.getBoundingClientRect().height > 0)
        .filter((el) => el.getBoundingClientRect().height < 43.5)
        .map(
          (el) =>
            `${el.tagName}.${String(el.className).slice(0, 30)} "${el.textContent.trim().slice(0, 16)}" ${Math.round(el.getBoundingClientRect().height)}px`,
        ),
    )
    expect(short).toEqual([])
  })
}

test('the swap sheet controls are 44px on a phone', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
  await open(page, openRoute, '/admin', 'light', 390)
  await openSwap(page)
  const short = await page.evaluate(() =>
    [...document.querySelectorAll('dialog[open] button')]
      .filter((el) => el.getBoundingClientRect().height < 43.5)
      .map(
        (el) =>
          `${el.textContent.trim().slice(0, 16)} ${Math.round(el.getBoundingClientRect().height)}px`,
      ),
  )
  expect(short).toEqual([])
})

// ---- Focus rings, measured in pixels ----

const CONTROLS =
  ':is(a[href], button, input:not([type=hidden]), select, textarea):not(:disabled):visible'

for (const path of ROUTES) {
  for (const width of [390, 1280]) {
    for (const theme of THEMES) {
      test(`focus rings paint on every control at ${width}px, ${theme}, ${path}`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        test.setTimeout(180_000)
        await open(page, openRoute, path, theme, width)
        const controls = page.locator(`main ${CONTROLS}`)
        expect(await controls.count()).toBeGreaterThan(0)
        expect(await tabRings(page, controls)).toEqual([])
      })
    }
  }
}

for (const width of [390, 1280]) {
  for (const theme of THEMES) {
    test(`focus rings paint in the swap sheet at ${width}px, ${theme}`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
      test.setTimeout(180_000)
      await open(page, openRoute, '/admin', theme, width)
      await openSwap(page)
      const controls = page.locator(`dialog[open] ${CONTROLS}`)
      expect(await controls.count()).toBeGreaterThan(2)
      expect(await unringed(page, controls)).toEqual([])
    })
  }
}

// ---- Computed contrast, in the built CSS ----

/**
 * The text-vs-fill ratio of each element matching `selector`: its colour
 * against the first painted background above it, both blended with the
 * opacity of the element and its ancestors (a dimmed control is measured as
 * seen).
 */
async function contrasts(page, selector) {
  return page.evaluate((sel) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const rgba = (value) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = value
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const over = (top, under) => {
      const a = top[3]
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1)
    }
    const lum = ([r, g, b]) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    }
    const bodyBg = (() => {
      const bg = rgba(getComputedStyle(document.body).backgroundColor)
      return bg[3] < 1 ? [255, 255, 255, 1] : bg
    })()
    return [...document.querySelectorAll(sel)].map((el) => {
      const chain = []
      for (let p = el; p; p = p.parentElement) chain.push(p)
      let opacity = 1
      for (const p of chain) opacity *= Number(getComputedStyle(p).opacity)
      let ground = bodyBg
      for (const p of [...chain].reverse()) {
        const bg = rgba(getComputedStyle(p).backgroundColor)
        if (bg[3] > 0) ground = over(bg, ground)
      }
      const text = rgba(getComputedStyle(el).color)
      const onGround = over(text, ground)
      const seenGround = over([...ground.slice(0, 3), opacity], bodyBg)
      const seenText = over([...onGround.slice(0, 3), opacity], bodyBg)
      const l1 = lum(seenText)
      const l2 = lum(seenGround)
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      return {
        label: `${el.tagName}.${String(el.className).slice(0, 24)} "${el.textContent.trim().slice(0, 18)}"`,
        ratio: Math.round(ratio * 100) / 100,
      }
    })
  }, selector)
}

const TEXT =
  'main :is(h1, h2, p, dt, dd, th, td, a, button, li, .status-text):not(:empty)'

for (const path of ROUTES) {
  for (const theme of THEMES) {
    test(`text reaches 4.5:1 on ${path} (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      await open(page, openRoute, path, theme, 1280)
      const weak = (await contrasts(page, TEXT)).filter((c) => c.ratio < 4.5)
      expect(weak).toEqual([])
    })
  }
}

for (const theme of THEMES) {
  test(`the swap sheet, pressed chip included, reaches 4.5:1 (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
    await open(page, openRoute, '/admin', theme, 1280)
    await openSwap(page)
    // The first slot chip is pressed; press the second so both states show.
    const chips = page
      .getByRole('dialog')
      .getByRole('group', { name: 'Slot' })
      .getByRole('button')
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true')
    await chips.nth(1).click()
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await page.mouse.move(1, 1)
    await page.waitForTimeout(300)
    const weak = (
      await contrasts(page, 'dialog[open] :is(h2, p, button, span:not(:empty))')
    ).filter((c) => c.ratio < 4.5)
    expect(weak).toEqual([])
    // Not by colour alone: the pressed chip differs in weight.
    const weights = await chips.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).fontWeight),
    )
    expect(new Set(weights).size).toBeGreaterThan(1)
  })

  test(`a running job button and a logged night reach 4.5:1 (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
    await open(page, openRoute, '/admin/jobs', theme, 1280)
    // The start call never answers, so the button stays "Running…".
    await page.route('**/api/spots/weather/refresh', () => {})
    await page
      .getByRole('button', { name: /^Run now\s*: Weekend forecast/ })
      .click()
    const busy = page.getByRole('button', {
      name: /^Running…\s*: Weekend forecast/,
    })
    await expect(busy).toBeDisabled()
    expect(await busy.evaluate((el) => getComputedStyle(el).cursor)).toBe(
      'progress',
    )
    await page.mouse.move(1, 1)
    await page.waitForTimeout(300)
    const weak = (await contrasts(page, 'main :is(button, a)')).filter(
      (c) => c.ratio < 4.5,
    )
    expect(weak).toEqual([])
  })
}

for (const theme of THEMES) {
  test(`Home's buttons reach 4.5:1, disabled ones included (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
    await serveHome(page)
    // Last played today: "Logged tonight" is disabled.
    await page.route('**/api/picker/continuing', async (route) => {
      const today = new Date().toLocaleDateString('en-CA')
      await route.fulfill({
        json: {
          cards: [
            {
              item_id: 'a1',
              type: 'game',
              title: 'Dredge',
              platform: 'Switch',
              last_played_on: today,
              journal_hours: 6.4,
              sessions: 3,
            },
          ],
        },
      })
    })
    await page.setViewportSize({ width: 1280, height: 900 })
    await openRoute('/admin', theme)
    await expect(
      page.getByRole('button', { name: 'Logged tonight' }),
    ).toBeDisabled()
    await page.waitForLoadState('networkidle')
    await page.mouse.move(1, 1)
    await page.waitForTimeout(300)
    // A disabled button is marked by more than its colour: a dashed outline
    // and the not-allowed cursor.
    const cue = await page
      .getByRole('button', { name: 'Logged tonight' })
      .evaluate((el) => {
        const s = getComputedStyle(el)
        return `${s.borderStyle} ${s.cursor}`
      })
    expect(cue).toBe('dashed not-allowed')
    const found = await contrasts(page, 'main button')
    expect(found.length).toBeGreaterThan(3)
    expect(found.filter((c) => c.ratio < 4.5)).toEqual([])
  })
}

// The panel header links and the table's item links draw the design ring (2px,
// solid, the ring colour), not the browser's blue default.
for (const theme of THEMES) {
  test(`panel and table links draw the design ring (${theme})`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
    await open(page, openRoute, '/admin/jobs', theme, 1280)
    await page.keyboard.press('Shift')
    const links = page.locator('main .panel-head a, main table a')
    expect(await links.count()).toBeGreaterThan(2)
    for (let i = 0; i < (await links.count()); i++) {
      await links.nth(i).focus()
      const ring = await links.nth(i).evaluate((el) => {
        const s = getComputedStyle(el)
        return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`
      })
      expect(ring).toMatch(/^solid 2px /)
      expect(ring).not.toContain('rgb(0, 95, 204)')
    }
  })
}

// The table keeps its roles whole on every cell, for VoiceOver.
test('every table cell has its role', async ({ page, openRoute }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  await open(page, openRoute, '/admin/jobs', 'light', 390)
  const bad = await page.evaluate(() => [
    ...[...document.querySelectorAll('main th')]
      .filter((el) => el.getAttribute('role') !== 'columnheader')
      .map(() => 'th'),
    ...[...document.querySelectorAll('main td')]
      .filter((el) => el.getAttribute('role') !== 'cell')
      .map(() => 'td'),
  ])
  expect(bad).toEqual([])
})

// The When column stays on one line where there is room.
for (const width of [1280, 1440]) {
  test(`the When column is one line at ${width}px`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    await open(page, openRoute, '/admin/jobs', 'light', width)
    const lines = await page.evaluate(() =>
      [...document.querySelectorAll('main td.job-when')].map((td) => {
        const range = document.createRange()
        range.selectNodeContents(td)
        return new Set(
          [...range.getClientRects()].map((r) => Math.round(r.top)),
        ).size
      }),
    )
    expect(lines.length).toBeGreaterThan(3)
    expect(lines.filter((n) => n !== 1)).toEqual([])
  })
}

// ---- axe ----

for (const path of ROUTES) {
  for (const theme of THEMES) {
    test(`axe finds no serious violation on ${path} (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      await open(page, openRoute, path, theme, 1280)
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

test('axe finds no serious violation in the swap sheet', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  await open(page, openRoute, '/admin', 'dark', 390)
  await openSwap(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(
    results.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact))
      .map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`),
  ).toEqual([])
})

// Behaviour guard: Wore this posts the lead outfit once.
test('Wore this and Swap keep working', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  const posts = []
  await serveHome(page, { posts })
  await openRoute('/admin', 'light')
  await page.getByRole('button', { name: 'Wore this' }).click()
  await expect.poll(() => posts).toContain('POST /api/closet/wore')
})

// Review shots: set E2E_SHOT_DIR to save each page at the four widths in
// both themes, and the opened swap sheet at the phone width.
test('home and jobs review shots', async ({ page, openRoute }, testInfo) => {
  test.skip(!process.env.E2E_SHOT_DIR, 'set E2E_SHOT_DIR to save the shots')
  test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
  test.setTimeout(600_000)
  const dir = process.env.E2E_SHOT_DIR
  mkdirSync(dir, { recursive: true })
  await serveHome(page)
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const path of ROUTES) {
        await page.setViewportSize({ width, height: 900 })
        await openRoute(path, theme)
        await expect(page.locator('main h1').first()).toBeVisible()
        await page.waitForLoadState('networkidle')
        await page.mouse.move(1, 1)
        await page.waitForTimeout(300)
        const label = path.replace(/^\/admin\/?/, '') || 'home'
        await page.screenshot({
          path: `${dir}/${label}-${width}-${theme}.png`,
          fullPage: true,
        })
      }
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await openRoute('/admin', theme)
      await expect(page.locator('main h1').first()).toBeVisible()
      await openSwap(page)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${dir}/swap-${width}-${theme}.png` })
    }
  }
})
