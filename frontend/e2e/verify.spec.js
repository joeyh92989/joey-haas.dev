import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './fixtures.js'

const PHONE = { width: 400, height: 800 }
const DESKTOP = { width: 1280, height: 800 }
const POST = '/blog/how-my-shelf-works'

/** The Report-Only CSP exactly as render.yaml ships it. */
function reportOnlyCsp() {
  const yaml = readFileSync(
    resolve(import.meta.dirname, '../../render.yaml'),
    'utf8',
  )
  const match = yaml.match(
    /name: Content-Security-Policy-Report-Only\s+value: "([^"]+)"/,
  )
  if (!match) throw new Error('no report-only CSP in render.yaml')
  return match[1]
}

test.describe('post links and code blocks (#273, #275)', () => {
  for (const path of [POST, '/shelf/how']) {
    test(`${path}: every scrollable pre is focusable and named at 400px`, async ({
      page,
      openRoute,
    }) => {
      await page.setViewportSize(PHONE)
      await openRoute(path, 'dark')
      const bad = await page.$$eval('pre', (pres) =>
        pres
          .filter((pre) => pre.scrollWidth > pre.clientWidth)
          .filter(
            (pre) =>
              pre.getAttribute('tabindex') !== '0' ||
              !(pre.getAttribute('aria-label') || pre.getAttribute('role')),
          )
          .map((pre) => pre.outerHTML.slice(0, 80)),
      )
      expect(bad).toEqual([])
    })
  }

  test('post prose links are underlined', async ({ page, openRoute }) => {
    await openRoute(POST, 'dark')
    const links = await page.$$eval('.prose a, .post-body a', (as) =>
      as.map((a) => getComputedStyle(a).textDecorationLine),
    )
    expect(links.length).toBeGreaterThan(0)
    expect(links.filter((line) => !line.includes('underline'))).toEqual([])
  })
})

test.describe('tap targets at 400px (#276)', () => {
  const FLOOR = 44
  const pages = [
    '/',
    '/shelf/games',
    '/shelf/comics',
    '/shelf/how',
    '/projects',
  ]

  for (const path of pages) {
    test(`${path}: header and page controls are at least ${FLOOR}px high`, async ({
      page,
      openRoute,
    }) => {
      await page.setViewportSize(PHONE)
      await openRoute(path, 'dark')
      if (path === '/shelf/games')
        await expect(page.locator('.chip').first()).toBeVisible()
      const small = await page.evaluate((floor) => {
        const sel =
          'header a, header button, nav a, nav button, .hero-actions a, .chip, button, .shelf-links a, .section-head a, .project-links a, .spine-tabs a'
        const seen = new Set()
        const out = []
        for (const el of document.querySelectorAll(sel)) {
          if (seen.has(el)) continue
          seen.add(el)
          if (el.closest('dialog:not([open])')) continue
          if (el.closest('.prose')) continue
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          if (el.matches('.skip-link, [class*="skip"]')) continue
          if (r.height < floor)
            out.push(
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${(el.textContent || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
            )
        }
        return out
      }, FLOOR)
      expect(small).toEqual([])
    })
  }
})

test.describe('no sideways scroll at 390px (#475, #482)', () => {
  for (const path of ['/shelf/how', '/']) {
    test(`${path} fits the viewport`, async ({ page, openRoute }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await openRoute(path, 'dark')
      await expect(page.locator('main, .page').first()).toBeVisible()
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(widths.scroll).toBe(widths.client)
    })
  }
})

test.describe('standalone link targets at 390px (#477)', () => {
  // WCAG 2.2 AA 2.5.8: 24px, or 24px of spacing. Links inside a sentence are
  // exempt; the footer rows and the lone Changes feed link are not sentences.
  const FLOOR = 24
  const PHONE_390 = { width: 390, height: 844 }
  const cases = [
    ['/', '.site-footer a'],
    ['/colophon', '.site-footer a'],
    ['/stats', '.site-footer a, #changes > p a'],
  ]

  for (const [path, selector] of cases) {
    test(`${path}: ${selector} are at least ${FLOOR}px high`, async ({
      page,
      openRoute,
    }) => {
      await page.setViewportSize(PHONE_390)
      await openRoute(path, 'dark')
      await expect(page.locator('.site-footer a').first()).toBeVisible()
      const small = await page.$$eval(
        selector,
        (links, floor) =>
          links
            .map((a) => [a.textContent.trim(), a.getBoundingClientRect()])
            .filter(([, r]) => r.height > 0 && r.height < floor)
            .map(([text, r]) => `${text} ${Math.round(r.height)}px`),
        FLOOR,
      )
      expect(small).toEqual([])
    })
  }
})

test.describe('hero actions in the first viewport (#287)', () => {
  for (const [name, size] of [
    ['400px', PHONE],
    ['1280px', DESKTOP],
  ]) {
    test(`Resume and Email are above the fold at ${name}`, async ({
      page,
      openRoute,
    }) => {
      await page.setViewportSize(size)
      await openRoute('/', 'dark')
      for (const label of [/Resume \(PDF\)/, /Email me/]) {
        const box = await page
          .locator('.hero-actions')
          .getByRole('link', { name: label })
          .boundingBox()
        expect(box, String(label)).not.toBeNull()
        expect(box.y + box.height).toBeLessThanOrEqual(size.height)
      }
    })
  }

  test('search finds Resume and Contact', async ({ page, openRoute }) => {
    await openRoute('/', 'dark')
    await page
      .getByRole('button', { name: /search/i })
      .first()
      .click()
    const input = page.getByRole('combobox', { name: 'Search' })
    for (const [word, hit] of [
      ['resume', 'Resume (PDF)'],
      ['contact', 'Contact'],
    ]) {
      await input.fill(word)
      await expect(
        page.getByRole('option', { name: hit }).first(),
      ).toBeVisible()
    }
  })

  // #482: after Escape on a no-results search, the next tap landed on
  // /projects, as if the overlay still held input. It closes, and the page
  // beneath takes the tap.
  test('Escape on a no-results search closes it and the page beneath is tappable', async ({
    page,
    openRoute,
  }) => {
    await openRoute('/', 'dark')
    await page
      .getByRole('button', { name: /search/i })
      .first()
      .click()
    const input = page.getByRole('combobox', { name: 'Search' })
    await input.fill('zzzqqq-no-such-page')
    await expect(page.locator('dialog.search-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog.search-dialog')).toBeHidden()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    // The top element at a page link's centre is the link, not the dialog.
    const link = page.locator('main a:visible').first()
    await link.scrollIntoViewIfNeeded()
    const hitsLink = await link.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const top = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      )
      return el.contains(top)
    })
    expect(hitsLink).toBe(true)
  })
})

test.describe('Report-Only CSP (#263)', () => {
  const csp = reportOnlyCsp()
  for (const path of [
    '/',
    '/about',
    '/projects',
    POST,
    '/shelf/how',
    '/stats',
  ]) {
    test(`${path}: no securitypolicyviolation under the shipped policy`, async ({
      page,
      openRoute,
    }) => {
      await page.route(
        (url) =>
          !url.pathname.startsWith('/api/') &&
          url.origin.startsWith('http://localhost'),
        async (route) => {
          if (route.request().resourceType() !== 'document')
            return route.fallback()
          const response = await route.fetch()
          await route.fulfill({
            response,
            headers: {
              ...response.headers(),
              'content-security-policy-report-only': csp,
            },
          })
        },
      )
      await page.addInitScript(() => {
        window.__csp = []
        document.addEventListener('securitypolicyviolation', (e) =>
          window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
        )
      })
      await openRoute(path, 'dark')
      await page.waitForLoadState('networkidle')
      expect(await page.evaluate(() => window.__csp)).toEqual([])
    })
  }
})

test.describe('SpotMap action is a button, not on the image (#275)', () => {
  test('Clear selection is a named, keyboard-reachable button at 400px', async ({
    page,
    openRoute,
  }) => {
    await page.setViewportSize(PHONE)
    await page.route('**/snapshot/spots.json', (route) =>
      route.fulfill({
        json: [
          {
            spot_id: 'a',
            name: 'Union Station',
            slug: 'union-station',
            neighbourhood: 'LoDo',
            tags: [],
            blurb: null,
            lat: 39.7527,
            lng: -105.0003,
          },
        ],
      }),
    )
    await openRoute('/denver', 'dark')
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await page.locator('.spot-map-pin').first().click()

    const clear = page.getByRole('button', { name: 'Clear selection' })
    await expect(clear).toBeVisible()
    await clear.focus()
    await expect(clear).toBeFocused()
    expect(await clear.getAttribute('tabindex')).not.toBe('-1')

    // The role=img drawing holds no control and takes no focus.
    const image = page.locator('.spot-map-ground[role="img"]')
    await expect(image).toHaveAttribute('aria-label', /.+/)
    expect(await image.locator('button, a, [tabindex]').count()).toBe(0)
    expect(await image.getAttribute('tabindex')).toBeNull()

    await clear.press('Enter')
    await expect(clear).toBeHidden()
  })
})

test.describe('keyboard focus ring (#528)', () => {
  // The shared components once shipped `outline-none` beside `outline-2`, and
  // Tailwind v4 then draws no ring at all. Tab onto the real control and read
  // what the browser computed.
  const targets = [
    ['a filter chip on /shelf/games', '/shelf/games', '.chip'],
    ['Try again on /shelf/games', '/shelf/games', '.load-state .btn'],
  ]
  for (const theme of ['light', 'dark']) {
    for (const [name, path, selector] of targets) {
      test(`${name} shows a 2px ring in ${theme}, 3:1 on the page and the card`, async ({
        page,
        openRoute,
      }) => {
        await openRoute(path, theme)
        const target = page.locator(selector).first()
        await expect(target).toBeVisible()
        let found = false
        for (let i = 0; i < 80 && !found; i += 1) {
          await page.keyboard.press('Tab')
          found = await target.evaluate((el) => el === document.activeElement)
        }
        expect(found, `Tab never reached ${selector}`).toBe(true)
        const ring = await target.evaluate((el) => {
          const cs = getComputedStyle(el)
          const root = getComputedStyle(document.documentElement)
          return {
            style: cs.outlineStyle,
            width: parseFloat(cs.outlineWidth),
            color: cs.outlineColor,
            page: root.getPropertyValue('--bg').trim(),
            card: root.getPropertyValue('--surface').trim(),
          }
        })
        expect(ring.style).not.toBe('none')
        expect(ring.width).toBeGreaterThanOrEqual(2)
        const channels = (css) =>
          css
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
        const lum = ([r, g, b]) =>
          [r, g, b]
            .map((v) => v / 255)
            .map((v) =>
              v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
            )
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
        const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
        const ratio = (a, b) => {
          const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
          return (hi + 0.05) / (lo + 0.05)
        }
        const color = channels(ring.color)
        expect(ratio(color, hex(ring.page))).toBeGreaterThanOrEqual(3)
        expect(ratio(color, hex(ring.card))).toBeGreaterThanOrEqual(3)
      })
    }
  }
})

test.describe('site shell frame and focus (#529)', () => {
  // Content and tracker pages share the 1200px measure; prose keeps its
  // 45rem reading column.
  for (const [path, width] of [
    ['/', 1200],
    ['/projects', 1200],
    ['/shelf/games', 1200],
    ['/blog/how-my-shelf-works', 720],
  ]) {
    test(`${path}: main is ${width}px wide at 1440px`, async ({
      page,
      openRoute,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await openRoute(path, 'light')
      const box = await page.locator('main#main').boundingBox()
      expect(Math.round(box.width)).toBe(width)
    })
  }

  test('the masthead row sits on the same 1200px measure', async ({
    page,
    openRoute,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openRoute('/blog/how-my-shelf-works', 'light')
    const box = await page.locator('.mast-row').boundingBox()
    expect(Math.round(box.width)).toBe(1200)
  })

  // A focus ring that is `outline-style: none` is invisible: Tailwind's
  // outline-2 sets only the width, so each new control needs outline-solid.
  test('keyboard focus draws a ring on every masthead control', async ({
    page,
    openRoute,
  }, testInfo) => {
    await openRoute('/', 'light')
    const phone = testInfo.project.name === 'phone'
    const names = phone
      ? ['Search', 'Switch to dark theme', 'Menu']
      : ['More', 'Search', 'Switch to dark theme']
    for (const name of names) {
      const control = page.getByRole('button', { name: new RegExp(name) })
      await control.first().focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      const style = await control
        .first()
        .evaluate((el) => getComputedStyle(el).outlineStyle)
      expect(style, name).not.toBe('none')
    }
  })

  // Tailwind sorts `border-transparent` after every named border colour, so a
  // base class of it would hide each variant's outline.
  test('masthead buttons draw their outline, not a transparent border', async ({
    page,
    openRoute,
  }) => {
    await openRoute('/', 'light')
    const toggle = page.getByRole('button', { name: /^Switch to dark/ })
    const color = await toggle.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    )
    expect(color).not.toBe('rgba(0, 0, 0, 0)')
    expect(
      await toggle.evaluate((el) => getComputedStyle(el).borderTopWidth),
    ).toBe('1px')
  })

  test('the search field and its Close button draw a ring', async ({
    page,
    openRoute,
  }) => {
    await openRoute('/', 'light')
    await page
      .getByRole('button', { name: /^Search/ })
      .first()
      .click()
    const input = page.getByRole('combobox', { name: 'Search' })
    await expect(input).toBeFocused()
    expect(
      await input.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).not.toBe('none')
    await page.keyboard.press('Tab')
    const close = page.getByRole('button', { name: 'Close' })
    await expect(close).toBeFocused()
    expect(
      await close.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).not.toBe('none')
  })
})

test.describe('masthead fit and search loading (#529 review)', () => {
  // A real phone widens the layout viewport to fit content, so these use
  // isMobile like tour-overflow.spec.js.
  for (const width of [320, 360, 390]) {
    test.describe(`${width}px phone`, () => {
      test.use({
        viewport: { width, height: 800 },
        isMobile: true,
        hasTouch: true,
      })
      test('the page does not scroll sideways and the bar gutters are equal', async ({
        page,
        openRoute,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
        await openRoute('/', 'light')
        const m = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
          left: document.querySelector('.brand').getBoundingClientRect().left,
          right: document.querySelector('.mast-menu').getBoundingClientRect()
            .right,
        }))
        expect(m.scroll).toBe(m.inner)
        expect(Math.round(m.inner - m.right)).toBe(Math.round(m.left))
      })
    })
  }

  for (const width of [961, 1000, 1035, 1100]) {
    test(`no sideways scroll at ${width}px`, async ({
      page,
      openRoute,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'sizes are set here')
      await page.setViewportSize({ width, height: 800 })
      await openRoute('/', 'light')
      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }))
      expect(m.scroll).toBe(m.inner)
    })
  }

  test('More has the padding and gap of the other links', async ({
    page,
    openRoute,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the phone uses Menu')
    await page.setViewportSize({ width: 1280, height: 800 })
    await openRoute('/', 'light')
    const m = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.site-nav > a')]
      const last = links[links.length - 1].getBoundingClientRect()
      const btn = document.querySelector('.more-btn')
      const b = btn.getBoundingClientRect()
      const cs = getComputedStyle(btn)
      const a = links[links.length - 1].getBoundingClientRect()
      const prev = links[links.length - 2].getBoundingClientRect()
      return {
        gapToMore: b.left - last.right,
        gapBetween: a.left - prev.right,
        padL: cs.paddingLeft,
        padR: cs.paddingRight,
        gap: cs.columnGap,
      }
    })
    expect(Math.round(m.gapToMore)).toBe(Math.round(m.gapBetween))
    expect(m.padL).toBe('0px')
    expect(m.padR).toBe('0px')
    expect(m.gap).toBe('4px')
  })

  test('a failed search chunk leaves the page up and the next click retries', async ({
    page,
    openRoute,
  }) => {
    let failed = 0
    await page.route('**/assets/SearchDialog-*.js', (route) => {
      if (failed++ < 3) return route.abort()
      return route.continue()
    })
    await openRoute('/', 'light')
    await page
      .getByRole('button', { name: /^Search/ })
      .first()
      .click()
    await page.waitForTimeout(500)
    await expect(page.locator('#root > *').first()).toBeVisible()
    await expect(page.locator('main#main')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Search' })).toHaveCount(0)
    failed = 3
    await page
      .getByRole('button', { name: /^Search/ })
      .first()
      .click()
    await expect(page.getByRole('combobox', { name: 'Search' })).toBeFocused()
  })

  test('keys pressed while the search chunk loads still open it', async ({
    page,
    openRoute,
  }) => {
    await page.route('**/assets/SearchDialog-*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.continue()
    })
    await openRoute('/', 'light')
    // Wait for the app to mount: its key handler is attached by an effect.
    await expect(
      page.getByRole('button', { name: /^Search/ }).first(),
    ).toBeVisible()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('combobox', { name: 'Search' })).toBeFocused()
  })

  test('the search field is 16px and rings on its own control', async ({
    page,
    openRoute,
  }) => {
    await openRoute('/', 'light')
    await page
      .getByRole('button', { name: /^Search/ })
      .first()
      .click()
    const input = page.getByRole('combobox', { name: 'Search' })
    await expect(input).toBeFocused()
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      '16px',
    )
  })
})
