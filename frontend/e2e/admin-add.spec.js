import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { unringed } from './closet-ring.js'
import { tabRings } from './denver-site-ring.js'
import { GAMES, serveAdmin } from './admin-shelf.fixtures.js'
import { serveAdminAdd } from './admin-add.fixtures.js'

// The admin Shelf add and recommend pages (#535, slice c), with realistic
// mocked answers and no backend: no sideways scroll from 320px to 1440px
// (naming the element past the edge), 44px targets on a phone, focus rings
// measured in pixels on every control including the opened states, computed
// contrast in the built CSS (both themes, pressed, armed and disabled states)
// and axe in both themes.
test.skip(!!process.env.E2E_BASE_URL, 'mocked answers only')

const PAGES = [
  { name: 'add', path: '/admin/collection/add', ready: 'Start a sitting' },
  { name: 'closet add', path: '/admin/closet/add', ready: 'Start a sitting' },
  { name: 'sitting', path: '/admin/collection/add/s1', ready: 'Take photos' },
  {
    name: 'sitting check',
    path: '/admin/collection/add/chk',
    ready: 'Which one is it?',
  },
  {
    name: 'sitting details',
    path: '/admin/collection/add/det',
    ready: 'Back to Check',
  },
  {
    name: 'sitting done',
    path: '/admin/collection/add/det',
    ready: 'Back to Check',
    // Adds the sitting: the commit answer is served, and Done opens.
    prep: async (page) => {
      await page.getByRole('button', { name: /^Add \d+ to/ }).click()
      await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible()
    },
    tap: ['main'],
  },
  { name: 'discover', path: '/admin/discover', ready: 'Rate a few' },
  { name: 'radar', path: '/admin/radar', ready: 'Suggested' },
  { name: 'pull list', path: '/admin/pull-list', ready: 'Week of' },
  {
    name: 'games',
    path: '/admin/shelf/games',
    ready: 'Now playing',
    // The games page is the shelf slice's; these are this slice's parts. Its
    // poster cards (inside rings, #532) are measured by that slice's spec.
    tap: ['.now-playing', '.intake-addbar', '.intake-resume', '.quick-rate'],
  },
]
const THEMES = ['light', 'dark']
const byName = (name) => PAGES.find((entry) => entry.name === name)

async function open(page, openRoute, spec, theme, size) {
  await serveAdminAdd(page)
  if (size) await page.setViewportSize(size)
  await openRoute(spec.path, theme)
  await expect(page.locator('main h1').first()).toBeVisible()
  await expect(page.getByText(spec.ready).first()).toBeVisible()
  if (spec.prep) await spec.prep(page)
  await page.waitForLoadState('networkidle')
  await page.mouse.move(1, 1)
  // The theme fades colours (transition-colors): let it finish.
  await page.waitForTimeout(400)
}

/** The elements past the right edge that no scroller contains. */
async function wideElements(page) {
  return page.evaluate(() => {
    const inner = document.documentElement.clientWidth
    const own = (node) =>
      node.tagName.toLowerCase() +
      (typeof node.className === 'string' && node.className
        ? `.${node.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : '')
    const name = (el) => {
      let up = el.parentElement
      while (up && !(typeof up.className === 'string' && up.className))
        up = up.parentElement
      return `${own(el)} in ${up ? own(up) : '-'} "${(el.textContent || '').trim().slice(0, 24)}"`
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
    return { wide, scroll: document.documentElement.scrollWidth, inner }
  })
}

// Opened states: each prepares its page, and `scope` is where the controls are.
const STATES = [
  {
    name: 'Discard asked',
    spec: byName('add'),
    scope: 'main',
    prep: async (page) => {
      await page
        .getByRole('button', { name: /^Discard / })
        .first()
        .click()
      await expect(
        page.getByRole('button', { name: 'Keep it' }).first(),
      ).toBeVisible()
    },
  },
  {
    name: 'Radar digital open',
    spec: byName('radar'),
    scope: 'main',
    prep: async (page) => {
      await page.locator('.radar-digital summary').click()
      await expect(page.locator('.radar-digital')).toHaveAttribute('open', '')
    },
  },
  {
    name: 'Pull list search results',
    spec: byName('pull list'),
    scope: 'main',
    prep: async (page) => {
      await page.getByRole('searchbox').fill('Saga')
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await expect(page.getByText('Absolute Batman').first()).toBeVisible()
    },
  },
  {
    name: 'Add bar results',
    spec: byName('games'),
    scope: 'main',
    prep: async (page) => {
      await page.getByRole('searchbox', { name: 'Add' }).fill('zelda')
      await page.keyboard.press('Enter')
      await expect(
        page.getByRole('list', { name: /^Results for/ }),
      ).toBeVisible()
    },
  },
  {
    name: 'Wrap up sheet',
    spec: byName('games'),
    scope: 'dialog[open]',
    prep: async (page) => {
      await page
        .getByRole('button', { name: /^Wrap up/ })
        .first()
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
]

for (const spec of PAGES) {
  for (const width of [320, 390, 1280, 1440]) {
    for (const theme of THEMES) {
      test(`${spec.name} does not scroll sideways at ${width}px (${theme})`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        await open(page, openRoute, spec, theme, { width, height: 900 })
        const found = await wideElements(page)
        expect(found.wide, 'elements past the right edge').toEqual([])
        expect(found.scroll).toBeLessThanOrEqual(found.inner)
      })
    }
  }
}

for (const spec of PAGES) {
  test(`${spec.name} controls are 44px tall on a phone`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    await open(page, openRoute, spec, 'light', { width: 390, height: 900 })
    const short = await page.evaluate(
      (roots) => {
        const found = roots.flatMap((root) => [
          ...document.querySelectorAll(
            `${root} :is(button, summary, label:has(input), a):not(h1 a, h2 a, h3 a, nav *)`,
          ),
        ])
        return [...new Set(found)]
          .filter((el) => {
            const box = el.getBoundingClientRect()
            return (
              box.height > 0 &&
              getComputedStyle(el).display !== 'inline' &&
              !el.matches('.visually-hidden') &&
              box.height < 43.5
            )
          })
          .map(
            (el) =>
              `${el.tagName}.${String(el.className).slice(0, 40)} "${el.textContent.trim().slice(0, 16)}" ${Math.round(el.getBoundingClientRect().height)}px`,
          )
      },
      spec.tap ?? ['main'],
    )
    expect(short).toEqual([])
  })
}

// The opened states' controls are 44px tall on a phone as well.
for (const [name, roots] of [
  ['Discard asked', ['.intake-sitting-actions']],
  ['Add bar results', ['.intake-results']],
  ['Pull list search results', ['.pull-list-search']],
]) {
  test(`${name} controls are 44px tall on a phone`, async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
    const state = STATES.find((entry) => entry.name === name)
    await open(page, openRoute, state.spec, 'light', {
      width: 390,
      height: 900,
    })
    await state.prep(page)
    const short = await page.evaluate(
      (list) =>
        list
          .flatMap((root) => [
            ...document.querySelectorAll(
              `${root} :is(button, summary, label:has(input), a, input, select)`,
            ),
          ])
          .filter((el) => {
            const box = el.getBoundingClientRect()
            return (
              box.height > 0 &&
              getComputedStyle(el).display !== 'inline' &&
              !el.matches('.visually-hidden, [type=hidden]') &&
              box.height < 43.5
            )
          })
          .map(
            (el) =>
              `${el.tagName}.${String(el.className).slice(0, 40)} "${el.textContent.trim().slice(0, 16)}" ${Math.round(el.getBoundingClientRect().height)}px`,
          ),
      roots,
    )
    expect(short).toEqual([])
  })
}

for (const width of [390, 1280]) {
  for (const spec of PAGES) {
    for (const theme of THEMES) {
      test(`focus rings paint on every control of ${spec.name} at ${width}px, ${theme}`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        test.setTimeout(240_000)
        await open(page, openRoute, spec, theme, { width, height: 900 })
        const controls = page.locator(
          'main :is(a[href], button, input:not([type=hidden]), select, textarea, summary):not(:disabled):not(.poster-card, .poster-card *):visible',
        )
        expect(await unringed(page, controls)).toEqual([])
      })
    }
  }
  for (const state of STATES) {
    for (const theme of THEMES) {
      test(`focus rings paint in ${state.name} at ${width}px, ${theme}`, async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        test.setTimeout(240_000)
        await open(page, openRoute, state.spec, theme, { width, height: 900 })
        await state.prep(page)
        await page.mouse.move(1, 1)
        const controls = page.locator(
          `${state.scope} :is(a[href], button, input:not([type=hidden]), select, textarea, summary):not(:disabled):not(.poster-card, .poster-card *):visible`,
        )
        expect(await controls.count()).toBeGreaterThan(0)
        // Real Tab presses, geometry and pixels (denver-site-ring.js).
        expect(await tabRings(page, controls)).toEqual([])
      })
    }
  }
}

/** Text against the colour behind it, with opacity, in the built CSS. */
async function ratios(page, selector) {
  return page.evaluate((sel) => {
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
    const over = (top, under) => {
      const a = top[3]
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1)
    }
    const lum = ([r, g, b]) => {
      const f = (c) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    return [...document.querySelectorAll(sel)]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map((el) => {
        let opacity = 1
        for (let p = el; p; p = p.parentElement)
          opacity *= Number(getComputedStyle(p).opacity)
        // The colour behind: every ancestor's background, painted bottom up.
        const stack = []
        for (let p = el; p; p = p.parentElement) {
          const c = rgba(getComputedStyle(p).backgroundColor)
          if (c[3] > 0) stack.push(c)
        }
        let back = rgba(getComputedStyle(document.body).backgroundColor)
        if (back[3] < 1) back = [255, 255, 255, 1]
        for (const c of stack.reverse()) back = over(c, back)
        const ink = rgba(getComputedStyle(el).color)
        const fore = over([ink[0], ink[1], ink[2], ink[3] * opacity], back)
        const [hi, lo] = [lum(fore), lum(back)].sort((a, b) => b - a)
        return {
          name: `${el.tagName}.${String(el.className).slice(0, 30)} "${el.textContent.trim().slice(0, 18)}"`,
          ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
        }
      })
  }, selector)
}

const CONTRAST = [
  {
    name: 'Add page tiles (enabled and disabled), Resume, Discard',
    spec: byName('add'),
    selector:
      'main button, main a.btn, main [class*="inline-flex"], main .intake-kind, main .intake-sitting-name, main .muted',
  },
  {
    name: 'Add page armed Discard',
    spec: byName('add'),
    prep: STATES[0].prep,
    selector: 'main .intake-sitting-actions button, main .intake-sitting span',
  },
  {
    name: 'Discover chips and controls',
    spec: byName('discover'),
    selector: 'main button, main .muted, main legend, main label',
  },
  {
    name: 'Discover chip pressed once more',
    spec: byName('discover'),
    prep: async (page) => {
      await page
        .getByRole('button', { name: 'Switch', exact: false })
        .first()
        .click()
    },
    selector: 'main button[aria-pressed]',
  },
  {
    name: 'Radar',
    spec: byName('radar'),
    selector: 'main button, main .muted, main a',
  },
  {
    name: 'Pull list',
    spec: byName('pull list'),
    selector: 'main button, main .muted, main .next-badge',
  },
  {
    name: 'Games Now playing',
    spec: byName('games'),
    selector: 'main .now-playing *',
  },
  {
    name: 'Add bar results (Add, Added, On shelf)',
    spec: byName('games'),
    prep: STATES.find((s) => s.name === 'Add bar results').prep,
    selector: 'main .intake-results *',
  },
  {
    name: 'Radar and Discover answers',
    spec: byName('discover'),
    selector: 'main .radar-card *, main .rate-a-few *',
  },
]

for (const check of CONTRAST) {
  for (const theme of THEMES) {
    test(`text contrast is at least 4.5 on ${check.name} (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
      await open(page, openRoute, check.spec, theme, {
        width: 1280,
        height: 900,
      })
      if (check.prep) await check.prep(page)
      await page.mouse.move(1, 1)
      await page.waitForTimeout(400)
      const all = await ratios(page, check.selector)
      expect(all.length).toBeGreaterThan(0)
      expect(all.filter((entry) => entry.ratio < 4.5)).toEqual([])
    })
  }
}

// Pressed is never colour alone: the pressed chip differs from the unpressed
// in more than ink.
test('a pressed platform chip differs by more than colour', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
  await open(page, openRoute, byName('discover'), 'light', {
    width: 1280,
    height: 900,
  })
  const chips = page.locator('main button[aria-pressed]')
  await chips.first().click()
  await page.mouse.move(1, 1)
  const traits = await chips.evaluateAll((all) =>
    all.map((el) => {
      const style = getComputedStyle(el)
      return {
        pressed: el.getAttribute('aria-pressed'),
        weight: style.fontWeight,
        line: style.textDecorationLine,
        border: style.borderTopColor,
      }
    }),
  )
  const on = traits.find((t) => t.pressed === 'true')
  const off = traits.find((t) => t.pressed === 'false')
  expect(on && off, 'a pressed and an unpressed chip').toBeTruthy()
  const unlike = [on.weight !== off.weight, on.line !== off.line].filter(
    Boolean,
  ).length
  expect(unlike).toBeGreaterThan(0)
})

for (const spec of PAGES) {
  for (const theme of THEMES) {
    test(`${spec.name} has no serious axe violations (${theme})`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
      await open(page, openRoute, spec, theme, { width: 1280, height: 900 })
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

// Review shots: set E2E_SHOT_DIR to save each page at the four widths in
// both themes, and the opened states at the phone width.
test('add pages review shots', async ({ page, openRoute }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
  test.skip(!process.env.E2E_SHOT_DIR, 'set E2E_SHOT_DIR to save the shots')
  test.setTimeout(900_000)
  const dir = process.env.E2E_SHOT_DIR
  for (const theme of THEMES) {
    for (const width of [320, 390, 1280, 1440]) {
      for (const spec of PAGES) {
        await open(page, openRoute, spec, theme, { width, height: 900 })
        await page.screenshot({
          path: `${dir}/${spec.name.replace(/ /g, '-')}-${width}-${theme}.png`,
          fullPage: true,
        })
      }
    }
    for (const state of STATES) {
      await open(page, openRoute, state.spec, theme, {
        width: 390,
        height: 900,
      })
      await state.prep(page)
      await page.waitForTimeout(400)
      await page.screenshot({
        path: `${dir}/state-${state.name.replace(/ /g, '-')}-390-${theme}.png`,
        fullPage: true,
      })
    }
  }
})

// The admin shelf's phone sheet draws the stars at 3rem: the 44px floor of
// the inline rows must not shrink or clip them.
test('the shelf sheet keeps its stars whole and 44px tall', async ({
  page,
  openRoute,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone project only')
  await serveAdmin(page, GAMES)
  await openRoute('/admin/shelf/games', 'light')
  await expect(page.locator('.poster-card').first()).toBeVisible()
  const card = page.locator('.poster-card').filter({ hasText: 'Star Fox' })
  const toggle = card.getByRole('button', { name: 'Actions for Star Fox' })
  await toggle.scrollIntoViewIfNeeded()
  await toggle.click()
  const sheet = page.locator('dialog[open]')
  await expect(sheet).toBeVisible()
  const targets = sheet.locator('.quick-rate-target')
  await expect(targets).toHaveCount(10)
  const geometry = await targets.evaluateAll((all) =>
    all.map((el) => {
      const star = el.querySelector('span').getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return {
        height: Math.round(box.height),
        // The star's own box sits inside the target: nothing cut off.
        topCut: Math.round((box.top - star.top) * 10) / 10,
        clipped: el.scrollHeight > el.clientHeight + 1,
      }
    }),
  )
  for (const target of geometry) {
    expect(target.height).toBeGreaterThanOrEqual(44)
    expect(target.topCut).toBeLessThanOrEqual(0.5)
    expect(target.clipped).toBe(false)
  }
  // Pixels: the top row of a target is as empty as the row just above it.
  await sheet.locator('.quick-rate').scrollIntoViewIfNeeded()
  const box = await targets.nth(4).boundingBox()
  const row = (y) =>
    page.screenshot({
      clip: { x: box.x, y, width: box.width, height: 1 },
    })
  expect((await row(box.y)).equals(await row(box.y - 3))).toBe(true)
})
